'use client'

import { useEffect, useState, ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'

interface Vendor {
  id: string
  name: string
  notificationEmail: string
  notes: string
  _count?: { invoices: number }
}

interface ImportResult {
  created: number
  skipped: number
  errors: { row: number; vendor: string; invoiceNumber: string; message: string }[]
  vendorsCreated: string[]
}

export default function VendorsPage() {
  const router = useRouter()
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [createMissingVendors, setCreateMissingVendors] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)

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

  const handleImportExcel = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImporting(true)
    setImportResult(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('createMissingVendors', String(createMissingVendors))

      const res = await fetch('/api/vendor-payments/import-invoices', {
        method: 'POST',
        body: formData
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Import failed')

      setImportResult(data)
      fetchVendors()
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : 'Failed to import')
    } finally {
      setImporting(false)
      e.target.value = ''
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
          <div className="flex gap-2">
            <button
              onClick={() => { setShowImportModal(true); setImportResult(null) }}
              className="px-4 py-2 bg-green-600 text-white rounded font-semibold hover:bg-green-700"
            >
              Import from Excel
            </button>
            <button
              onClick={() => router.push('/vendor-payments/vendors/new')}
              className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700"
            >
              Add Vendor
            </button>
          </div>
        </div>

        {vendors.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
            <p className="text-gray-500 mb-4">No vendors found.</p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => { setShowImportModal(true); setImportResult(null) }}
                className="px-4 py-2 bg-green-600 text-white rounded font-semibold hover:bg-green-700"
              >
                Import from Excel
              </button>
              <button
                onClick={() => router.push('/vendor-payments/vendors/new')}
                className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700"
              >
                Add First Vendor
              </button>
            </div>
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

      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b">
              <h2 className="text-xl font-bold text-gray-900">Import Invoices from Excel</h2>
              <p className="text-sm text-gray-600 mt-1">
                Upload a Cstore vendor payment Excel file. Rubis West Indies rows are skipped (handled in Fuel Payments).
              </p>
            </div>
            <div className="p-6 space-y-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={createMissingVendors}
                  onChange={(e) => setCreateMissingVendors(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span className="text-sm text-gray-700">Create vendors if they don&apos;t exist</span>
              </label>
              <div>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleImportExcel}
                  disabled={importing}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
                />
                {importing && <p className="text-sm text-amber-600 mt-2">Importing...</p>}
              </div>
              {importResult && (
                <div className="bg-gray-50 rounded p-4 text-sm space-y-2">
                  <p className="font-medium text-green-700">
                    Created {importResult.created} invoice(s)
                    {importResult.skipped > 0 && ` · Skipped ${importResult.skipped} Rubis row(s)`}
                  </p>
                  {importResult.vendorsCreated.length > 0 && (
                    <p className="text-gray-600">
                      New vendors: {importResult.vendorsCreated.join(', ')}
                    </p>
                  )}
                  {importResult.errors.length > 0 && (
                    <div className="mt-2">
                      <p className="font-medium text-amber-700">{importResult.errors.length} error(s):</p>
                      <ul className="mt-1 max-h-32 overflow-y-auto space-y-1 text-gray-600">
                        {importResult.errors.slice(0, 10).map((err, idx) => (
                          <li key={idx}>
                            Row {err.row}: {err.vendor} #{err.invoiceNumber} – {err.message}
                          </li>
                        ))}
                        {importResult.errors.length > 10 && (
                          <li className="text-gray-500">...and {importResult.errors.length - 10} more</li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="p-6 border-t bg-gray-50 flex justify-end">
              <button
                onClick={() => setShowImportModal(false)}
                className="px-4 py-2 bg-gray-600 text-white rounded font-semibold hover:bg-gray-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
