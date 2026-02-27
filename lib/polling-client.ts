"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { OSPFTopology, PollingState, TopologyChange } from "./ospf-types"
import { parseOSPFData } from "./ospf-parser"
import { diffTopologies } from "./topology-diff"

interface UsePollingOptions {
  onTopologyUpdate: (newTopo: OSPFTopology, changes: TopologyChange[]) => void
  currentTopology: OSPFTopology | null
}

export function usePolling({ onTopologyUpdate, currentTopology }: UsePollingOptions) {
  const [pollingState, setPollingState] = useState<PollingState>({
    enabled: false,
    interval: 10000,
    lastUpdated: null,
    status: "idle",
  })

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const currentTopoRef = useRef<OSPFTopology | null>(currentTopology)
  const lastRawRef = useRef<string>("")

  // Keep ref in sync
  useEffect(() => {
    currentTopoRef.current = currentTopology
  }, [currentTopology])

  const poll = useCallback(async () => {
    try {
      setPollingState((prev) => ({ ...prev, status: "polling" }))

      const res = await fetch("/api/ospf-poll")
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const data = await res.json()

      if (!data.snapshot) {
        setPollingState((prev) => ({
          ...prev,
          status: "connected",
          lastUpdated: Date.now(),
        }))
        return
      }

      const { raw, timestamp } = data.snapshot

      // Skip if same data
      if (raw === lastRawRef.current) {
        setPollingState((prev) => ({
          ...prev,
          status: "connected",
          lastUpdated: timestamp,
        }))
        return
      }

      lastRawRef.current = raw

      const newTopo = parseOSPFData(raw)
      const changes = currentTopoRef.current
        ? diffTopologies(currentTopoRef.current, newTopo)
        : []

      setPollingState((prev) => ({
        ...prev,
        status: "connected",
        lastUpdated: timestamp,
      }))

      onTopologyUpdate(newTopo, changes)
    } catch (error) {
      setPollingState((prev) => ({
        ...prev,
        status: "error",
        errorMessage: String(error),
      }))
    }
  }, [onTopologyUpdate])

  const startPolling = useCallback(() => {
    setPollingState((prev) => ({ ...prev, enabled: true, status: "polling" }))
  }, [])

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    setPollingState((prev) => ({
      ...prev,
      enabled: false,
      status: "idle",
    }))
  }, [])

  const setInterval_ = useCallback((ms: number) => {
    setPollingState((prev) => ({ ...prev, interval: ms }))
  }, [])

  // Start/stop polling based on enabled state
  useEffect(() => {
    if (pollingState.enabled) {
      // Initial poll
      poll()
      intervalRef.current = setInterval(poll, pollingState.interval)
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [pollingState.enabled, pollingState.interval, poll])

  return {
    pollingState,
    startPolling,
    stopPolling,
    setInterval: setInterval_,
    pollNow: poll,
  }
}
