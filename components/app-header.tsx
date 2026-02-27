"use client"

import { Network } from "lucide-react"
import type { PollingState } from "@/lib/ospf-types"
import { LiveIndicator } from "@/components/live-indicator"

interface AppHeaderProps {
  pollingState: PollingState
}

export function AppHeader({ pollingState }: AppHeaderProps) {
  return (
    <header className="flex h-12 items-center justify-between border-b border-border bg-card/80 backdrop-blur-sm px-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
            <Network className="h-4 w-4 text-primary" />
          </div>
          <h1 className="text-sm font-semibold text-foreground tracking-tight">
            OSPF Topology Visualizer
          </h1>
        </div>
        <div className="h-4 w-px bg-border" />
        <LiveIndicator pollingState={pollingState} />
      </div>
    </header>
  )
}
