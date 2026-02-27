import type { GraphNode, GraphEdge, LayoutAlgorithm, OSPFTopology } from "./ospf-types"

const AREA_COLORS: Record<string, string> = {
  "0": "#2dd4a0",
  "1": "#38bdf8",
  "2": "#f97316",
  "3": "#e879f9",
  "4": "#facc15",
  "5": "#fb923c",
  "6": "#a78bfa",
  "7": "#f472b6",
}

export function getAreaColor(area: string): string {
  if (AREA_COLORS[area]) return AREA_COLORS[area]
  const num = parseInt(area, 10) || 0
  const hue = (num * 47 + 30) % 360
  return `hsl(${hue}, 65%, 55%)`
}

function computeLayoutSize(nodeCount: number, baseWidth: number, baseHeight: number) {
  const minArea = baseWidth * baseHeight
  const desiredArea = Math.max(minArea, nodeCount * 150 * 150)
  const aspect = baseWidth / baseHeight
  const h = Math.sqrt(desiredArea / aspect)
  const w = h * aspect
  return { width: Math.ceil(w), height: Math.ceil(h) }
}

export function buildGraph(
  topology: OSPFTopology,
  layout: LayoutAlgorithm,
  viewportWidth: number,
  viewportHeight: number
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []

  for (const router of topology.routers) {
    nodes.push({
      id: router.id,
      type: "router",
      label: router.routerId,
      role: router.role,
      area: router.area,
      x: 0,
      y: 0,
      data: router,
    })
  }

  for (const network of topology.networks) {
    nodes.push({
      id: network.id,
      type: "network",
      label: network.networkAddress,
      area: network.area,
      x: 0,
      y: 0,
      data: network,
    })
  }

  for (const link of topology.links) {
    edges.push({
      id: link.id,
      source: link.source,
      target: link.target,
      cost: link.cost,
      sourceCost: link.sourceCost ?? link.cost,
      targetCost: link.targetCost ?? link.cost,
      linkType: link.linkType,
      area: link.area,
      interfaceInfo: link.interfaceInfo,
    })
  }

  const { width, height } = computeLayoutSize(nodes.length, viewportWidth, viewportHeight)
  applyLayout(nodes, edges, layout, width, height)
  return { nodes, edges }
}

export function computeAutoFit(
  nodes: GraphNode[],
  viewportWidth: number,
  viewportHeight: number
): { zoom: number; panX: number; panY: number } {
  if (nodes.length === 0) return { zoom: 1, panX: 0, panY: 0 }

  const padding = 80
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const n of nodes) {
    if (n.x < minX) minX = n.x
    if (n.y < minY) minY = n.y
    if (n.x > maxX) maxX = n.x
    if (n.y > maxY) maxY = n.y
  }

  const contentW = maxX - minX + padding * 2
  const contentH = maxY - minY + padding * 2
  if (contentW <= 0 || contentH <= 0) return { zoom: 1, panX: 0, panY: 0 }

  const zoom = Math.min(viewportWidth / contentW, viewportHeight / contentH, 1.5)
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2
  const panX = viewportWidth / 2 - centerX * zoom
  const panY = viewportHeight / 2 - centerY * zoom
  return { zoom: Math.max(0.05, zoom), panX, panY }
}

function applyLayout(nodes: GraphNode[], edges: GraphEdge[], layout: LayoutAlgorithm, width: number, height: number) {
  switch (layout) {
    case "force-directed": forceDirectedLayout(nodes, edges, width, height); break
    case "hierarchical": hierarchicalLayout(nodes, edges, width, height); break
    case "radial": radialLayout(nodes, edges, width, height); break
  }
}

