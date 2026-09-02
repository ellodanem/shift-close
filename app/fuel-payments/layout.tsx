'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  { label: 'Invoices', href: '/fuel-payments/invoices' },
  { label: 'Batches', href: '/fuel-payments/batches' },
  { label: 'Monthly report', href: '/fuel-payments/monthly-report' }
]

export default function FuelPaymentsLayout({
  children
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav
            className="-mb-px flex gap-1 overflow-x-auto sm:gap-6"
            aria-label="Fuel payments tabs"
          >
            {tabs.map((tab) => {
              const isActive =
                pathname === tab.href || pathname.startsWith(tab.href + '/')
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`shrink-0 whitespace-nowrap border-b-2 px-2 py-3 text-sm font-medium sm:px-1 sm:py-4 ${
                    isActive
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  }`}
                >
                  {tab.label}
                </Link>
              )
            })}
          </nav>
        </div>
      </div>
      {children}
    </div>
  )
}
