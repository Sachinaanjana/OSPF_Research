import type {
  OSPFTopology,
  OSPFRouter,
  OSPFNetwork,
  OSPFLink,
  OSPFInterface,
  OSPFSummaryRoute,
  OSPFExternalRoute,
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
  const summaryLSAs = parseSummaryLSAs(lines)       // Type 3 + Type 4
  const externalLSAs = parseExternalLSAs(lines)     // Type 5

  const routerMap = new Map<string, OSPFRouter>()
  const networkMap = new Map<string, OSPFNetwork>()
  const links: OSPFLink[] = []
  const areas = new Set<string>()

  // p2pCosts accumulates link costs from both directions before building edges
  const p2pCosts = new Map<
    string,
    { srcId: string; tgtId: string; srcCost: number; tgtCost: number; ifInfo: string; area: string }
  >()

  // Helper: ensure a router stub node exists
  const ensureRouter = (rid: string, area: string): OSPFRouter => {
    if (!routerMap.has(rid)) {
      routerMap.set(rid, {
        id: rid,
        routerId: rid,
        role: "internal",
        area,
        lsaTypes: [],
        neighbors: [],
        neighborInterfaces: {},
        interfaces: [],
        networks: [],
        stubNetworks: [],
        summaryRoutes: [],
        externalRoutes: [],
      })
    }
    return routerMap.get(rid)!
  }

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
        neighborInterfaces: {},
        interfaces: [],
        networks: [],
        stubNetworks: [],
        summaryRoutes: [],
        externalRoutes: [],
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
      // Update LSA metadata if more recent
      if (!existing.sequenceNumber) existing.sequenceNumber = lsa.seqNumber
      if (!existing.age) existing.age = lsa.age
      if (!existing.checksum) existing.checksum = lsa.checksum
    }

    const router = routerMap.get(rid)!

    for (const link of lsa.links) {
      if (link.type === "point-to-point") {
        if (!router.neighbors.includes(link.linkId)) router.neighbors.push(link.linkId)
        if (link.linkData && !router.neighborInterfaces[link.linkId]) {
          router.neighborInterfaces[link.linkId] = link.linkData
        }
        // Record interface
        if (link.linkData && !router.interfaces.some(i => i.address === link.linkData && i.connectedTo === link.linkId)) {
          router.interfaces.push({ address: link.linkData, connectedTo: link.linkId, linkType: "point-to-point", cost: link.metric })
        }
        const key = [rid, link.linkId].sort().join("|")
        const existing = p2pCosts.get(key)
        if (existing) {
          if (rid === existing.srcId) { existing.srcCost = link.metric; if (link.linkData) existing.ifInfo = link.linkData }
          else existing.tgtCost = link.metric
        } else {
          p2pCosts.set(key, { srcId: rid, tgtId: link.linkId, srcCost: link.metric, tgtCost: link.metric, ifInfo: link.linkData, area: lsa.area })
        }
      } else if (link.type === "stub") {
        const stubLabel = link.linkData ? `${link.linkId}/${link.linkData}` : link.linkId
        if (!router.stubNetworks.includes(stubLabel)) router.stubNetworks.push(stubLabel)
        const netId = `stub-${link.linkId}-${link.linkData}`
        if (!router.networks.includes(netId)) router.networks.push(netId)
        // Record interface for stub (linkData is the network mask, linkId is the network address)
        if (link.linkData && !router.interfaces.some(i => i.connectedTo === link.linkId && i.linkType === "stub")) {
          router.interfaces.push({ address: link.linkData, connectedTo: link.linkId, linkType: "stub", cost: link.metric })
        }
      } else if (link.type === "transit") {
        if (!router.networks.includes(link.linkId)) router.networks.push(link.linkId)
        // linkData is the router's interface IP on the transit network
        if (link.linkData && !router.interfaces.some(i => i.address === link.linkData && i.connectedTo === link.linkId)) {
          router.interfaces.push({ address: link.linkData, connectedTo: link.linkId, linkType: "transit", cost: link.metric })
        }
      }
    }
  }

  // ── Build P2P links, ensuring both endpoints exist ──────────
  for (const [, p] of p2pCosts) {
    // Ensure both routers exist
    const srcRouter = ensureRouter(p.srcId, p.area)
    const tgtRouter = ensureRouter(p.tgtId, p.area)

    // Bidirectionally populate neighbors and interfaces
    if (!srcRouter.neighbors.includes(p.tgtId)) {
      srcRouter.neighbors.push(p.tgtId)
    }
    if (!tgtRouter.neighbors.includes(p.srcId)) {
      tgtRouter.neighbors.push(p.srcId)
    }
    if (p.ifInfo && !srcRouter.neighborInterfaces[p.tgtId]) {
      srcRouter.neighborInterfaces[p.tgtId] = p.ifInfo
    }
    // Also store interface on the target side pointing back to source
    if (p.ifInfo && !tgtRouter.neighborInterfaces[p.srcId]) {
      tgtRouter.neighborInterfaces[p.srcId] = p.ifInfo
    }
    // Record interface entry on target router too
    if (p.ifInfo && !tgtRouter.interfaces.some(i => i.connectedTo === p.srcId && i.linkType === "point-to-point")) {
      tgtRouter.interfaces.push({ address: p.ifInfo, connectedTo: p.srcId, linkType: "point-to-point", cost: p.tgtCost })
    }

    console.log("[v0] P2P link:", p.srcId, "<->", p.tgtId, "src neighbors:", srcRouter.neighbors, "tgt neighbors:", tgtRouter.neighbors)

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
      const arRouter = ensureRouter(ar, nlsa.area)
      if (!arRouter.networks.includes(nid)) {
        arRouter.networks.push(nid)
      }
      if (ar === nlsa.advertisingRouter) {
        if (!arRouter.lsaTypes.includes("Network LSA (Type 2)")) {
          arRouter.lsaTypes.push("Network LSA (Type 2)")
        }
      }
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
    }
  }

  // ── Ensure all neighbor refs exist and are bidirectional ─────
  for (const router of Array.from(routerMap.values())) {
    for (const neighborId of router.neighbors) {
      const nb = ensureRouter(neighborId, router.area)
      if (!nb.neighbors.includes(router.id)) {
        nb.neighbors.push(router.id)
      }
    }
  }

  // ── Attach Summary LSAs (Type 3 / Type 4) to advertising routers ──
  for (const s of summaryLSAs) {
    const router = ensureRouter(s.advertisingRouter, s.area)
    if (!router.lsaTypes.includes(s.lsaType)) router.lsaTypes.push(s.lsaType)
    if (s.lsaType === "ASBR Summary LSA (Type 4)" && router.role === "internal") router.role = "abr"
    router.summaryRoutes.push(s)
  }

  // ── Attach External LSAs (Type 5) to advertising routers (ASBRs) ──
  for (const e of externalLSAs) {
    const router = ensureRouter(e.advertisingRouter, "0")
    if (!router.lsaTypes.includes("AS External LSA (Type 5)")) router.lsaTypes.push("AS External LSA (Type 5)")
    if (router.role === "internal") router.role = "asbr"
    router.externalRoutes.push(e)
  }

  // ── Debug: trace specific router ─────────────────────────
  const debugRouter = routerMap.get("203.143.61.7")
  if (debugRouter) {
    console.log("[v0] 203.143.61.7 found in routerMap:", JSON.stringify({
      neighbors: debugRouter.neighbors,
      neighborInterfaces: debugRouter.neighborInterfaces,
      interfaces: debugRouter.interfaces,
      networks: debugRouter.networks,
      lsaTypes: debugRouter.lsaTypes,
    }, null, 2))
  } else {
    console.log("[v0] 203.143.61.7 NOT found in routerMap at all")
  }

  return {
    routers: Array.from(routerMap.values()),
    networks: Array.from(networkMap.values()),
    links: dedup(links),
    areas: Array.from(areas).sort(),
    summaryRoutes: summaryLSAs,
    externalRoutes: externalLSAs,
  }
}