// ───────────── Optimized Force-Directed Layout ─────────────
// Uses indexed lookups, Barnes-Hut-like grid spatial hashing for repulsion at scale
function forceDirectedLayout(nodes: GraphNode[], edges: GraphEdge[], width: number, height: number) {
  const n = nodes.length
  if (n === 0) return

  const centerX = width / 2
  const centerY = height / 2
  const nodeSpacing = Math.max(100, 600 / Math.sqrt(n))

  // Build ID -> index map for O(1) lookups
  const idxMap = new Map<string, number>()
  for (let i = 0; i < n; i++) idxMap.set(nodes[i].id, i)

  // Pre-compute edge index pairs
  const edgePairs: [number, number][] = []
  for (const e of edges) {
    const si = idxMap.get(e.source)
    const ti = idxMap.get(e.target)
    if (si !== undefined && ti !== undefined) edgePairs.push([si, ti])
  }

  // Area-grouped initialization
  const areaGroups = new Map<string, number[]>()
  for (let i = 0; i < n; i++) {
    const a = nodes[i].area
    if (!areaGroups.has(a)) areaGroups.set(a, [])
    areaGroups.get(a)!.push(i)
  }

  const areas = Array.from(areaGroups.keys()).sort()
  const areaAngle = (2 * Math.PI) / Math.max(areas.length, 1)
  const initRadius = Math.min(width, height) * 0.4

  for (let ai = 0; ai < areas.length; ai++) {
    const area = areas[ai]
    const group = areaGroups.get(area)!
    const baseAngle = areaAngle * ai
    const areaR = initRadius * (area === "0" ? 0.3 : 0.85)
    const acx = centerX + (area === "0" ? 0 : areaR * Math.cos(baseAngle))
    const acy = centerY + (area === "0" ? 0 : areaR * Math.sin(baseAngle))
    const r = Math.min(nodeSpacing * Math.sqrt(group.length) * 0.4, initRadius * 0.3)
    for (let ni = 0; ni < group.length; ni++) {
      const a = (2 * Math.PI * ni) / group.length
      nodes[group[ni]].x = acx + r * Math.cos(a)
      nodes[group[ni]].y = acy + r * Math.sin(a)
    }
  }

  // Use typed arrays for velocities -- much faster than object arrays
  const vx = new Float64Array(n)
  const vy = new Float64Array(n)
  const px = new Float64Array(n)
  const py = new Float64Array(n)

  // Copy positions to typed arrays
  for (let i = 0; i < n; i++) { px[i] = nodes[i].x; py[i] = nodes[i].y }

  const repulsion = Math.max(12000, n * 250)
  const attraction = 0.004
  const minDist = nodeSpacing * 0.5

  // Adaptive iterations: fewer for very large graphs
  const iterations = n > 200 ? 100 : n > 100 ? 140 : 200
  const damping = 0.88

  // For large graphs (100+), use grid-based spatial hashing for repulsion
  const useGrid = n > 80
  const gridCellSize = nodeSpacing * 2

  for (let iter = 0; iter < iterations; iter++) {
    const temp = 1 - iter / iterations

    // Reset forces
    vx.fill(0)
    vy.fill(0)

    if (useGrid) {
      // Grid-based approximate repulsion: O(N * k) where k = avg neighbors in nearby cells
      const cellMap = new Map<string, number[]>()
      for (let i = 0; i < n; i++) {
        const cx = Math.floor(px[i] / gridCellSize)
        const cy = Math.floor(py[i] / gridCellSize)
        const key = `${cx},${cy}`
        if (!cellMap.has(key)) cellMap.set(key, [])
        cellMap.get(key)!.push(i)
      }

      for (let i = 0; i < n; i++) {
        const cx = Math.floor(px[i] / gridCellSize)
        const cy = Math.floor(py[i] / gridCellSize)

        // Check 5x5 neighborhood for more accurate repulsion at scale
        for (let dcx = -2; dcx <= 2; dcx++) {
          for (let dcy = -2; dcy <= 2; dcy++) {
            const key = `${cx + dcx},${cy + dcy}`
            const cell = cellMap.get(key)
            if (!cell) continue

            for (const j of cell) {
              if (j <= i) continue
              const dx = px[i] - px[j]
              const dy = py[i] - py[j]
              const distSq = dx * dx + dy * dy
              const dist = Math.sqrt(distSq) || 0.1

              let force: number
              if (dist < minDist) {
                force = repulsion * 3 / (distSq + 1)
              } else {
                force = repulsion / (distSq + 1)
              }

              if (nodes[i].area === nodes[j].area) force *= 0.6

              const fx = (dx / dist) * force * temp
              const fy = (dy / dist) * force * temp
              vx[i] += fx; vy[i] += fy
              vx[j] -= fx; vy[j] -= fy
            }
          }
        }
      }
    } else {
      // Exact O(N^2) for small graphs (< 80 nodes)
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const dx = px[i] - px[j]
          const dy = py[i] - py[j]
          const distSq = dx * dx + dy * dy
          const dist = Math.sqrt(distSq) || 0.1

          let force: number
          if (dist < minDist) {
            force = repulsion * 3 / (distSq + 1)
          } else {
            force = repulsion / (distSq + 1)
          }

          if (nodes[i].area === nodes[j].area) force *= 0.6

          const fx = (dx / dist) * force * temp
          const fy = (dy / dist) * force * temp
          vx[i] += fx; vy[i] += fy
          vx[j] -= fx; vy[j] -= fy
        }
      }
    }

    // Edge attraction (pre-indexed O(E))
    for (const [si, ti] of edgePairs) {
      const dx = px[ti] - px[si]
      const dy = py[ti] - py[si]
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.1
      const displacement = dist - nodeSpacing
      const force = displacement * attraction * temp
      const fx = (dx / dist) * force
      const fy = (dy / dist) * force
      vx[si] += fx; vy[si] += fy
      vx[ti] -= fx; vy[ti] -= fy
    }

    // Area gravity
    for (const [, group] of areaGroups) {
      let gx = 0, gy = 0
      for (const idx of group) { gx += px[idx]; gy += py[idx] }
      gx /= group.length; gy /= group.length
      for (const idx of group) {
        vx[idx] += (gx - px[idx]) * 0.0005 * temp
        vy[idx] += (gy - py[idx]) * 0.0005 * temp
      }
    }

    // Center gravity
    for (let i = 0; i < n; i++) {
      vx[i] += (centerX - px[i]) * 0.0003 * temp
      vy[i] += (centerY - py[i]) * 0.0003 * temp
    }

    // Apply velocities
    const maxSpeed = 50 * temp + 5
    const margin = 60
    for (let i = 0; i < n; i++) {
      vx[i] *= damping
      vy[i] *= damping

      const speed = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i])
      if (speed > maxSpeed) {
        const scale = maxSpeed / speed
        vx[i] *= scale
        vy[i] *= scale
      }

      px[i] += vx[i]
      py[i] += vy[i]
      px[i] = Math.max(margin, Math.min(width - margin, px[i]))
      py[i] = Math.max(margin, Math.min(height - margin, py[i]))
    }
  }

  // Post-process overlap resolution
  resolveOverlaps(px, py, n, minDist, 8)

  // Write back to nodes
  for (let i = 0; i < n; i++) {
    nodes[i].x = px[i]
    nodes[i].y = py[i]
  }
}

