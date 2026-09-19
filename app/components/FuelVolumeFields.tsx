'use client'

export function FuelVolumeFields({
  type,
  unleadedLitres,
  dieselLitres,
  onChange,
  disabled
}: {
  type: string
  unleadedLitres: string
  dieselLitres: string
  onChange: (next: { unleadedLitres: string; dieselLitres: string }) => void
  disabled?: boolean
}) {
  if (type !== 'Fuel') return null

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Unleaded litres</label>
          <input
            type="number"
            min="0"
            step="1"
            disabled={disabled}
            value={unleadedLitres}
            onChange={(e) => onChange({ unleadedLitres: e.target.value, dieselLitres })}
            placeholder="Optional"
            className="min-h-[44px] w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:min-h-0"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Diesel litres</label>
          <input
            type="number"
            min="0"
            step="1"
            disabled={disabled}
            value={dieselLitres}
            onChange={(e) => onChange({ unleadedLitres, dieselLitres: e.target.value })}
            placeholder="Optional"
            className="min-h-[44px] w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:min-h-0"
          />
        </div>
      </div>
      <p className="text-xs text-gray-500">
        Counts toward tank inventory on the invoice date, not when the invoice is paid. Leave blank if
        litres are not on this invoice.
      </p>
    </div>
  )
}

export function litresPayload(unleadedLitres: string, dieselLitres: string): {
  unleadedLitres: number | null
  dieselLitres: number | null
} {
  const parse = (raw: string): number | null => {
    const trimmed = raw.trim()
    if (!trimmed) return null
    const n = Number(trimmed)
    return Number.isFinite(n) ? n : null
  }
  return {
    unleadedLitres: parse(unleadedLitres),
    dieselLitres: parse(dieselLitres)
  }
}

export function litresInputValue(value: number | null | undefined): string {
  if (value == null) return ''
  return String(value)
}
