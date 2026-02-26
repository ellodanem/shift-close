import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { prisma } from '@/lib/prisma'
import { formatAmount } from '@/lib/fuelPayments'

export async function POST(request: NextRequest) {
  try {
    const user = process.env.SMTP_USER
    const pass = process.env.SMTP_PASS
    const from = process.env.EMAIL_FROM || user

    if (!user || !pass) {
      return NextResponse.json(
        { error: 'Email not configured. Set SMTP_USER and SMTP_PASS.' },
        { status: 500 }
      )
    }

    const body = await request.json()
    const { batchId, ccEmail } = body as { batchId?: string; ccEmail?: string }

    if (!batchId?.trim()) {
      return NextResponse.json({ error: 'batchId is required' }, { status: 400 })
    }

    const batch = await prisma.vendorPaymentBatch.findUnique({
      where: { id: batchId },
      include: { vendor: true, invoices: { orderBy: { invoiceNumber: 'asc' } } }
    })

    if (!batch) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 })
    }

    const toEmail = batch.vendor.notificationEmail?.trim()
    if (!toEmail) {
      return NextResponse.json(
        { error: 'Vendor has no notification email configured' },
        { status: 400 }
      )
    }

    const paymentDateStr = new Date(batch.paymentDate).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })

    const invoiceRows = batch.invoices
      .map(
        (inv) =>
          `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee">${inv.invoiceNumber}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${formatAmount(inv.amount)}</td></tr>`
      )
      .join('')

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Payment Notification</title></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
  <h2 style="color:#111">Payment Notification – ${batch.vendor.name}</h2>
  <p>This is to confirm that payment has been made for the following invoices.</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0">
    <thead>
      <tr style="background:#f5f5f5">
        <th style="padding:8px;text-align:left">Invoice #</th>
        <th style="padding:8px;text-align:right">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${invoiceRows}
    </tbody>
  </table>
  <p><strong>Total:</strong> ${formatAmount(batch.totalAmount)}</p>
  <p><strong>Payment Date:</strong> ${paymentDateStr}</p>
  <p><strong>Payment Method:</strong> ${batch.paymentMethod.toUpperCase()}</p>
  <p><strong>Reference:</strong> ${batch.bankRef}</p>
  ${batch.balanceBefore != null && batch.balanceAfter != null ? `<p><strong>Balance Before:</strong> ${formatAmount(batch.balanceBefore)} &nbsp; <strong>Balance After:</strong> ${formatAmount(batch.balanceAfter)}</p>` : ''}
  <p style="margin-top:24px;color:#666;font-size:12px">This is an automated notification from Shift Close.</p>
</body>
</html>
    `.trim()

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: { user, pass }
    })

    const mailOptions: Parameters<typeof transporter.sendMail>[0] = {
      from: from || user,
      to: toEmail,
      subject: `Payment Notification – ${batch.vendor.name} – ${paymentDateStr}`,
      text: html.replace(/<[^>]*>/g, ''),
      html
    }

    if (ccEmail && String(ccEmail).trim()) {
      mailOptions.cc = String(ccEmail).trim()
    }

    await transporter.sendMail(mailOptions)

    return NextResponse.json({
      success: true,
      to: toEmail,
      message: `Notification sent to ${toEmail}`
    })
  } catch (error: unknown) {
    console.error('Vendor notification email error:', error)
    const err = error as { message?: string }
    return NextResponse.json(
      { error: err?.message || 'Failed to send email' },
      { status: 500 }
    )
  }
}
