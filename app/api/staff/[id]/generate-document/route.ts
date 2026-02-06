import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Simple template system - templates stored in code for now
const TEMPLATES: Record<string, string> = {
  contract: `EMPLOYMENT CONTRACT

This Employment Contract ("Contract") is entered into on {{date}} between [Company Name] ("Employer") and {{name}} ("Employee").

EMPLOYEE INFORMATION:
- Full Name: {{name}}
- Date of Birth: {{dateOfBirth}}
- Position: {{role}}
- Start Date: {{startDate}}

TERMS AND CONDITIONS:
[Standard employment terms and conditions will be inserted here]

This contract is effective as of {{startDate}}.

_________________________          _________________________
Employer Signature                  Employee Signature

Date: {{date}}                      Date: {{date}}`,

  'job-letter': `JOB LETTER

Date: {{date}}

To Whom It May Concern,

This letter confirms that {{name}} (Date of Birth: {{dateOfBirth}}) has been employed with [Company Name] in the position of {{role}} since {{startDate}}.

[Additional details about employment status and performance can be added here]

If you require any further information, please do not hesitate to contact us.

Sincerely,

[Manager Name]
[Company Name]
[Contact Information]`,

  'reference-letter': `REFERENCE LETTER

Date: {{date}}

To Whom It May Concern,

This letter serves as a reference for {{name}} (Date of Birth: {{dateOfBirth}}), who has been employed with [Company Name] as a {{role}} since {{startDate}}.

[Details about performance, character, and work ethic can be added here]

We recommend {{name}} without reservation.

Sincerely,

[Manager Name]
[Company Name]
[Contact Information]`
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    const body = await request.json()
    const { templateType, customContent } = body
    
    if (!templateType || !TEMPLATES[templateType]) {
      return NextResponse.json({ error: 'Invalid template type' }, { status: 400 })
    }
    
    // Get staff information
    const staff = await prisma.staff.findUnique({
      where: { id }
    })
    
    if (!staff) {
      return NextResponse.json({ error: 'Staff not found' }, { status: 404 })
    }
    
    // Get template
    let template = TEMPLATES[templateType]
    
    // If custom content provided, use it; otherwise use template
    const content = customContent || template
    
    // Replace placeholders
    const today = new Date()
    const formattedDate = today.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    })
    
    const formattedDOB = staff.dateOfBirth 
      ? new Date(staff.dateOfBirth + 'T00:00:00').toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })
      : '[Not provided]'
    
    const formattedStartDate = staff.startDate
      ? new Date(staff.startDate + 'T00:00:00').toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })
      : '[Not provided]'
    
    const roleDisplay = staff.role.charAt(0).toUpperCase() + staff.role.slice(1)
    
    let finalContent = content
      .replace(/\{\{name\}\}/g, staff.name)
      .replace(/\{\{dateOfBirth\}\}/g, formattedDOB)
      .replace(/\{\{startDate\}\}/g, formattedStartDate)
      .replace(/\{\{role\}\}/g, roleDisplay)
      .replace(/\{\{date\}\}/g, formattedDate)
    
    return NextResponse.json({
      content: finalContent,
      templateType,
      staffName: staff.name
    })
  } catch (error) {
    console.error('Error generating document:', error)
    return NextResponse.json({ error: 'Failed to generate document' }, { status: 500 })
  }
}

