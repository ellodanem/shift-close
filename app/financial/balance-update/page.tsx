'use client'

import { useEffect } from 'react'
import { useNav } from '@/app/components/NavContext'

export default function BalanceUpdatePage() {
  const { openBalanceUpdate } = useNav()

  useEffect(() => {
    openBalanceUpdate()
  }, [openBalanceUpdate])

  return (
    <div className="min-h-full bg-gray-50 p-6">
      <div className="mx-auto max-w-xl">
        <h1 className="text-2xl font-bold text-blue-950">Balance Update</h1>
        <p className="mt-2 text-sm text-slate-600">
          Update the current and available funds for Westline Ent and Service Station.
        </p>
        <button
          type="button"
          onClick={() => openBalanceUpdate()}
          className="mt-4 min-h-[44px] rounded bg-cyan-700 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-800 sm:min-h-0"
        >
          Open balance form
        </button>
      </div>
    </div>
  )
}