function resolveOverlaps(px: Float64Array, py: Float64Array, n: number, minDist: number, passes: number) {
  for (let p = 0; p < passes; p++) {
    let moved = false
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = px[j] - px[i]
        const dy = py[j] - py[i]
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < minDist && dist > 0) {
          const overlap = (minDist - dist) / 2
          const nx = dx / dist
          const ny = dy / dist
          px[i] -= nx * overlap
          py[i] -= ny * overlap
          px[j] += nx * overlap
          py[j] += ny * overlap
          moved = true
        } else if (dist === 0) {
          px[j] += (Math.random() - 0.5) * minDist
          py[j] += (Math.random() - 0.5) * minDist
          moved = true
        }
      }
    }
    if (!moved) break
  }
}

// ───────────── Hierarchical Layout ─────────────
function hierarchicalLayout(nodes: GraphNode[], _edges: GraphEdge[], width: number, height: number) {
  if (nodes.length === 0) return

  const areaGroups = new Map<string, GraphNode[]>()
  for (const node of nodes) {
    if (!areaGroups.has(node.area)) areaGroups.set(node.area, [])
    areaGroups.get(node.area)!.push(node)
  }

  const areas = Array.from(areaGroups.keys()).sort((a, b) => {
    if (a === "0") return -1
    if (b === "0") return 1
    return a.localeCompare(b)
  })

  const cellW = 150
  const cellH = 130
  const areaPadding = 60
  const areaGap = 80
  let currentY = areaPadding

  for (const area of areas) {
    const group = areaGroups.get(area)!
    const cols = Math.max(2, Math.min(Math.floor((width - areaPadding * 2) / cellW), Math.ceil(Math.sqrt(group.length * 1.5))))
    const rows = Math.ceil(group.length / cols)
    const gridW = cols * cellW
    const startX = (width - gridW) / 2 + cellW / 2

    for (let idx = 0; idx < group.length; idx++) {
      const col = idx % cols
      const row = Math.floor(idx / cols)
      group[idx].x = startX + col * cellW
      group[idx].y = currentY + row * cellH
    }

    currentY += rows * cellH + areaGap
  }

  const totalH = currentY - areaGap + areaPadding
  if (totalH < height) {
    const offsetY = (height - totalH) / 2
    for (const node of nodes) node.y += offsetY
  }
}

