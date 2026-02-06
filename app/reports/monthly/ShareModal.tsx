'use client'

import { useState, useEffect } from 'react'
import { MonthlyReportData } from './types'

interface ShareModalProps {
  data: MonthlyReportData
  isOpen: boolean
  onClose: () => void
}

export default function ShareModal({ data, isOpen, onClose }: ShareModalProps) {
  const [emailAddress, setEmailAddress] = useState('')
  const [whatsappNumber, setWhatsappNumber] = useState('')

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = 'unset'
      }
    }
  }, [isOpen])

  if (!isOpen) return null

  const formatCurrency = (num: number): string => {
    return num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  }

  const generateWhatsAppMessage = (): string => {
    const message = `Monthly Report - ${data.monthName} ${data.year}

Executive Summary:
• Total Days: ${data.period.totalDays}
• Working Days: ${data.period.workingDays}
• Complete Days: ${data.period.completeDays}
• Incomplete Days: ${data.period.incompleteDays}

Financial Totals:
• Total Deposits: $${formatCurrency(data.summary.totalDeposits)}
• Debit & Credit: $${formatCurrency(data.summary.debitAndCredit)}
• Fleet Revenue: $${formatCurrency(data.summary.fleet)}
• Vouchers/Coupons: $${formatCurrency(data.summary.vouchers)}
• Grand Total: $${formatCurrency(data.summary.grandTotal)}

Operational Metrics:
• Total Shifts: ${data.summary.totalShifts}
• Draft Shifts: ${data.summary.draftShifts}
• Unleaded Sales: ${data.summary.unleaded.toFixed(2)}
• Diesel Sales: ${data.summary.diesel.toFixed(2)}

Over/Short Analysis:
• Total Over/Short: $${formatCurrency(data.overShortAnalysis.totalOverShort)}
• Average per Shift: $${formatCurrency(data.overShortAnalysis.averageOverShort)}
• Shifts with Discrepancy: ${data.overShortAnalysis.shiftsWithOverShort}
• Shifts Balanced: ${data.overShortAnalysis.shiftsWithZeroOverShort}

View full report in the system for detailed breakdown.`

    return encodeURIComponent(message)
  }

  const generateEmailSubject = (): string => {
    return `Monthly Report - ${data.monthName} ${data.year}`
  }

  const generateEmailBody = (): string => {
    return `Please find attached the Monthly Report for ${data.monthName} ${data.year}.

Executive Summary:
• Total Days: ${data.period.totalDays}
• Working Days: ${data.period.workingDays}
• Complete Days: ${data.period.completeDays}
• Incomplete Days: ${data.period.incompleteDays}

Financial Totals:
• Total Deposits: $${formatCurrency(data.summary.totalDeposits)}
• Debit & Credit: $${formatCurrency(data.summary.debitAndCredit)}
• Fleet Revenue: $${formatCurrency(data.summary.fleet)}
• Vouchers/Coupons: $${formatCurrency(data.summary.vouchers)}
• Grand Total: $${formatCurrency(data.summary.grandTotal)}

Operational Metrics:
• Total Shifts: ${data.summary.totalShifts}
• Draft Shifts: ${data.summary.draftShifts}

Over/Short Analysis:
• Total Over/Short: $${formatCurrency(data.overShortAnalysis.totalOverShort)}
• Average per Shift: $${formatCurrency(data.overShortAnalysis.averageOverShort)}
• Shifts with Discrepancy: ${data.overShortAnalysis.shiftsWithOverShort}
• Shifts Balanced: ${data.overShortAnalysis.shiftsWithZeroOverShort}

Please review the attached report for detailed breakdowns.

Best regards`
  }

  const handleWhatsAppShare = () => {
    const message = generateWhatsAppMessage()
    const phoneNumber = whatsappNumber.replace(/[^0-9]/g, '')
    
    if (phoneNumber) {
      // WhatsApp Web/App link
      const whatsappUrl = `https://wa.me/${phoneNumber}?text=${message}`
      window.open(whatsappUrl, '_blank')
    } else {
      // Copy to clipboard if no number provided
      const decodedMessage = decodeURIComponent(message)
      navigator.clipboard.writeText(decodedMessage).then(() => {
        alert('Report summary copied to clipboard! You can paste it into WhatsApp.')
      })
    }
  }

  const handleEmailShare = () => {
    const subject = generateEmailSubject()
    const body = generateEmailBody()
    
    if (emailAddress) {
      // mailto link with recipient
      const mailtoUrl = `mailto:${emailAddress}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
      window.location.href = mailtoUrl
    } else {
      // Copy email content to clipboard
      const emailContent = `Subject: ${subject}\n\n${body}`
      navigator.clipboard.writeText(emailContent).then(() => {
        alert('Email content copied to clipboard! You can paste it into your email client.')
      })
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-900">Share Report</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>

        <div className="space-y-4">
          {/* WhatsApp Share */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              WhatsApp Share
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Phone number (optional)"
                value={whatsappNumber}
                onChange={(e) => setWhatsappNumber(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <button
                onClick={handleWhatsAppShare}
                className="px-4 py-2 bg-green-600 text-white rounded font-semibold hover:bg-green-700 flex items-center gap-2"
              >
                📱 Share
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {whatsappNumber ? 'Will open WhatsApp with the number' : 'Will copy summary to clipboard'}
            </p>
          </div>

          {/* Email Share */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email Share
            </label>
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="Email address (optional)"
                value={emailAddress}
                onChange={(e) => setEmailAddress(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleEmailShare}
                className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700 flex items-center gap-2"
              >
                ✉️ Share
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {emailAddress ? 'Will open email client' : 'Will copy email content to clipboard'}
            </p>
          </div>

          {/* Quick Actions */}
          <div className="pt-4 border-t border-gray-200">
            <p className="text-sm font-medium text-gray-700 mb-2">Quick Actions:</p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const message = decodeURIComponent(generateWhatsAppMessage())
                  navigator.clipboard.writeText(message)
                  alert('Report summary copied to clipboard!')
                }}
                className="flex-1 px-3 py-2 bg-gray-100 text-gray-700 rounded text-sm hover:bg-gray-200"
              >
                Copy Summary
              </button>
              <button
                onClick={() => {
                  const emailContent = `Subject: ${generateEmailSubject()}\n\n${generateEmailBody()}`
                  navigator.clipboard.writeText(emailContent)
                  alert('Email content copied to clipboard!')
                }}
                className="flex-1 px-3 py-2 bg-gray-100 text-gray-700 rounded text-sm hover:bg-gray-200"
              >
                Copy Email
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

