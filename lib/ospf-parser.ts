import type {
  OSPFTopology,
  OSPFRouter,
  OSPFNetwork,
  OSPFLink,
  RouterRole,
} from "./ospf-types"

/**
 * Main parser: takes raw "show ip ospf database" text
 * and returns an OSPFTopology object.
 */
export function parseOSPFData(input: string): OSPFTopology {
  const lines = input.split("\n")
  const routerLSAs = parseRouterLSAs(lines)
  const networkLSAs = parseNetworkLSAs(lines)

  const routerMap = new Map<string, OSPFRouter>()
  const networkMap = new Map<string, OSPFNetwork>()
  const links: OSPFLink[] = []
  const areas = new Set<string>()
  const p2pCosts = new Map<string, { srcId: string; tgtId: string; srcCost: number; tgtCost: number; ifInfo: string; area: string }>()

  // Build routers from Router LSAs
  for (const lsa of routerLSAs) {
    areas.add(lsa.area)
    const rid = lsa.routerId
    if (!routerMap.has(rid)) {
      let role: RouterRole = "internal"
      if (lsa.isABR && lsa.isASBR) role = "asbr"
      else if (lsa.isABR) role = "abr"
      else if (lsa.isASBR) role = "asbr"

      routerMap.set(rid, {
        id: rid,
        routerId: rid,
        role,
        area: lsa.area,
        lsaTypes: ["Router LSA (Type 1)"],
        neighbors: [],
        networks: [],
        sequenceNumber: lsa.seqNumber,
        age: lsa.age,
        checksum: lsa.checksum,
      })
    } else {
      const existing = routerMap.get(rid)!
      if (lsa.isABR && existing.role === "internal") existing.role = "abr"
      if (lsa.isASBR) existing.role = "asbr"
    }

    const router = routerMap.get(rid)!

    for (const link of lsa.links) {
      if (link.type === "point-to-point") {
        if (!router.neighbors.includes(link.linkId)) {
          router.neighbors.push(link.linkId)
        }
        // Track costs from both directions
        const key = [rid, link.linkId].sort().join("-")
        const existing = p2pCosts.get(key)
        if (existing) {
          // Second direction: fill in the other side's cost
          if (rid === existing.srcId) {
            existing.srcCost = link.metric
          } else {
            existing.tgtCost = link.metric
          }
        } else {
          // First direction seen
          p2pCosts.set(key, {
            srcId: rid,
            tgtId: link.linkId,
            srcCost: link.metric,
            tgtCost: link.metric, // default same until we see the other side
            ifInfo: link.linkData,
            area: lsa.area,
          })
        }
      } else if (link.type === "stub") {
        const netId = `stub-${link.linkId}-${link.linkData}`
        if (!router.networks.includes(netId)) {
          router.networks.push(netId)
        }
      } else if (link.type === "transit") {
        if (!router.networks.includes(link.linkId)) {
          router.networks.push(link.linkId)
        }
      }
    }
  }

  // Build directional P2P links from collected cost data
  for (const [, p] of p2pCosts) {
    links.push({
      id: `p2p-${p.srcId}-${p.tgtId}`,
      source: p.srcId,
      target: p.tgtId,
      cost: Math.max(p.srcCost, p.tgtCost),
      sourceCost: p.srcCost,
      targetCost: p.tgtCost,
      linkType: "point-to-point",
      interfaceInfo: p.ifInfo,
      area: p.area,
    })
  }

  // Build networks from Network LSAs
  for (const nlsa of networkLSAs) {
    areas.add(nlsa.area)
    const nid = nlsa.linkStateId

    networkMap.set(nid, {
      id: nid,
      networkAddress: nlsa.linkStateId,
      mask: nlsa.networkMask,
      attachedRouters: nlsa.attachedRouters,
      designatedRouter: nlsa.advertisingRouter,
      area: nlsa.area,
    })

    for (const ar of nlsa.attachedRouters) {
      links.push({
        id: `transit-${nid}-${ar}`,
        source: nid,
        target: ar,
        cost: 0,
        sourceCost: 0,
        targetCost: 0,
        linkType: "transit",
        area: nlsa.area,
      })
      if (!routerMap.has(ar)) {
        routerMap.set(ar, {
          id: ar,
          routerId: ar,
          role: "internal",
          area: nlsa.area,
          lsaTypes: [],
          neighbors: [],
          networks: [nid],
        })
      }
      if (ar === nlsa.advertisingRouter) {
        const r = routerMap.get(ar)!
        if (!r.lsaTypes.includes("Network LSA (Type 2)")) {
          r.lsaTypes.push("Network LSA (Type 2)")
        }
      }
    }
  }

  return {
    routers: Array.from(routerMap.values()),
    networks: Array.from(networkMap.values()),
    links: dedup(links),
    areas: Array.from(areas).sort(),
  }
}