// ─── Internal types ���─────────────────────────────────────────

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
    if (block.isAreaHeader) {
      currentArea = block.area!
      continue
    }
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

    const finalRouterId = advertisingRouter || routerId
    if (!finalRouterId) continue

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
    if (block.isAreaHeader) { currentArea = block.area!; continue }
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
      result.push({ linkStateId, advertisingRouter, area: currentArea, age, seqNumber, checksum, networkMask, attachedRouters })
    }
  }

  return result
}

// ─── Link sub-block parser ──────────────────────────────────

function parseLinkSubBlocks(lsaLines: string[]): RawLink[] {
  const links: RawLink[] = []
  const linkStartIndices: number[] = []

  for (let i = 0; i < lsaLines.length; i++) {
    if (/Link connected to:/i.test(lsaLines[i])) linkStartIndices.push(i)
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

      const lidM = t.match(/(?:\(Link ID\)[^:]*|Link\s+ID):\s*([\d.]+)/i)
      if (lidM) { linkId = lidM[1]; continue }

      const ldM = t.match(/(?:\(Link Data\)[^:]*|Link\s+Data):\s*([\d.\/]+)/i)
      if (ldM) { linkData = ldM[1]; continue }

      const metM = t.match(/TOS\s*:?\s*0\s+Metrics?:\s*(\d+)/i)
      if (metM) { metric = parseInt(metM[1]); continue }

      const metM2 = t.match(/^Metric:\s*(\d+)/i)
      if (metM2 && metric === 0) { metric = parseInt(metM2[1]); continue }
    }

    if (linkId) links.push({ type: linkType, linkId, linkData, metric })
  }

  return links
}

