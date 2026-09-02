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
  totalRows?: number
  columnNames?: string[]
  skippedNoVendor?: number
  skippedNoInvoice?: number
  skippedHeaderTotal?: number
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
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-4 sm:p-8">
        <p className="text-gray-600">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-4 pb-10 sm:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Vendors</h1>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-2">
            <button
              type="button"
              onClick={() => {
                setShowImportModal(true)
                setImportResult(null)
              }}
              className="min-h-[44px] rounded bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 sm:min-h-0"
            >
              Import from Excel
            </button>
            <button
              type="button"
              onClick={() => router.push('/vendor-payments/vendors/new')}
              className="min-h-[44px] rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 sm:min-h-0"
            >
              Add Vendor
            </button>
          </div>
        </div>

        {vendors.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
            <p className="mb-4 text-gray-500">No vendors found.</p>
            <div className="grid grid-cols-1 gap-3 sm:flex sm:justify-center sm:gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowImportModal(true)
                  setImportResult(null)
                }}
                className="min-h-[44px] rounded bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 sm:min-h-0"
              >
                Import from Excel
              </button>
              <button
                type="button"
                onClick={() => router.push('/vendor-payments/vendors/new')}
                className="min-h-[44px] rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 sm:min-h-0"
              >
                Add First Vendor
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-3 md:hidden">
              {vendors.map((vendor) => (
                <div
                  key={vendor.id}
                  className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900">{vendor.name}</div>
                      <div className="mt-0.5 break-all text-xs text-gray-600">
                        {vendor.notificationEmail || 'No notification email'}
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        {vendor._count?.invoices ?? 0} invoice
                        {(vendor._count?.invoices ?? 0) === 1 ? '' : 's'}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-4 border-t border-gray-100 pt-3">
                    <button
                      type="button"
                      onClick={() =>
                        router.push(`/vendor-payments/vendors/${vendor.id}`)
                      }
                      className="min-h-[44px] text-sm font-medium text-blue-600 hover:text-blue-900"
                    >
                      View
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        router.push(`/vendor-payments/vendors/${vendor.id}/edit`)
                      }
                      className="min-h-[44px] text-sm font-medium text-indigo-600 hover:text-indigo-900"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(vendor.id, vendor.name)}
                      className="min-h-[44px] text-sm font-medium text-red-600 hover:text-red-900"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm md:block">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Notification Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Invoices
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {vendors.map((vendor) => (
                    <tr key={vendor.id} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">
                          {vendor.name}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                        {vendor.notificationEmail}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                        {vendor._count?.invoices ?? 0}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                        <button
                          type="button"
                          onClick={() =>
                            router.push(`/vendor-payments/vendors/${vendor.id}`)
                          }
                          className="mr-4 text-blue-600 hover:text-blue-900"
                        >
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            router.push(
                              `/vendor-payments/vendors/${vendor.id}/edit`
                            )
                          }
                          className="mr-4 text-blue-600 hover:text-blue-900"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
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
          </>
        )}
      </div>

      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center">
          <div className="my-4 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-lg bg-white shadow-xl">
            <div className="border-b p-4 sm:p-6">
              <h2 className="text-xl font-bold text-gray-900">
                Import Invoices from Excel
              </h2>
              <p className="mt-1 text-sm text-gray-600">
                Upload a Cstore vendor payment Excel file. Rubis West Indies rows
                are skipped (handled in Fuel Payments).
              </p>
            </div>
            <div className="space-y-4 overflow-y-auto p-4 sm:p-6">
              <label className="flex min-h-[44px] cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={createMissingVendors}
                  onChange={(e) => setCreateMissingVendors(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span className="text-sm text-gray-700">
                  Create vendors if they don&apos;t exist
                </span>
              </label>
              <div>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleImportExcel}
                  disabled={importing}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:rounded file:border-0 file:bg-green-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-green-700 hover:file:bg-green-100"
                />
                {importing && (
                  <p className="mt-2 text-sm text-amber-600">Importing...</p>
                )}
              </div>
              {importResult && (
                <div className="space-y-2 rounded bg-gray-50 p-4 text-sm">
                  <p className="font-medium text-green-700">
                    Created {importResult.created} invoice(s)
                    {importResult.skipped > 0 &&
                      ` · Skipped ${importResult.skipped} Rubis row(s)`}
                  </p>
                  {importResult.vendorsCreated.length > 0 && (
                    <p className="text-gray-600">
                      New vendors: {importResult.vendorsCreated.join(', ')}
                    </p>
                  )}
                  {importResult.created === 0 &&
                    importResult.totalRows !== undefined && (
                      <div className="mt-2 rounded border border-amber-200 bg-amber-50 p-3">
                        <p className="font-medium text-amber-800">
                          No invoices imported. Your file had{' '}
                          {importResult.totalRows} row(s).
                        </p>
                        {importResult.columnNames &&
                          importResult.columnNames.length > 0 && (
                            <p className="mt-1 text-xs text-amber-700">
                              Detected columns:{' '}
                              {importResult.columnNames.join(', ')}
                            </p>
                          )}
                        <p className="mt-1 text-xs text-amber-700">
                          Expected: Vendor (or Vendor Name, Payee), Invoice# (or
                          Invoice, Invoice No), Date, Invoice Amount (or Amount,
                          Total)
                        </p>
                        {(importResult.skippedNoVendor ?? 0) > 0 && (
                          <p className="mt-1 text-amber-600">
                            Skipped {importResult.skippedNoVendor} row(s) with no
                            vendor name
                          </p>
                        )}
                        {(importResult.skippedNoInvoice ?? 0) > 0 && (
                          <p className="text-amber-600">
                            Skipped {importResult.skippedNoInvoice} row(s) with
                            no invoice number
                          </p>
                        )}
                        {(importResult.skippedHeaderTotal ?? 0) > 0 && (
                          <p className="text-amber-600">
                            Skipped {importResult.skippedHeaderTotal}{' '}
                            header/total row(s)
                          </p>
                        )}
                      </div>
                    )}
                  {importResult.errors.length > 0 && (
                    <div className="mt-2">
                      <p className="font-medium text-amber-700">
                        {importResult.errors.length} error(s):
                      </p>
                      <ul className="mt-1 max-h-32 space-y-1 overflow-y-auto text-gray-600">
                        {importResult.errors.slice(0, 10).map((err, idx) => (
                          <li key={idx}>
                            Row {err.row}: {err.vendor} #{err.invoiceNumber} –{' '}
                            {err.message}
                          </li>
                        ))}
                        {importResult.errors.length > 10 && (
                          <li className="text-gray-500">
                            ...and {importResult.errors.length - 10} more
                          </li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex justify-end border-t bg-gray-50 p-4 sm:p-6">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="min-h-[44px] rounded bg-gray-600 px-4 py-2 font-semibold text-white hover:bg-gray-700 sm:min-h-0"
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
