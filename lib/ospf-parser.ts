import type {
  OSPFTopology,
  OSPFRouter,
  OSPFNetwork,
  OSPFLink,
  OSPFInterface,
  OSPFSummaryRoute,
  OSPFExternalRoute,
  OSPFNeighborEntry,
  OSPFLearnedRoute,
  OSPFProcessInfo,
  RouterRole,
} from "./ospf-types"

// ─── Multi-command input structure ─────────────────────────

export interface MultiCommandInput {
  showIpOspf?: string               // show ip ospf
  showIpOspfNeighbor?: string       // show ip ospf neighbor
  showIpOspfDatabaseRouter?: string // show ip ospf database router
  showIpOspfDatabaseNetwork?: string// show ip ospf database network
  showIpOspfInterface?: string      // show ip ospf interface
  showIpRouteOspf?: string          // show ip route ospf
  // legacy single-field input
  raw?: string
}

/**
 * Main entry point. Accepts either a MultiCommandInput object or
 * a raw string (legacy single-textarea mode).
 */
export function parseOSPFData(input: string | MultiCommandInput): OSPFTopology {
  let multi: MultiCommandInput

  if (typeof input === "string") {
    // Legacy mode: treat as combined database output
    multi = { raw: input }
  } else {
    multi = input
  }

  // Combine router + network database text (and raw fallback)
  const dbText = [
    multi.raw ?? "",
    multi.showIpOspfDatabaseRouter ?? "",
    multi.showIpOspfDatabaseNetwork ?? "",
  ].join("\n")

  const lines = dbText.split("\n")
  const routerLSAs = parseRouterLSAs(lines)
  const networkLSAs = parseNetworkLSAs(lines)
  const summaryLSAs = parseSummaryLSAs(lines)
  const externalLSAs = parseExternalLSAs(lines)

  // Parse auxiliary command outputs
  const processInfo = multi.showIpOspf ? parseShowIpOspf(multi.showIpOspf) : undefined
  const neighborEntries = multi.showIpOspfNeighbor ? parseShowIpOspfNeighbor(multi.showIpOspfNeighbor) : []
  const ifaceDetails = multi.showIpOspfInterface ? parseShowIpOspfInterface(multi.showIpOspfInterface) : []
  const learnedRoutes = multi.showIpRouteOspf ? parseShowIpRouteOspf(multi.showIpRouteOspf) : []

  const routerMap = new Map<string, OSPFRouter>()
  const networkMap = new Map<string, OSPFNetwork>()
  const links: OSPFLink[] = []
  const areas = new Set<string>()

  const p2pCosts = new Map<
    string,
    { srcId: string; tgtId: string; srcCost: number; tgtCost: number; ifInfo: string; area: string }
  >()

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
        neighborEntries: [],
        interfaces: [],
        networks: [],
        stubNetworks: [],
        summaryRoutes: [],
        externalRoutes: [],
        learnedRoutes: [],
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
        neighborEntries: [],
        interfaces: [],
        networks: [],
        stubNetworks: [],
        summaryRoutes: [],
        externalRoutes: [],
        learnedRoutes: [],
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
        if (link.linkData && !router.interfaces.some(i => i.connectedTo === link.linkId && i.linkType === "stub")) {
          router.interfaces.push({ address: link.linkData, connectedTo: link.linkId, linkType: "stub", cost: link.metric })
        }
      } else if (link.type === "transit") {
        if (!router.networks.includes(link.linkId)) router.networks.push(link.linkId)
        if (link.linkData && !router.interfaces.some(i => i.address === link.linkData && i.connectedTo === link.linkId)) {
          router.interfaces.push({ address: link.linkData, connectedTo: link.linkId, linkType: "transit", cost: link.metric })
        }
      }
    }
  }

  // ── Build P2P links ──────────────────────────────────────
  for (const [, p] of p2pCosts) {
    const srcRouter = ensureRouter(p.srcId, p.area)
    const tgtRouter = ensureRouter(p.tgtId, p.area)

    if (!srcRouter.neighbors.includes(p.tgtId)) srcRouter.neighbors.push(p.tgtId)
    if (!tgtRouter.neighbors.includes(p.srcId)) tgtRouter.neighbors.push(p.srcId)
    if (p.ifInfo && !srcRouter.neighborInterfaces[p.tgtId]) srcRouter.neighborInterfaces[p.tgtId] = p.ifInfo
    if (p.ifInfo && !tgtRouter.neighborInterfaces[p.srcId]) tgtRouter.neighborInterfaces[p.srcId] = p.ifInfo
    if (p.ifInfo && !tgtRouter.interfaces.some(i => i.connectedTo === p.srcId && i.linkType === "point-to-point")) {
      tgtRouter.interfaces.push({ address: p.ifInfo, connectedTo: p.srcId, linkType: "point-to-point", cost: p.tgtCost })
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

  // ── Build networks from Network LSAs ─────────────────────
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
      if (!arRouter.networks.includes(nid)) arRouter.networks.push(nid)
      if (ar === nlsa.advertisingRouter && !arRouter.lsaTypes.includes("Network LSA (Type 2)")) {
        arRouter.lsaTypes.push("Network LSA (Type 2)")
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

  // ── Bidirectional neighbor enforcement ──────────────────
  for (const router of Array.from(routerMap.values())) {
    for (const neighborId of router.neighbors) {
      const nb = ensureRouter(neighborId, router.area)
      if (!nb.neighbors.includes(router.id)) nb.neighbors.push(router.id)
    }
  }

  // ── Attach Summary LSAs ──────────────────────────────────
  for (const s of summaryLSAs) {
    const router = ensureRouter(s.advertisingRouter, s.area)
    if (!router.lsaTypes.includes(s.lsaType)) router.lsaTypes.push(s.lsaType)
    if (s.lsaType === "ASBR Summary LSA (Type 4)" && router.role === "internal") router.role = "abr"
    router.summaryRoutes.push(s)
  }

  // ── Attach External LSAs ────────────────────────────────
  for (const e of externalLSAs) {
    const router = ensureRouter(e.advertisingRouter, "0")
    if (!router.lsaTypes.includes("AS External LSA (Type 5)")) router.lsaTypes.push("AS External LSA (Type 5)")
    if (router.role === "internal") router.role = "asbr"
    router.externalRoutes.push(e)
  }

  // ── Attach neighbor entries (show ip ospf neighbor) ──────
  // Group neighbor entries by their neighbor ID — attach to matching routers
  for (const ne of neighborEntries) {
    // Try to find a router whose ID matches the neighbor entry's neighborId
    // If not found, also try to find by the interface address
    const router = routerMap.get(ne.neighborId) ?? findRouterByInterface(routerMap, ne.address)
    if (router && !router.neighborEntries.some(e => e.neighborId === ne.neighborId && e.interface === ne.interface)) {
      router.neighborEntries.push(ne)
    }
    // Also ensure the neighbor is in the neighbors list of the LOCAL router
    // The local router is the one whose output we're reading — but we don't know which that is.
    // We'll attach the entry to the neighbor router for display purposes.
  }

  // ── Enrich interfaces with show ip ospf interface data ──
  for (const detail of ifaceDetails) {
    // Find router by interface address or by matching area
    for (const router of Array.from(routerMap.values())) {
      const iface = router.interfaces.find(i => i.address === detail.address || i.connectedTo === detail.connectedTo)
      if (iface) {
        iface.ifName = detail.ifName
        iface.state = detail.state
        iface.drAddress = detail.drAddress
        iface.bdrAddress = detail.bdrAddress
        iface.helloInterval = detail.helloInterval
        iface.deadInterval = detail.deadInterval
        iface.area = detail.area
        if (detail.cost > 0 && iface.cost === 0) iface.cost = detail.cost
        break
      }
    }
  }

  // ── Attach learned routes (show ip route ospf) ──────────
  // These routes are local to the router we ran the command on — 
  // but since we don't know which router, attach to the process owner.
  if (learnedRoutes.length > 0) {
    const owner = processInfo?.routerId
      ? routerMap.get(processInfo.routerId)
      : Array.from(routerMap.values()).find(r => r.lsaTypes.length > 0)
    if (owner) {
      owner.learnedRoutes = learnedRoutes
    }
  }

  // ── Attach process info ──────────────────────────────────
  if (processInfo) {
    const owner = routerMap.get(processInfo.routerId)
    if (owner) owner.processInfo = processInfo
  }

  return {
    routers: Array.from(routerMap.values()),
    networks: Array.from(networkMap.values()),
    links: dedup(links),
    areas: Array.from(areas).sort(),
    summaryRoutes: summaryLSAs,
    externalRoutes: externalLSAs,
    processInfo,
  }
}

function findRouterByInterface(routerMap: Map<string, OSPFRouter>, address: string): OSPFRouter | undefined {
  for (const router of Array.from(routerMap.values())) {
    if (router.interfaces.some(i => i.address === address)) return router
  }
  return undefined
}

// ─── Internal types ─────────────────────────────────────────

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

// ─── show ip ospf parser ────────────────────────────────────

function parseShowIpOspf(text: string): OSPFProcessInfo | undefined {
  const lines = text.split("\n")
  let processId = ""
  let routerId = ""
  let numberOfAreas: number | undefined
  let referencesBandwidth: number | undefined

  for (const line of lines) {
    const t = line.trim()
    const pidM = t.match(/Routing Process "ospf\s+(\d+)"/i)
    if (pidM) { processId = pidM[1]; continue }
    const ridM = t.match(/Router ID\s+([\d.]+)/i)
    if (ridM) { routerId = ridM[1]; continue }
    const areaM = t.match(/Number of areas[^:]*:\s*(\d+)/i)
    if (areaM) { numberOfAreas = parseInt(areaM[1]); continue }
    const bwM = t.match(/Reference bandwidth unit is\s+(\d+)/i)
    if (bwM) { referencesBandwidth = parseInt(bwM[1]); continue }
  }

  if (!processId && !routerId) return undefined
  return { processId, routerId, numberOfAreas, referencesBandwidth }
}

// ─── show ip ospf neighbor parser ──────────────────────────

function parseShowIpOspfNeighbor(text: string): OSPFNeighborEntry[] {
  const entries: OSPFNeighborEntry[] = []
  const lines = text.split("\n")

  for (const line of lines) {
    // Typical Cisco IOS format:
    // Neighbor ID     Pri   State           Dead Time   Address         Interface
    // 1.1.1.1           1   FULL/DR         00:00:38    10.0.0.1        GigabitEthernet0/0
    const m = line.match(
      /^\s*([\d.]+)\s+(\d+)\s+(\S+\/\S+|\S+)\s+(\S+)\s+([\d.]+)\s+(\S+)/
    )
    if (m) {
      entries.push({
        neighborId: m[1],
        priority: parseInt(m[2]),
        state: m[3],
        deadTime: m[4],
        address: m[5],
        interface: m[6],
      })
    }
  }

  return entries
}

// ─── show ip ospf interface parser ─────────────────────────

function parseShowIpOspfInterface(text: string): Partial<OSPFInterface>[] {
  const result: Partial<OSPFInterface>[] = []
  const lines = text.split("\n")
  let current: Partial<OSPFInterface> | null = null

  const flush = () => {
    if (current && (current.ifName || current.address)) result.push(current)
    current = null
  }

  for (const line of lines) {
    const t = line.trim()

    // New interface block: "GigabitEthernet0/0 is up, line protocol is up"
    const ifM = line.match(/^(\S+)\s+is\s+(up|down)/i)
    if (ifM) {
      flush()
      current = { ifName: ifM[1] }
      continue
    }
    if (!current) continue

    // "Internet Address 10.0.0.1/24, Area 0"
    const addrM = t.match(/Internet Address\s+([\d.]+)(?:\/\d+)?,\s*Area\s+([\d.]+)/i)
    if (addrM) { current.address = addrM[1]; current.area = addrM[2]; continue }

    // "Process ID 1, Router ID 1.1.1.1, Network Type POINT_TO_POINT, Cost: 1"
    const costM = t.match(/Cost:\s*(\d+)/i)
    if (costM) { current.cost = parseInt(costM[1]); continue }

    const netTypeM = t.match(/Network Type\s+(\S+)/i)
    if (netTypeM) {
      const nt = netTypeM[1].toUpperCase()
      if (nt.includes("POINT")) current.linkType = "point-to-point"
      else if (nt.includes("TRANSIT") || nt.includes("BROADCAST")) current.linkType = "transit"
      else current.linkType = "stub"
      continue
    }

    // "State DR, Network type BROADCAST"
    const stateM = t.match(/^State\s+(\S+)/i)
    if (stateM) { current.state = stateM[1]; continue }

    // "Designated Router (ID) 1.1.1.1, Interface address 10.0.0.1"
    const drM = t.match(/Designated Router.*?Interface address\s+([\d.]+)/i)
    if (drM) { current.drAddress = drM[1]; continue }

    const bdrM = t.match(/Backup Designated Router.*?Interface address\s+([\d.]+)/i)
    if (bdrM) { current.bdrAddress = bdrM[1]; continue }

    // "Timer intervals configured, Hello 10, Dead 40"
    const timerM = t.match(/Hello\s+(\d+),\s*Dead\s+(\d+)/i)
    if (timerM) { current.helloInterval = parseInt(timerM[1]); current.deadInterval = parseInt(timerM[2]); continue }
  }
  flush()
  return result
}

// ─── show ip route ospf parser ──────────────────────────────

function parseShowIpRouteOspf(text: string): OSPFLearnedRoute[] {
  const routes: OSPFLearnedRoute[] = []
  const lines = text.split("\n")

  for (const line of lines) {
    // Cisco IOS route line:
    // O     10.0.0.0/24 [110/20] via 192.168.1.1, 00:01:00, GigabitEthernet0/0
    // O IA  172.16.0.0/16 [110/30] via ...
    // O E2  0.0.0.0/0 [110/1] via ...
    const m = line.match(
      /^\s*(O(?:\s+(?:IA|E1|E2|N1|N2))?)\s+([\d.]+\/\d+)\s+\[(\d+)\/(\d+)\]\s+via\s+([\d.]+)(?:,\s*\S+,\s*(\S+))?/
    )
    if (m) {
      routes.push({
        prefix: m[2],
        routeType: m[1].trim(),
        metric: parseInt(m[4]),
        nextHop: m[5],
        outInterface: m[6] ?? "",
        tag: undefined,
      })
    }
  }

  return routes
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
        network, mask, cost, area: currentArea,
        lsaType: isType4 ? "ASBR Summary LSA (Type 4)" : "Summary LSA (Type 3)",
        advertisingRouter, seqNumber, age,
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
      result.push({ network, mask, metric, metricType, tag, forwardingAddress, advertisingRouter, seqNumber, age })
    }
  }

  return result
}

// ─── Dedup helper ───────────────────────────────────────────

function dedup(links: OSPFLink[]): OSPFLink[] {
  const seen = new Map<string, OSPFLink>()
  for (const link of links) {
    const key = `${[link.source, link.target].sort().join("|")}|${link.linkType}`
    const existing = seen.get(key)
    if (!existing) {
      seen.set(key, { ...link })
    } else {
      // Keep the entry with the most info
      if (link.cost > 0 && existing.cost === 0) existing.cost = link.cost
      if (link.sourceCost > 0 && existing.sourceCost === 0) existing.sourceCost = link.sourceCost
      if (link.targetCost > 0 && existing.targetCost === 0) existing.targetCost = link.targetCost
      if (link.interfaceInfo && !existing.interfaceInfo) existing.interfaceInfo = link.interfaceInfo
    }
  }
  return Array.from(seen.values())
}