// ─── Internal types ──────────────────────────────────────────

interface RawRouterLSA {
  routerId: string
  area: string
  age: number
  seqNumber: string
  checksum: string
  isABR: boolean
  isASBR: boolean
  links: RawLink[]
}
interface RawLink {
  type: "point-to-point" | "stub" | "transit"
  linkId: string
  linkData: string
  metric: number
}
interface RawNetworkLSA {
  linkStateId: string
  advertisingRouter: string
  area: string
  age: number
  seqNumber: string
  checksum: string
  networkMask: string
  attachedRouters: string[]
}

// ─── Router LSA parser ──────────────────────────────────────

function parseRouterLSAs(lines: string[]): RawRouterLSA[] {
  const result: RawRouterLSA[] = []
  let currentArea = "0"

  // Split the input into LSA blocks.
  // Every "LS age:" starts a new LSA block.
  const blocks = splitIntoBlocks(lines, (line) => /^\s*LS age:\s*\d+/i.test(line))

  for (const block of blocks) {
    // Check for area header lines BEFORE this block
    // (We track area globally as we iterate)
    updateArea(block, (a) => { currentArea = a })

    // Only process Router Link LSA blocks
    if (!block.some((l) => /LS Type:\s*Router Links/i.test(l))) continue

    let age = 0
    let routerId = ""
    let seqNumber = ""
    let checksum = ""
    let isABR = false
    let isASBR = false
    const lsaLinks: RawLink[] = []

    for (const line of block) {
      const trimmed = line.trim()
      const ageM = trimmed.match(/^LS age:\s*(\d+)/i)
      if (ageM) { age = parseInt(ageM[1]); continue }

      const lsidM = trimmed.match(/^Link State ID:\s*([\d.]+)/i)
      if (lsidM) { routerId = lsidM[1]; continue }

      const seqM = trimmed.match(/^LS Seq Number:\s*(\S+)/i)
      if (seqM) { seqNumber = seqM[1]; continue }

      const csM = trimmed.match(/^Checksum:\s*(\S+)/i)
      if (csM) { checksum = csM[1]; continue }

      if (/Area Border Router/i.test(trimmed)) { isABR = true; continue }
      if (/AS Boundary Router/i.test(trimmed)) { isASBR = true; continue }
    }

    // Now parse the link sub-blocks
    const linkBlocks = splitIntoBlocks(block, (l) => /Link connected to:/i.test(l))
    for (const lb of linkBlocks) {
      if (lb.length === 0) continue
      const headerLine = lb[0].trim()
      const connM = headerLine.match(/Link connected to:\s*(.+)/i)
      if (!connM) continue

      const desc = connM[1]
      let linkType: RawLink["type"] = "stub"
      if (/point-to-point/i.test(desc)) linkType = "point-to-point"
      else if (/Transit/i.test(desc)) linkType = "transit"
      else if (/Stub/i.test(desc)) linkType = "stub"

      let linkId = ""
      let linkData = ""
      let metric = 0

      for (const dl of lb) {
        const t = dl.trim()
        const lidM = t.match(/\(Link ID\).*?:\s*([\d.]+)/i)
        if (lidM) linkId = lidM[1]
        const ldM = t.match(/\(Link Data\).*?:\s*([\d.]+)/i)
        if (ldM) linkData = ldM[1]
        const metM = t.match(/TOS 0 Metrics?:\s*(\d+)/i)
        if (metM) metric = parseInt(metM[1])
      }

      if (linkId) {
        lsaLinks.push({ type: linkType, linkId, linkData, metric })
      }
    }

    if (routerId) {
      result.push({ routerId, area: currentArea, age, seqNumber, checksum, isABR, isASBR, links: lsaLinks })
    }
  }

  return result
}

