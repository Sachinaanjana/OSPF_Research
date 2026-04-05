"use client"

import type { GraphNode, GraphEdge } from "@/lib/ospf-types"
import type { PathResult } from "@/lib/path-finder"
import { X, ArrowRight, TrendingUp } from "lucide-react"

interface PathPopupProps {
  sourceNode: GraphNode
  targetNode: GraphNode | null
  allPaths: Map<string, PathResult>
  nodes: GraphNode[]
  edges: GraphEdge[]
  systemIds: Record<string, string>
  onClose: () => void
}

function nodeLabel(node: GraphNode, systemIds: Record<string, string>): string {
  const sysName = node.type === "router" ? (systemIds[node.id] ?? "") : ""
  return sysName ? `${node.label} (${sysName})` : node.label
}

export function PathPopup({
  sourceNode,
  targetNode,
  allPaths,
  nodes,
  edges,
  systemIds,
  onClose,
}: PathPopupProps) {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  const edgeMap = new Map(edges.map((e) => [e.id, e]))

  // If a specific target is selected, show its path. Otherwise show all paths from source.
  const pathsToShow: Array<{ targetId: string; path: PathResult }> = targetNode
    ? allPaths.has(targetNode.id)
      ? [{ targetId: targetNode.id, path: allPaths.get(targetNode.id)! }]
      : []
    : Array.from(allPaths.entries())
        .map(([targetId, path]) => ({ targetId, path }))
        .sort((a, b) => a.path.totalCost - b.path.totalCost)
        .slice(0, 12) // limit display to 12 shortest paths

  return (
    <div
      className="absolute top-4 left-1/2 -translate-x-1/2 z-30 w-[480px] max-w-[90vw] bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
      role="dialog"
      aria-label="Path details"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-secondary/40 border-b border-border">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">
            {targetNode
              ? `Path: ${nodeLabel(sourceNode, systemIds)} → ${nodeLabel(targetNode, systemIds)}`
              : `Paths from: ${nodeLabel(sourceNode, systemIds)}`}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors rounded-md p-1 hover:bg-secondary/50"
          aria-label="Close path popup"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Source node details */}
      <div className="px-4 py-2 border-b border-border bg-primary/5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">Source</span>
          <span className="font-mono text-xs text-foreground">{sourceNode.label}</span>
          {systemIds[sourceNode.id] && (
            <span className="text-xs text-amber-400">{systemIds[sourceNode.id]}</span>
          )}
          <span className="ml-auto text-[10px] text-muted-foreground">
            Area {sourceNode.area} &bull; {sourceNode.role ?? "internal"}
          </span>
        </div>
      </div>

      {/* Path list */}
      <div className="max-h-72 overflow-y-auto">
        {pathsToShow.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            No active path found (links may be down or not connected)
          </div>
        ) : (
          pathsToShow.map(({ targetId, path }) => {
            const target = nodeMap.get(targetId)
            if (!target) return null

            return (
              <div
                key={targetId}
                className="px-4 py-2.5 border-b border-border last:border-b-0 hover:bg-secondary/20 transition-colors"
              >
                {/* Destination + cost */}
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-foreground">
                      {target.label}
                    </span>
                    {systemIds[targetId] && (
                      <span className="text-[11px] text-amber-400">{systemIds[targetId]}</span>
                    )}
                    <span className="text-[10px] text-muted-foreground">
                      Area {target.area}
                    </span>
                  </div>
                  <span className="text-xs font-mono bg-primary/10 text-primary border border-primary/20 rounded px-1.5 py-0.5">
                    cost {path.totalCost}
                  </span>
                </div>

                {/* Hop-by-hop path */}
                <div className="flex items-center gap-1 flex-wrap">
                  {path.nodeIds.map((nid, idx) => {
                    const hopNode = nodeMap.get(nid)
                    const edgeToNext =
                      idx < path.nodeIds.length - 1
                        ? Array.from(path.edgeIds).find((eid) => {
                            const e = edgeMap.get(eid)
                            return e && (
                              (e.source === nid && e.target === path.nodeIds[idx + 1]) ||
                              (e.target === nid && e.source === path.nodeIds[idx + 1])
                            )
                          })
                        : undefined
                    const hopCost = edgeToNext ? edgeMap.get(edgeToNext)?.cost : undefined

                    return (
                      <span key={nid} className="flex items-center gap-1">
                        <span
                          className={`font-mono text-[10px] px-1.5 py-0.5 rounded border ${
                            nid === sourceNode.id
                              ? "bg-primary/15 border-primary/30 text-primary"
                              : nid === targetId
                              ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                              : "bg-secondary/50 border-border text-muted-foreground"
                          }`}
                        >
                          {systemIds[nid] ?? hopNode?.label ?? nid}
                        </span>
                        {idx < path.nodeIds.length - 1 && (
                          <span className="flex items-center gap-0.5 text-muted-foreground">
                            {hopCost !== undefined && (
                              <span className="text-[9px] text-muted-foreground/60 font-mono">
                                {hopCost}
                              </span>
                            )}
                            <ArrowRight className="w-2.5 h-2.5" />
                          </span>
                        )}
                      </span>
                    )
                  })}
                </div>

                {/* Interface info for single-hop */}
                {path.nodeIds.length === 2 && path.edgeIds.size > 0 && (
                  <div className="mt-1">
                    {Array.from(path.edgeIds).map((eid) => {
                      const e = edgeMap.get(eid)
                      if (!e) return null
                      return (
                        <span key={eid} className="text-[10px] text-muted-foreground font-mono">
                          via {e.interfaceInfo ?? e.linkType}
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Footer status */}
      {!targetNode && allPaths.size > 0 && (
        <div className="px-4 py-2 border-t border-border bg-secondary/20 text-[10px] text-muted-foreground">
          Showing shortest {Math.min(12, allPaths.size)} of {allPaths.size} active paths from this node.
          Click another node to see a specific path.
        </div>
      )}
    </div>
  )
}
