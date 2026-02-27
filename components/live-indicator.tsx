"use client"

import { useEffect, useState } from "react"
import type { PollingState } from "@/lib/ospf-types"

interface LiveIndicatorProps {
  pollingState: PollingState
}

function formatLastUpdated(timestamp: number | null): string {
  if (!timestamp) return "Never"
  const diff = Date.now() - timestamp
  const seconds = Math.floor(diff / 1000)
  if (seconds < 5) return "Just now"
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  return `${Math.floor(minutes / 60)}h ago`
}

export function LiveIndicator({ pollingState }: LiveIndicatorProps) {
  const [, setTick] = useState(0)

  // Re-render every second to keep "last updated" fresh
  useEffect(() => {
    if (!pollingState.enabled) return
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [pollingState.enabled])

  const statusConfig = {
    idle: {
      dot: "bg-muted-foreground",
      pulse: false,
      label: "Offline",
    },
    polling: {
      dot: "bg-amber-400",
      pulse: true,
      label: "Polling...",
    },
    connected: {
      dot: "bg-emerald-400",
      pulse: true,
      label: "Live",
    },
    error: {
      dot: "bg-red-400",
      pulse: false,
      label: "Error",
    },
  }

  const config = statusConfig[pollingState.status]

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5">
        <div className="relative flex h-2.5 w-2.5">
          {config.pulse && (
            <span
              className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${config.dot}`}
            />
          )}
          <span
            className={`relative inline-flex h-2.5 w-2.5 rounded-full ${config.dot}`}
          />
        </div>
        <span className="text-xs font-medium text-muted-foreground">
          {config.label}
        </span>
      </div>
      {pollingState.lastUpdated && (
        <span className="text-[10px] text-muted-foreground opacity-60">
          Updated {formatLastUpdated(pollingState.lastUpdated)}
        </span>
      )}
    </div>
  )
}
