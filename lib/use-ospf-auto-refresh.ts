"use client"

import { useState, useEffect, useRef, useCallback } from "react"
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
  refreshCount: number
}

export function useOspfAutoRefresh(
  config: AutoRefreshConfig,
  onDataReceived?: (data: string) => void
) {
  const [state, setState] = useState<AutoRefreshState>({
    isRefreshing: false,
    lastRefresh: null,
    nextRefresh: null,
    error: null,
    refreshCount: 0,
  })

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const configRef = useRef(config)
  configRef.current = config

  const fetchAndSaveOspfData = useCallback(async () => {
    const cfg = configRef.current
    
    if (!cfg.host || !cfg.username || !cfg.password) {
      setState((s) => ({ ...s, error: "Missing connection credentials" }))
      return
    }

    setState((s) => ({ ...s, isRefreshing: true, error: null }))

    try {
      // Step 1: Fetch OSPF data from router via Telnet
      const telnetResponse = await fetch("/api/ssh-fetch", {
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

      const telnetData = await telnetResponse.json()

      if (!telnetResponse.ok || !telnetData.success) {
        throw new Error(telnetData.error || "Failed to fetch OSPF data from router")
      }

      // Parse the command results
      let commandResults: Record<string, string>
      try {
        commandResults = JSON.parse(telnetData.data)
      } catch {
        commandResults = { raw: telnetData.data }
      }

      // Extract "show ip ospf database router" output
      const databaseRouterOutput = commandResults.showIpOspfDatabaseRouter || commandResults.raw || ""

      if (!databaseRouterOutput.trim()) {
        throw new Error("No OSPF database router data received")
      }

      // Step 2: Save to Blob storage (cloud equivalent of /root/ospf_upload_file_dir/ospf_data.txt)
      const saveResponse = await fetch("/api/ospf-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: databaseRouterOutput,
          host: cfg.host,
        }),
      })

      const saveData = await saveResponse.json()

      if (!saveResponse.ok || !saveData.success) {
        throw new Error(saveData.error || "Failed to save OSPF data")
      }

      const now = new Date()
      const nextRefreshTime = new Date(now.getTime() + REFRESH_INTERVAL)

      setState((s) => ({
        ...s,
        isRefreshing: false,
        lastRefresh: now,
        nextRefresh: nextRefreshTime,
        error: null,
        refreshCount: s.refreshCount + 1,
      }))

      // Show success notification
      toast.success("OSPF Data Uploaded", {
        description: `show ip ospf database router saved to cloud storage at ${now.toLocaleTimeString()}`,
        duration: 5000,
      })

      // Notify parent component with full data
      if (onDataReceived) {
        onDataReceived(telnetData.data)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error"
      
      setState((s) => ({
        ...s,
        isRefreshing: false,
        error: errorMessage,
      }))

      toast.error("OSPF Upload Failed", {
        description: errorMessage,
        duration: 5000,
      })
    }
  }, [onDataReceived])

  // Start/stop interval based on enabled state
  useEffect(() => {
    if (config.enabled) {
      // Fetch immediately on enable
      fetchAndSaveOspfData()

      // Set up interval
      intervalRef.current = setInterval(fetchAndSaveOspfData, REFRESH_INTERVAL)

      // Calculate next refresh time
      setState((s) => ({
        ...s,
        nextRefresh: new Date(Date.now() + REFRESH_INTERVAL),
      }))
    } else {
      // Clear interval when disabled
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      setState((s) => ({
        ...s,
        nextRefresh: null,
      }))
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [config.enabled, fetchAndSaveOspfData])

  // Manual refresh function
  const refreshNow = useCallback(() => {
    fetchAndSaveOspfData()
  }, [fetchAndSaveOspfData])

  return {
    ...state,
    refreshNow,
  }
}
