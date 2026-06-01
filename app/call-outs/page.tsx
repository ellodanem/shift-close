import { redirect } from 'next/navigation'

type Props = {
  searchParams: Promise<{ date?: string }>
}

/** Legacy route — redirects to Time Off → Call Outs tab. */
export default async function CallOutsRedirectPage({ searchParams }: Props) {
  const sp = await searchParams
  const qs = new URLSearchParams({ tab: 'call-outs' })
  if (sp.date) qs.set('date', sp.date)
  redirect(`/time-off?${qs.toString()}`)
}
