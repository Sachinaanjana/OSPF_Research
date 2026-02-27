import type { OSPFTopology, TopologyChange, GraphNode, GraphEdge } from "./ospf-types"

let changeCounter = 0
function nextChangeId(): string {
  return `change-${Date.now()}-${changeCounter++}`
}

/**
 * Compare two OSPF topology snapshots and return a list of changes.
 */
export function diffTopologies(
  oldTopo: OSPFTopology,
  newTopo: OSPFTopology
): TopologyChange[] {
  const changes: TopologyChange[] = []
  const now = Date.now()

  const oldRouterIds = new Set(oldTopo.routers.map((r) => r.routerId))
  const newRouterIds = new Set(newTopo.routers.map((r) => r.routerId))

  // Detect new routers
  for (const r of newTopo.routers) {
    if (!oldRouterIds.has(r.routerId)) {
      changes.push({
        id: nextChangeId(),
        type: "router-added",
        routerId: r.routerId,
        description: `Router ${r.routerId} came online (Area ${r.area})`,
        timestamp: now,
      })
    }
  }

  // Detect removed routers
  for (const r of oldTopo.routers) {
    if (!newRouterIds.has(r.routerId)) {
      changes.push({
        id: nextChangeId(),
        type: "router-removed",
        routerId: r.routerId,
        description: `Router ${r.routerId} went offline`,
        timestamp: now,
      })
    }
  }

  // Build link maps keyed by sorted source-target pair
  const linkKey = (src: string, tgt: string) =>
    [src, tgt].sort().join("<->")

  const oldLinkMap = new Map<string, (typeof oldTopo.links)[0]>()
  for (const l of oldTopo.links) {
    oldLinkMap.set(linkKey(l.source, l.target), l)
  }

  const newLinkMap = new Map<string, (typeof newTopo.links)[0]>()
  for (const l of newTopo.links) {
    newLinkMap.set(linkKey(l.source, l.target), l)
  }

  // Detect new links
  for (const [key, link] of newLinkMap) {
    if (!oldLinkMap.has(key)) {
      changes.push({
        id: nextChangeId(),
        type: "link-added",
        linkId: link.id,
        description: `Link ${link.source} <-> ${link.target} established (cost: ${link.cost})`,
        timestamp: now,
      })
    }
  }

  // Detect removed links
  for (const [key, link] of oldLinkMap) {
    if (!newLinkMap.has(key)) {
      changes.push({
        id: nextChangeId(),
        type: "link-removed",
        linkId: link.id,
        description: `Link ${link.source} <-> ${link.target} disconnected`,
        timestamp: now,
      })
    }
  }

  // Detect metric changes
  for (const [key, newLink] of newLinkMap) {
    const oldLink = oldLinkMap.get(key)
    if (oldLink && oldLink.cost !== newLink.cost) {
      changes.push({
        id: nextChangeId(),
        type: "metric-changed",
        linkId: newLink.id,
        description: `Link ${newLink.source} <-> ${newLink.target} cost changed: ${oldLink.cost} -> ${newLink.cost}`,
        oldValue: oldLink.cost,
        newValue: newLink.cost,
        timestamp: now,
      })
    }
  }

  // Detect area changes for routers that exist in both
  const oldRouterMap = new Map(oldTopo.routers.map((r) => [r.routerId, r]))
  for (const r of newTopo.routers) {
    const oldRouter = oldRouterMap.get(r.routerId)
    if (oldRouter && oldRouter.area !== r.area) {
      changes.push({
        id: nextChangeId(),
        type: "area-changed",
        routerId: r.routerId,
        description: `Router ${r.routerId} moved from Area ${oldRouter.area} to Area ${r.area}`,
        oldValue: oldRouter.area,
        newValue: r.area,
        timestamp: now,
      })
    }
  }

  return changes
}

/**
 * Apply status annotations to nodes based on detected changes.
 * Returns a new array of nodes with status fields set.
 */
export function applyNodeStatuses(
  nodes: GraphNode[],
  changes: TopologyChange[],
  oldNodes: GraphNode[]
): GraphNode[] {
  const now = Date.now()
  const addedRouterIds = new Set<string>()
  const removedRouterIds = new Set<string>()
  const changedRouterIds = new Set<string>()

  for (const c of changes) {
    if (c.type === "router-added" && c.routerId) addedRouterIds.add(c.routerId)
    if (c.type === "router-removed" && c.routerId) removedRouterIds.add(c.routerId)
    if (c.type === "area-changed" && c.routerId) changedRouterIds.add(c.routerId)
  }

  // Start with new nodes annotated
  const result: GraphNode[] = nodes.map((node) => {
    if (addedRouterIds.has(node.id)) {
      return { ...node, status: "new" as const, statusTimestamp: now }
    }
    if (changedRouterIds.has(node.id)) {
      return { ...node, status: "changed" as const, statusTimestamp: now }
    }
    return { ...node, status: "stable" as const }
  })

  // Add removed nodes (from old nodes) so they can fade out
  for (const oldNode of oldNodes) {
    if (removedRouterIds.has(oldNode.id)) {
      result.push({
        ...oldNode,
        status: "removed" as const,
        statusTimestamp: now,
      })
    }
  }

  return result
}

/**
 * Apply status annotations to edges based on detected changes.
 * Returns a new array of edges with status fields set.
 */
export function applyEdgeStatuses(
  edges: GraphEdge[],
  changes: TopologyChange[],
  oldEdges: GraphEdge[]
): GraphEdge[] {
  const now = Date.now()

  const linkKey = (src: string, tgt: string) =>
    [src, tgt].sort().join("<->")

  const addedLinkKeys = new Set<string>()
  const removedLinkKeys = new Set<string>()
  const changedLinkKeys = new Map<string, { oldCost: number }>()

  for (const c of changes) {
    if (c.type === "link-added" && c.linkId) {
      // Extract source/target from description
      const match = c.description.match(/Link (.+?) <-> (.+?) /)
      if (match) addedLinkKeys.add(linkKey(match[1], match[2]))
    }
    if (c.type === "link-removed" && c.linkId) {
      const match = c.description.match(/Link (.+?) <-> (.+?) /)
      if (match) removedLinkKeys.add(linkKey(match[1], match[2]))
    }
    if (c.type === "metric-changed") {
      const match = c.description.match(/Link (.+?) <-> (.+?) /)
      if (match) {
        changedLinkKeys.set(linkKey(match[1], match[2]), {
          oldCost: c.oldValue as number,
        })
      }
    }
  }

  const result: GraphEdge[] = edges.map((edge) => {
    const key = linkKey(edge.source, edge.target)
    if (addedLinkKeys.has(key)) {
      return { ...edge, status: "new" as const, statusTimestamp: now }
    }
    const changed = changedLinkKeys.get(key)
    if (changed) {
      return {
        ...edge,
        status: "changed" as const,
        statusTimestamp: now,
        oldCost: changed.oldCost,
      }
    }
    return { ...edge, status: "stable" as const }
  })

  // Add removed edges so they can fade out
  for (const oldEdge of oldEdges) {
    const key = linkKey(oldEdge.source, oldEdge.target)
    if (removedLinkKeys.has(key)) {
      result.push({
        ...oldEdge,
        status: "removed" as const,
        statusTimestamp: now,
      })
    }
  }

  return result
}
