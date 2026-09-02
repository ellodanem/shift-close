/**
 * Send a sample harvest task summary email.
 * Usage: npx tsx scripts/send-harvest-email-sample.ts [email]
 */
import 'dotenv/config'
import { buildSampleHarvestTaskEmail, sendHarvestTaskEmailTo } from '../lib/harvest-agent-email'

async function main() {
  const to = process.argv[2]?.trim() || 'dane.elrus1@gmail.com'
  const sample = buildSampleHarvestTaskEmail()
  await sendHarvestTaskEmailTo(sample, to)
  console.log(`Sample harvest email sent to ${to}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
