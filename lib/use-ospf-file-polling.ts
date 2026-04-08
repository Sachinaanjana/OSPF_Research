"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { toast } from "sonner"

const POLLING_INTERVAL = 5 * 60 * 1000 // 5 minutes in milliseconds

interface UseOspfFilePollingOptions {
  enabled: boolean
  onDataReceived?: (data: string) => void
}

interface UseOspfFilePollingReturn {
  isPolling: boolean
  lastPoll: Date | null
  nextPoll: Date | null
  pollCount: number
  lastModified: string | null
  error: string | null
  pollNow: () => void
}

export function useOspfFilePolling(
  options: UseOspfFilePollingOptions
): UseOspfFilePollingReturn {
  const { enabled, onDataReceived } = options
  
  const [isPolling, setIsPolling] = useState(false)
  const [lastPoll, setLastPoll] = useState<Date | null>(null)
  const [nextPoll, setNextPoll] = useState<Date | null>(null)
  const [pollCount, setPollCount] = useState(0)
  const [lastModified, setLastModified] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const previousContentRef = useRef<string | null>(null)

  const fetchFile = useCallback(async () => {
    setIsPolling(true)
    setError(null)

    try {
      const response = await fetch("/api/ospf-file", {
        method: "GET",
        cache: "no-store",
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || "Failed to fetch OSPF file")
      }

      const { data, lastModified: fileMtime } = result as {
        data: string
        lastModified: string
      }

      setLastModified(fileMtime)
      setLastPoll(new Date())
      setNextPoll(new Date(Date.now() + POLLING_INTERVAL))
      setPollCount((c) => c + 1)

      // Check if content has changed
      const contentChanged = previousContentRef.current !== data
      previousContentRef.current = data

      // Call the callback with new data
      if (onDataReceived) {
        onDataReceived(data)
      }

      // Show notification
      if (contentChanged && pollCount > 0) {
        toast.success("OSPF File Updated", {
          description: `File has been refreshed with new data. Last modified: ${new Date(fileMtime).toLocaleString()}`,
          duration: 5000,
        })
      } else {
        toast.info("OSPF File Polled", {
          description: `File read successfully at ${new Date().toLocaleTimeString()}. Size: ${(data.length / 1024).toFixed(1)} KB`,
          duration: 3000,
        })
      }

    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error"
      setError(message)
      toast.error("OSPF File Poll Failed", {
        description: message,
        duration: 5000,
      })
    } finally {
      setIsPolling(false)
    }
  }, [onDataReceived, pollCount])

  // Start/stop polling based on enabled state
  useEffect(() => {
    if (enabled) {
      // Initial fetch
      fetchFile()

      // Set up interval
      intervalRef.current = setInterval(() => {
        fetchFile()
      }, POLLING_INTERVAL)

      // Update next poll time immediately
      setNextPoll(new Date(Date.now() + POLLING_INTERVAL))

      toast.success("Auto-Polling Started", {
        description: "OSPF file will be checked every 5 minutes",
        duration: 3000,
      })
    } else {
      // Clear interval when disabled
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      setNextPoll(null)

      if (pollCount > 0) {
        toast.info("Auto-Polling Stopped", {
          description: `Polling disabled after ${pollCount} polls`,
          duration: 3000,
        })
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [enabled, fetchFile, pollCount])

  const pollNow = useCallback(() => {
    if (!isPolling) {
      fetchFile()
      // Reset the interval timer
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = setInterval(() => {
          fetchFile()
        }, POLLING_INTERVAL)
      }
    }
  }, [isPolling, fetchFile])

  return {
    isPolling,
    lastPoll,
    nextPoll,
    pollCount,
    lastModified,
    error,
    pollNow,
  }
}
