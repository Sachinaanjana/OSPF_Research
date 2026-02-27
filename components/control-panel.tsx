"use client"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Download, RotateCcw, Radio, Activity } from "lucide-react"
import type { LayoutAlgorithm, LinkType, PollingState, TopologyChange } from "@/lib/ospf-types"
import { getAreaColor } from "@/lib/layout-engine"
import { EventLog } from "@/components/event-log"

interface ControlPanelProps {
  layout: LayoutAlgorithm
  showLabels: boolean
  showMetrics: boolean
  colorBy: "area" | "lsa-type" | "role"
  areas: string[]
  filterArea: string | null
  filterLinkType: LinkType | null
  onLayoutChange: (layout: LayoutAlgorithm) => void
  onShowLabelsChange: (show: boolean) => void
  onShowMetricsChange: (show: boolean) => void
  onColorByChange: (colorBy: "area" | "lsa-type" | "role") => void
  onFilterAreaChange: (area: string | null) => void
  onFilterLinkTypeChange: (type: LinkType | null) => void
  onExportPNG: () => void
  onResetView: () => void
  nodeCount: number
  edgeCount: number
  pollingState: PollingState
  onStartPolling: () => void
  onStopPolling: () => void
  onSetPollingInterval: (ms: number) => void
  events: TopologyChange[]
}

export function ControlPanel({
  layout,
  showLabels,
  showMetrics,
  colorBy,
  areas,
  filterArea,
  filterLinkType,
  onLayoutChange,
  onShowLabelsChange,
  onShowMetricsChange,
  onColorByChange,
  onFilterAreaChange,
  onFilterLinkTypeChange,
  onExportPNG,
  onResetView,
  nodeCount,
  edgeCount,
  pollingState,
  onStartPolling,
  onStopPolling,
  onSetPollingInterval,
  events,
}: ControlPanelProps) {
  return (
    <div className="flex flex-col gap-5 p-4">
      {/* Live Monitor Section */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-primary mb-3 flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5" />
          Live Monitor
        </h3>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="polling" className="text-xs text-secondary-foreground flex items-center gap-1.5">
              <Radio className="w-3 h-3" />
              Enable Polling
            </Label>
            <Switch
              id="polling"
              checked={pollingState.enabled}
              onCheckedChange={(checked) => {
                if (checked) onStartPolling()
                else onStopPolling()
              }}
            />
          </div>
          {pollingState.enabled && (
            <div>
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">
                Interval
              </Label>
              <Select
                value={String(pollingState.interval)}
                onValueChange={(v) => onSetPollingInterval(Number(v))}
              >
                <SelectTrigger className="h-7 text-xs bg-secondary/50 border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5000">5 seconds</SelectItem>
                  <SelectItem value="10000">10 seconds</SelectItem>
                  <SelectItem value="30000">30 seconds</SelectItem>
                  <SelectItem value="60000">60 seconds</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {pollingState.status === "error" && pollingState.errorMessage && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 px-2 py-1.5">
              <p className="text-[10px] text-destructive">{pollingState.errorMessage}</p>
            </div>
          )}
        </div>
      </div>

      {/* Event Log */}
      {events.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Event Log ({events.length})
          </h3>
          <EventLog events={events} />
        </div>
      )}

      <div className="h-px bg-border" />

      {/* Stats */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Topology Stats
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-secondary/50 rounded-md p-2.5 text-center">
            <div className="text-lg font-semibold text-foreground font-mono">{nodeCount}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Nodes</div>
          </div>
          <div className="bg-secondary/50 rounded-md p-2.5 text-center">
            <div className="text-lg font-semibold text-foreground font-mono">{edgeCount}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Links</div>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Layout
        </h3>
        <Select value={layout} onValueChange={(v) => onLayoutChange(v as LayoutAlgorithm)}>
          <SelectTrigger className="h-8 text-xs bg-secondary/50 border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="force-directed">Force-Directed</SelectItem>
            <SelectItem value="hierarchical">Hierarchical</SelectItem>
            <SelectItem value="radial">Radial</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Color By
        </h3>
        <Select value={colorBy} onValueChange={(v) => onColorByChange(v as "area" | "lsa-type" | "role")}>
          <SelectTrigger className="h-8 text-xs bg-secondary/50 border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="area">Area</SelectItem>
            <SelectItem value="role">Router Role</SelectItem>
            <SelectItem value="lsa-type">LSA Type</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Display
        </h3>
        <div className="flex items-center justify-between">
          <Label htmlFor="labels" className="text-xs text-secondary-foreground">Labels</Label>
          <Switch id="labels" checked={showLabels} onCheckedChange={onShowLabelsChange} />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="metrics" className="text-xs text-secondary-foreground">Cost Metrics</Label>
          <Switch id="metrics" checked={showMetrics} onCheckedChange={onShowMetricsChange} />
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Filter Area
        </h3>
        <Select value={filterArea || "all"} onValueChange={(v) => onFilterAreaChange(v === "all" ? null : v)}>
          <SelectTrigger className="h-8 text-xs bg-secondary/50 border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Areas</SelectItem>
            {areas.map((area) => (
              <SelectItem key={area} value={area}>Area {area}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Filter Link Type
        </h3>
        <Select
          value={filterLinkType || "all"}
          onValueChange={(v) => onFilterLinkTypeChange(v === "all" ? null : (v as LinkType))}
        >
          <SelectTrigger className="h-8 text-xs bg-secondary/50 border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="point-to-point">Point-to-Point</SelectItem>
            <SelectItem value="transit">Transit</SelectItem>
            <SelectItem value="stub">Stub</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Legend
        </h3>
        <div className="flex flex-col gap-1.5">
          {areas.map((area) => (
            <div key={area} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: getAreaColor(area) }} />
              <span className="text-xs text-secondary-foreground">Area {area}</span>
            </div>
          ))}
          <div className="h-px bg-border my-1" />
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-secondary-foreground">New / Online</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-400" />
            <span className="text-xs text-secondary-foreground">Removed / Offline</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-amber-400" />
            <span className="text-xs text-secondary-foreground">Changed / Updated</span>
          </div>
          <div className="h-px bg-border my-1" />
          <div className="flex items-center gap-2">
            <div className="w-5 h-3 rounded-sm border border-muted-foreground flex items-center justify-center">
              <span className="text-[7px] text-muted-foreground">R</span>
            </div>
            <span className="text-xs text-secondary-foreground">Router</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full border border-dashed border-muted-foreground" />
            <span className="text-xs text-secondary-foreground">Network</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 mt-auto">
        <Button variant="outline" size="sm" className="w-full text-xs justify-start gap-2" onClick={onExportPNG}>
          <Download className="w-3.5 h-3.5" />
          Export as PNG
        </Button>
        <Button variant="outline" size="sm" className="w-full text-xs justify-start gap-2" onClick={onResetView}>
          <RotateCcw className="w-3.5 h-3.5" />
          Reset View
        </Button>
      </div>
    </div>
  )
}
