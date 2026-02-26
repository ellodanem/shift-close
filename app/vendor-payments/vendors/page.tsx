'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Vendor {
  id: string
  name: string
  notificationEmail: string
  notes: string
  _count?: { invoices: number }
}

export default function VendorsPage() {
  const router = useRouter()
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchVendors()
  }, [])

  const fetchVendors = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/vendor-payments/vendors')
      if (!res.ok) throw new Error('Failed to fetch vendors')
      const data = await res.json()
      setVendors(data)
    } catch (error) {
      console.error('Error fetching vendors:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete ${name}?`)) return

    try {
      const res = await fetch(`/api/vendor-payments/vendors/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const error = await res.json()
        alert(error.error || 'Failed to delete vendor')
        return
      }
      fetchVendors()
    } catch (error) {
      console.error('Error deleting vendor:', error)
      alert('Failed to delete vendor')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <p className="text-gray-600">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Vendors</h1>
          <button
            onClick={() => router.push('/vendor-payments/vendors/new')}
            className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700"
          >
            Add Vendor
          </button>
        </div>

        {vendors.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
            <p className="text-gray-500 mb-4">No vendors found.</p>
            <button
              onClick={() => router.push('/vendor-payments/vendors/new')}
              className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700"
            >
              Add First Vendor
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Notification Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Invoices
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {vendors.map((vendor) => (
                  <tr key={vendor.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{vendor.name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {vendor.notificationEmail}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {vendor._count?.invoices ?? 0}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => router.push(`/vendor-payments/vendors/${vendor.id}`)}
                        className="text-blue-600 hover:text-blue-900 mr-4"
                      >
                        View
                      </button>
                      <button
                        onClick={() => router.push(`/vendor-payments/vendors/${vendor.id}/edit`)}
                        className="text-blue-600 hover:text-blue-900 mr-4"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(vendor.id, vendor.name)}
                        className="text-red-600 hover:text-red-900"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
