"use client"

import { useEffect, useRef, useCallback, useState } from "react"
import { toast } from "sonner"

const REFRESH_INTERVAL = 5 * 60 * 1000 // 5 minutes in milliseconds

interface AutoRefreshConfig {
  enabled: boolean
  host: string
  port: number
  username: string
  password: string
  enablePassword?: string
}

interface AutoRefreshState {
  isRefreshing: boolean
  lastRefresh: Date | null
  nextRefresh: Date | null
  error: string | null
}

/**
 * Hook to automatically fetch OSPF data from router every 5 minutes
 * and save the `show ip ospf database router` output to Blob storage.
 */
export function useOspfAutoRefresh(
  config: AutoRefreshConfig,
  onDataReceived?: (data: string) => void
) {
  const [state, setState] = useState<AutoRefreshState>({
    isRefreshing: false,
    lastRefresh: null,
    nextRefresh: null,
    error: null,
  })

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const configRef = useRef(config)

  // Keep config ref updated
  useEffect(() => {
    configRef.current = config
  }, [config])

  const fetchAndSave = useCallback(async () => {
    const cfg = configRef.current
    if (!cfg.enabled || !cfg.host || !cfg.username || !cfg.password) {
      return
    }

    setState((s) => ({ ...s, isRefreshing: true, error: null }))

    try {
      // Fetch OSPF data from router via Telnet
      const response = await fetch("/api/ssh-fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: cfg.host,
          port: cfg.port,
          username: cfg.username,
          password: cfg.password,
          enablePassword: cfg.enablePassword,
        }),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to fetch OSPF data")
      }

      // Parse the data to extract showIpOspfDatabaseRouter
      const parsedData = JSON.parse(result.data)
      const routerDbOutput = parsedData.showIpOspfDatabaseRouter || ""

      if (!routerDbOutput) {
        throw new Error("No OSPF database router output received")
      }

      // Save to Blob storage
      const saveResponse = await fetch("/api/ospf-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: routerDbOutput,
          host: cfg.host,
        }),
      })

      const saveResult = await saveResponse.json()

      if (!saveResponse.ok || !saveResult.success) {
        throw new Error(saveResult.error || "Failed to save OSPF data")
      }

      const now = new Date()
      const next = new Date(now.getTime() + REFRESH_INTERVAL)

      setState({
        isRefreshing: false,
        lastRefresh: now,
        nextRefresh: next,
        error: null,
      })

      // Show success notification
      toast.success("OSPF Data Auto-Saved", {
        description: `Data from ${cfg.host} saved at ${now.toLocaleTimeString()}. Next refresh in 5 minutes.`,
        duration: 5000,
      })

      // Callback with full data for topology update
      if (onDataReceived) {
        onDataReceived(result.data)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error"
      
      setState((s) => ({
        ...s,
        isRefreshing: false,
        error: message,
      }))

      toast.error("Auto-Refresh Failed", {
        description: message,
        duration: 8000,
      })
    }
  }, [onDataReceived])

  // Start/stop interval based on enabled state
  useEffect(() => {
    if (config.enabled && config.host && config.username && config.password) {
      // Clear any existing interval
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }

      // Set next refresh time
      const next = new Date(Date.now() + REFRESH_INTERVAL)
      setState((s) => ({ ...s, nextRefresh: next }))

      // Start interval
      intervalRef.current = setInterval(fetchAndSave, REFRESH_INTERVAL)

      toast.info("Auto-Refresh Enabled", {
        description: `OSPF data will be fetched from ${config.host} every 5 minutes.`,
        duration: 4000,
      })

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
      }
    } else {
      // Disabled - clear interval
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      setState((s) => ({ ...s, nextRefresh: null }))
    }
  }, [config.enabled, config.host, config.username, config.password, fetchAndSave])

  // Manual refresh function
  const refreshNow = useCallback(() => {
    fetchAndSave()
    
    // Reset interval timer
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }
    if (configRef.current.enabled) {
      intervalRef.current = setInterval(fetchAndSave, REFRESH_INTERVAL)
      setState((s) => ({
        ...s,
        nextRefresh: new Date(Date.now() + REFRESH_INTERVAL),
      }))
    }
  }, [fetchAndSave])

  return {
    ...state,
    refreshNow,
  }
}
