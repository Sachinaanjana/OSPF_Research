"use client"

import { useRef, useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { MultiCommandInput } from "@/lib/ospf-parser"
import {
  Play,
  Trash2,
  Loader2,
  ChevronDown,
  ChevronRight,
  FileText,
  RefreshCw,
  Download,
} from "lucide-react"
import { toast } from "sonner"

// ── Types ──────────────────────────────────────────────────

interface InputPanelProps {
  value: MultiCommandInput
  onChange: (value: MultiCommandInput) => void
  onParse: () => void
  onClear: () => void
  onSSHData?: (data: string, host: string) => void
  isParsing: boolean
  parseError: string | null
}

// ── Command field definitions ──────────────────────────────

const COMMAND_FIELDS: Array<{
  key: keyof MultiCommandInput
  label: string
  command: string
  placeholder: string
  rows?: number
}> = [
  {
    key: "showIpOspf",
    label: "show ip ospf",
    command: "show ip ospf",
    placeholder: "Paste output of: show ip ospf\n\nShows process ID, Router ID, number of areas, SPF statistics...",
    rows: 4,
  },
  {
    key: "showIpOspfNeighbor",
    label: "show ip ospf neighbor",
    command: "show ip ospf neighbor",
    placeholder: "Paste output of: show ip ospf neighbor\n\nNeighbor ID   Pri   State   Dead Time   Address   Interface",
    rows: 5,
  },
  {
    key: "showIpOspfDatabaseRouter",
    label: "show ip ospf database router",
    command: "show ip ospf database router",
    placeholder: "Paste output of: show ip ospf database router\n\nRouter LSAs (Type 1) — required for topology.",
    rows: 8,
  },
  {
    key: "showIpOspfDatabaseNetwork",
    label: "show ip ospf database network",
    command: "show ip ospf database network",
    placeholder: "Paste output of: show ip ospf database network\n\nNetwork LSAs (Type 2) — transit networks.",
    rows: 6,
  },
  {
    key: "showIpOspfInterface",
    label: "show ip ospf interface",
    command: "show ip ospf interface",
    placeholder: "Paste output of: show ip ospf interface\n\nInterface state, cost, DR/BDR, hello/dead timers...",
    rows: 5,
  },
  {
    key: "showIpRouteOspf",
    label: "show ip route ospf",
    command: "show ip route ospf",
    placeholder: "Paste output of: show ip route ospf\n\nO  10.0.0.0/24 [110/20] via 192.168.1.1, Gi0/0",
    rows: 5,
  },
]

// ── Section component ──────────────────────────────────────

function CommandSection({
  field,
  value,
  onChange,
  onGetFile,
  isLoading,
}: {
  field: (typeof COMMAND_FIELDS)[number]
  value: string
  onChange: (val: string) => void
  onGetFile: (key: keyof MultiCommandInput) => void
  isLoading: boolean
}) {
  const [open, setOpen] = useState(field.key === "showIpOspfDatabaseRouter")
  const filled = value.trim().length > 0

  return (
    <div className="border border-border rounded-md overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 bg-secondary/30 hover:bg-secondary/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span
            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${filled ? "bg-primary" : "bg-muted-foreground/30"}`}
          />
          <code className="text-xs font-mono font-semibold text-foreground">
            {field.command}
          </code>
          {filled && (
            <span className="text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded font-medium">
              filled
            </span>
          )}
        </div>
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        )}
      </button>

      {open && (
        <div className="p-2.5 flex flex-col gap-2 bg-card">
          <div className="flex items-center justify-end gap-1">
            <button
              type="button"
              onClick={() => onGetFile(field.key)}
              disabled={isLoading}
              className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 px-2 py-1 rounded-sm hover:bg-primary/10 transition-colors disabled:opacity-50"
            >
              {isLoading ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Download className="w-3 h-3" />
              )}
              Get from Server
            </button>
            {value && (
              <button
                type="button"
                onClick={() => onChange("")}
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-destructive px-2 py-1 rounded-sm hover:bg-secondary/50 transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                Clear
              </button>
            )}
          </div>
          <Textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            rows={field.rows ?? 5}
            className="resize-y font-mono text-xs bg-secondary/20 border-border placeholder:text-muted-foreground/35 leading-relaxed"
          />
        </div>
      )}
    </div>
  )
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
  const [loadingField, setLoadingField] = useState<keyof MultiCommandInput | null>(null)
  const [isLoadingAll, setIsLoadingAll] = useState(false)

  // Fetch file from server and put into a specific field
  const handleGetFile = useCallback(async (key: keyof MultiCommandInput) => {
    setLoadingField(key)
    try {
      const res = await fetch("/api/ospf-file")
      const data = await res.json()
      
      if (!res.ok || data.error) {
        toast.error(data.error || "Failed to load file")
        return
      }
      
      onChange({ ...value, [key]: data.content })
      toast.success("File loaded successfully")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load file")
    } finally {
      setLoadingField(null)
    }
  }, [value, onChange])

  // Load file and auto-parse
  const handleGetAndParse = useCallback(async () => {
    setIsLoadingAll(true)
    try {
      const res = await fetch("/api/ospf-file")
      const data = await res.json()
      
      if (!res.ok || data.error) {
        toast.error(data.error || "Failed to load file")
        return
      }
      
      // Put the file content into showIpOspfDatabaseRouter field
      const newValue = { 
        ...value, 
        showIpOspfDatabaseRouter: data.content,
        raw: data.content 
      }
      onChange(newValue)
      toast.success("File loaded, generating topology...")
      
      // Auto-parse after state update
      setTimeout(() => {
        onParse()
      }, 100)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load file")
    } finally {
      setIsLoadingAll(false)
    }
  }, [value, onChange, onParse])

  const hasAnyInput = Object.values(value).some(v => v?.trim())

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1">
        <div className="flex flex-col px-4 py-3 gap-3">
          {/* Header with Get & Visualize button */}
          <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                OSPF Data
              </h3>
              <button
                type="button"
                onClick={onClear}
                disabled={!hasAnyInput}
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-destructive disabled:opacity-30 px-2 py-1 rounded-sm hover:bg-secondary/50 transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                Clear all
              </button>
            </div>
            
            <p className="text-xs text-muted-foreground mb-3">
              Click the button below to load OSPF data from the server and automatically generate the network topology.
            </p>
            
            <p className="text-[10px] text-muted-foreground/70 font-mono bg-secondary/30 px-2 py-1 rounded mb-3">
              /root/ospf_upload_file_dir/ospf_data.txt
            </p>
            
            <Button
              onClick={handleGetAndParse}
              disabled={isLoadingAll || isParsing}
              className="w-full gap-2"
              size="sm"
            >
              {isLoadingAll || isParsing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              {isLoadingAll ? "Loading File..." : isParsing ? "Parsing..." : "Get File & Visualize"}
            </Button>
          </div>

          {/* Status: filled fields count */}
          {hasAnyInput && (
            <div className="flex items-center gap-1.5 text-[10px] text-primary bg-primary/10 rounded-md px-2.5 py-1.5 border border-primary/20">
              <span className="font-semibold">
                {Object.values(value).filter(v => v?.trim()).length} of {COMMAND_FIELDS.length}
              </span>
              <span className="text-muted-foreground">command outputs provided</span>
            </div>
          )}

          {/* Six command fields */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Command Outputs
            </h3>
            {COMMAND_FIELDS.map((field) => (
              <CommandSection
                key={field.key}
                field={field}
                value={value[field.key] ?? ""}
                onChange={(v) => onChange({ ...value, [field.key]: v })}
                onGetFile={handleGetFile}
                isLoading={loadingField === field.key}
              />
            ))}
          </div>

          {parseError && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2">
              <p className="text-xs text-destructive">{parseError}</p>
            </div>
          )}

          <Button
            onClick={onParse}
            disabled={!hasAnyInput || isParsing}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
            size="sm"
          >
            <Play className="w-3.5 h-3.5" />
            {isParsing ? "Parsing..." : "Parse & Visualize"}
          </Button>
        </div>
      </ScrollArea>
    </div>
  )
}
