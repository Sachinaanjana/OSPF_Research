"use client"

import type { GraphNode, GraphEdge, OSPFRouter, OSPFNetwork, OSPFInterface, OSPFSummaryRoute, OSPFExternalRoute, OSPFNeighborEntry, OSPFLearnedRoute } from "@/lib/ospf-types"
import { getAreaColor } from "@/lib/layout-engine"
import { ScrollArea } from "@/components/ui/scroll-area"
import { X, Router, Network, ArrowRightLeft, Globe, MapPin, Activity, Navigation } from "lucide-react"

const ROLE_COLORS: Record<string, string> = {
  internal: "#2dd4a0",
  abr: "#38bdf8",
  asbr: "#f97316",
}

const ROLE_LABELS: Record<string, string> = {
  internal: "Internal Router",
  abr: "Area Border Router (ABR)",
  asbr: "AS Boundary Router (ASBR)",
}

const LINK_TYPE_COLORS: Record<string, string> = {
  "point-to-point": "#38bdf8",
  transit: "#a78bfa",
  stub: "#94a3b8",
}

const NEIGHBOR_STATE_COLORS: Record<string, string> = {
  FULL: "#2dd4a0",
  "2WAY": "#fbbf24",
  EXSTART: "#f97316",
  EXCHANGE: "#f97316",
  LOADING: "#fbbf24",
  INIT: "#94a3b8",
  DOWN: "#f87171",
  ATTEMPT: "#94a3b8",
}

function neighborStateColor(state: string): string {
  const base = state.split("/")[0].toUpperCase()
  return NEIGHBOR_STATE_COLORS[base] ?? "#94a3b8"
}