// ───────────── Radial Layout ─────────────
function radialLayout(nodes: GraphNode[], _edges: GraphEdge[], width: number, height: number) {
  if (nodes.length === 0) return

  const centerX = width / 2
  const centerY = height / 2

  const areaGroups = new Map<string, GraphNode[]>()
  for (const node of nodes) {
    if (!areaGroups.has(node.area)) areaGroups.set(node.area, [])
    areaGroups.get(node.area)!.push(node)
  }

  const areas = Array.from(areaGroups.keys()).sort()
  const nonBackbone = areas.filter((a) => a !== "0")
  const backbone = areaGroups.get("0") || []

  const innerRadius = Math.max(100, Math.min(width, height) * 0.12 + backbone.length * 15)
  for (let ni = 0; ni < backbone.length; ni++) {
    const a = (2 * Math.PI * ni) / Math.max(backbone.length, 1)
    backbone[ni].x = centerX + innerRadius * Math.cos(a)
    backbone[ni].y = centerY + innerRadius * Math.sin(a)
  }

  if (nonBackbone.length > 0) {
    const sectorAngle = (2 * Math.PI) / nonBackbone.length

    for (let ai = 0; ai < nonBackbone.length; ai++) {
      const group = areaGroups.get(nonBackbone[ai])!
      const baseAngle = sectorAngle * ai - Math.PI / 2
      const nodesPerRing = Math.max(6, Math.ceil(Math.sqrt(group.length) * 3))

      for (let ni = 0; ni < group.length; ni++) {
        const ringIdx = Math.floor(ni / nodesPerRing)
        const posInRing = ni % nodesPerRing
        const ringTotal = Math.min(nodesPerRing, group.length - ringIdx * nodesPerRing)
        const outerRadius = innerRadius + 120 + ringIdx * 100
        const spreadAngle = sectorAngle * 0.75
        const startAngle = baseAngle - spreadAngle / 2
        const a = startAngle + (spreadAngle * (posInRing + 0.5)) / ringTotal
        group[ni].x = centerX + outerRadius * Math.cos(a)
        group[ni].y = centerY + outerRadius * Math.sin(a)
      }
    }
  }
}
