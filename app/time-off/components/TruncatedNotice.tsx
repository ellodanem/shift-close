export default function TruncatedNotice({
  truncated
}: {
  truncated: { dayOffs?: boolean; sickLeaves?: boolean; callOuts?: boolean }
}) {
  const parts: string[] = []
  if (truncated.dayOffs) parts.push('day offs')
  if (truncated.sickLeaves) parts.push('sick leave')
  if (truncated.callOuts) parts.push('call outs')
  if (parts.length === 0) return null
  return (
    <p className="mb-4 text-sm text-amber-900 rounded border border-amber-200 bg-amber-50 px-3 py-2">
      Showing the first 500 {parts.join(', ')} in this range. Narrow the date range to see older
      records.
    </p>
  )
}
