"use client"

import { useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { X, Plus, Trash2, Download, Upload, Tag } from "lucide-react"
import type { GraphNode } from "@/lib/ospf-types"

interface SystemIdManagerProps {
  nodes: GraphNode[]
  systemIds: Record<string, string>
  onSystemIdsChange: (ids: Record<string, string>) => void
  onClose: () => void
}

export function SystemIdManager({ nodes, systemIds, onSystemIdsChange, onClose }: SystemIdManagerProps) {
  const [bulkText, setBulkText] = useState("")
  const [bulkMode, setBulkMode] = useState(false)
  const [search, setSearch] = useState("")
  const [localIds, setLocalIds] = useState<Record<string, string>>({ ...systemIds })

  const routerNodes = useMemo(
    () => nodes.filter((n) => n.type === "router"),
    [nodes]
  )

  const filtered = useMemo(() => {
    if (!search.trim()) return routerNodes
    const q = search.toLowerCase()
    return routerNodes.filter(
      (n) =>
        n.id.toLowerCase().includes(q) ||
        (localIds[n.id] ?? "").toLowerCase().includes(q)
    )
  }, [routerNodes, search, localIds])

  const handleChange = (routerId: string, value: string) => {
    setLocalIds((prev) => ({ ...prev, [routerId]: value }))
  }

  const handleSave = () => {
    // Remove empty entries
    const cleaned: Record<string, string> = {}
    for (const [k, v] of Object.entries(localIds)) {
      if (v.trim()) cleaned[k] = v.trim()
    }
    onSystemIdsChange(cleaned)
    onClose()
  }

  const handleBulkApply = () => {
    const updated = { ...localIds }
    for (const line of bulkText.split("\n")) {
      const sep = line.indexOf("=")
      if (sep === -1) continue
      const rid = line.slice(0, sep).trim()
      const name = line.slice(sep + 1).trim()
      if (rid && name) updated[rid] = name
    }
    setLocalIds(updated)
    setBulkText("")
    setBulkMode(false)
  }

  const handleExport = () => {
    const text = Object.entries(localIds)
      .filter(([, v]) => v.trim())
      .map(([k, v]) => `${k}=${v}`)
      .join("\n")
    navigator.clipboard.writeText(text)
  }

  const handleClearAll = () => {
    setLocalIds({})
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-[620px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Tag className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">System ID Manager</h2>
              <p className="text-[11px] text-muted-foreground">
                {routerNodes.length} routers &middot; {Object.values(localIds).filter(Boolean).length} named
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={() => setBulkMode(!bulkMode)}
            >
              <Upload className="w-3 h-3" />
              Bulk Input
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={handleExport}
            >
              <Download className="w-3 h-3" />
              Copy
            </Button>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Bulk input area */}
        {bulkMode && (
          <div className="px-5 py-3 border-b border-border bg-secondary/30 shrink-0">
            <p className="text-[11px] text-muted-foreground mb-2">
              One entry per line: <span className="font-mono text-foreground">routerId=SystemName</span>
            </p>
            <textarea
              className="w-full h-28 bg-background border border-border rounded-md text-xs font-mono p-2.5 text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder={"198.18.253.226=Core-Router-A\n203.143.61.35=Edge-Router-B\n..."}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
            />
            <div className="flex gap-2 mt-2">
              <Button size="sm" className="h-7 text-xs" onClick={handleBulkApply}>
                Apply
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => { setBulkMode(false); setBulkText("") }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="px-5 py-2.5 border-b border-border shrink-0">
          <Input
            className="h-8 text-xs"
            placeholder="Search by router ID or system name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Router list */}
        <ScrollArea className="flex-1 px-5 py-2">
          <div className="flex flex-col gap-1.5 pb-2">
            {filtered.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-8">No routers found</p>
            )}
            {filtered.map((node) => (
              <div key={node.id} className="flex items-center gap-3 group">
                <span className="font-mono text-[11px] text-muted-foreground w-36 shrink-0 truncate">
                  {node.id}
                </span>
                <Input
                  className="h-7 text-xs flex-1"
                  placeholder="Enter system name..."
                  value={localIds[node.id] ?? ""}
                  onChange={(e) => handleChange(node.id, e.target.value)}
                />
                {localIds[node.id] && (
                  <button
                    onClick={() => handleChange(node.id, "")}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-destructive hover:text-destructive gap-1.5"
            onClick={handleClearAll}
          >
            <Trash2 className="w-3 h-3" />
            Clear All
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" className="h-7 text-xs" onClick={handleSave}>
              Save
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
