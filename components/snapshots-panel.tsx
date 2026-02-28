"use client"

import { useEffect, useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Database,
  Trash2,
  Download,
  RefreshCw,
  Loader2,
  Clock,
  Router,
  Network,
  Layers,
  AlertCircle,
  Save,
  X,
} from "lucide-react"
import { toast } from "sonner"

interface SnapshotMeta {
  id: number
  name: string | null
  source: string
  host: string | null
  router_count: number
  network_count: number
  area_count: number
  created_at: string
}

interface SnapshotsPanelProps {
  onLoadSnapshot: (topology: unknown, rawText: string | null, meta: SnapshotMeta) => void
  onSaveSnapshot: () => Promise<void>
  isSaving: boolean
}

export function SnapshotsPanel({ onLoadSnapshot, onSaveSnapshot, isSaving }: SnapshotsPanelProps) {
  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [clearingAll, setClearingAll] = useState(false)
  const [loadingId, setLoadingId] = useState<number | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)

  const fetchSnapshots = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/snapshots")
      const data = await res.json()
      if (res.ok) setSnapshots(data.snapshots ?? [])
    } catch {
      toast.error("Failed to load snapshots")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSnapshots()
  }, [fetchSnapshots])

  const handleLoad = useCallback(async (id: number) => {
    setLoadingId(id)
    try {
      const res = await fetch(`/api/snapshots/${id}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onLoadSnapshot(data.snapshot.topology, data.snapshot.raw_text, data.snapshot)
      toast.success("Snapshot loaded")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load snapshot")
    } finally {
      setLoadingId(null)
    }
  }, [onLoadSnapshot])

  const handleDelete = useCallback(async (id: number) => {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/snapshots/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Delete failed")
      setSnapshots((prev) => prev.filter((s) => s.id !== id))
      toast.success("Snapshot deleted")
    } catch {
      toast.error("Failed to delete snapshot")
    } finally {
      setDeletingId(null)
    }
  }, [])

  const handleClearAll = useCallback(async () => {
    if (!confirmClear) {
      setConfirmClear(true)
      setTimeout(() => setConfirmClear(false), 3000)
      return
    }
    setClearingAll(true)
    try {
      const res = await fetch("/api/snapshots", { method: "DELETE" })
      if (!res.ok) throw new Error("Failed to clear")
      setSnapshots([])
      toast.success("All snapshots cleared")
    } catch {
      toast.error("Failed to clear all snapshots")
    } finally {
      setClearingAll(false)
      setConfirmClear(false)
    }
  }, [confirmClear])

  const handleSave = useCallback(async () => {
    await onSaveSnapshot()
    await fetchSnapshots()
  }, [onSaveSnapshot, fetchSnapshots])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Saved Snapshots</span>
          {snapshots.length > 0 && (
            <span className="text-[10px] font-mono bg-secondary px-1.5 py-0.5 rounded text-muted-foreground">
              {snapshots.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            onClick={fetchSnapshots}
            disabled={loading}
            title="Refresh list"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
          {snapshots.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className={`h-7 text-xs gap-1 ${confirmClear ? "text-destructive hover:text-destructive" : "text-muted-foreground hover:text-destructive"}`}
              onClick={handleClearAll}
              disabled={clearingAll}
              title="Clear all snapshots"
            >
              {clearingAll ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : confirmClear ? (
                <X className="w-3 h-3" />
              ) : (
                <Trash2 className="w-3 h-3" />
              )}
              {confirmClear ? "Confirm?" : "Clear All"}
            </Button>
          )}
        </div>
      </div>

      {/* Save button */}
      <div className="px-4 py-2.5 border-b border-border">
        <Button
          onClick={handleSave}
          disabled={isSaving}
          size="sm"
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90 gap-2 h-8"
        >
          {isSaving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
          {isSaving ? "Saving..." : "Save Current Topology"}
        </Button>
      </div>

      {/* Snapshot list */}
      <ScrollArea className="flex-1">
        <div className="px-3 py-2 flex flex-col gap-1.5">
          {loading ? (
            <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs">Loading...</span>
            </div>
          ) : snapshots.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
              <AlertCircle className="w-8 h-8 text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground">No snapshots saved yet.</p>
              <p className="text-[10px] text-muted-foreground/60">
                Parse your OSPF data, then click<br />"Save Current Topology".
              </p>
            </div>
          ) : (
            snapshots.map((snap) => (
              <div
                key={snap.id}
                className="group flex flex-col gap-1.5 rounded-md border border-border bg-secondary/30 px-3 py-2.5 hover:bg-secondary/50 transition-colors"
              >
                {/* Top row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate leading-none">
                      {snap.name ?? snap.host ?? `Snapshot #${snap.id}`}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5 shrink-0" />
                      {new Date(snap.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-primary hover:text-primary/80"
                      onClick={() => handleLoad(snap.id)}
                      disabled={loadingId === snap.id}
                      title="Load snapshot"
                    >
                      {loadingId === snap.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Download className="w-3 h-3" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(snap.id)}
                      disabled={deletingId === snap.id}
                      title="Delete snapshot"
                    >
                      {deletingId === snap.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Trash2 className="w-3 h-3" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Stats row */}
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Router className="w-2.5 h-2.5" />
                    {snap.router_count} routers
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Network className="w-2.5 h-2.5" />
                    {snap.network_count} nets
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Layers className="w-2.5 h-2.5" />
                    Area {snap.area_count > 1 ? `×${snap.area_count}` : snap.area_count}
                  </span>
                </div>

                {/* Source badge */}
                <div className="flex items-center gap-1.5">
                  <span
                    className="text-[9px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wide"
                    style={{
                      backgroundColor: snap.source === "ssh" ? "#38bdf820" : "#2dd4a020",
                      color: snap.source === "ssh" ? "#38bdf8" : "#2dd4a0",
                    }}
                  >
                    {snap.source === "ssh" ? "SSH" : "Manual"}
                  </span>
                  {snap.host && (
                    <span className="text-[10px] text-muted-foreground font-mono">{snap.host}</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
