export type RouterRole = "internal" | "abr" | "asbr"

export type LinkType = "stub" | "transit" | "point-to-point" | "virtual"

export type LSAType =
  | "Router LSA (Type 1)"
  | "Network LSA (Type 2)"
  | "Summary LSA (Type 3)"
  | "ASBR Summary LSA (Type 4)"
  | "AS External LSA (Type 5)"

export type ViewFilter = "all" | "cost-unbalanced" | "cost-balanced" | "abr" | "asbr" | "down"

export interface OSPFInterface {
  address: string
  connectedTo: string
  linkType: "point-to-point" | "stub" | "transit"
  cost: number
  // from show ip ospf interface
  ifName?: string          // e.g. "GigabitEthernet0/0"
  state?: string           // e.g. "DR", "BDR", "DROther", "P2P"
  drAddress?: string
  bdrAddress?: string
  helloInterval?: number
  deadInterval?: number
  area?: string
}

export interface OSPFNeighborEntry {
  neighborId: string       // neighbor router ID
  priority: number
  state: string            // e.g. "FULL/DR", "FULL/BDR", "FULL/-"
  deadTime: string         // remaining dead timer
  address: string          // neighbor interface IP
  interface: string        // local interface name
}

export interface OSPFSummaryRoute {
  network: string
  mask: string
  cost: number
  area: string
  lsaType: "Summary LSA (Type 3)" | "ASBR Summary LSA (Type 4)"
  advertisingRouter: string
  seqNumber?: string
  age?: number
}

export interface OSPFExternalRoute {
  network: string
  mask: string
  metric: number
  metricType: 1 | 2
  tag: number
  forwardingAddress: string
  advertisingRouter: string
  seqNumber?: string
  age?: number
}

export interface OSPFLearnedRoute {
  prefix: string           // e.g. "10.0.0.0/24"
  routeType: string        // e.g. "O", "O IA", "O E1", "O E2"
  metric: number
  nextHop: string
  outInterface: string
  tag?: number
}

export interface OSPFProcessInfo {
  processId: string
  routerId: string
  spfAlgorithm?: string
  numberOfAreas?: number
  referencesBandwidth?: number
}

export interface OSPFRouter {
  id: string
  routerId: string
  role: RouterRole
  area: string
  lsaTypes: LSAType[]
  neighbors: string[]
  neighborInterfaces: Record<string, string>
  neighborEntries: OSPFNeighborEntry[]     // from show ip ospf neighbor
  interfaces: OSPFInterface[]
  networks: string[]
  stubNetworks: string[]
  summaryRoutes: OSPFSummaryRoute[]
  externalRoutes: OSPFExternalRoute[]
  learnedRoutes: OSPFLearnedRoute[]        // from show ip route ospf
  processInfo?: OSPFProcessInfo            // from show ip ospf
  sequenceNumber?: string
  age?: number
  checksum?: string
}

export interface OSPFNetwork {
  id: string
  networkAddress: string
  mask: string
  attachedRouters: string[]
  designatedRouter?: string
  area: string
}

export interface OSPFLink {
  id: string
  source: string
  target: string
  cost: number
  sourceCost: number
  targetCost: number
  linkType: LinkType
  interfaceInfo?: string
  area: string
}

export interface OSPFTopology {
  routers: OSPFRouter[]
  networks: OSPFNetwork[]
  links: OSPFLink[]
  areas: string[]
  summaryRoutes: OSPFSummaryRoute[]
  externalRoutes: OSPFExternalRoute[]
  processInfo?: OSPFProcessInfo
}

export interface GraphNode {
  id: string
  type: "router" | "network"
  label: string
  role?: RouterRole
  area: string
  x: number
  y: number
  data: OSPFRouter | OSPFNetwork
  status?: NodeStatus
  statusTimestamp?: number
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  cost: number
  sourceCost: number
  targetCost: number
  linkType: LinkType
  area: string
  interfaceInfo?: string
  status?: EdgeStatus
  statusTimestamp?: number
  oldCost?: number
}

export type NodeStatus = "stable" | "new" | "removed" | "changed"
export type EdgeStatus = "stable" | "new" | "removed" | "changed"

export type TopologyChangeType =
  | "router-added"
  | "router-removed"
  | "link-added"
  | "link-removed"
  | "metric-changed"
  | "area-changed"

export interface TopologyChange {
  id: string
  type: TopologyChangeType
  routerId?: string
  linkId?: string
  description: string
  oldValue?: string | number
  newValue?: string | number
  timestamp: number
}

