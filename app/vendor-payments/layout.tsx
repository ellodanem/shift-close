'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  { label: 'Vendors', href: '/vendor-payments/vendors' },
  { label: 'Make Payment', href: '/vendor-payments/make-payment' },
  { label: 'Uncashed Checks', href: '/vendor-payments/uncashed-checks' }
]

export default function VendorPaymentsLayout({
  children
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex gap-6" aria-label="Vendor payments tabs">
            {tabs.map((tab) => {
              const isActive =
                pathname === tab.href || pathname.startsWith(tab.href + '/')
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`py-4 px-1 border-b-2 font-medium text-sm ${
                    isActive
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
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
