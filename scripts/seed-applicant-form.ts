/**
 * Seed the default Pump Attendant application form.
 * Run: npx ts-node scripts/seed-applicant-form.ts
 * Or: npx prisma db seed (if configured)
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const DEFAULT_FORM = {
  name: 'Total Auto Gas Station Application Form',
  slug: 'pump-attendant',
  position: 'Pump Attendant',
  introText: `This application is for the position of Pump Attendant.

The position operates on a rotating shift schedule from Monday to Sunday, with one (1) day off per week.
Shifts may be scheduled anytime between 6:30 a.m. and 9:00 p.m.
Applicants must be able to reliably work within these hours.

Please note that Pump Attendants are responsible for arranging their own transportation to and from work.
The business is located in Cul de Sac.

By continuing with this application, you confirm that you have read and understand these requirements and are able to meet them.`,
  fields: JSON.stringify([
    { name: 'firstName', label: 'First Name', type: 'text', required: true },
    { name: 'lastName', label: 'Last Name', type: 'text', required: true },
    { name: 'address', label: 'Address', type: 'text', required: true },
    { name: 'email', label: 'Email', type: 'email', required: false },
    { name: 'dateOfBirth', label: 'Date of Birth', type: 'text', required: true, placeholder: 'dd/mm/yyyy' },
    { name: 'phoneNumber', label: 'Phone Number', type: 'text', required: true },
    { name: 'education', label: 'Highest Level of Education Completed', type: 'select', required: true, options: ['Primary', 'Secondary', 'A-Level', 'University', 'Other'] },
    { name: 'gasStationExperience', label: 'Have you ever worked at a Gas Station before?', type: 'select', required: true, options: ['Yes', 'No'] },
    { name: 'mostRecentEmployer', label: 'Most Recent Employer', type: 'text', required: true, placeholder: 'If no recent employer, please type NA' },
    { name: 'howSoonStart', label: 'How soon can you start?', type: 'text', required: true },
    { name: 'coverLetter', label: 'Cover Letter', type: 'textarea', required: true }
  ]),
  confirmationText: 'I confirm that I am applying for the position of Pump Attendant and understand the following:',
  confirmationBullets: JSON.stringify([
    'Work schedule is Monday to Sunday, with one (1) day off per week',
    'Shifts may be scheduled anytime between 6:30 a.m. and 9:00 p.m.',
    'I am responsible for my own transportation',
    'The workplace is located in Cul de Sac'
  ]),
  isActive: true
}

async function main() {
  const existing = await prisma.applicantForm.findUnique({
    where: { slug: DEFAULT_FORM.slug }
  })
  if (existing) {
    console.log('Form already exists:', existing.name)
    return
  }
  const form = await prisma.applicantForm.create({
    data: DEFAULT_FORM
  })
  console.log('Created form:', form.name, '(slug:', form.slug, ')')
  console.log('Apply URL:', `/apply/${form.slug}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