// ─── Block splitter ─────────────────────────────────────────

interface LSABlock {
  isAreaHeader: boolean
  area?: string
  lines: string[]
}

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
    const areaM = line.match(/(?:Router|Net|Summary\s+Net|Summary\s+AS|Type-7\s+AS\s+External)\s+Link\s+States\s+\(Area\s+([\d.]+)\)/i)
    if (areaM) {
      flushCurrent()
      blocks.push({ isAreaHeader: true, area: areaM[1], lines: [] })
      continue
    }

    const isLSAStart = /^\s*LS age:\s*(?:\d+|MAXAGE\(\d+\))/i.test(line)
    if (isLSAStart) {
      flushCurrent()
      current = [line]
      continue
    }

    if (current !== null) current.push(line)
  }

  flushCurrent()
  return blocks
}

// ─── Summary LSA parser (Type 3 + Type 4) ──────────────────

function parseSummaryLSAs(lines: string[]): OSPFSummaryRoute[] {
  const result: OSPFSummaryRoute[] = []
  let currentArea = "0"
  const blocks = splitLSABlocks(lines)

  for (const block of blocks) {
    if (block.isAreaHeader) { currentArea = block.area!; continue }

    const isType3 = block.lines.some((l) => /LS Type:\s*Summary Links\s*\(Network\)/i.test(l))
    const isType4 = block.lines.some((l) => /LS Type:\s*Summary Links\s*\(AS Boundary Router\)/i.test(l))
    if (!isType3 && !isType4) continue

    let network = ""
    let mask = ""
    let cost = 0
    let advertisingRouter = ""
    let seqNumber = ""
    let age = 0

    for (const line of block.lines) {
      const t = line.trim()
      const ageM = t.match(/^LS age:\s*(?:MAXAGE\()?(\d+)\)?/i)
      if (ageM) { age = parseInt(ageM[1]); continue }
      const lsidM = t.match(/^Link State ID:\s*([\d.]+)/i)
      if (lsidM) { network = lsidM[1]; continue }
      const advM = t.match(/^Advertising Router:\s*([\d.]+)/i)
      if (advM) { advertisingRouter = advM[1]; continue }
      const seqM = t.match(/^LS Seq Number:\s*(\S+)/i)
      if (seqM) { seqNumber = seqM[1]; continue }
      const maskM = t.match(/^Network Mask:\s*(\S+)/i)
      if (maskM) { mask = maskM[1]; continue }
      const metM = t.match(/TOS\s*:?\s*0\s+Metrics?:\s*(\d+)/i)
      if (metM) { cost = parseInt(metM[1]); continue }
      const metM2 = t.match(/^Metric:\s*(\d+)/i)
      if (metM2 && cost === 0) { cost = parseInt(metM2[1]); continue }
    }

    if (network && advertisingRouter) {
      result.push({
        network,
        mask,
        cost,
        area: currentArea,
        lsaType: isType4 ? "ASBR Summary LSA (Type 4)" : "Summary LSA (Type 3)",
        advertisingRouter,
        seqNumber,
        age,
      })
    }
  }

  return result
}

