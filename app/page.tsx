"use client"

import { useState, useCallback, useMemo, useRef } from "react"
import { toast } from "sonner"
import { AppHeader } from "@/components/app-header"
import { InputPanel } from "@/components/input-panel"
import { SnapshotsPanel } from "@/components/snapshots-panel"
import { TopologyCanvas } from "@/components/topology-canvas"
import { ControlPanel } from "@/components/control-panel"
import { DetailsPanel } from "@/components/details-panel"
import { EmptyState } from "@/components/empty-state"
import { TopologySearch } from "@/components/topology-search"
import { parseOSPFData } from "@/lib/ospf-parser"
import { buildGraph, computeAutoFit } from "@/lib/layout-engine"
import { usePolling } from "@/lib/polling-client"
import { diffTopologies, applyNodeStatuses, applyEdgeStatuses } from "@/lib/topology-diff"
import type {
  OSPFTopology,
  GraphNode,
  GraphEdge,
  LayoutAlgorithm,
  LinkType,
  TopologyChange,
  ViewFilter,
} from "@/lib/ospf-types"
import {
  PanelLeft,
  PanelRight,
  ChevronLeft,
  ChevronRight,
  FileText,
  Database,
} from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"

export default function Page() {
  // ── Core topology state ──
  const [inputText, setInputText] = useState("")
  const [isParsing, setIsParsing] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [topology, setTopology] = useState<OSPFTopology | null>(null)
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [edges, setEdges] = useState<GraphEdge[]>([])

  // ── Visualization state ──
  const [layout, setLayout] = useState<LayoutAlgorithm>("force-directed")
  const [spacingMultiplier, setSpacingMultiplier] = useState(1.5)
  const [showLabels, setShowLabels] = useState(true)
  const [showMetrics, setShowMetrics] = useState(true)
  const [colorBy, setColorBy] = useState<"area" | "lsa-type" | "role">("area")
  const [zoom, setZoom] = useState(1)
  const [panX, setPanX] = useState(0)
  const [panY, setPanY] = useState(0)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null)
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [filterArea, setFilterArea] = useState<string | null>(null)
  const [filterLinkType, setFilterLinkType] = useState<LinkType | null>(null)
  const [viewFilter, setViewFilter] = useState<ViewFilter>("all")
  const [showLeftPanel, setShowLeftPanel] = useState(true)
  const [showRightPanel, setShowRightPanel] = useState(true)

  // ── Left panel tab ──
  const [leftTab, setLeftTab] = useState<"input" | "snapshots">("input")
  const [isSaving, setIsSaving] = useState(false)
  const [events, setEvents] = useState<TopologyChange[]>([])
  const canvasSizeRef = useRef({ width: 900, height: 600 })

  const handleCanvasSizeChange = useCallback((w: number, h: number) => {
    canvasSizeRef.current = { width: w, height: h }
  }, [])

  const autoFitView = useCallback((graphNodes: GraphNode[]) => {
    const { width, height } = canvasSizeRef.current
    const fit = computeAutoFit(graphNodes, width, height)
    setZoom(fit.zoom)
    setPanX(fit.panX)
    setPanY(fit.panY)
  }, [])

  // ── Toast notifications ──
  const notifyChanges = useCallback((changes: TopologyChange[]) => {
    for (const change of changes) {
      if (change.type === "router-added") {
        toast.success(change.description, {
          duration: 5000,
          style: { borderLeft: "3px solid #34d399" },
        })
      } else if (change.type === "router-removed") {
        toast.error(change.description, {
          duration: 5000,
          style: { borderLeft: "3px solid #f87171" },
        })
      } else if (change.type === "link-added" || change.type === "link-removed") {
        const fn = change.type === "link-added" ? toast.success : toast.error
        fn(change.description, {
          duration: 4000,
          style: { borderLeft: `3px solid ${change.type === "link-added" ? "#34d399" : "#f87171"}` },
        })
      } else if (change.type === "metric-changed") {
        toast.warning(change.description, {
          duration: 4000,
          style: { borderLeft: "3px solid #fbbf24" },
        })
      } else if (change.type === "area-changed") {
        toast.info(change.description, {
          duration: 4000,
          style: { borderLeft: "3px solid #38bdf8" },
        })
      }
    }
  }, [])

  // ── Polling ──
  const handlePollingUpdate = useCallback(
    (newTopo: OSPFTopology, changes: TopologyChange[]) => {
      const { width, height } = canvasSizeRef.current
      const graph = buildGraph(newTopo, layout, width, height, spacingMultiplier)

      if (changes.length > 0) {
        const annotatedNodes = applyNodeStatuses(graph.nodes, changes, nodes)
        const annotatedEdges = applyEdgeStatuses(graph.edges, changes, edges)
        setNodes(annotatedNodes)
        setEdges(annotatedEdges)
        setEvents((prev) => [...changes, ...prev].slice(0, 200))
        notifyChanges(changes)
        autoFitView(annotatedNodes)
      } else {
        setNodes(graph.nodes)
        setEdges(graph.edges)
      }

      setTopology(newTopo)
    },
    [layout, spacingMultiplier, nodes, edges, notifyChanges, autoFitView]
  )

  const { pollingState, startPolling, stopPolling, setInterval: setPollingInterval } =
    usePolling({ onTopologyUpdate: handlePollingUpdate, currentTopology: topology })

  // ── Parse handler ──
  const handleParse = useCallback(() => {
    if (!inputText.trim()) return
    setIsParsing(true)
    setParseError(null)
    const { width, height } = canvasSizeRef.current

    setTimeout(() => {
      try {
        const parsed = parseOSPFData(inputText)
        if (parsed.routers.length === 0 && parsed.networks.length === 0) {
          setParseError("No OSPF data found. Make sure the input contains valid OSPF LSA data (e.g. output of 'show ip ospf database').")
          setIsParsing(false)
          return
        }

        // Diff against previous topology if exists
        if (topology) {
          const changes = diffTopologies(topology, parsed)
          if (changes.length > 0) {
            const graph = buildGraph(parsed, layout, width, height, spacingMultiplier)
            const annotatedNodes = applyNodeStatuses(graph.nodes, changes, nodes)
            const annotatedEdges = applyEdgeStatuses(graph.edges, changes, edges)
            setNodes(annotatedNodes)
            setEdges(annotatedEdges)
            setEvents((prev) => [...changes, ...prev].slice(0, 200))
            notifyChanges(changes)
            setTopology(parsed)
            autoFitView(annotatedNodes)
            setIsParsing(false)
            return
          }
        }

        setTopology(parsed)
        const graph = buildGraph(parsed, layout, width, height, spacingMultiplier)
        setNodes(graph.nodes)
        setEdges(graph.edges)
        setSelectedNodeId(null)
        setSelectedEdgeId(null)
        autoFitView(graph.nodes)
        setFilterArea(null)
        setFilterLinkType(null)
      } catch {
        setParseError("Failed to parse OSPF data. Please check the input format.")
      }
      setIsParsing(false)
    }, 50)
  },     [inputText, layout, spacingMultiplier, topology, nodes, edges, notifyChanges, autoFitView])

  // ── SSH data received ──
  const handleSSHData = useCallback(
    (data: string, host: string) => {
      setInputText(data)
      setParseError(null)
      const { width, height } = canvasSizeRef.current

      try {
        const parsed = parseOSPFData(data)
        if (parsed.routers.length === 0 && parsed.networks.length === 0) {
          setParseError("Connected but no OSPF data found on " + host)
          return
        }

        // Diff if we have a previous topology
        if (topology) {
          const changes = diffTopologies(topology, parsed)
          if (changes.length > 0) {
            const graph = buildGraph(parsed, layout, width, height, spacingMultiplier)
            const annotatedNodes = applyNodeStatuses(graph.nodes, changes, nodes)
            const annotatedEdges = applyEdgeStatuses(graph.edges, changes, edges)
            setNodes(annotatedNodes)
            setEdges(annotatedEdges)
            setEvents((prev) => [...changes, ...prev].slice(0, 200))
            notifyChanges(changes)
            setTopology(parsed)
            autoFitView(annotatedNodes)
            toast.success(`Updated topology from ${host}: ${changes.length} change(s)`)
            return
          }
        }

        setTopology(parsed)
        const graph = buildGraph(parsed, layout, width, height, spacingMultiplier)
        setNodes(graph.nodes)
        setEdges(graph.edges)
        setSelectedNodeId(null)
        setSelectedEdgeId(null)
        autoFitView(graph.nodes)
        setFilterArea(null)
        setFilterLinkType(null)
        toast.success(`Loaded ${parsed.routers.length} routers from ${host}`)

        // Auto-save SSH snapshots to DB
        fetch("/api/snapshots", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topology: parsed,
            raw_text: data,
            source: "ssh",
            host,
            name: `${host} — ${parsed.routers.length} routers`,
          }),
        }).catch(() => {/* silent */})
      } catch {
        setParseError("Failed to parse OSPF data from " + host)
      }
    },
    [topology, layout, spacingMultiplier, nodes, edges, notifyChanges, autoFitView]
  )

  // ── Clear ──
  const handleClear = useCallback(() => {
    setInputText("")
    setTopology(null)
    setNodes([])
    setEdges([])
    setParseError(null)
    setSelectedNodeId(null)
    setSelectedEdgeId(null)
    setEvents([])
    setViewFilter("all")
  }, [])

  // ── Save snapshot to DB ──
  const handleSaveSnapshot = useCallback(async () => {
    if (!topology) {
      toast.error("No topology to save. Parse some OSPF data first.")
      return
    }
    setIsSaving(true)
    try {
      const res = await fetch("/api/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topology,
          raw_text: inputText || null,
          source: "manual",
          name: `Snapshot — ${topology.routers.length} routers`,
        }),
      })
      if (!res.ok) throw new Error("Save failed")
      toast.success("Topology saved to database")
    } catch {
      toast.error("Failed to save snapshot")
    } finally {
      setIsSaving(false)
    }
  }, [topology, inputText])

  // ── Load snapshot from DB ──
  const handleLoadSnapshot = useCallback(
    (topoData: unknown, rawText: string | null, _meta?: unknown) => {
      try {
        const parsed = topoData as OSPFTopology
        if (!parsed?.routers) throw new Error("Invalid topology data")
        const { width, height } = canvasSizeRef.current
        const graph = buildGraph(parsed, layout, width, height, spacingMultiplier)
        setTopology(parsed)
        setNodes(graph.nodes)
        setEdges(graph.edges)
        if (rawText) setInputText(rawText)
        setSelectedNodeId(null)
        setSelectedEdgeId(null)
        setFilterArea(null)
        setFilterLinkType(null)
        setViewFilter("all")
        setEvents([])
        autoFitView(graph.nodes)
        setLeftTab("input")
      } catch {
        toast.error("Failed to restore snapshot topology")
      }
    },
    [layout, spacingMultiplier, autoFitView]
  )

  // ── Layout change ──
  const handleLayoutChange = useCallback(
    (newLayout: LayoutAlgorithm) => {
      setLayout(newLayout)
      if (topology) {
        const { width, height } = canvasSizeRef.current
        const graph = buildGraph(topology, newLayout, width, height, spacingMultiplier)
        setNodes(graph.nodes)
        setEdges(graph.edges)
        autoFitView(graph.nodes)
      }
    },
    [topology, spacingMultiplier, autoFitView]
  )

  // ── Spacing change handler ──
  const handleSpacingChange = useCallback(
    (value: number) => {
      setSpacingMultiplier(value)
      if (topology) {
        const { width, height } = canvasSizeRef.current
        const graph = buildGraph(topology, layout, width, height, value)
        setNodes(graph.nodes)
        setEdges(graph.edges)
        autoFitView(graph.nodes)
      }
    },
    [topology, layout, autoFitView]
  )

  // ── Focus node (from search) — smooth animated zoom-in ──
  const animFrameRef = useRef<number | null>(null)

  const handleFocusNode = useCallback(
    (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId)
      if (!node) return

      const { width, height } = canvasSizeRef.current

      // Target: zoom to 1.8 (node detail level) and center on the node
      const TARGET_ZOOM = 1.8
      const targetPanX = width / 2 - node.x * TARGET_ZOOM
      const targetPanY = height / 2 - node.y * TARGET_ZOOM

      // Cancel any previous animation
      if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current)

      const startZoom = zoom
      const startPanX = panX
      const startPanY = panY
      const DURATION = 600 // ms

      const startTime = performance.now()

      const animate = (now: number) => {
        const elapsed = now - startTime
        const t = Math.min(elapsed / DURATION, 1)
        // Ease in-out cubic
        const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

        const currentZoom = startZoom + (TARGET_ZOOM - startZoom) * ease
        const currentPanX = startPanX + (targetPanX - startPanX) * ease
        const currentPanY = startPanY + (targetPanY - startPanY) * ease

        setZoom(currentZoom)
        setPanX(currentPanX)
        setPanY(currentPanY)

        if (t < 1) {
          animFrameRef.current = requestAnimationFrame(animate)
        } else {
          animFrameRef.current = null
        }
      }

      animFrameRef.current = requestAnimationFrame(animate)

      // Select and highlight the node
      setSelectedNodeId(nodeId)
      setFocusedNodeId(nodeId)
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current)
      focusTimerRef.current = setTimeout(() => setFocusedNodeId(null), 8000)
    },
    [nodes, zoom, panX, panY]
  )

  // ── View filter logic ──
  // For cost-unbalanced: edges where sourceCost !== targetCost (asymmetric metrics)
  // For cost-balanced: edges where sourceCost === targetCost (symmetric metrics)
  // For down: nodes with status "removed" or edges with status "removed"
  const unbalancedEdgeNodeIds = useMemo(() => {
    const ids = new Set<string>()
    for (const e of edges) {
      if (e.sourceCost !== e.targetCost && e.linkType === "point-to-point") {
        ids.add(e.source)
        ids.add(e.target)
      }
    }
    return ids
  }, [edges])

  const balancedEdgeNodeIds = useMemo(() => {
    const ids = new Set<string>()
    for (const e of edges) {
      if (e.sourceCost === e.targetCost && e.linkType === "point-to-point" && e.cost > 0) {
        ids.add(e.source)
        ids.add(e.target)
      }
    }
    return ids
  }, [edges])

  // ── Derived state ──
  const areas = useMemo(() => topology?.areas || [], [topology])

  const filteredNodes = useMemo(() => {
    let result = nodes

    // Apply area filter
    if (filterArea) result = result.filter((n) => n.area === filterArea)

    // Apply view filter
    if (viewFilter === "abr") {
      result = result.filter((n) => n.type === "router" && n.role === "abr")
    } else if (viewFilter === "asbr") {
      result = result.filter((n) => n.type === "router" && n.role === "asbr")
    } else if (viewFilter === "cost-unbalanced") {
      result = result.filter((n) => unbalancedEdgeNodeIds.has(n.id))
    } else if (viewFilter === "cost-balanced") {
      result = result.filter((n) => balancedEdgeNodeIds.has(n.id))
    } else if (viewFilter === "down") {
      result = result.filter((n) => n.status === "removed")
    }

    return result
  }, [nodes, filterArea, viewFilter, unbalancedEdgeNodeIds, balancedEdgeNodeIds])

  const filteredEdges = useMemo(() => {
    let filtered = edges

    const nodeIds = new Set(filteredNodes.map((n) => n.id))

    if (filterArea || viewFilter !== "all") {
      filtered = filtered.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
    }

    if (filterLinkType) {
      filtered = filtered.filter((e) => e.linkType === filterLinkType)
    }

    // For cost-unbalanced view: only show the unbalanced edges
    if (viewFilter === "cost-unbalanced") {
      filtered = filtered.filter((e) => e.sourceCost !== e.targetCost)
    }

    // For cost-balanced view: only show the balanced edges
    if (viewFilter === "cost-balanced") {
      filtered = filtered.filter((e) => e.sourceCost === e.targetCost && e.cost > 0)
    }

    // For down view: show removed edges
    if (viewFilter === "down") {
      filtered = filtered.filter((e) => e.status === "removed")
    }

    return filtered
  }, [edges, filteredNodes, filterArea, filterLinkType, viewFilter])

  const selectedNode = useMemo(
    () => (selectedNodeId ? filteredNodes.find((n) => n.id === selectedNodeId) || null : null),
    [selectedNodeId, filteredNodes]
  )
  const selectedEdge = useMemo(
    () => (selectedEdgeId ? filteredEdges.find((e) => e.id === selectedEdgeId) || null : null),
    [selectedEdgeId, filteredEdges]
  )

  const hasTopology = nodes.length > 0

  // ── Render ──
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <AppHeader pollingState={pollingState} />

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel - Input / Snapshots */}
        <div
          className={`flex flex-col border-r border-border bg-card transition-all duration-200 ${
            showLeftPanel ? "w-80" : "w-0"
          } overflow-hidden shrink-0`}
        >
          {showLeftPanel && (
            <>
              {/* Tab switcher */}
              <div className="flex border-b border-border shrink-0">
                <button
                  onClick={() => setLeftTab("input")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
                    leftTab === "input"
                      ? "text-foreground border-b-2 border-primary bg-card"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  Input
                </button>
                <button
                  onClick={() => setLeftTab("snapshots")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
                    leftTab === "snapshots"
                      ? "text-foreground border-b-2 border-primary bg-card"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Database className="w-3.5 h-3.5" />
                  Snapshots
                </button>
              </div>

              {leftTab === "input" ? (
                <ScrollArea className="flex-1">
                  <InputPanel
                    value={inputText}
                    onChange={setInputText}
                    onParse={handleParse}
                    onClear={handleClear}
                    onSSHData={handleSSHData}
                    isParsing={isParsing}
                    parseError={parseError}
                  />
                </ScrollArea>
              ) : (
                <SnapshotsPanel
                  onLoadSnapshot={handleLoadSnapshot}
                  onSaveSnapshot={handleSaveSnapshot}
                  isSaving={isSaving}
                />
              )}
            </>
          )}
        </div>

        {/* Left panel toggle */}
        <button
          onClick={() => setShowLeftPanel(!showLeftPanel)}
          className="flex items-center justify-center w-5 shrink-0 border-r border-border bg-card hover:bg-secondary/50 transition-colors"
          aria-label={showLeftPanel ? "Hide input panel" : "Show input panel"}
        >
          {showLeftPanel ? (
            <ChevronLeft className="w-3 h-3 text-muted-foreground" />
          ) : (
            <PanelLeft className="w-3 h-3 text-muted-foreground" />
          )}
        </button>

        {/* Center - Canvas + Search */}
        <div className="flex-1 flex flex-col relative min-w-0">
          {/* Search bar overlay */}
          {hasTopology && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 w-[420px]">
              <TopologySearch
                nodes={filteredNodes}
                edges={filteredEdges}
                onSelectNode={setSelectedNodeId}
                onFocusNode={handleFocusNode}
              />
            </div>
          )}

          {hasTopology ? (
            <TopologyCanvas
              nodes={filteredNodes}
              edges={filteredEdges}
              selectedNodeId={selectedNodeId}
              selectedEdgeId={selectedEdgeId}
              focusedNodeId={focusedNodeId}
              showLabels={showLabels}
              showMetrics={showMetrics}
              colorBy={colorBy}
              zoom={zoom}
              panX={panX}
              panY={panY}
              onSelectNode={setSelectedNodeId}
              onSelectEdge={setSelectedEdgeId}
              onZoomChange={setZoom}
              onPanChange={(x, y) => { setPanX(x); setPanY(y) }}
              onSizeChange={handleCanvasSizeChange}
            />
          ) : (
            <EmptyState />
          )}
        </div>

        {/* Right panel toggle */}
        <button
          onClick={() => setShowRightPanel(!showRightPanel)}
          className="flex items-center justify-center w-5 shrink-0 border-l border-border bg-card hover:bg-secondary/50 transition-colors"
          aria-label={showRightPanel ? "Hide control panel" : "Show control panel"}
        >
          {showRightPanel ? (
            <ChevronRight className="w-3 h-3 text-muted-foreground" />
          ) : (
            <PanelRight className="w-3 h-3 text-muted-foreground" />
          )}
        </button>

        {/* Right panel - Controls + Details */}
        <div
          className={`flex border-l border-border bg-card transition-all duration-200 ${
            showRightPanel ? "w-72" : "w-0"
          } overflow-hidden shrink-0`}
        >
          {showRightPanel && (
            <div className="flex flex-col w-72">
              {(selectedNode || selectedEdge) && (
                <div className="border-b border-border h-[300px] shrink-0">
                  <DetailsPanel
                    selectedNode={selectedNode}
                    selectedEdge={selectedEdge}
                    nodes={filteredNodes}
                    onClose={() => { setSelectedNodeId(null); setSelectedEdgeId(null) }}
                  />
                </div>
              )}
              <ScrollArea className="flex-1">
                <ControlPanel
                  layout={layout}
                  showLabels={showLabels}
                  showMetrics={showMetrics}
                  colorBy={colorBy}
                  areas={areas}
                  filterArea={filterArea}
                  filterLinkType={filterLinkType}
                  onLayoutChange={handleLayoutChange}
                  onShowLabelsChange={setShowLabels}
                  onShowMetricsChange={setShowMetrics}
                  onColorByChange={setColorBy}
                  onFilterAreaChange={setFilterArea}
                  onFilterLinkTypeChange={setFilterLinkType}
                  onExportPNG={() => {
                    const canvas = document.querySelector("canvas")
                    if (!canvas) return
                    const link = document.createElement("a")
                    link.download = `ospf-topology-${Date.now()}.png`
                    link.href = canvas.toDataURL("image/png")
                    link.click()
                  }}
                  onResetView={() => autoFitView(nodes)}
                  nodeCount={filteredNodes.length}
                  edgeCount={filteredEdges.length}
                  pollingState={pollingState}
                  onStartPolling={startPolling}
                  onStopPolling={stopPolling}
                  onSetPollingInterval={setPollingInterval}
                  events={events}
                  nodes={filteredNodes}
                  allNodes={nodes}
                  allEdges={edges}
                  spacingMultiplier={spacingMultiplier}
                  onSpacingChange={handleSpacingChange}
                  viewFilter={viewFilter}
                  onViewFilterChange={setViewFilter}
                />
              </ScrollArea>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