// ─── Network LSA parser ─────────────────────────────────────

function parseNetworkLSAs(lines: string[]): RawNetworkLSA[] {
  const result: RawNetworkLSA[] = []
  let currentArea = "0"

  const blocks = splitIntoBlocks(lines, (line) => /^\s*LS age:\s*\d+/i.test(line))

  for (const block of blocks) {
    updateArea(block, (a) => { currentArea = a })

    if (!block.some((l) => /LS Type:\s*Network Links/i.test(l))) continue

    let linkStateId = ""
    let advertisingRouter = ""
    let age = 0
    let seqNumber = ""
    let checksum = ""
    let networkMask = ""
    const attachedRouters: string[] = []

    for (const line of block) {
      const t = line.trim()
      const ageM = t.match(/^LS age:\s*(\d+)/i)
      if (ageM) { age = parseInt(ageM[1]); continue }
      const lsidM = t.match(/^Link State ID:\s*([\d.]+)/i)
      if (lsidM) { linkStateId = lsidM[1]; continue }
      const advM = t.match(/^Advertising Router:\s*([\d.]+)/i)
      if (advM) { advertisingRouter = advM[1]; continue }
      const seqM = t.match(/^LS Seq Number:\s*(\S+)/i)
      if (seqM) { seqNumber = seqM[1]; continue }
      const csM = t.match(/^Checksum:\s*(\S+)/i)
      if (csM) { checksum = csM[1]; continue }
      const maskM = t.match(/^Network Mask:\s*(\S+)/i)
      if (maskM) { networkMask = maskM[1]; continue }
      const arM = t.match(/Attached Router:\s*([\d.]+)/i)
      if (arM) { attachedRouters.push(arM[1]); continue }
    }

    if (linkStateId) {
      result.push({ linkStateId, advertisingRouter, area: currentArea, age, seqNumber, checksum, networkMask, attachedRouters })
    }
  }

  return result
}

// ─── Helpers ────────────────────────────────────────────────

/**
 * Split lines into blocks. A new block starts whenever `isBoundary` returns true.
 * Area header lines (Router Link States, Net Link States, Summary) are tracked separately.
 */
function splitIntoBlocks(lines: string[], isBoundary: (line: string) => boolean): string[][] {
  const blocks: string[][] = []
  let current: string[] = []

  for (const line of lines) {
    // Track area headers -- these are not boundaries, they belong to the current context
    if (/(?:Router|Net|Summary.*)\s+Link States\s+\(Area\s+\d+\)/i.test(line)) {
      // Push any accumulated block
      if (current.length > 0) {
        blocks.push(current)
        current = []
      }
      // Start a new pseudo-block with just the header
      blocks.push([line])
      continue
    }

    if (isBoundary(line)) {
      if (current.length > 0) {
        blocks.push(current)
      }
      current = [line]
    } else {
      current.push(line)
    }
  }
  if (current.length > 0) blocks.push(current)
  return blocks
}

/**
 * Scan a block for area header lines and call the setter if found.
 */
function updateArea(block: string[], setArea: (area: string) => void) {
  for (const line of block) {
    const m = line.match(/Link States\s+\(Area\s+(\d+)\)/i)
    if (m) setArea(m[1])
  }
}

function dedup(links: OSPFLink[]): OSPFLink[] {
  const seen = new Set<string>()
  const out: OSPFLink[] = []
  for (const l of links) {
    const key = [l.source, l.target].sort().join("|") + "|" + l.linkType
    if (!seen.has(key)) {
      seen.add(key)
      out.push(l)
    }
  }
  return out
}
