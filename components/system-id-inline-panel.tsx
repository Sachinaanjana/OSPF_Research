"use client"

import { useState, useMemo, useEffect, useRef, useCallback } from "react"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { X, Trash2, Download, Upload, CheckCircle2, Loader2 } from "lucide-react"
import type { GraphNode } from "@/lib/ospf-types"

interface SystemIdInlinePanelProps {
  nodes: GraphNode[]
  systemIds: Record<string, string>
  onSystemIdsChange: (ids: Record<string, string>) => void
}

export function SystemIdInlinePanel({ nodes, systemIds, onSystemIdsChange }: SystemIdInlinePanelProps) {
  const [search, setSearch] = useState("")
  const [bulkMode, setBulkMode] = useState(false)
  const [bulkText, setBulkText] = useState("")
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [localIds, setLocalIds] = useState<Record<string, string>>({})
  const [loaded, setLoaded] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load all system IDs from DB on mount
  useEffect(() => {
    fetch("/api/system-ids")
      .then((r) => r.json())
      .then((data: Record<string, string>) => {
        setLocalIds(data)
        onSystemIdsChange(data)
        setLoaded(true)
      })
      .catch(() => {
        // Fallback to parent state if DB fails
        setLocalIds({ ...systemIds })
        setLoaded(true)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // When parent resets (e.g. load snapshot), sync down
  useEffect(() => {
    if (!loaded) return
    setLocalIds((prev) => ({ ...prev, ...systemIds }))
  }, [systemIds, loaded])

  const persistToDb = useCallback(async (ids: Record<string, string>) => {
    setSaveState("saving")
    try {
      await fetch("/api/system-ids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: ids }),
      })
      setSaveState("saved")
      setTimeout(() => setSaveState("idle"), 2000)
    } catch {
      setSaveState("error")
      setTimeout(() => setSaveState("idle"), 3000)
    }
  }, [])

  const deleteFromDb = useCallback(async (routerId: string) => {
    await fetch("/api/system-ids", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ routerId }),
    })
  }, [])

  const clearAllFromDb = useCallback(async () => {
    await fetch("/api/system-ids", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
  }, [])

  const routerNodes = useMemo(() => nodes.filter((n) => n.type === "router"), [nodes])

  const manualOnly = useMemo(() => {
    const topologyIds = new Set(routerNodes.map((n) => n.id))
    return Object.entries(localIds)
      .filter(([k]) => !topologyIds.has(k) && localIds[k]?.trim())
      .map(([k]) => k)
  }, [routerNodes, localIds])

  const filtered = useMemo(() => {
    if (!search.trim()) return routerNodes
    const q = search.toLowerCase()
    return routerNodes.filter(
      (n) =>
        n.id.toLowerCase().includes(q) ||
        (localIds[n.id] ?? "").toLowerCase().includes(q)
    )
  }, [routerNodes, search, localIds])

  const handleChange = useCallback((routerId: string, value: string) => {
    const next = { ...localIds }
    if (!value.trim()) {
      delete next[routerId]
      deleteFromDb(routerId)
    } else {
      next[routerId] = value
    }
    setLocalIds(next)
    onSystemIdsChange(next)

    // Debounce save to DB — 600ms after last keystroke
    if (value.trim()) {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        persistToDb({ [routerId]: value.trim() })
      }, 600)
    }
  }, [localIds, onSystemIdsChange, persistToDb, deleteFromDb])

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
    onSystemIdsChange(updated)
    persistToDb(updated)
    setBulkText("")
    setBulkMode(false)
  }

  const handleExport = () => {
    const text = Object.entries(localIds)
      .filter(([, v]) => v.trim())
      .map(([k, v]) => `${k}=${v}`)
      .join("\n")
    navigator.clipboard.writeText(text)
    setSaveState("saved")
    setTimeout(() => setSaveState("idle"), 2000)
  }

  const handleClearAll = async () => {
    setLocalIds({})
    onSystemIdsChange({})
    await clearAllFromDb()
  }

  const namedCount = Object.values(localIds).filter(Boolean).length

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-xs font-semibold text-foreground">System ID Mapping</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {!loaded ? "Loading from database..." :
                routerNodes.length > 0
                  ? `${namedCount} of ${routerNodes.length} routers named`
                  : `${namedCount} pre-mapped entries`}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {saveState === "saving" && <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin" />}
            {saveState === "saved" && <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />}
            {saveState === "error" && <span className="text-[10px] text-destructive">Save failed</span>}
            <button
              onClick={() => setBulkMode(!bulkMode)}
              title="Bulk input (routerId=Name)"
              className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleExport}
              title="Copy all to clipboard"
              className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
            {namedCount > 0 && (
              <button
                onClick={handleClearAll}
                title="Clear all"
                className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-destructive transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Bulk input textarea */}
        {bulkMode && (
          <div className="mt-2">
            <p className="text-[10px] text-muted-foreground mb-1.5">
              One per line:{" "}
              <span className="font-mono text-foreground">routerId=SystemName</span>
            </p>
            <textarea
              className="w-full h-32 bg-background border border-border rounded-md text-xs font-mono p-2 text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder={"198.18.253.226=Core-Router-A\n203.143.61.35=Edge-Router-B"}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
            />
            <div className="flex gap-2 mt-1.5">
              <button
                onClick={handleBulkApply}
                className="flex-1 h-7 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
              >
                Apply & Save
              </button>
              <button
                onClick={() => { setBulkMode(false); setBulkText("") }}
                className="h-7 px-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Search */}
        {!bulkMode && (
          <Input
            className="h-7 text-xs mt-2"
            placeholder={routerNodes.length > 0 ? "Search router ID or name..." : "Search pre-mapped IDs..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-0 px-3 py-2">
          {/* Pre-mapped entries with no topology match */}
          {manualOnly.length > 0 && (
            <>
              <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground px-1 pt-2 pb-1">
                Pre-mapped
              </p>
              {manualOnly.map((rid) => (
                <RouterRow
                  key={rid}
                  routerId={rid}
                  value={localIds[rid] ?? ""}
                  onChange={handleChange}
                  highlight
                />
              ))}
              {routerNodes.length > 0 && <div className="h-px bg-border my-2" />}
            </>
          )}

          {/* No topology — free-form row */}
          {routerNodes.length === 0 && loaded && (
            <div className="px-1 pt-2">
              <p className="text-[10px] text-muted-foreground mb-3 leading-relaxed">
                No topology loaded. Enter router IDs below — they will be applied automatically when you parse OSPF data.
              </p>
              <FreeFormRow onAdd={handleChange} />
            </div>
          )}

          {/* Topology rows */}
          {filtered.length === 0 && routerNodes.length > 0 && (
            <p className="text-xs text-muted-foreground text-center py-6">No routers match</p>
          )}
          {filtered.map((node) => (
            <RouterRow
              key={node.id}
              routerId={node.id}
              value={localIds[node.id] ?? ""}
              onChange={handleChange}
            />
          ))}
        </div>
      </ScrollArea>

      {routerNodes.length === 0 && loaded && (
        <div className="px-4 py-2 border-t border-border shrink-0 text-center">
          <p className="text-[9px] text-muted-foreground">Saved to database automatically</p>
        </div>
      )}
    </div>
  )
}

function RouterRow({
  routerId,
  value,
  onChange,
  highlight = false,
}: {
  routerId: string
  value: string
  onChange: (id: string, val: string) => void
  highlight?: boolean
}) {
  return (
    <div className="flex items-center gap-2 py-1 group">
      <span
        className={`font-mono text-[11px] w-36 shrink-0 truncate ${highlight ? "text-amber-400" : "text-muted-foreground"}`}
        title={routerId}
      >
        {routerId}
      </span>
      <Input
        className="h-7 text-[11px] flex-1"
        placeholder="System name..."
        value={value}
        onChange={(e) => onChange(routerId, e.target.value)}
      />
      {value && (
        <button
          onClick={() => onChange(routerId, "")}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}

function FreeFormRow({ onAdd }: { onAdd: (id: string, val: string) => void }) {
  const [routerId, setRouterId] = useState("")
  const [name, setName] = useState("")

  const commit = () => {
    if (routerId.trim() && name.trim()) {
      onAdd(routerId.trim(), name.trim())
      setRouterId("")
      setName("")
    }
  }

  return (
    <div className="flex items-center gap-2 py-1">
      <Input
        className="h-7 text-[11px] font-mono w-36 shrink-0"
        placeholder="Router ID"
        value={routerId}
        onChange={(e) => setRouterId(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && commit()}
      />
      <Input
        className="h-7 text-[11px] flex-1"
        placeholder="System name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && commit()}
        onBlur={commit}
      />
    </div>
  )
}
