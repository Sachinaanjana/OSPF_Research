import type {
  OSPFTopology,
  OSPFRouter,
  OSPFNetwork,
  OSPFLink,
  RouterRole,
} from "./ospf-types"

/**
 * Main parser: takes raw "show ip ospf database" text (and/or
 * "show ip ospf database router/network") and returns an OSPFTopology.
 */
export function parseOSPFData(input: string): OSPFTopology {
  const lines = input.split("\n")
  const routerLSAs = parseRouterLSAs(lines)
  const networkLSAs = parseNetworkLSAs(lines)

  const routerMap = new Map<string, OSPFRouter>()
  const networkMap = new Map<string, OSPFNetwork>()
  const links: OSPFLink[] = []
  const areas = new Set<string>()

  // p2pCosts accumulates link costs from both directions before building edges
  const p2pCosts = new Map<
    string,
    { srcId: string; tgtId: string; srcCost: number; tgtCost: number; ifInfo: string; area: string }
  >()

  // ── Build routers from Router LSAs ──────────────────────────
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
      if (!existing.lsaTypes.includes("Router LSA (Type 1)")) {
        existing.lsaTypes.push("Router LSA (Type 1)")
      }
    }

    const router = routerMap.get(rid)!

    for (const link of lsa.links) {
      if (link.type === "point-to-point") {
        if (!router.neighbors.includes(link.linkId)) {
          router.neighbors.push(link.linkId)
        }
        // Accumulate costs from both sides
        const key = [rid, link.linkId].sort().join("|")
        const existing = p2pCosts.get(key)
        if (existing) {
          if (rid === existing.srcId) {
            existing.srcCost = link.metric
          } else {
            existing.tgtCost = link.metric
          }
        } else {
          p2pCosts.set(key, {
            srcId: rid,
            tgtId: link.linkId,
            srcCost: link.metric,
            tgtCost: link.metric,
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

  // ── Build P2P links, ensuring both endpoints exist ──────────
  for (const [, p] of p2pCosts) {
    for (const rid of [p.srcId, p.tgtId]) {
      if (!routerMap.has(rid)) {
        routerMap.set(rid, {
          id: rid,
          routerId: rid,
          role: "internal",
          area: p.area,
          lsaTypes: [],
          neighbors: [],
          networks: [],
        })
      }
    }
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

  // ── Build networks from Network LSAs ─────────────────────────
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

  // ── Ensure all neighbor references exist as router nodes ────
  // Iterate over a snapshot so we can safely mutate routerMap
  for (const router of Array.from(routerMap.values())) {
    for (const neighborId of router.neighbors) {
      if (!routerMap.has(neighborId)) {
        routerMap.set(neighborId, {
          id: neighborId,
          routerId: neighborId,
          role: "internal",
          area: router.area,
          lsaTypes: [],
          neighbors: [],
          networks: [],
        })
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

  const blocks = splitLSABlocks(lines)

  for (const block of blocks) {
    // Track area from header pseudo-blocks
    if (block.isAreaHeader) {
      currentArea = block.area!
      continue
    }

    // Only process Router Link LSA blocks
    if (!block.lines.some((l) => /LS Type:\s*Router Links/i.test(l))) continue

    let age = 0
    let routerId = ""
    let advertisingRouter = ""
    let seqNumber = ""
    let checksum = ""
    let isABR = false
    let isASBR = false

    for (const line of block.lines) {
      const t = line.trim()

      // LS age: can be a number or "MAXAGE(3600)"
      const ageM = t.match(/^LS age:\s*(?:MAXAGE\()?(\d+)\)?/i)
      if (ageM) { age = parseInt(ageM[1]); continue }

      const lsidM = t.match(/^Link State ID:\s*([\d.]+)/i)
      if (lsidM) { routerId = lsidM[1]; continue }

      const advM = t.match(/^Advertising Router:\s*([\d.]+)/i)
      if (advM) { advertisingRouter = advM[1]; continue }

      const seqM = t.match(/^LS Seq Number:\s*(\S+)/i)
      if (seqM) { seqNumber = seqM[1]; continue }

      const csM = t.match(/^Checksum:\s*(\S+)/i)
      if (csM) { checksum = csM[1]; continue }

      if (/Area Border Router/i.test(t)) { isABR = true; continue }
      if (/AS Boundary Router/i.test(t)) { isASBR = true; continue }
    }

    // Prefer Advertising Router as the canonical router-id since it's always
    // the originating router's router-id. Link State ID equals it for Router LSAs,
    // but some IOS variants render them differently.
    const finalRouterId = advertisingRouter || routerId
    if (!finalRouterId) continue

    // Parse link sub-blocks within this LSA block
    const lsaLinks = parseLinkSubBlocks(block.lines)

    result.push({
      routerId: finalRouterId,
      area: currentArea,
      age,
      seqNumber,
      checksum,
      isABR,
      isASBR,
      links: lsaLinks,
    })
  }

  return result
}

// ─── Network LSA parser ─────────────────────────────────────

function parseNetworkLSAs(lines: string[]): RawNetworkLSA[] {
  const result: RawNetworkLSA[] = []
  let currentArea = "0"

  const blocks = splitLSABlocks(lines)

  for (const block of blocks) {
    if (block.isAreaHeader) {
      currentArea = block.area!
      continue
    }

    if (!block.lines.some((l) => /LS Type:\s*Network Links/i.test(l))) continue

    let linkStateId = ""
    let advertisingRouter = ""
    let age = 0
    let seqNumber = ""
    let checksum = ""
    let networkMask = ""
    const attachedRouters: string[] = []

    for (const line of block.lines) {
      const t = line.trim()
      const ageM = t.match(/^LS age:\s*(?:MAXAGE\()?(\d+)\)?/i)
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
      result.push({
        linkStateId,
        advertisingRouter,
        area: currentArea,
        age,
        seqNumber,
        checksum,
        networkMask,
        attachedRouters,
      })
    }
  }

  return result
}

// ─── Link sub-block parser ──────────────────────────────────

/**
 * Parse "Link connected to: ..." sub-blocks within a Router LSA block.
 * Handles both the classic Cisco IOS format and the detailed format from
 * "show ip ospf database router".
 */
function parseLinkSubBlocks(lsaLines: string[]): RawLink[] {
  const links: RawLink[] = []

  // Find all lines that start a link description
  const linkStartIndices: number[] = []
  for (let i = 0; i < lsaLines.length; i++) {
    if (/Link connected to:/i.test(lsaLines[i])) {
      linkStartIndices.push(i)
    }
  }

  for (let li = 0; li < linkStartIndices.length; li++) {
    const start = linkStartIndices[li]
    const end = li + 1 < linkStartIndices.length ? linkStartIndices[li + 1] : lsaLines.length

    const headerLine = lsaLines[start].trim()
    const connM = headerLine.match(/Link connected to:\s*(.+)/i)
    if (!connM) continue

    const desc = connM[1].trim()
    let linkType: RawLink["type"] = "stub"
    if (/point-to-point/i.test(desc)) linkType = "point-to-point"
    else if (/Transit/i.test(desc)) linkType = "transit"
    else if (/Stub/i.test(desc)) linkType = "stub"

    let linkId = ""
    let linkData = ""
    let metric = 0

    for (let i = start + 1; i < end; i++) {
      const t = lsaLines[i].trim()

      // "(Link ID) Designated Router address: X.X.X.X"
      // "(Link ID) Neighboring Router ID: X.X.X.X"
      // "(Link ID) Net's IP address: X.X.X.X"
      const lidM = t.match(/\(Link ID\)[^:]*:\s*([\d.]+)/i)
      if (lidM) { linkId = lidM[1]; continue }

      // "(Link Data) Router Interface address: X.X.X.X"
      // "(Link Data) Network Mask: /X or X.X.X.X"
      const ldM = t.match(/\(Link Data\)[^:]*:\s*([\d.\/]+)/i)
      if (ldM) { linkData = ldM[1]; continue }

      // "TOS 0 Metrics: N" or "TOS 0 Metric: N"
      const metM = t.match(/TOS\s+0\s+Metrics?:\s*(\d+)/i)
      if (metM) { metric = parseInt(metM[1]); continue }

      // Some IOS versions show just "Metric: N" inside a link block
      const metM2 = t.match(/^Metric:\s*(\d+)/i)
      if (metM2 && metric === 0) { metric = parseInt(metM2[1]); continue }
    }

    if (linkId) {
      links.push({ type: linkType, linkId, linkData, metric })
    }
  }

  return links
}

// ─── Block splitter ─────────────────────────────────────────

interface LSABlock {
  isAreaHeader: boolean
  area?: string         // set when isAreaHeader = true
  lines: string[]       // LSA content lines (empty when isAreaHeader)
}

/**
 * Split raw IOS lines into typed blocks:
 *  - Area header blocks (e.g. "Router Link States (Area 0)")
 *  - LSA content blocks (start at "LS age:")
 *
 * Handles:
 *  - "LS age: MAXAGE(3600)" — treated as a block boundary
 *  - Blank lines / comment lines between LSAs
 *  - Multiple command outputs concatenated (from SSH multi-command fetch)
 */
function splitLSABlocks(lines: string[]): LSABlock[] {
  const blocks: LSABlock[] = []
  let current: string[] | null = null

  const flushCurrent = () => {
    if (current && current.length > 0) {
      blocks.push({ isAreaHeader: false, lines: current })
    }
    current = null
  }

  for (const line of lines) {
    // Area / section header — e.g.:
    //   "                Router Link States (Area 0)"
    //   "                Net Link States (Area 1)"
    //   "                Summary Net Link States (Area 0)"
    const areaM = line.match(/(?:Router|Net|Summary\s+Net|Summary\s+AS|Type-7\s+AS\s+External)\s+Link\s+States\s+\(Area\s+([\d.]+)\)/i)
    if (areaM) {
      flushCurrent()
      blocks.push({ isAreaHeader: true, area: areaM[1], lines: [] })
      continue
    }

    // LSA boundary: "  LS age: N" or "  LS age: MAXAGE(N)"
    const isLSAStart = /^\s*LS age:\s*(?:\d+|MAXAGE\(\d+\))/i.test(line)
    if (isLSAStart) {
      flushCurrent()
      current = [line]
      continue
    }

    // Accumulate into current LSA block (or discard if no block started yet)
    if (current !== null) {
      current.push(line)
    }
  }

  flushCurrent()
  return blocks
}

// ─── Helpers ────────────────────────────────────────────────

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
