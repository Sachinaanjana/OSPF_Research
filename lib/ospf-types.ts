export type RouterRole = "internal" | "abr" | "asbr"

export type LinkType = "stub" | "transit" | "point-to-point" | "virtual"

export type LSAType =
  | "Router LSA (Type 1)"
  | "Network LSA (Type 2)"
  | "Summary LSA (Type 3)"
  | "ASBR Summary LSA (Type 4)"
  | "AS External LSA (Type 5)"

export interface OSPFRouter {
  id: string
  routerId: string
  role: RouterRole
  area: string
  lsaTypes: LSAType[]
  neighbors: string[]
  networks: string[]
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
}
