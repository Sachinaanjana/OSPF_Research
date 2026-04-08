"use client"

import { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import type { MultiCommandInput } from "@/lib/ospf-parser"
import {
  Play,
  Loader2,
  FileText,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
} from "lucide-react"
import { toast } from "sonner"

// ── Types ──────────────────────────────────────────────────

interface InputPanelProps {
  value: MultiCommandInput
  onChange: (value: MultiCommandInput) => void
  onParse: () => void
  onClear: () => void
  isParsing: boolean
  parseError: string | null
}

// ── Main component ─────────────────────────────────────────

export function InputPanel({
  value,
  onChange,
  onParse,
  onClear,
  isParsing,
  parseError,
}: InputPanelProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [lastLoaded, setLastLoaded] = useState<Date | null>(null)
  const [fileInfo, setFileInfo] = useState<{
    lastModified?: string
    fileSize?: number
  } | null>(null)

  // Load file from server and auto-parse to draw topology
  const handleGetFileAndVisualize = useCallback(async () => {
    setIsLoading(true)
    try {
      console.log("[v0] Fetching OSPF file from server...")
      const res = await fetch("/api/ospf-file")
      const json = await res.json()
      
      console.log("[v0] API response:", { ok: res.ok, hasData: !!json.data, error: json.error })
      
      if (!res.ok || json.error) {
        toast.error(json.error || "Failed to load file from server")
        return
      }
      
      if (!json.data || !json.data.trim()) {
        toast.error("File is empty or contains no data")
        return
      }

      // Store file info
      setFileInfo({
        lastModified: json.lastModified,
        fileSize: json.fileSize,
      })
      setLastLoaded(new Date())
      
      // Put the file content into showIpOspfDatabaseRouter field
      const newValue: MultiCommandInput = { 
        showIpOspfDatabaseRouter: json.data,
        raw: json.data,
      }
      
      console.log("[v0] Setting input value, data length:", json.data.length)
      onChange(newValue)
      
      toast.success("File loaded successfully, generating topology...")
      
      // Auto-parse after a short delay to ensure state is updated
      setTimeout(() => {
        console.log("[v0] Triggering parse...")
        onParse()
      }, 150)
      
    } catch (err) {
      console.error("[v0] Error loading file:", err)
      toast.error(err instanceof Error ? err.message : "Failed to load file")
    } finally {
      setIsLoading(false)
    }
  }, [onChange, onParse])

  const hasData = !!value.showIpOspfDatabaseRouter?.trim() || !!value.raw?.trim()

  return (
    <div className="flex flex-col h-full p-4">
      {/* Main Card */}
      <div className="flex flex-col gap-4 p-4 rounded-xl bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-primary/15">
            <FileText className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">
              OSPF Topology Viewer
            </h2>
            <p className="text-xs text-muted-foreground">
              Load OSPF data and visualize network topology
            </p>
          </div>
        </div>

        {/* File Path */}
        <div className="px-3 py-2 rounded-lg bg-secondary/50 border border-border">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
            Server File Path
          </p>
          <p className="text-xs font-mono text-foreground">
            /root/ospf_upload_file_dir/ospf_data.txt
          </p>
        </div>

        {/* Main Button */}
        <Button
          onClick={handleGetFileAndVisualize}
          disabled={isLoading || isParsing}
          size="lg"
          className="w-full gap-2 h-12 text-sm font-semibold"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading File...
            </>
          ) : isParsing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating Topology...
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              Get File &amp; Visualize
            </>
          )}
        </Button>

        {/* Status */}
        {hasData && lastLoaded && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-emerald-600">
                Data loaded successfully
              </p>
              <p className="text-[10px] text-muted-foreground">
                Last loaded: {lastLoaded.toLocaleTimeString()}
                {fileInfo?.fileSize && ` • ${(fileInfo.fileSize / 1024).toFixed(1)} KB`}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleGetFileAndVisualize}
              disabled={isLoading || isParsing}
              className="h-7 px-2 text-xs"
            >
              <RefreshCw className="w-3 h-3" />
            </Button>
          </div>
        )}

        {/* Error */}
        {parseError && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20">
            <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-xs text-destructive">{parseError}</p>
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="mt-4 px-3 py-2 rounded-lg bg-secondary/30 border border-border">
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          <strong className="text-foreground">How it works:</strong> Click the button above to read the OSPF database router output from the server file and automatically generate an interactive network topology diagram.
        </p>
      </div>
    </div>
  )
}
