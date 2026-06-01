'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import type { TimeOffBundlePayload, TimeOffStaffOption } from '@/lib/time-off-bundle'

type FetchBundleOptions = {
  includeSickDocuments?: boolean
  force?: boolean
}

type TimeOffContextValue = {
  staffOptions: TimeOffStaffOption[]
  staffLoading: boolean
  staffError: string | null
  fetchBundle: (
    startDate: string,
    endDate: string,
    options?: FetchBundleOptions
  ) => Promise<TimeOffBundlePayload>
  invalidateBundles: () => void
}

const TimeOffContext = createContext<TimeOffContextValue | null>(null)

function bundleCacheKey(start: string, end: string, includeSickDocuments: boolean): string {
  return `${start}|${end}|${includeSickDocuments ? 'docs' : 'slim'}`
}

export function TimeOffProvider({ children }: { children: ReactNode }) {
  const [staffOptions, setStaffOptions] = useState<TimeOffStaffOption[]>([])
  const [staffLoading, setStaffLoading] = useState(true)
  const [staffError, setStaffError] = useState<string | null>(null)
  const bundleCacheRef = useRef<Map<string, TimeOffBundlePayload>>(new Map())
  const inflightRef = useRef<Map<string, Promise<TimeOffBundlePayload>>>(new Map())

  useEffect(() => {
    let cancelled = false
    setStaffLoading(true)
    setStaffError(null)
    fetch('/api/time-off/staff-options', { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || 'Failed to load staff')
        }
        return res.json() as Promise<TimeOffStaffOption[]>
      })
      .then((staff) => {
        if (!cancelled) setStaffOptions(staff)
      })
      .catch((e) => {
        if (!cancelled) {
          setStaffError(e instanceof Error ? e.message : 'Failed to load staff')
          setStaffOptions([])
        }
      })
      .finally(() => {
        if (!cancelled) setStaffLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const invalidateBundles = useCallback(() => {
    bundleCacheRef.current.clear()
    inflightRef.current.clear()
  }, [])

  const fetchBundle = useCallback(
    async (startDate: string, endDate: string, options?: FetchBundleOptions) => {
      const includeSickDocuments = options?.includeSickDocuments === true
      const key = bundleCacheKey(startDate, endDate, includeSickDocuments)

      if (!options?.force) {
        const cached = bundleCacheRef.current.get(key)
        if (cached) return cached
        const inflight = inflightRef.current.get(key)
        if (inflight) return inflight
      }

      const qs = new URLSearchParams({
        startDate,
        endDate,
        ...(includeSickDocuments ? { includeSickDocuments: '1' } : {})
      })

      const promise = fetch(`/api/time-off/bundle?${qs.toString()}`, { cache: 'no-store' })
        .then(async (res) => {
          if (!res.ok) {
            const body = await res.json().catch(() => ({}))
            throw new Error(body.error || 'Failed to load time off data')
          }
          return res.json() as Promise<TimeOffBundlePayload>
        })
        .then((payload) => {
          bundleCacheRef.current.set(key, payload)
          inflightRef.current.delete(key)
          return payload
        })
        .catch((err) => {
          inflightRef.current.delete(key)
          throw err
        })

      inflightRef.current.set(key, promise)
      return promise
    },
    []
  )

  const value = useMemo(
    () => ({
      staffOptions,
      staffLoading,
      staffError,
      fetchBundle,
      invalidateBundles
    }),
    [staffOptions, staffLoading, staffError, fetchBundle, invalidateBundles]
  )

  return <TimeOffContext.Provider value={value}>{children}</TimeOffContext.Provider>
}

export function useTimeOff(): TimeOffContextValue {
  const ctx = useContext(TimeOffContext)
  if (!ctx) {
    throw new Error('useTimeOff must be used within TimeOffProvider')
  }
  return ctx
}
