"use client"

import { useState, useMemo, useRef, useEffect, useCallback } from "react"
import { Search, X, Router, Globe, MapPin, ArrowRightLeft, Shield, Network } from "lucide-react"
import { Input } from "@/components/ui/input"
import type { GraphNode, GraphEdge, OSPFRouter, OSPFNetwork } from "@/lib/ospf-types"
import { getAreaColor } from "@/lib/layout-engine"

interface SearchResult {
  node: GraphNode
  matchField: string
  matchValue: string
}

interface TopologySearchProps {
  nodes: GraphNode[]
  edges: GraphEdge[]
  onSelectNode: (nodeId: string) => void
  onFocusNode: (nodeId: string) => void
}

export function TopologySearch({ nodes, edges, onSelectNode, onFocusNode }: TopologySearchProps) {
  const [query, setQuery] = useState("")
  const [isOpen, setIsOpen] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(0)
  const [popupNode, setPopupNode] = useState<GraphNode | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const results = useMemo<SearchResult[]>(() => {
    const q = query.toLowerCase().trim()
    if (!q || q.length < 1) return []

    const matches: SearchResult[] = []
    for (const node of nodes) {
      if (node.label.toLowerCase().includes(q)) {
        matches.push({ node, matchField: "ID", matchValue: node.label })
      } else if (node.area.toLowerCase().includes(q)) {
        matches.push({ node, matchField: "Area", matchValue: `Area ${node.area}` })
      } else if (node.role && node.role.toLowerCase().includes(q)) {
        matches.push({ node, matchField: "Role", matchValue: node.role.toUpperCase() })
      } else if (node.type.toLowerCase().includes(q)) {
        matches.push({ node, matchField: "Type", matchValue: node.type })
      } else if (node.status && node.status.toLowerCase().includes(q)) {
        matches.push({ node, matchField: "Status", matchValue: node.status })
      }
    }
    return matches.slice(0, 20)
  }, [query, nodes])

  // Compute connected edges for popup
  const nodeEdges = useMemo(() => {
    if (!popupNode) return []
    return edges.filter((e) => e.source === popupNode.id || e.target === popupNode.id)
  }, [popupNode, edges])

  const handleSelect = useCallback(
    (node: GraphNode) => {
      setPopupNode(node)
      onSelectNode(node.id)
      onFocusNode(node.id)
    },
    [onSelectNode, onFocusNode]
  )

  const handleClosePopup = useCallback(() => {
    setPopupNode(null)
    setIsOpen(false)
    setQuery("")
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setHighlightIndex((prev) => Math.min(prev + 1, results.length - 1))
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setHighlightIndex((prev) => Math.max(prev - 1, 0))
      } else if (e.key === "Enter" && results[highlightIndex]) {
        e.preventDefault()
        handleSelect(results[highlightIndex].node)
      } else if (e.key === "Escape") {
        if (popupNode) {
          handleClosePopup()
        } else {
          setIsOpen(false)
          setQuery("")
          inputRef.current?.blur()
        }
      }
    },
    [results, highlightIndex, handleSelect, popupNode, handleClosePopup]
  )

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
        setPopupNode(null)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  useEffect(() => {
    setHighlightIndex(0)
    setPopupNode(null)
  }, [query])

  const getNodeIcon = (type: string, role?: string) => {
    if (type === "network") return <Globe className="h-3.5 w-3.5 text-accent" />
    if (role === "abr") return <Router className="h-3.5 w-3.5 text-[#38bdf8]" />
    if (role === "asbr") return <Router className="h-3.5 w-3.5 text-[#f97316]" />
    return <Router className="h-3.5 w-3.5 text-primary" />
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="text"
          placeholder="Search routers, areas, roles..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setIsOpen(true)
          }}
          onFocus={() => {
            if (query.length > 0) setIsOpen(true)
          }}
          onKeyDown={handleKeyDown}
          className="h-10 bg-card/95 backdrop-blur-sm border-border shadow-lg shadow-black/40 pl-9 pr-8 text-sm placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-primary/40 focus:border-primary/50"
          aria-label="Search topology"
          role="combobox"
          aria-expanded={isOpen && results.length > 0}
          aria-autocomplete="list"
        />
        {query && (
          <button
            onClick={() => {
              setQuery("")
              setIsOpen(false)
              setPopupNode(null)
              inputRef.current?.focus()
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Results dropdown */}
      {isOpen && !popupNode && results.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 mt-1.5 w-full max-h-80 overflow-auto rounded-lg border border-border bg-card/98 backdrop-blur-md shadow-2xl shadow-black/50 ring-1 ring-white/5"
          role="listbox"
        >
          {results.map((result, idx) => (
            <button
              key={result.node.id + result.matchField}
              onClick={() => handleSelect(result.node)}
              onMouseEnter={() => setHighlightIndex(idx)}
              className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors ${
                idx === highlightIndex
                  ? "bg-primary/10 text-foreground"
                  : "text-foreground/80 hover:bg-secondary/50"
              }`}
              role="option"
              aria-selected={idx === highlightIndex}
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-secondary">
                {getNodeIcon(result.node.type, result.node.role)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-medium truncate">
                    {result.node.label}
                  </span>
                  {result.node.role && result.node.role !== "internal" && (
                    <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                      {result.node.role}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <MapPin className="h-3 w-3 text-muted-foreground/60" />
                  <span className="text-[11px] text-muted-foreground">
                    Area {result.node.area}
                  </span>
                  <span className="text-muted-foreground/30">|</span>
                  <span className="text-[11px] text-muted-foreground">
                    {result.matchField}: {result.matchValue}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Detail popup for selected search result */}
      {isOpen && popupNode && (
        <div
          ref={dropdownRef}
          className="absolute z-50 mt-1.5 w-full rounded-lg border border-border bg-card/98 backdrop-blur-md shadow-2xl shadow-black/50 ring-1 ring-white/5 overflow-hidden"
        >
          {/* Popup header */}
          <div
            className="flex items-center justify-between px-4 py-3 border-b border-border/50"
            style={{ background: getAreaColor(popupNode.area) + "10" }}
          >
            <div className="flex items-center gap-2.5">
              <div
                className="flex h-8 w-8 items-center justify-center rounded-lg"
                style={{ backgroundColor: getAreaColor(popupNode.area) + "20" }}
              >
                {popupNode.type === "router" ? (
                  <Router className="h-4 w-4" style={{ color: getAreaColor(popupNode.area) }} />
                ) : (
                  <Network className="h-4 w-4" style={{ color: getAreaColor(popupNode.area) }} />
                )}
              </div>
              <div>
                <p className="font-mono text-sm font-semibold text-foreground">{popupNode.label}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  {popupNode.type === "router" ? "Router" : "Network"} - Area {popupNode.area}
                </p>
              </div>
            </div>
            <button
              onClick={handleClosePopup}
              className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-secondary/50"
              aria-label="Close popup"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Detail rows */}
          <div className="px-4 py-3 flex flex-col gap-0">
            {popupNode.type === "router" && (() => {
              const data = popupNode.data as OSPFRouter
              return (
                <>
                  <PopupRow label="Router ID" value={data.routerId} mono />
                  <PopupRow label="Role" value={data.role.toUpperCase()} badge badgeColor={
                    data.role === "abr" ? "#38bdf8" : data.role === "asbr" ? "#f97316" : "#2dd4a0"
                  } />
                  <PopupRow label="Area" value={`Area ${popupNode.area}`} />
                  {data.sequenceNumber && <PopupRow label="Seq Number" value={data.sequenceNumber} mono />}
                  {data.age !== undefined && <PopupRow label="LS Age" value={`${data.age}s`} mono />}
                  {data.checksum && <PopupRow label="Checksum" value={data.checksum} mono />}

                  {data.neighbors.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-border/40">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                        Neighbors ({data.neighbors.length})
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {data.neighbors.map((n) => (
                          <span key={n} className="font-mono text-[11px] bg-secondary/60 px-2 py-0.5 rounded text-secondary-foreground">
                            {n}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {data.networks.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-border/40">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                        Networks ({data.networks.length})
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {data.networks.map((n) => (
                          <span key={n} className="font-mono text-[11px] bg-secondary/60 px-2 py-0.5 rounded text-secondary-foreground">
                            {n}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )
            })()}

            {popupNode.type === "network" && (() => {
              const data = popupNode.data as OSPFNetwork
              return (
                <>
                  <PopupRow label="Network" value={data.networkAddress} mono />
                  <PopupRow label="Mask" value={data.mask} mono />
                  <PopupRow label="Area" value={`Area ${popupNode.area}`} />
                  {data.designatedRouter && <PopupRow label="DR" value={data.designatedRouter} mono />}
                  {data.attachedRouters.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-border/40">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                        Attached Routers ({data.attachedRouters.length})
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {data.attachedRouters.map((r) => (
                          <span key={r} className="font-mono text-[11px] bg-secondary/60 px-2 py-0.5 rounded text-secondary-foreground">
                            {r}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )
            })()}

            {/* Connected links */}
            {nodeEdges.length > 0 && (
              <div className="mt-2 pt-2 border-t border-border/40">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  <ArrowRightLeft className="inline h-3 w-3 mr-1 -mt-0.5" />
                  Connected Links ({nodeEdges.length})
                </p>
                <div className="flex flex-col gap-1 max-h-32 overflow-auto">
                  {nodeEdges.map((edge) => {
                    const peer = edge.source === popupNode.id ? edge.target : edge.source
                    const peerNode = nodes.find((n) => n.id === peer)
                    return (
                      <div
                        key={edge.id}
                        className="flex items-center justify-between bg-secondary/40 rounded px-2 py-1"
                      >
                        <div className="flex items-center gap-1.5">
                          <Shield className="h-3 w-3 text-muted-foreground/60" />
                          <span className="font-mono text-[11px] text-foreground/80">
                            {peerNode?.label || peer}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground">{edge.linkType}</span>
                          {(() => {
                            const sCost = edge.sourceCost ?? edge.cost
                            const tCost = edge.targetCost ?? edge.cost
                            const isMe = edge.source === popupNode.id
                            const myCost = isMe ? sCost : tCost
                            const peerCost = isMe ? tCost : sCost
                            const isAsymmetric = sCost !== tCost
                            const areaCol = getAreaColor(edge.area)
                            if (isAsymmetric) {
                              return (
                                <div className="flex items-center gap-1">
                                  <span
                                    className="font-mono text-[10px] font-bold px-1 py-0.5 rounded"
                                    style={{ color: "#f87171", backgroundColor: "#f8717115" }}
                                  >
                                    {myCost}
                                  </span>
                                  <span className="text-[9px] text-muted-foreground/50">/</span>
                                  <span
                                    className="font-mono text-[10px] font-bold px-1 py-0.5 rounded"
                                    style={{ color: "#f87171", backgroundColor: "#f8717115" }}
                                  >
                                    {peerCost}
                                  </span>
                                </div>
                              )
                            }
                            return (
                              <span
                                className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded text-xs"
                                style={{ color: areaCol, backgroundColor: areaCol + "15" }}
                              >
                                cost {myCost}
                              </span>
                            )
                          })()}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-border/40 bg-secondary/20">
            <button
              onClick={handleClosePopup}
              className="w-full text-center text-[11px] text-muted-foreground hover:text-foreground transition-colors py-1"
            >
              Press Esc or click to close
            </button>
          </div>
        </div>
      )}

      {/* No results state */}
      {isOpen && !popupNode && query.length >= 1 && results.length === 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 mt-1.5 w-full rounded-lg border border-border bg-card/98 backdrop-blur-md p-4 shadow-2xl shadow-black/50 ring-1 ring-white/5"
        >
          <p className="text-center text-sm text-muted-foreground">
            No devices matching &ldquo;{query}&rdquo;
          </p>
        </div>
      )}
    </div>
  )
}

function PopupRow({ label, value, mono, badge, badgeColor }: {
  label: string
  value: string | number
  mono?: boolean
  badge?: boolean
  badgeColor?: string
}) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-border/30 last:border-b-0">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      {badge ? (
        <span
          className="text-[10px] font-bold uppercase px-2 py-0.5 rounded"
          style={{ color: badgeColor, backgroundColor: (badgeColor || "#888") + "18" }}
        >
          {value}
        </span>
      ) : (
        <span className={`text-[11px] text-foreground ${mono ? "font-mono" : ""}`}>{value}</span>
      )}
    </div>
  )
}
