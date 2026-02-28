"use client"

import { useState, useMemo } from "react"
import type { GraphNode, OSPFRouter } from "@/lib/ospf-types"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Input } from "@/components/ui/input"
import { Search, ChevronDown, ChevronRight } from "lucide-react"
import { getAreaColor } from "@/lib/layout-engine"

interface RouterTableProps {
  nodes: GraphNode[]
  onSelectNode: (nodeId: string) => void
}

const ROLE_COLORS: Record<string, string> = {
  internal: "#2dd4a0",
  abr: "#38bdf8",
  asbr: "#f97316",
}

const LINK_TYPE_COLORS: Record<string, string> = {
  "point-to-point": "#38bdf8",
  transit: "#a78bfa",
  stub: "#94a3b8",
}

export function RouterTable({ nodes, onSelectNode }: RouterTableProps) {
  const [search, setSearch] = useState("")
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const routers = useMemo(
    () =>
      nodes
        .filter((n) => n.type === "router")
        .map((n) => ({ node: n, data: n.data as OSPFRouter }))
        .filter(({ data }) =>
          search.trim() === "" ||
          data.routerId.includes(search.trim()) ||
          data.interfaces?.some((i) => i.address.includes(search.trim())) ||
          data.neighbors.some((nb) => nb.includes(search.trim()))
        )
        .sort((a, b) => a.data.routerId.localeCompare(b.data.routerId)),
    [nodes, search]
  )

  return (
    <div className="flex flex-col h-full">
      {/* Search bar */}
      <div className="p-3 border-b border-border shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search router ID or interface..."
            className="pl-8 h-8 text-xs bg-secondary/50 border-border"
          />
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5">
          {routers.length} router{routers.length !== 1 ? "s" : ""}
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="divide-y divide-border/50">
          {routers.map(({ node, data }) => {
            const isExpanded = expandedId === node.id
            const areaColor = getAreaColor(node.area)
            const roleColor = ROLE_COLORS[data.role] ?? "#94a3b8"
            const ifaceCount = data.interfaces?.length ?? 0

            return (
              <div key={node.id}>
                {/* Router row */}
                <div
                  className="flex items-center gap-2 px-3 py-2 hover:bg-secondary/30 cursor-pointer transition-colors"
                  onClick={() => {
                    setExpandedId(isExpanded ? null : node.id)
                    onSelectNode(node.id)
                  }}
                >
                  {/* Expand toggle */}
                  <button className="shrink-0 text-muted-foreground">
                    {isExpanded ? (
                      <ChevronDown className="w-3 h-3" />
                    ) : (
                      <ChevronRight className="w-3 h-3" />
                    )}
                  </button>

                  {/* Area dot */}
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: areaColor }}
                  />

                  {/* Router ID */}
                  <span className="font-mono text-xs text-foreground flex-1 truncate">
                    {data.routerId}
                  </span>

                  {/* Role badge */}
                  <span
                    className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase shrink-0"
                    style={{ backgroundColor: roleColor + "20", color: roleColor }}
                  >
                    {data.role}
                  </span>

                  {/* Interface count */}
                  <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                    {ifaceCount} iface{ifaceCount !== 1 ? "s" : ""}
                  </span>
                </div>

                {/* Expanded interfaces */}
                {isExpanded && (
                  <div className="bg-secondary/20 border-t border-border/30 px-3 py-2">
                    {/* System IDs */}
                    <div className="mb-2 flex flex-col gap-0.5">
                      <DetailLine label="Router ID" value={data.routerId} />
                      <DetailLine label="Area" value={`Area ${node.area}`} />
                      {data.sequenceNumber && <DetailLine label="Seq" value={data.sequenceNumber} />}
                      {data.age !== undefined && <DetailLine label="Age" value={`${data.age}s`} />}
                      {data.checksum && <DetailLine label="Checksum" value={data.checksum} />}
                    </div>

                    {/* Interfaces */}
                    {ifaceCount > 0 && (
                      <>
                        <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                          Interfaces
                        </p>
                        <div className="flex flex-col gap-1">
                          {data.interfaces.map((iface, idx) => {
                            const typeColor = LINK_TYPE_COLORS[iface.linkType] ?? "#94a3b8"
                            return (
                              <div
                                key={idx}
                                className="flex items-center gap-2 text-[10px] font-mono bg-background/60 rounded px-2 py-1"
                              >
                                <span
                                  className="shrink-0 font-bold"
                                  style={{ color: typeColor }}
                                >
                                  {iface.linkType === "point-to-point" ? "P2P" : iface.linkType.substring(0, 3).toUpperCase()}
                                </span>
                                <span className="text-foreground">{iface.address}</span>
                                <span className="text-muted-foreground truncate flex-1">→ {iface.connectedTo}</span>
                                {iface.cost > 0 && (
                                  <span className="text-muted-foreground shrink-0">{iface.cost}</span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </>
                    )}

                    {/* Neighbors */}
                    {data.neighbors.length > 0 && (
                      <>
                        <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 mt-2">
                          Neighbors ({data.neighbors.length})
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {data.neighbors.map((nb) => (
                            <button
                              key={nb}
                              onClick={(e) => { e.stopPropagation(); onSelectNode(nb) }}
                              className="font-mono text-[10px] bg-background/60 hover:bg-primary/10 hover:text-primary rounded px-1.5 py-0.5 transition-colors text-secondary-foreground"
                            >
                              {nb}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {routers.length === 0 && (
            <div className="p-6 text-center text-xs text-muted-foreground">
              No routers match your search
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-[10px]">
      <span className="text-muted-foreground shrink-0 w-16">{label}</span>
      <span className="font-mono text-foreground">{value}</span>
    </div>
  )
}
