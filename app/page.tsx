"use client"

import { useState, useCallback, useMemo, useEffect, useRef } from "react"
import { toast } from "sonner"
import { AppHeader } from "@/components/app-header"
import { InputPanel } from "@/components/input-panel"
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
} from "@/lib/ospf-types"
import {
  PanelLeft,
  PanelRight,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"

interface AuthUser {
  name: string
  email: string
}

export default function Page() {
  // ── Auth ──
  const [user, setUser] = useState<AuthUser | null>(null)

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) setUser(data.user)
      })
      .catch(() => {})
  }, [])

  // ── Core topology state ──
  const [inputText, setInputText] = useState("")
  const [isParsing, setIsParsing] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [topology, setTopology] = useState<OSPFTopology | null>(null)
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [edges, setEdges] = useState<GraphEdge[]>([])

  // ── Visualization state ──
  const [layout, setLayout] = useState<LayoutAlgorithm>("force-directed")
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
  const [showLeftPanel, setShowLeftPanel] = useState(true)
  const [showRightPanel, setShowRightPanel] = useState(true)

  // ── Real-time ──
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
      const graph = buildGraph(newTopo, layout, width, height)

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
    [layout, nodes, edges, notifyChanges, autoFitView]
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
            const graph = buildGraph(parsed, layout, width, height)
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
        const graph = buildGraph(parsed, layout, width, height)
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
  }, [inputText, layout, topology, nodes, edges, notifyChanges, autoFitView])

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
            const graph = buildGraph(parsed, layout, width, height)
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
        const graph = buildGraph(parsed, layout, width, height)
        setNodes(graph.nodes)
        setEdges(graph.edges)
        setSelectedNodeId(null)
        setSelectedEdgeId(null)
        autoFitView(graph.nodes)
        setFilterArea(null)
        setFilterLinkType(null)
        toast.success(`Loaded ${parsed.routers.length} routers from ${host}`)
      } catch {
        setParseError("Failed to parse OSPF data from " + host)
      }
    },
    [topology, layout, nodes, edges, notifyChanges, autoFitView]
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
  }, [])

  // ── Layout change ──
  const handleLayoutChange = useCallback(
    (newLayout: LayoutAlgorithm) => {
      setLayout(newLayout)
      if (topology) {
        const { width, height } = canvasSizeRef.current
        const graph = buildGraph(topology, newLayout, width, height)
        setNodes(graph.nodes)
        setEdges(graph.edges)
        autoFitView(graph.nodes)
      }
    },
    [topology, autoFitView]
  )

  // ── Focus node (from search) ──
  const handleFocusNode = useCallback(
    (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId)
      if (!node) return
      const { width, height } = canvasSizeRef.current
      const targetZoom = Math.max(zoom, 0.8)
      setPanX(width / 2 - node.x * targetZoom)
      setPanY(height / 2 - node.y * targetZoom)
      setZoom(targetZoom)
      setSelectedNodeId(nodeId)

      // Set focus highlight with auto-clear after 6s
      setFocusedNodeId(nodeId)
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current)
      focusTimerRef.current = setTimeout(() => setFocusedNodeId(null), 6000)
    },
    [nodes, zoom]
  )

  // ── Derived state ──
  const areas = useMemo(() => topology?.areas || [], [topology])

  const filteredNodes = useMemo(() => {
    if (!filterArea) return nodes
    return nodes.filter((n) => n.area === filterArea)
  }, [nodes, filterArea])

  const filteredEdges = useMemo(() => {
    let filtered = edges
    if (filterArea) {
      const nodeIds = new Set(filteredNodes.map((n) => n.id))
      filtered = filtered.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
    }
    if (filterLinkType) {
      filtered = filtered.filter((e) => e.linkType === filterLinkType)
    }
    return filtered
  }, [edges, filteredNodes, filterArea, filterLinkType])

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
      <AppHeader pollingState={pollingState} user={user} />

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel - Input */}
        <div
          className={`flex flex-col border-r border-border bg-card transition-all duration-200 ${
            showLeftPanel ? "w-80" : "w-0"
          } overflow-hidden shrink-0`}
        >
          {showLeftPanel && (
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
                />
              </ScrollArea>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