// ─── External LSA parser (Type 5) ──────────────────────────

function parseExternalLSAs(lines: string[]): OSPFExternalRoute[] {
  const result: OSPFExternalRoute[] = []
  const blocks = splitLSABlocks(lines)

  for (const block of blocks) {
    if (block.isAreaHeader) continue
    const isType5 = block.lines.some((l) => /LS Type:\s*AS External Link/i.test(l))
    if (!isType5) continue

    let network = ""
    let mask = ""
    let metric = 0
    let metricType: 1 | 2 = 2
    let tag = 0
    let forwardingAddress = ""
    let advertisingRouter = ""
    let seqNumber = ""
    let age = 0

    for (const line of block.lines) {
      const t = line.trim()
      const ageM = t.match(/^LS age:\s*(?:MAXAGE\()?(\d+)\)?/i)
      if (ageM) { age = parseInt(ageM[1]); continue }
      const lsidM = t.match(/^Link State ID:\s*([\d.]+)/i)
      if (lsidM) { network = lsidM[1]; continue }
      const advM = t.match(/^Advertising Router:\s*([\d.]+)/i)
      if (advM) { advertisingRouter = advM[1]; continue }
      const seqM = t.match(/^LS Seq Number:\s*(\S+)/i)
      if (seqM) { seqNumber = seqM[1]; continue }
      const maskM = t.match(/^Network Mask:\s*(\S+)/i)
      if (maskM) { mask = maskM[1]; continue }
      const metTypeM = t.match(/Metric Type:\s*(\d+)/i)
      if (metTypeM) { metricType = parseInt(metTypeM[1]) === 1 ? 1 : 2; continue }
      const metM = t.match(/TOS\s*:?\s*0\s+Metrics?:\s*(\d+)/i)
      if (metM) { metric = parseInt(metM[1]); continue }
      const metM2 = t.match(/^Metric:\s*(\d+)/i)
      if (metM2 && metric === 0) { metric = parseInt(metM2[1]); continue }
      const fwdM = t.match(/Forwarding\s+Address:\s*([\d.]+)/i)
      if (fwdM) { forwardingAddress = fwdM[1]; continue }
      const tagM = t.match(/External\s+Route\s+Tag:\s*(\d+)/i)
      if (tagM) { tag = parseInt(tagM[1]); continue }
    }

    if (network && advertisingRouter) {
      result.push({
        network,
        mask,
        metric,
        metricType,
        tag,
        forwardingAddress,
        advertisingRouter,
        seqNumber,
        age,
      })
    }
  }

  return result
}

function dedup(links: OSPFLink[]): OSPFLink[] {
  const seen = new Map<string, OSPFLink>()
  for (const l of links) {
    const key = [l.source, l.target].sort().join("|") + "|" + l.linkType
    if (!seen.has(key)) {
      seen.set(key, l)
    } else {
      // Keep the entry with more information (prefer one with cost > 0)
      const existing = seen.get(key)!
      if (l.cost > 0 && existing.cost === 0) seen.set(key, l)
      if (l.interfaceInfo && !existing.interfaceInfo) existing.interfaceInfo = l.interfaceInfo
    }
  }
  return Array.from(seen.values())
}
