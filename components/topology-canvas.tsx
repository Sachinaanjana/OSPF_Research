"use client"

import { useRef, useEffect, useCallback, useState, useMemo } from "react"
import type { GraphNode, GraphEdge } from "@/lib/ospf-types"
import { getAreaColor } from "@/lib/layout-engine"

interface TopologyCanvasProps {
  nodes: GraphNode[]
  edges: GraphEdge[]
  selectedNodeId: string | null
  selectedEdgeId: string | null
  focusedNodeId: string | null
  showLabels: boolean
  showMetrics: boolean
  colorBy: "area" | "lsa-type" | "role"
  zoom: number
  panX: number
  panY: number
  onSelectNode: (id: string | null) => void
  onSelectEdge: (id: string | null) => void
  onZoomChange: (zoom: number) => void
  onPanChange: (x: number, y: number) => void
  onSizeChange?: (width: number, height: number) => void
}

const ROLE_COLORS: Record<string, string> = {
  internal: "#2dd4a0",
  abr: "#38bdf8",
  asbr: "#f97316",
}

const NEW_GLOW_DURATION = 10000
const REMOVED_FADE_DURATION = 5000
const CHANGED_PULSE_DURATION = 8000

function getStatusAlpha(status: string | undefined, timestamp: number | undefined): number {
  if (!status || !timestamp || status === "stable") return 1
  if (status === "removed") {
    return Math.max(0, 1 - (Date.now() - timestamp) / REMOVED_FADE_DURATION)
  }
  return 1
}

function getGlowIntensity(status: string | undefined, timestamp: number | undefined): number {
  if (!status || !timestamp) return 0
  const elapsed = Date.now() - timestamp
  if (status === "new") {
    if (elapsed > NEW_GLOW_DURATION) return 0
    const decay = 1 - elapsed / NEW_GLOW_DURATION
    return decay * (0.5 + 0.5 * Math.sin(elapsed / 200))
  }
  if (status === "removed") {
    if (elapsed > REMOVED_FADE_DURATION) return 0
    return (1 - elapsed / REMOVED_FADE_DURATION) * (0.5 + 0.5 * Math.sin(elapsed / 150))
  }
  if (status === "changed") {
    if (elapsed > CHANGED_PULSE_DURATION) return 0
    const decay = 1 - elapsed / CHANGED_PULSE_DURATION
    return decay * (0.4 + 0.6 * Math.sin(elapsed / 250))
  }
  return 0
}

function getStatusColor(status: string | undefined): string {
  if (status === "new") return "#34d399"
  if (status === "removed") return "#f87171"
  if (status === "changed") return "#fbbf24"
  return ""
}

// ─── Simplified router icon for low zoom / many nodes ───
function drawRouterSimple(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, selected: boolean) {
  const s = selected ? 12 : 10
  ctx.fillStyle = "#141a22"
  ctx.strokeStyle = color
  ctx.lineWidth = selected ? 2 : 1.5
  ctx.beginPath()
  ctx.roundRect(x - s, y - s * 0.6, s * 2, s * 1.2, 3)
  ctx.fill()
  ctx.stroke()
}

function drawNetworkSimple(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, selected: boolean) {
  const s = selected ? 10 : 8
  ctx.fillStyle = "#141a22"
  ctx.strokeStyle = color
  ctx.lineWidth = selected ? 2 : 1.5
  ctx.beginPath()
  ctx.moveTo(x - s, y - s * 0.5)
  ctx.lineTo(x + s, y - s * 0.5)
  ctx.lineTo(x + s * 1.1, y + s * 0.5)
  ctx.lineTo(x - s * 1.1, y + s * 0.5)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
}

