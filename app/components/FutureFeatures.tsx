'use client'

import { useState } from 'react'

export default function FutureFeatures() {
  const [showModal, setShowModal] = useState(false)

  const plannedFeatures = [
    {
      category: 'Online Deployment & Accessibility',
      features: [
        'Cloud database migration (SQLite → PostgreSQL)',
        'Cloud file storage for uploads (Vercel Blob or AWS S3)',
        'Deploy to Vercel for global access',
        'Custom domain support with SSL',
        'Basic authentication and password protection',
        'Automated database backups',
        'Environment variable configuration',
        'Optimised for mobile, tablet and desktop use',
        'Access from anywhere, anytime via web browser'
      ]
    },
    {
      category: 'Email & Sharing (Mr. Elcock)',
      features: [
        'Built-in email sending for Proposed Payment PNG/PDF',
        'Email Paid Payment summaries directly to Mr. Elcock',
        'Email Monthly Fuel Payment Report with one click',
        'Configurable email provider (SendGrid or SMTP)',
        'Simple email history/logs for what was sent and when',
        'One-tap WhatsApp sharing of Proposed and Paid Payment images (mobile)',
        'WhatsApp Web sharing flow on desktop (copy then open WhatsApp Web)'
      ]
    },
    {
      category: 'Financial Module & Advanced Reports',
      features: [
        'Financial module mirroring the accountant’s cashbook (expenses, payables, receivables)',
        'Financial Report page with cash flow and profit/loss',
        'Integration of Financial Report into Monthly Report',
        'Over/Short Trend Reports – track discrepancies over time',
        'Fuel Sales & Fuel Payment Reports – detailed fuel analysis',
        'Deposit Reports – deposit patterns and analysis',
        'Exception Reports – red flags and missing data alerts'
      ]
    },
    {
      category: 'Historical Data & Comparisons',
      features: [
        'Bulk import for at least two years of historical fuel data (Excel/CSV)',
        'Data validation and duplicate detection during import',
        'Fuel Comparison Report using historical data (month-over-month / year-over-year)',
        'Backup and restore functionality for imported datasets',
        'Data archiving for old records'
      ]
    },
    {
      category: 'Customer Accounts (Lightweight A/R)',
      features: [
        'Dashboard visibility of Customer Charges (In-House, month-to-date)',
        'Simple monthly summary of customer accounts: opening balance, new charges, payments, closing balance',
        'Designed to stay compatible with the accountant’s primary A/R system (no double system of record)'
      ]
    },
    {
      category: 'User Management',
      features: [
        'Multi-user support with roles',
        'User authentication and permissions',
        'Activity logs and audit trails',
        'Optional read-only access for Mr. Elcock to key reports'
      ]
    },
    {
      category: 'Printing & Export',
      features: [
        'Print-optimised Monthly Fuel Payment Report',
        'Export Monthly Report to PDF and/or Excel',
        'Hide navigation and apply print-specific styling for A4/Letter',
        'Support multi-page handling for long reports'
      ]
    }
  ]

  return (
    <>
      {/* Floating Info Button */}
      <button
        onClick={() => setShowModal(true)}
        className="fixed bottom-6 right-6 bg-blue-600 hover:bg-blue-700 text-white rounded-full w-12 h-12 flex items-center justify-center shadow-lg z-40 transition-all hover:scale-110"
        title="View planned features"
        aria-label="View planned features"
      >
        <span className="text-2xl">ℹ️</span>
      </button>

      {/* Modal */}
      {showModal && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowModal(false)}
        >
          <div 
            className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[80vh] overflow-y-auto border-2 border-gray-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b-2 border-gray-300 px-6 py-4 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-gray-900">Planned Features</h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            
            <div className="p-6">
              <p className="text-gray-600 mb-6">
                The following features are planned for future releases. This roadmap helps guide development priorities.
              </p>
              
              <div className="space-y-6">
                {plannedFeatures.map((category, index) => (
                  <div key={index} className="border-b border-gray-200 pb-6 last:border-b-0">
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">
                      {category.category}
                    </h3>
                    <ul className="space-y-2">
                      {category.features.map((feature, featureIndex) => (
                        <li key={featureIndex} className="flex items-start text-sm text-gray-700">
                          <span className="text-blue-600 mr-2 mt-1">•</span>
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              <div className="mt-6 pt-4 border-t border-gray-200">
                <p className="text-xs text-gray-500">
                  Features are subject to change based on user feedback and business priorities.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

