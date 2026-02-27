"use client"

import type { GraphNode, GraphEdge, OSPFRouter, OSPFNetwork } from "@/lib/ospf-types"
import { getAreaColor } from "@/lib/layout-engine"
import { ScrollArea } from "@/components/ui/scroll-area"
import { X, Router, Network, ArrowRightLeft } from "lucide-react"

interface DetailsPanelProps {
  selectedNode: GraphNode | null
  selectedEdge: GraphEdge | null
  nodes: GraphNode[]
  onClose: () => void
}

function DetailRow({ label, value, mono }: { label: string; value: string | number; mono?: boolean }) {
  return (
    <div className="flex justify-between items-start gap-2 py-1.5 border-b border-border/50 last:border-b-0">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className={`text-xs text-foreground text-right ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  )
}

export function DetailsPanel({ selectedNode, selectedEdge, nodes, onClose }: DetailsPanelProps) {
  if (!selectedNode && !selectedEdge) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <div className="w-10 h-10 rounded-full bg-secondary/50 flex items-center justify-center mb-3">
          <ArrowRightLeft className="w-4 h-4 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">
          Click a node or link to view details
        </p>
      </div>
    )
  }

  if (selectedNode) {
    const isRouter = selectedNode.type === "router"
    const data = selectedNode.data
    const color = getAreaColor(selectedNode.area)

    return (
      <ScrollArea className="h-full">
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              {isRouter ? (
                <Router className="w-4 h-4" style={{ color }} />
              ) : (
                <Network className="w-4 h-4" style={{ color }} />
              )}
              <h3 className="text-sm font-semibold text-foreground">
                {isRouter ? "Router" : "Network"}
              </h3>
            </div>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Close details"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div
            className="rounded-md px-3 py-2 mb-4"
            style={{ backgroundColor: color + "12", borderLeft: `3px solid ${color}` }}
          >
            <span className="font-mono text-sm font-medium" style={{ color }}>
              {selectedNode.label}
            </span>
          </div>

          {isRouter && (
            <div className="flex flex-col gap-0">
              <DetailRow label="Router ID" value={(data as OSPFRouter).routerId} mono />
              <DetailRow label="Role" value={(data as OSPFRouter).role.toUpperCase()} />
              <DetailRow label="Area" value={`Area ${selectedNode.area}`} />
              {(data as OSPFRouter).sequenceNumber && (
                <DetailRow label="Seq Number" value={(data as OSPFRouter).sequenceNumber!} mono />
              )}
              {(data as OSPFRouter).age !== undefined && (
                <DetailRow label="LS Age" value={`${(data as OSPFRouter).age}s`} mono />
              )}
              {(data as OSPFRouter).checksum && (
                <DetailRow label="Checksum" value={(data as OSPFRouter).checksum!} mono />
              )}

              {(data as OSPFRouter).lsaTypes.length > 0 && (
                <div className="mt-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    LSA Types
                  </h4>
                  <div className="flex flex-wrap gap-1">
                    {(data as OSPFRouter).lsaTypes.map((type) => (
                      <span
                        key={type}
                        className="text-[10px] bg-secondary px-2 py-0.5 rounded-sm text-secondary-foreground"
                      >
                        {type}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {(data as OSPFRouter).neighbors.length > 0 && (
                <div className="mt-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Neighbors
                  </h4>
                  <div className="flex flex-col gap-1">
                    {(data as OSPFRouter).neighbors.map((n) => (
                      <span
                        key={n}
                        className="font-mono text-xs text-secondary-foreground bg-secondary/50 px-2 py-1 rounded-sm"
                      >
                        {n}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {(data as OSPFRouter).networks.length > 0 && (
                <div className="mt-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Networks
                  </h4>
                  <div className="flex flex-col gap-1">
                    {(data as OSPFRouter).networks.map((n) => (
                      <span
                        key={n}
                        className="font-mono text-xs text-secondary-foreground bg-secondary/50 px-2 py-1 rounded-sm"
                      >
                        {n}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {!isRouter && (
            <div className="flex flex-col gap-0">
              <DetailRow label="Network" value={(data as OSPFNetwork).networkAddress} mono />
              <DetailRow label="Mask" value={(data as OSPFNetwork).mask} mono />
              <DetailRow label="Area" value={`Area ${selectedNode.area}`} />
              {(data as OSPFNetwork).designatedRouter && (
                <DetailRow label="DR" value={(data as OSPFNetwork).designatedRouter!} mono />
              )}

              {(data as OSPFNetwork).attachedRouters.length > 0 && (
                <div className="mt-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Attached Routers
                  </h4>
                  <div className="flex flex-col gap-1">
                    {(data as OSPFNetwork).attachedRouters.map((r) => (
                      <span
                        key={r}
                        className="font-mono text-xs text-secondary-foreground bg-secondary/50 px-2 py-1 rounded-sm"
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </ScrollArea>
    )
  }

  if (selectedEdge) {
    const color = getAreaColor(selectedEdge.area)
    const sourceNode = nodes.find((n) => n.id === selectedEdge.source)
    const targetNode = nodes.find((n) => n.id === selectedEdge.target)

    return (
      <ScrollArea className="h-full">
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4" style={{ color }} />
              <h3 className="text-sm font-semibold text-foreground">Link</h3>
            </div>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Close details"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div
            className="rounded-md px-3 py-2 mb-4"
            style={{ backgroundColor: color + "12", borderLeft: `3px solid ${color}` }}
          >
            <div className="flex items-center gap-1.5 font-mono text-xs" style={{ color }}>
              <span>{sourceNode?.label || selectedEdge.source}</span>
              <ArrowRightLeft className="w-3 h-3" />
              <span>{targetNode?.label || selectedEdge.target}</span>
            </div>
          </div>

          <div className="flex flex-col gap-0">
            <DetailRow label="Link Type" value={selectedEdge.linkType} />
            <DetailRow label="Area" value={`Area ${selectedEdge.area}`} />
            {selectedEdge.interfaceInfo && (
              <DetailRow label="Interface" value={selectedEdge.interfaceInfo} mono />
            )}
            <DetailRow label="Source" value={sourceNode?.label || selectedEdge.source} mono />
            <DetailRow label="Target" value={targetNode?.label || selectedEdge.target} mono />
          </div>

          {/* Directional cost display */}
          <div className="mt-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Link Costs
            </h4>
            {(() => {
              const sCost = selectedEdge.sourceCost ?? selectedEdge.cost
              const tCost = selectedEdge.targetCost ?? selectedEdge.cost
              const isAsymmetric = sCost !== tCost
              return (
                <div className="flex flex-col gap-1.5">
                  <div
                    className="flex items-center justify-between rounded px-2.5 py-1.5"
                    style={{
                      backgroundColor: isAsymmetric ? "#f8717112" : color + "12",
                      borderLeft: `3px solid ${isAsymmetric ? "#f87171" : color}`,
                    }}
                  >
                    <span className="font-mono text-[11px] text-foreground/80">
                      {sourceNode?.label || selectedEdge.source}
                    </span>
                    <span
                      className="font-mono text-sm font-bold"
                      style={{ color: isAsymmetric ? "#f87171" : color }}
                    >
                      {sCost}
                    </span>
                  </div>
                  <div
                    className="flex items-center justify-between rounded px-2.5 py-1.5"
                    style={{
                      backgroundColor: isAsymmetric ? "#f8717112" : color + "12",
                      borderLeft: `3px solid ${isAsymmetric ? "#f87171" : color}`,
                    }}
                  >
                    <span className="font-mono text-[11px] text-foreground/80">
                      {targetNode?.label || selectedEdge.target}
                    </span>
                    <span
                      className="font-mono text-sm font-bold"
                      style={{ color: isAsymmetric ? "#f87171" : color }}
                    >
                      {tCost}
                    </span>
                  </div>
                  {isAsymmetric && (
                    <p className="text-[10px] text-destructive mt-1 flex items-center gap-1">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-destructive" />
                      Asymmetric costs detected
                    </p>
                  )}
                </div>
              )
            })()}
          </div>
        </div>
      </ScrollArea>
    )
  }

  return null
}