// ─── Detailed router icon (Packet Tracer style) ───
function drawRouterDetailed(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, selected: boolean) {
  const s = size
  if (selected) { ctx.shadowColor = color; ctx.shadowBlur = 18 }

  ctx.fillStyle = "#141a22"
  ctx.strokeStyle = color
  ctx.lineWidth = selected ? 2.5 : 1.8
  ctx.beginPath()
  ctx.roundRect(x - s * 1.1, y - s * 0.65, s * 2.2, s * 1.3, 5)
  ctx.fill()
  ctx.stroke()
  ctx.shadowBlur = 0

  ctx.strokeStyle = color + "50"
  ctx.lineWidth = 0.8
  ctx.beginPath()
  ctx.moveTo(x - s * 0.9, y + s * 0.15)
  ctx.lineTo(x + s * 0.9, y + s * 0.15)
  ctx.stroke()

  const ledY = y + s * 0.35
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = i === 0 ? color : color + "30"
    ctx.beginPath()
    ctx.arc(x - s * 0.5 + i * s * 0.35, ledY, 2, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.strokeStyle = color
  ctx.lineWidth = 1.8
  ctx.beginPath()
  ctx.moveTo(x - s * 0.45, y - s * 0.2)
  ctx.lineTo(x + s * 0.45, y - s * 0.2)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(x + s * 0.25, y - s * 0.35)
  ctx.lineTo(x + s * 0.45, y - s * 0.2)
  ctx.lineTo(x + s * 0.25, y - s * 0.05)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(x - s * 0.25, y - s * 0.35)
  ctx.lineTo(x - s * 0.45, y - s * 0.2)
  ctx.lineTo(x - s * 0.25, y - s * 0.05)
  ctx.stroke()

  ctx.fillStyle = color + "80"
  for (let i = 0; i < 2; i++) {
    ctx.beginPath()
    ctx.arc(x - s * 1.1, y - s * 0.25 + i * s * 0.5, 3, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(x + s * 1.1, y - s * 0.25 + i * s * 0.5, 3, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawNetworkDetailed(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, selected: boolean) {
  const s = size
  if (selected) { ctx.shadowColor = color; ctx.shadowBlur = 18 }

  ctx.fillStyle = "#141a22"
  ctx.strokeStyle = color
  ctx.lineWidth = selected ? 2.5 : 1.8
  ctx.beginPath()
  ctx.moveTo(x - s * 0.9, y - s * 0.45)
  ctx.lineTo(x + s * 0.9, y - s * 0.45)
  ctx.lineTo(x + s * 1.1, y + s * 0.45)
  ctx.lineTo(x - s * 1.1, y + s * 0.45)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.shadowBlur = 0

  ctx.strokeStyle = color + "90"
  ctx.lineWidth = 1.3
  const arrowY1 = y - s * 0.15
  const arrowY2 = y + s * 0.15
  ctx.beginPath()
  ctx.moveTo(x - s * 0.5, arrowY1)
  ctx.lineTo(x + s * 0.5, arrowY1)
  ctx.moveTo(x + s * 0.3, arrowY1 - 4)
  ctx.lineTo(x + s * 0.5, arrowY1)
  ctx.lineTo(x + s * 0.3, arrowY1 + 4)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(x + s * 0.5, arrowY2)
  ctx.lineTo(x - s * 0.5, arrowY2)
  ctx.moveTo(x - s * 0.3, arrowY2 - 4)
  ctx.lineTo(x - s * 0.5, arrowY2)
  ctx.lineTo(x - s * 0.3, arrowY2 + 4)
  ctx.stroke()
}

export function TopologyCanvas({
  nodes,
  edges,
  selectedNodeId,
  selectedEdgeId,
  focusedNodeId,
  showLabels,
  showMetrics,
  colorBy,
  zoom,
  panX,
  panY,
  onSelectNode,
  onSelectEdge,
  onZoomChange,
  onPanChange,
  onSizeChange,
}: TopologyCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 })
  const [dragNodeId, setDragNodeId] = useState<string | null>(null)
  const [localNodes, setLocalNodes] = useState<GraphNode[]>(nodes)
  const focusStartRef = useRef<number>(0)

  // Track when focusedNodeId changes
  useEffect(() => {
    if (focusedNodeId) focusStartRef.current = Date.now()
  }, [focusedNodeId])

  useEffect(() => { setLocalNodes(nodes) }, [nodes])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        const { width, height } = entry.contentRect
        const w = Math.floor(width)
        const h = Math.floor(height)
        setCanvasSize({ width: w, height: h })
        onSizeChange?.(w, h)
      }
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [onSizeChange])

  // Pre-build node lookup map for O(1) edge->node resolution
  const nodeMap = useMemo(() => {
    const map = new Map<string, GraphNode>()
    for (const n of localNodes) map.set(n.id, n)
    return map
  }, [localNodes])



  const getNodeColor = useCallback(
    (node: GraphNode): string => {
      if (colorBy === "area") return getAreaColor(node.area)
      if (colorBy === "role" && node.type === "router") {
        return ROLE_COLORS[node.role || "internal"] || "#94a3b8"
      }
      return getAreaColor(node.area)
    },
    [colorBy]
  )

  // Determine rendering LOD: at low zoom or many nodes, use simplified shapes
  const detailLevel = useMemo(() => {
    const totalElements = localNodes.length + edges.length
    if (zoom < 0.3 || totalElements > 800) return "minimal"
    if (zoom < 0.5 || totalElements > 400) return "simple"
    return "detailed"
  }, [zoom, localNodes.length, edges.length])

  // Viewport bounds for culling (in world coordinates)
  const viewport = useMemo(() => {
    const margin = 100
    return {
      left: (-panX / zoom) - margin,
      top: (-panY / zoom) - margin,
      right: (-panX + canvasSize.width) / zoom + margin,
      bottom: (-panY + canvasSize.height) / zoom + margin,
    }
  }, [panX, panY, zoom, canvasSize])

  const isInViewport = useCallback((x: number, y: number) => {
    return x >= viewport.left && x <= viewport.right && y >= viewport.top && y <= viewport.bottom
  }, [viewport])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = canvasSize.width * dpr
    canvas.height = canvasSize.height * dpr
    canvas.style.width = `${canvasSize.width}px`
    canvas.style.height = `${canvasSize.height}px`
    ctx.scale(dpr, dpr)

    // Background
    ctx.fillStyle = "#0d1117"
    ctx.fillRect(0, 0, canvasSize.width, canvasSize.height)

    ctx.save()
    ctx.translate(panX, panY)
    ctx.scale(zoom, zoom)

    // Grid dots -- only if zoom > 0.25 and skip for massive graphs
    if (detailLevel !== "minimal") {
      const gridSize = 30
      ctx.fillStyle = "rgba(255,255,255,0.04)"
      const startX = Math.floor(viewport.left / gridSize) * gridSize
      const startY = Math.floor(viewport.top / gridSize) * gridSize
      // Limit grid dots to avoid perf issues
      const maxDots = 3000
      let dotCount = 0
      for (let gx = startX; gx < viewport.right && dotCount < maxDots; gx += gridSize) {
        for (let gy = startY; gy < viewport.bottom && dotCount < maxDots; gy += gridSize) {
          ctx.fillRect(gx - 0.5, gy - 0.5, 1, 1) // rect is faster than arc
          dotCount++
        }
      }
    }

    // Area backgrounds -- only at sufficient detail
    if (detailLevel !== "minimal") {
      const areaGroups = new Map<string, { minX: number; minY: number; maxX: number; maxY: number }>()
      for (const node of localNodes) {
        const bounds = areaGroups.get(node.area)
        if (!bounds) {
          areaGroups.set(node.area, { minX: node.x, minY: node.y, maxX: node.x, maxY: node.y })
        } else {
          if (node.x < bounds.minX) bounds.minX = node.x
          if (node.y < bounds.minY) bounds.minY = node.y
          if (node.x > bounds.maxX) bounds.maxX = node.x
          if (node.y > bounds.maxY) bounds.maxY = node.y
        }
      }

      const pad = 80
      for (const [area, b] of areaGroups) {
        const color = getAreaColor(area)
        ctx.fillStyle = color + "08"
        ctx.strokeStyle = color + "20"
        ctx.lineWidth = 1.5
        ctx.setLineDash([8, 4])
        ctx.beginPath()
        ctx.roundRect(b.minX - pad, b.minY - pad, b.maxX - b.minX + pad * 2, b.maxY - b.minY + pad * 2, 16)
        ctx.fill()
        ctx.stroke()
        ctx.setLineDash([])

        ctx.fillStyle = color + "80"
        ctx.font = "bold 12px system-ui, sans-serif"
        ctx.textAlign = "left"
        ctx.textBaseline = "top"
        ctx.fillText(`Area ${area}`, b.minX - pad + 10, b.minY - pad + 8)
      }
    }

    // ─── Draw edges ───
    for (const edge of edges) {
      const sourceNode = nodeMap.get(edge.source)
      const targetNode = nodeMap.get(edge.target)
      if (!sourceNode || !targetNode) continue

      // Viewport culling for edges
      if (!isInViewport(sourceNode.x, sourceNode.y) && !isInViewport(targetNode.x, targetNode.y)) continue

      const isSelected = edge.id === selectedEdgeId
      const edgeColor = getAreaColor(edge.area)
      const edgeAlpha = getStatusAlpha(edge.status, edge.statusTimestamp)
      const edgeGlow = getGlowIntensity(edge.status, edge.statusTimestamp)
      const statusCol = getStatusColor(edge.status)

      ctx.save()
      ctx.globalAlpha = edgeAlpha

      // Status glow (only for active status changes, skip shadow for perf)
      if (edgeGlow > 0 && statusCol) {
        ctx.beginPath()
        ctx.moveTo(sourceNode.x, sourceNode.y)
        ctx.lineTo(targetNode.x, targetNode.y)
        ctx.strokeStyle = statusCol
        ctx.lineWidth = 6 * edgeGlow + 2
        ctx.setLineDash([])
        ctx.stroke()
      }

      // Cable line
      ctx.beginPath()
      ctx.moveTo(sourceNode.x, sourceNode.y)
      ctx.lineTo(targetNode.x, targetNode.y)

      if (edge.linkType === "point-to-point") {
        ctx.setLineDash([])
        ctx.lineWidth = isSelected ? 3 : 1.5
      } else if (edge.linkType === "transit") {
        ctx.setLineDash([8, 4])
        ctx.lineWidth = isSelected ? 3 : 1.5
      } else {
        ctx.setLineDash([3, 3])
        ctx.lineWidth = isSelected ? 2.5 : 1.2
      }

      ctx.strokeStyle = isSelected ? (statusCol || edgeColor) : (statusCol ? statusCol + "cc" : edgeColor + "60")
      if (isSelected) { ctx.shadowColor = statusCol || edgeColor; ctx.shadowBlur = 10 }
      ctx.stroke()
      ctx.setLineDash([])
      ctx.shadowBlur = 0

      // Per-side cost labels on every edge
      const sCost = edge.sourceCost ?? edge.cost
      const tCost = edge.targetCost ?? edge.cost
      if (sCost > 0 || tCost > 0) {
        const dx = targetNode.x - sourceNode.x
        const dy = targetNode.y - sourceNode.y
        const len = Math.sqrt(dx * dx + dy * dy)
        if (len > 40) {
          const nx = dx / len
          const ny = dy / len
          const isAsymmetric = sCost !== tCost
          const costFont = detailLevel === "detailed" ? "bold 10px monospace" : "bold 8px monospace"
          ctx.font = costFont
          const asymColor = "#f87171"    // red for asymmetric
          const normalColor = statusCol || edgeColor

          // Source-side cost (25% from source along the line)
          if (sCost > 0) {
            const sx = sourceNode.x + nx * len * 0.25
            const sy = sourceNode.y + ny * len * 0.25
            // Offset perpendicular to the line so label sits beside it
            const offX = -ny * 10
            const offY = nx * 10
            const lx = sx + offX
            const ly = sy + offY
            const sText = `${sCost}`
            const sw = ctx.measureText(sText).width + 6
            const sh = 14
            const sColor = isAsymmetric ? asymColor : normalColor
            ctx.fillStyle = "#0f1520ee"
            ctx.strokeStyle = sColor + "60"
            ctx.lineWidth = 0.8
            ctx.beginPath()
            ctx.roundRect(lx - sw / 2, ly - sh / 2, sw, sh, 3)
            ctx.fill()
            ctx.stroke()
            ctx.fillStyle = sColor
            ctx.textAlign = "center"
            ctx.textBaseline = "middle"
            ctx.fillText(sText, lx, ly)
          }

          // Target-side cost (75% from source = 25% from target)
          if (tCost > 0) {
            const tx = sourceNode.x + nx * len * 0.75
            const ty = sourceNode.y + ny * len * 0.75
            const offX = -ny * 10
            const offY = nx * 10
            const lx = tx + offX
            const ly = ty + offY
            const tText = `${tCost}`
            const tw = ctx.measureText(tText).width + 6
            const th = 14
            const tColor = isAsymmetric ? asymColor : normalColor
            ctx.fillStyle = "#0f1520ee"
            ctx.strokeStyle = tColor + "60"
            ctx.lineWidth = 0.8
            ctx.beginPath()
            ctx.roundRect(lx - tw / 2, ly - th / 2, tw, th, 3)
            ctx.fill()
            ctx.stroke()
            ctx.fillStyle = tColor
            ctx.textAlign = "center"
            ctx.textBaseline = "middle"
            ctx.fillText(tText, lx, ly)
          }
        }
      }

      // Interface dots + detailed labels
      if (detailLevel === "detailed") {
        const dx = targetNode.x - sourceNode.x
        const dy = targetNode.y - sourceNode.y
        const len = Math.sqrt(dx * dx + dy * dy)
        if (len > 0) {
          const nx = dx / len
          const ny = dy / len
          const srcEndX = sourceNode.x + nx * 30
          const srcEndY = sourceNode.y + ny * 30
          const tgtEndX = targetNode.x - nx * 30
          const tgtEndY = targetNode.y - ny * 30

          ctx.fillStyle = edgeColor
          ctx.beginPath()
          ctx.arc(srcEndX, srcEndY, 2.5, 0, Math.PI * 2)
          ctx.fill()
          ctx.beginPath()
          ctx.arc(tgtEndX, tgtEndY, 2.5, 0, Math.PI * 2)
          ctx.fill()

          if (showMetrics && edge.interfaceInfo) {
            ctx.font = "9px monospace"
            const tw = ctx.measureText(edge.interfaceInfo).width + 8
            const lx = srcEndX + ny * 12
            const ly = srcEndY - nx * 12
            ctx.fillStyle = "#0d1117"
            ctx.strokeStyle = edgeColor + "40"
            ctx.lineWidth = 0.8
            ctx.beginPath()
            ctx.roundRect(lx - tw / 2, ly - 7, tw, 14, 3)
            ctx.fill()
            ctx.stroke()
            ctx.fillStyle = edgeColor + "cc"
            ctx.textAlign = "center"
            ctx.textBaseline = "middle"
            ctx.fillText(edge.interfaceInfo, lx, ly)
          }
        }
      }
      ctx.restore()
    }

    // ─── Draw nodes ───
    for (const node of localNodes) {
      // Viewport culling
      if (!isInViewport(node.x, node.y)) continue

      const isSelected = node.id === selectedNodeId
      const color = getNodeColor(node)
      const nodeAlpha = getStatusAlpha(node.status, node.statusTimestamp)
      const nodeGlow = getGlowIntensity(node.status, node.statusTimestamp)
      const nodeStatusCol = getStatusColor(node.status)

      if (nodeAlpha <= 0) continue

      ctx.save()
      ctx.globalAlpha = nodeAlpha

      // Glow aura (no shadow for perf -- use radial gradient instead)
      if (nodeGlow > 0 && nodeStatusCol) {
        const glowR = 30 + 10 * nodeGlow
        const gradient = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, glowR)
        gradient.addColorStop(0, nodeStatusCol + Math.round(nodeGlow * 60).toString(16).padStart(2, "0"))
        gradient.addColorStop(1, nodeStatusCol + "00")
        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.arc(node.x, node.y, glowR, 0, Math.PI * 2)
        ctx.fill()
      }

      const drawColor = nodeStatusCol && nodeGlow > 0.2 ? nodeStatusCol : color

      // LOD-based rendering
      if (detailLevel === "minimal") {
        // Just a colored dot
        ctx.fillStyle = drawColor
        ctx.beginPath()
        ctx.arc(node.x, node.y, isSelected ? 6 : 4, 0, Math.PI * 2)
        ctx.fill()
      } else if (detailLevel === "simple") {
        if (node.type === "router") {
          drawRouterSimple(ctx, node.x, node.y, drawColor, isSelected)
        } else {
          drawNetworkSimple(ctx, node.x, node.y, drawColor, isSelected)
        }
      } else {
        if (node.type === "router") {
          drawRouterDetailed(ctx, node.x, node.y, 20, drawColor, isSelected)
          if (node.role && node.role !== "internal") {
            const badge = node.role.toUpperCase()
            ctx.font = "bold 9px system-ui, sans-serif"
            const badgeW = ctx.measureText(badge).width + 10
            ctx.fillStyle = color
            ctx.beginPath()
            ctx.roundRect(node.x - badgeW / 2, node.y - 20 * 0.65 - 18, badgeW, 15, 3)
            ctx.fill()
            ctx.fillStyle = "#0d1117"
            ctx.textAlign = "center"
            ctx.textBaseline = "middle"
            ctx.fillText(badge, node.x, node.y - 20 * 0.65 - 10.5)
          }
        } else {
          drawNetworkDetailed(ctx, node.x, node.y, 16, drawColor, isSelected)
        }
      }

      // Status badge
      if (nodeStatusCol && nodeGlow > 0.1 && detailLevel !== "minimal") {
        const badgeText = node.status === "new" ? "NEW" : node.status === "removed" ? "DOWN" : "CHG"
        ctx.font = "bold 8px system-ui, sans-serif"
        const bw = ctx.measureText(badgeText).width + 6
        ctx.fillStyle = nodeStatusCol
        ctx.beginPath()
        ctx.roundRect(node.x + 18 - bw / 2, node.y - 24, bw, 12, 3)
        ctx.fill()
        ctx.fillStyle = "#0d1117"
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillText(badgeText, node.x + 18, node.y - 18)
      }

      // Labels
      if (showLabels && detailLevel !== "minimal") {
        const ly = node.type === "router" ? node.y + 18 : node.y + 14
        ctx.font = detailLevel === "simple" ? "bold 9px monospace" : "bold 11px monospace"
        ctx.textAlign = "center"
        ctx.textBaseline = "top"
        const lw = ctx.measureText(node.label).width + 8
        ctx.fillStyle = "#0d1117cc"
        ctx.beginPath()
        ctx.roundRect(node.x - lw / 2, ly - 2, lw, 16, 3)
        ctx.fill()
        ctx.fillStyle = "#e2e8f0"
        ctx.fillText(node.label, node.x, ly)
      }

      // Focus highlight ring -- bright pulsing circle when search focuses this node
      if (node.id === focusedNodeId) {
        const elapsed = Date.now() - focusStartRef.current
        const FOCUS_DURATION = 6000
        if (elapsed < FOCUS_DURATION) {
          const decay = 1 - elapsed / FOCUS_DURATION
          const pulse = 0.5 + 0.5 * Math.sin(elapsed / 180)
          const focusColor = "#fbbf24" // amber/yellow

          // Outer pulsing ring
          const outerRadius = 38 + 8 * pulse
          ctx.strokeStyle = focusColor
          ctx.lineWidth = 2.5 * decay
          ctx.globalAlpha = decay * 0.9
          ctx.setLineDash([6, 4])
          ctx.beginPath()
          ctx.arc(node.x, node.y, outerRadius, 0, Math.PI * 2)
          ctx.stroke()
          ctx.setLineDash([])

          // Inner solid ring
          const innerRadius = 30
          ctx.strokeStyle = focusColor
          ctx.lineWidth = 2 * decay
          ctx.globalAlpha = decay
          ctx.beginPath()
          ctx.arc(node.x, node.y, innerRadius, 0, Math.PI * 2)
          ctx.stroke()

          // Radial glow fill
          const glowR = 45 + 10 * pulse
          const gradient = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, glowR)
          gradient.addColorStop(0, focusColor + Math.round(decay * 40).toString(16).padStart(2, "0"))
          gradient.addColorStop(1, focusColor + "00")
          ctx.fillStyle = gradient
          ctx.globalAlpha = decay * 0.7
          ctx.beginPath()
          ctx.arc(node.x, node.y, glowR, 0, Math.PI * 2)
          ctx.fill()

          // Small crosshair at center
          ctx.globalAlpha = decay * 0.5
          ctx.strokeStyle = focusColor
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(node.x - 6, node.y)
          ctx.lineTo(node.x + 6, node.y)
          ctx.moveTo(node.x, node.y - 6)
          ctx.lineTo(node.x, node.y + 6)
          ctx.stroke()
        }
      }

      ctx.restore()
    }

    ctx.restore()
  }, [localNodes, edges, selectedNodeId, selectedEdgeId, focusedNodeId, showLabels, showMetrics, colorBy, zoom, panX, panY, canvasSize, getNodeColor, nodeMap, detailLevel, viewport, isInViewport])

  useEffect(() => { draw() }, [draw])

  // Animation loop for status effects
  useEffect(() => {
    let animFrameId: number | null = null
    const hasFocusAnim = focusedNodeId && (Date.now() - focusStartRef.current < 6000)
    const hasAnimations = hasFocusAnim || localNodes.some(
      (n) => n.status && n.status !== "stable" && n.statusTimestamp
    ) || edges.some(
      (e) => e.status && e.status !== "stable" && e.statusTimestamp
    )

    if (hasAnimations) {
      let lastFrame = 0
      const animate = (ts: number) => {
        // Throttle to ~30fps for animations to save GPU
        if (ts - lastFrame > 33) {
          draw()
          lastFrame = ts
        }
        animFrameId = requestAnimationFrame(animate)
      }
      animFrameId = requestAnimationFrame(animate)
    }

    return () => { if (animFrameId !== null) cancelAnimationFrame(animFrameId) }
  }, [localNodes, edges, draw, focusedNodeId])

  // Hit testing with nodeMap for O(1) lookups
  const getNodeAt = useCallback(
    (clientX: number, clientY: number): GraphNode | null => {
      const canvas = canvasRef.current
      if (!canvas) return null
      const rect = canvas.getBoundingClientRect()
      const x = (clientX - rect.left - panX) / zoom
      const y = (clientY - rect.top - panY) / zoom
      // Reverse iterate for z-order
      for (let i = localNodes.length - 1; i >= 0; i--) {
        const node = localNodes[i]
        const hitSize = node.type === "router" ? 28 : 22
        if (Math.abs(x - node.x) < hitSize && Math.abs(y - node.y) < hitSize) return node
      }
      return null
    },
    [localNodes, zoom, panX, panY]
  )

  const getEdgeAt = useCallback(
    (clientX: number, clientY: number): GraphEdge | null => {
      const canvas = canvasRef.current
      if (!canvas) return null
      const rect = canvas.getBoundingClientRect()
      const x = (clientX - rect.left - panX) / zoom
      const y = (clientY - rect.top - panY) / zoom

      for (const edge of edges) {
        const source = nodeMap.get(edge.source)
        const target = nodeMap.get(edge.target)
        if (!source || !target) continue
        const dx = target.x - source.x
        const dy = target.y - source.y
        const len = Math.sqrt(dx * dx + dy * dy)
        if (len === 0) continue
        const t = Math.max(0, Math.min(1, ((x - source.x) * dx + (y - source.y) * dy) / (len * len)))
        const projX = source.x + t * dx
        const projY = source.y + t * dy
        const dist = Math.sqrt((x - projX) ** 2 + (y - projY) ** 2)
        if (dist < 10) return edge
      }
      return null
    },
    [edges, nodeMap, zoom, panX, panY]
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const node = getNodeAt(e.clientX, e.clientY)
      if (node) {
        setDragNodeId(node.id)
        onSelectNode(node.id)
        onSelectEdge(null)
        return
      }
      const edge = getEdgeAt(e.clientX, e.clientY)
      if (edge) {
        onSelectEdge(edge.id)
        onSelectNode(null)
        return
      }
      setIsPanning(true)
      setPanStart({ x: e.clientX - panX, y: e.clientY - panY })
      onSelectNode(null)
      onSelectEdge(null)
    },
    [getNodeAt, getEdgeAt, panX, panY, onSelectNode, onSelectEdge]
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (dragNodeId) {
        const canvas = canvasRef.current
        if (!canvas) return
        const rect = canvas.getBoundingClientRect()
        const x = (e.clientX - rect.left - panX) / zoom
        const y = (e.clientY - rect.top - panY) / zoom
        setLocalNodes((prev) =>
          prev.map((n) => (n.id === dragNodeId ? { ...n, x, y } : n))
        )
        return
      }
      if (isPanning) {
        onPanChange(e.clientX - panStart.x, e.clientY - panStart.y)
      }
    },
    [dragNodeId, isPanning, panStart, panX, panY, zoom, onPanChange]
  )

  const handleMouseUp = useCallback(() => {
    setDragNodeId(null)
    setIsPanning(false)
  }, [])

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? 0.9 : 1.1
      const newZoom = Math.max(0.05, Math.min(5, zoom * delta))
      onZoomChange(newZoom)
    },
    [zoom, onZoomChange]
  )

  return (
    <div
      ref={containerRef}
      className="relative flex-1 overflow-hidden bg-card rounded-lg border border-border"
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ display: "block", cursor: dragNodeId ? "grabbing" : isPanning ? "grabbing" : "default" }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      />
      {/* Zoom controls */}
      <div className="absolute bottom-3 right-3 flex items-center gap-1 bg-background/90 backdrop-blur-sm rounded-md px-2 py-1.5 border border-border">
        <button
          onClick={() => onZoomChange(Math.max(0.05, zoom - 0.2))}
          className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors text-sm font-mono rounded hover:bg-secondary/50"
          aria-label="Zoom out"
        >
          -
        </button>
        <span className="text-xs text-muted-foreground font-mono min-w-[3.5rem] text-center">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => onZoomChange(Math.min(5, zoom + 0.2))}
          className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors text-sm font-mono rounded hover:bg-secondary/50"
          aria-label="Zoom in"
        >
          +
        </button>
        <div className="w-px h-4 bg-border mx-1" />
        <button
          onClick={() => { onZoomChange(1); onPanChange(0, 0) }}
          className="text-[10px] text-muted-foreground hover:text-foreground transition-colors font-mono px-1 rounded hover:bg-secondary/50"
          aria-label="Reset view"
        >
          FIT
        </button>
      </div>
      {/* Node/edge count indicator */}
      <div className="absolute top-3 left-3 text-[10px] font-mono text-muted-foreground bg-background/80 backdrop-blur-sm rounded px-2 py-1 border border-border">
        {localNodes.length} nodes / {edges.length} edges
        {detailLevel !== "detailed" && (
          <span className="ml-1 text-accent">({detailLevel} mode)</span>
        )}
      </div>
      {/* Empty state */}
      {localNodes.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <div className="w-16 h-16 rounded-xl bg-secondary/30 flex items-center justify-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground">
              <rect x="2" y="6" width="8" height="5" rx="1" />
              <rect x="14" y="6" width="8" height="5" rx="1" />
              <rect x="8" y="15" width="8" height="5" rx="1" />
              <path d="M10 8.5h4M6 11v5.5a1 1 0 001 1h1M18 11v5.5a1 1 0 01-1 1h-1" />
            </svg>
          </div>
          <p className="text-sm text-muted-foreground text-center max-w-[240px] leading-relaxed">
            Paste OSPF LSA data in the left panel and click <strong className="text-foreground">Parse & Visualize</strong> to draw the network topology
          </p>
        </div>
      )}
    </div>
  )
}
