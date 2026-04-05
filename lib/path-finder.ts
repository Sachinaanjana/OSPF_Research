import type { GraphNode, GraphEdge } from "./ospf-types"

export interface PathResult {
  /** Ordered list of node IDs from source to every reachable target */
  nodeIds: string[]
  /** Set of edge IDs that form the path */
  edgeIds: Set<string>
  /** Total accumulated OSPF cost */
  totalCost: number
}

export interface PathsFromSource {
  /** source node id */
  sourceId: string
  /** Map of targetId → PathResult for every reachable router node */
  paths: Map<string, PathResult>
}

/**
 * Dijkstra shortest-path from a source node across all router/network nodes.
 * Uses OSPF link costs. Only traverses edges whose status is NOT "removed".
 */
export function computePathsFrom(
  sourceId: string,
  nodes: GraphNode[],
  edges: GraphEdge[]
): PathsFromSource {
  // Build adjacency list: nodeId → [ { neighborId, edgeId, cost } ]
  type Neighbor = { neighborId: string; edgeId: string; cost: number }
  const adj = new Map<string, Neighbor[]>()

  for (const node of nodes) {
    adj.set(node.id, [])
  }

  for (const edge of edges) {
    // Skip "down" edges — only show active (up) paths
    if (edge.status === "removed") continue

    const srcAdj = adj.get(edge.source)
    const tgtAdj = adj.get(edge.target)

    const edgeCost = Math.max(1, edge.cost || 1)

    if (srcAdj) {
      srcAdj.push({ neighborId: edge.target, edgeId: edge.id, cost: edgeCost })
    }
    if (tgtAdj) {
      tgtAdj.push({ neighborId: edge.source, edgeId: edge.id, cost: edgeCost })
    }
  }

  // Dijkstra
  const dist = new Map<string, number>()
  const prev = new Map<string, { nodeId: string; edgeId: string } | null>()

  for (const node of nodes) {
    dist.set(node.id, Infinity)
    prev.set(node.id, null)
  }
  dist.set(sourceId, 0)

  // Simple priority queue (min-heap simulation with sorted array)
  const pq: Array<{ id: string; cost: number }> = [{ id: sourceId, cost: 0 }]

  while (pq.length > 0) {
    pq.sort((a, b) => a.cost - b.cost)
    const current = pq.shift()!
    const curDist = dist.get(current.id) ?? Infinity
    if (current.cost > curDist) continue

    const neighbors = adj.get(current.id) ?? []
    for (const { neighborId, edgeId, cost } of neighbors) {
      const newDist = curDist + cost
      if (newDist < (dist.get(neighborId) ?? Infinity)) {
        dist.set(neighborId, newDist)
        prev.set(neighborId, { nodeId: current.id, edgeId })
        pq.push({ id: neighborId, cost: newDist })
      }
    }
  }

  // Reconstruct paths
  const paths = new Map<string, PathResult>()

  for (const node of nodes) {
    if (node.id === sourceId) continue
    const totalCost = dist.get(node.id) ?? Infinity
    if (totalCost === Infinity) continue

    // Walk back from target to source
    const nodeIds: string[] = []
    const edgeIds = new Set<string>()
    let cursor: string | null = node.id

    while (cursor !== null) {
      nodeIds.unshift(cursor)
      const prevEntry = prev.get(cursor)
      if (!prevEntry) break
      edgeIds.add(prevEntry.edgeId)
      cursor = prevEntry.nodeId
    }

    paths.set(node.id, { nodeIds, edgeIds, totalCost })
  }

  return { sourceId, paths }
}