interface DetailsPanelProps {
  selectedNode: GraphNode | null
  selectedEdge: GraphEdge | null
  nodes: GraphNode[]
  systemIds?: Record<string, string>
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

function InterfaceRow({ iface }: { iface: OSPFInterface }) {
  const typeColor = LINK_TYPE_COLORS[iface.linkType] ?? "#94a3b8"
  return (
    <div className="flex flex-col gap-0.5 bg-secondary/40 rounded-md px-2.5 py-2 border border-border/30">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {iface.ifName && (
            <span className="text-[10px] font-semibold text-foreground/70 font-mono truncate">{iface.ifName}</span>
          )}
          {iface.ifName && <span className="text-muted-foreground/40 text-[10px]">—</span>}
          <span className="font-mono text-xs font-semibold text-foreground truncate">{iface.address}</span>
        </div>
        <span
          className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider flex-shrink-0"
          style={{ backgroundColor: typeColor + "20", color: typeColor }}
        >
          {iface.linkType === "point-to-point" ? "P2P" : iface.linkType}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[10px] text-muted-foreground font-mono truncate">{iface.connectedTo}</span>
        <div className="flex items-center gap-2">
          {iface.cost > 0 && (
            <span className="text-[10px] text-muted-foreground font-mono shrink-0">cost {iface.cost}</span>
          )}
          {iface.state && (
            <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-secondary text-foreground/70 uppercase shrink-0">{iface.state}</span>
          )}
        </div>
      </div>
      {(iface.helloInterval || iface.deadInterval) && (
        <div className="text-[10px] text-muted-foreground/70 font-mono">
          hello {iface.helloInterval}s / dead {iface.deadInterval}s
        </div>
      )}
      {iface.drAddress && (
        <div className="text-[10px] text-muted-foreground/70 font-mono">DR: {iface.drAddress}{iface.bdrAddress ? ` / BDR: ${iface.bdrAddress}` : ""}</div>
      )}
    </div>
  )
}

function NeighborEntryRow({ entry }: { entry: OSPFNeighborEntry }) {
  const color = neighborStateColor(entry.state)
  return (
    <div className="flex flex-col gap-0.5 bg-secondary/40 rounded-md px-2.5 py-2 border border-border/30">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-semibold text-foreground">{entry.neighborId}</span>
        <span
          className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0"
          style={{ backgroundColor: color + "20", color }}
        >
          {entry.state}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground font-mono">
        <span>{entry.address}</span>
        <span className="shrink-0">{entry.interface}</span>
      </div>
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground/70 font-mono">
        <span>pri {entry.priority}</span>
        <span>dead {entry.deadTime}</span>
      </div>
    </div>
  )
}

function SummaryRouteRow({ route }: { route: OSPFSummaryRoute }) {
  const isABSR = route.lsaType === "ASBR Summary LSA (Type 4)"
  const color = isABSR ? "#f97316" : "#a78bfa"
  return (
    <div className="flex flex-col gap-0.5 bg-secondary/40 rounded-md px-2.5 py-2 border border-border/30">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-semibold text-foreground">
          {route.network}{route.mask ? `/${route.mask}` : ""}
        </span>
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider"
          style={{ backgroundColor: color + "20", color }}>
          {isABSR ? "Type 4" : "Type 3"}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-muted-foreground font-mono">via {route.advertisingRouter}</span>
        <span className="text-[10px] text-muted-foreground font-mono shrink-0">cost {route.cost}</span>
      </div>
    </div>
  )
}

function ExternalRouteRow({ route }: { route: OSPFExternalRoute }) {
  return (
    <div className="flex flex-col gap-0.5 bg-secondary/40 rounded-md px-2.5 py-2 border border-border/30">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-semibold text-foreground">
          {route.network}{route.mask ? `/${route.mask}` : ""}
        </span>
        <div className="flex items-center gap-1">
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider bg-orange-500/20 text-orange-400">
            E{route.metricType}
          </span>
          <span className="text-[10px] font-mono text-muted-foreground">metric {route.metric}</span>
        </div>
      </div>
      {route.forwardingAddress && route.forwardingAddress !== "0.0.0.0" && (
        <span className="text-[10px] text-muted-foreground font-mono">fwd {route.forwardingAddress}</span>
      )}
      {route.tag > 0 && (
        <span className="text-[10px] text-muted-foreground font-mono">tag {route.tag}</span>
      )}
    </div>
  )
}

function LearnedRouteRow({ route }: { route: OSPFLearnedRoute }) {
  const isIA = route.routeType.includes("IA")
  const isE1 = route.routeType.includes("E1")
  const isE2 = route.routeType.includes("E2")
  const color = isE1 || isE2 ? "#f97316" : isIA ? "#a78bfa" : "#2dd4a0"
  return (
    <div className="flex flex-col gap-0.5 bg-secondary/40 rounded-md px-2.5 py-2 border border-border/30">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-semibold text-foreground">{route.prefix}</span>
        <span
          className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0"
          style={{ backgroundColor: color + "20", color }}
        >
          {route.routeType}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground font-mono">
        <span>via {route.nextHop}</span>
        {route.outInterface && <span className="shrink-0 truncate">{route.outInterface}</span>}
      </div>
      <span className="text-[10px] text-muted-foreground/70 font-mono">metric {route.metric}</span>
    </div>
  )
}

export function DetailsPanel({ selectedNode, selectedEdge, nodes, systemIds = {}, onClose }: DetailsPanelProps) {
  if (!selectedNode && !selectedEdge) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <div className="w-10 h-10 rounded-full bg-secondary/50 flex items-center justify-center mb-3">
          <ArrowRightLeft className="w-4 h-4 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">Click a node or link to view details</p>
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
              {isRouter ? <Router className="w-4 h-4" style={{ color }} /> : <Network className="w-4 h-4" style={{ color }} />}
              <h3 className="text-sm font-semibold text-foreground">{isRouter ? "Router" : "Network"}</h3>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors" aria-label="Close details">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="rounded-md px-3 py-2 mb-4" style={{ backgroundColor: color + "12", borderLeft: `3px solid ${color}` }}>
            <span className="font-mono text-sm font-medium" style={{ color }}>{selectedNode.label}</span>
            {systemIds[selectedNode.id] && (
              <div className="mt-1 font-mono text-xs font-semibold text-amber-400">{systemIds[selectedNode.id]}</div>
            )}
          </div>

          {isRouter && (
            <div className="flex flex-col gap-0">
              <DetailRow label="Router ID" value={(data as OSPFRouter).routerId} mono />
              {systemIds[selectedNode.id] && <DetailRow label="System ID" value={systemIds[selectedNode.id]} mono />}

              {/* Process info from show ip ospf */}
              {(data as OSPFRouter).processInfo && (
                <>
                  <DetailRow label="OSPF PID" value={(data as OSPFRouter).processInfo!.processId} mono />
                  {(data as OSPFRouter).processInfo!.numberOfAreas !== undefined && (
                    <DetailRow label="Areas" value={(data as OSPFRouter).processInfo!.numberOfAreas!} />
                  )}
                  {(data as OSPFRouter).processInfo!.referencesBandwidth !== undefined && (
                    <DetailRow label="Ref BW" value={`${(data as OSPFRouter).processInfo!.referencesBandwidth} Mbps`} />
                  )}
                </>
              )}

              <div className="flex justify-between items-center gap-2 py-1.5 border-b border-border/50">
                <span className="text-xs text-muted-foreground shrink-0">Role</span>
                {(() => {
                  const role = (data as OSPFRouter).role
                  const roleColor = ROLE_COLORS[role] ?? "#94a3b8"
                  const roleLabel = ROLE_LABELS[role] ?? role.toUpperCase()
                  return (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ backgroundColor: roleColor + "20", color: roleColor, border: `1px solid ${roleColor}40` }}>
                      {roleLabel}
                    </span>
                  )
                })()}
              </div>
              <DetailRow label="Area" value={`Area ${selectedNode.area}`} />
              {(data as OSPFRouter).sequenceNumber && <DetailRow label="Seq Number" value={(data as OSPFRouter).sequenceNumber!} mono />}
              {(data as OSPFRouter).age !== undefined && <DetailRow label="LS Age" value={`${(data as OSPFRouter).age}s`} mono />}
              {(data as OSPFRouter).checksum && <DetailRow label="Checksum" value={(data as OSPFRouter).checksum!} mono />}

              {(data as OSPFRouter).lsaTypes.length > 0 && (
                <div className="mt-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">LSA Types</h4>
                  <div className="flex flex-wrap gap-1">
                    {(data as OSPFRouter).lsaTypes.map((type) => (
                      <span key={type} className="text-[10px] bg-secondary px-2 py-0.5 rounded-sm text-secondary-foreground">{type}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Neighbor entries from show ip ospf neighbor */}
              {(data as OSPFRouter).neighborEntries?.length > 0 && (
                <div className="mt-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Activity className="w-3 h-3" />
                    OSPF Neighbors ({(data as OSPFRouter).neighborEntries.length})
                  </h4>
                  <div className="flex flex-col gap-1.5">
                    {(data as OSPFRouter).neighborEntries.map((ne, i) => (
                      <NeighborEntryRow key={i} entry={ne} />
                    ))}
                  </div>
                </div>
              )}

              {/* Interfaces enriched with show ip ospf interface */}
              {(data as OSPFRouter).interfaces?.length > 0 && (
                <div className="mt-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Interfaces ({(data as OSPFRouter).interfaces.length})
                  </h4>
                  <div className="flex flex-col gap-1.5">
                    {(data as OSPFRouter).interfaces.map((iface, idx) => (
                      <InterfaceRow key={`${iface.address}-${idx}`} iface={iface} />
                    ))}
                  </div>
                </div>
              )}

              {/* Neighbors (from LSA) */}
              {(data as OSPFRouter).neighbors.length > 0 && (data as OSPFRouter).neighborEntries?.length === 0 && (
                <div className="mt-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Neighbors ({(data as OSPFRouter).neighbors.length})
                  </h4>
                  <div className="flex flex-col gap-1">
                    {(data as OSPFRouter).neighbors.map((n) => {
                      const iface = (data as OSPFRouter).neighborInterfaces?.[n]
                      return (
                        <div key={n} className="flex items-center justify-between bg-secondary/50 rounded-sm px-2 py-1 gap-2">
                          <span className="font-mono text-xs text-secondary-foreground">{n}</span>
                          {iface && <span className="font-mono text-[10px] text-muted-foreground shrink-0">{iface}</span>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {(data as OSPFRouter).stubNetworks?.length > 0 && (
                <div className="mt-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Stub Networks ({(data as OSPFRouter).stubNetworks.length})
                  </h4>
                  <div className="flex flex-col gap-1">
                    {(data as OSPFRouter).stubNetworks.map((n) => (
                      <span key={n} className="font-mono text-xs text-secondary-foreground bg-secondary/50 px-2 py-1 rounded-sm">{n}</span>
                    ))}
                  </div>
                </div>
              )}

              {(data as OSPFRouter).networks.filter(n => !n.startsWith("stub-")).length > 0 && (
                <div className="mt-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Transit Networks</h4>
                  <div className="flex flex-col gap-1">
                    {(data as OSPFRouter).networks.filter(n => !n.startsWith("stub-")).map((n) => (
                      <span key={n} className="font-mono text-xs text-secondary-foreground bg-secondary/50 px-2 py-1 rounded-sm">{n}</span>
                    ))}
                  </div>
                </div>
              )}

              {(data as OSPFRouter).summaryRoutes?.length > 0 && (
                <div className="mt-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                    <MapPin className="w-3 h-3" />
                    Summary Routes ({(data as OSPFRouter).summaryRoutes.length})
                  </h4>
                  <div className="flex flex-col gap-1.5">
                    {(data as OSPFRouter).summaryRoutes.map((r, i) => <SummaryRouteRow key={i} route={r} />)}
                  </div>
                </div>
              )}

              {(data as OSPFRouter).externalRoutes?.length > 0 && (
                <div className="mt-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Globe className="w-3 h-3 text-orange-400" />
                    External Routes ({(data as OSPFRouter).externalRoutes.length})
                  </h4>
                  <div className="flex flex-col gap-1.5">
                    {(data as OSPFRouter).externalRoutes.map((r, i) => <ExternalRouteRow key={i} route={r} />)}
                  </div>
                </div>
              )}

              {/* Learned routes from show ip route ospf */}
              {(data as OSPFRouter).learnedRoutes?.length > 0 && (
                <div className="mt-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Navigation className="w-3 h-3 text-emerald-400" />
                    OSPF Routes ({(data as OSPFRouter).learnedRoutes.length})
                  </h4>
                  <div className="flex flex-col gap-1.5">
                    {(data as OSPFRouter).learnedRoutes.map((r, i) => <LearnedRouteRow key={i} route={r} />)}
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
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Attached Routers</h4>
                  <div className="flex flex-col gap-1">
                    {(data as OSPFNetwork).attachedRouters.map((r) => (
                      <span key={r} className="font-mono text-xs text-secondary-foreground bg-secondary/50 px-2 py-1 rounded-sm">{r}</span>
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
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors" aria-label="Close details">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="rounded-md px-3 py-2 mb-4" style={{ backgroundColor: color + "12", borderLeft: `3px solid ${color}` }}>
            <div className="flex items-center gap-1.5 font-mono text-xs" style={{ color }}>
              <span>{sourceNode?.label || selectedEdge.source}</span>
              <ArrowRightLeft className="w-3 h-3" />
              <span>{targetNode?.label || selectedEdge.target}</span>
            </div>
          </div>

          <div className="flex flex-col gap-0">
            <DetailRow label="Link Type" value={selectedEdge.linkType} />
            <DetailRow label="Area" value={`Area ${selectedEdge.area}`} />
            {selectedEdge.interfaceInfo && <DetailRow label="Interface" value={selectedEdge.interfaceInfo} mono />}
            <DetailRow label="Source" value={sourceNode?.label || selectedEdge.source} mono />
            <DetailRow label="Target" value={targetNode?.label || selectedEdge.target} mono />
          </div>

          <div className="mt-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Link Costs</h4>
            {(() => {
              const sCost = selectedEdge.sourceCost ?? selectedEdge.cost
              const tCost = selectedEdge.targetCost ?? selectedEdge.cost
              const isAsymmetric = sCost !== tCost
              return (
                <div className="flex flex-col gap-1.5">
                  {[
                    { label: sourceNode?.label || selectedEdge.source, cost: sCost },
                    { label: targetNode?.label || selectedEdge.target, cost: tCost },
                  ].map(({ label, cost }) => (
                    <div key={label} className="flex items-center justify-between rounded px-2.5 py-1.5" style={{ backgroundColor: isAsymmetric ? "#f8717112" : color + "12", borderLeft: `3px solid ${isAsymmetric ? "#f87171" : color}` }}>
                      <span className="font-mono text-[11px] text-foreground/80">{label}</span>
                      <span className="font-mono text-sm font-bold" style={{ color: isAsymmetric ? "#f87171" : color }}>{cost}</span>
                    </div>
                  ))}
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
import { getAreaColor } from "@/lib/layout-engine"
import { ScrollArea } from "@/components/ui/scroll-area"
import { X, Router, Network, ArrowRightLeft, Globe, MapPin, ExternalLink } from "lucide-react"

const ROLE_COLORS: Record<string, string> = {
  internal: "#2dd4a0",
  abr: "#38bdf8",
  asbr: "#f97316",
}

const ROLE_LABELS: Record<string, string> = {
  internal: "Internal Router",
  abr: "Area Border Router (ABR)",
  asbr: "AS Boundary Router (ASBR)",
}

const LINK_TYPE_COLORS: Record<string, string> = {
  "point-to-point": "#38bdf8",
  transit: "#a78bfa",
  stub: "#94a3b8",
}

interface DetailsPanelProps {
  selectedNode: GraphNode | null
  selectedEdge: GraphEdge | null
  nodes: GraphNode[]
  systemIds?: Record<string, string>
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

function InterfaceRow({ iface }: { iface: OSPFInterface }) {
  const typeColor = LINK_TYPE_COLORS[iface.linkType] ?? "#94a3b8"
  return (
    <div className="flex flex-col gap-0.5 bg-secondary/40 rounded-md px-2.5 py-2 border border-border/30">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-semibold text-foreground">{iface.address}</span>
        <span
          className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider"
          style={{ backgroundColor: typeColor + "20", color: typeColor }}
        >
          {iface.linkType === "point-to-point" ? "P2P" : iface.linkType}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-muted-foreground font-mono truncate">{iface.connectedTo}</span>
        {iface.cost > 0 && (
          <span className="text-[10px] text-muted-foreground font-mono shrink-0">cost {iface.cost}</span>
        )}
      </div>
    </div>
  )
}

function SummaryRouteRow({ route }: { route: OSPFSummaryRoute }) {
  const isABSR = route.lsaType === "ASBR Summary LSA (Type 4)"
  const color = isABSR ? "#f97316" : "#a78bfa"
  return (
    <div className="flex flex-col gap-0.5 bg-secondary/40 rounded-md px-2.5 py-2 border border-border/30">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-semibold text-foreground">
          {route.network}{route.mask ? `/${route.mask}` : ""}
        </span>
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider"
          style={{ backgroundColor: color + "20", color }}>
          {isABSR ? "Type 4" : "Type 3"}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-muted-foreground font-mono">via {route.advertisingRouter}</span>
        <span className="text-[10px] text-muted-foreground font-mono shrink-0">cost {route.cost}</span>
      </div>
    </div>
  )
}

function ExternalRouteRow({ route }: { route: OSPFExternalRoute }) {
  return (
    <div className="flex flex-col gap-0.5 bg-secondary/40 rounded-md px-2.5 py-2 border border-border/30">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-semibold text-foreground">
          {route.network}{route.mask ? `/${route.mask}` : ""}
        </span>
        <div className="flex items-center gap-1">
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider bg-orange-500/20 text-orange-400">
            E{route.metricType}
          </span>
          <span className="text-[10px] font-mono text-muted-foreground">metric {route.metric}</span>
        </div>
      </div>
      {route.forwardingAddress && route.forwardingAddress !== "0.0.0.0" && (
        <span className="text-[10px] text-muted-foreground font-mono">fwd {route.forwardingAddress}</span>
      )}
      {route.tag > 0 && (
        <span className="text-[10px] text-muted-foreground font-mono">tag {route.tag}</span>
      )}
    </div>
  )
}

export function DetailsPanel({ selectedNode, selectedEdge, nodes, systemIds = {}, onClose }: DetailsPanelProps) {
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
            {systemIds[selectedNode.id] && (
              <div className="mt-1 font-mono text-xs font-semibold text-amber-400">
                {systemIds[selectedNode.id]}
              </div>
            )}
          </div>

          {isRouter && (
            <div className="flex flex-col gap-0">
              <DetailRow label="Router ID" value={(data as OSPFRouter).routerId} mono />
              {systemIds[selectedNode.id] && (
                <DetailRow label="System ID" value={systemIds[selectedNode.id]} mono />
              )}
              <div className="flex justify-between items-center gap-2 py-1.5 border-b border-border/50">
                <span className="text-xs text-muted-foreground shrink-0">Role</span>
                {(() => {
                  const role = (data as OSPFRouter).role
                  const roleColor = ROLE_COLORS[role] ?? "#94a3b8"
                  const roleLabel = ROLE_LABELS[role] ?? role.toUpperCase()
                  return (
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded"
                      style={{ backgroundColor: roleColor + "20", color: roleColor, border: `1px solid ${roleColor}40` }}
                    >
                      {roleLabel}
                    </span>
                  )
                })()}
              </div>
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

              {/* ── Interfaces ── */}
              {(data as OSPFRouter).interfaces?.length > 0 && (
                <div className="mt-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Interfaces ({(data as OSPFRouter).interfaces.length})
                  </h4>
                  <div className="flex flex-col gap-1.5">
                    {(data as OSPFRouter).interfaces.map((iface, idx) => (
                      <InterfaceRow key={`${iface.address}-${idx}`} iface={iface} />
                    ))}
                  </div>
                </div>
              )}

              {(data as OSPFRouter).neighbors.length > 0 && (
                <div className="mt-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Neighbors ({(data as OSPFRouter).neighbors.length})
                  </h4>
                  <div className="flex flex-col gap-1">
                    {(data as OSPFRouter).neighbors.map((n) => {
                      const iface = (data as OSPFRouter).neighborInterfaces?.[n]
                      return (
                        <div key={n} className="flex items-center justify-between bg-secondary/50 rounded-sm px-2 py-1 gap-2">
                          <span className="font-mono text-xs text-secondary-foreground">{n}</span>
                          {iface && (
                            <span className="font-mono text-[10px] text-muted-foreground shrink-0">{iface}</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {(data as OSPFRouter).stubNetworks?.length > 0 && (
                <div className="mt-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Stub Networks ({(data as OSPFRouter).stubNetworks.length})
                  </h4>
                  <div className="flex flex-col gap-1">
                    {(data as OSPFRouter).stubNetworks.map((n) => (
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

              {(data as OSPFRouter).networks.filter(n => !n.startsWith("stub-")).length > 0 && (
                <div className="mt-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Transit Networks
                  </h4>
                  <div className="flex flex-col gap-1">
                    {(data as OSPFRouter).networks.filter(n => !n.startsWith("stub-")).map((n) => (
                      <span key={n} className="font-mono text-xs text-secondary-foreground bg-secondary/50 px-2 py-1 rounded-sm">{n}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Summary Routes (Type 3 / Type 4) */}
              {(data as OSPFRouter).summaryRoutes?.length > 0 && (
                <div className="mt-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                    <MapPin className="w-3 h-3" />
                    Summary Routes ({(data as OSPFRouter).summaryRoutes.length})
                  </h4>
                  <div className="flex flex-col gap-1.5">
                    {(data as OSPFRouter).summaryRoutes.map((r, i) => (
                      <SummaryRouteRow key={i} route={r} />
                    ))}
                  </div>
                </div>
              )}

              {/* External Routes (Type 5) */}
              {(data as OSPFRouter).externalRoutes?.length > 0 && (
                <div className="mt-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Globe className="w-3 h-3 text-orange-400" />
                    External Routes ({(data as OSPFRouter).externalRoutes.length})
                  </h4>
                  <div className="flex flex-col gap-1.5">
                    {(data as OSPFRouter).externalRoutes.map((r, i) => (
                      <ExternalRouteRow key={i} route={r} />
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