export interface PollingState {
  enabled: boolean
  interval: number
  lastUpdated: number | null
  status: "idle" | "polling" | "connected" | "error"
  errorMessage?: string
}

export type LayoutAlgorithm = "force-directed" | "hierarchical" | "radial"

export interface VisualizationState {
  nodes: GraphNode[]
  edges: GraphEdge[]
  selectedNodeId: string | null
  selectedEdgeId: string | null
  layout: LayoutAlgorithm
  showLabels: boolean
  showMetrics: boolean
  colorBy: "area" | "lsa-type" | "role"
  zoom: number
  panX: number
  panY: number
  filterArea: string | null
  filterLinkType: LinkType | null
  viewFilter: ViewFilter
}

export interface OSPFSummaryRoute {
  network: string      // destination prefix
  mask: string
  cost: number
  area: string         // area this summary came from
  lsaType: "Summary LSA (Type 3)" | "ASBR Summary LSA (Type 4)"
  advertisingRouter: string
  seqNumber?: string
  age?: number
}

export interface OSPFExternalRoute {
  network: string      // destination prefix
  mask: string
  metric: number
  metricType: 1 | 2    // E1 or E2
  tag: number
  forwardingAddress: string
  advertisingRouter: string
  seqNumber?: string
  age?: number
}

export interface OSPFRouter {
  id: string
  routerId: string
  role: RouterRole
  area: string
  lsaTypes: LSAType[]
  neighbors: string[]
  neighborInterfaces: Record<string, string>
  interfaces: OSPFInterface[]
  networks: string[]
  stubNetworks: string[]
  summaryRoutes: OSPFSummaryRoute[]       // Type 3 + Type 4 LSAs originated by this router
  externalRoutes: OSPFExternalRoute[]     // Type 5 LSAs originated by this router (ASBR)
  sequenceNumber?: string
  age?: number
  checksum?: string
}

export interface OSPFNetwork {
  id: string
  networkAddress: string
  mask: string
  attachedRouters: string[]
  designatedRouter?: string
  area: string
}

export interface OSPFLink {
  id: string
  source: string
  target: string
  cost: number
  sourceCost: number
  targetCost: number
  linkType: LinkType
  interfaceInfo?: string
  area: string
}

export interface OSPFTopology {
  routers: OSPFRouter[]
  networks: OSPFNetwork[]
  links: OSPFLink[]
  areas: string[]
  summaryRoutes: OSPFSummaryRoute[]    // all Type 3 / Type 4 LSAs
  externalRoutes: OSPFExternalRoute[]  // all Type 5 LSAs
}

export interface GraphNode {
  id: string
  type: "router" | "network"
  label: string
  role?: RouterRole
  area: string
  x: number
  y: number
  data: OSPFRouter | OSPFNetwork
  status?: NodeStatus
  statusTimestamp?: number
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  cost: number
  sourceCost: number    // cost from source side
  targetCost: number    // cost from target side
  linkType: LinkType
  area: string
  interfaceInfo?: string
  status?: EdgeStatus
  statusTimestamp?: number
  oldCost?: number
}

// Real-time status types
export type NodeStatus = "stable" | "new" | "removed" | "changed"
export type EdgeStatus = "stable" | "new" | "removed" | "changed"

export type TopologyChangeType =
  | "router-added"
  | "router-removed"
  | "link-added"
  | "link-removed"
  | "metric-changed"
  | "area-changed"

export interface TopologyChange {
  id: string
  type: TopologyChangeType
  routerId?: string
  linkId?: string
  description: string
  oldValue?: string | number
  newValue?: string | number
  timestamp: number
}

export interface PollingState {
  enabled: boolean
  interval: number // ms
  lastUpdated: number | null
  status: "idle" | "polling" | "connected" | "error"
  errorMessage?: string
}

export type LayoutAlgorithm = "force-directed" | "hierarchical" | "radial"

export interface VisualizationState {
  nodes: GraphNode[]
  edges: GraphEdge[]
  selectedNodeId: string | null
  selectedEdgeId: string | null
  layout: LayoutAlgorithm
  showLabels: boolean
  showMetrics: boolean
  colorBy: "area" | "lsa-type" | "role"
  zoom: number
  panX: number
  panY: number
  filterArea: string | null
  filterLinkType: LinkType | null
  viewFilter: ViewFilter
}
