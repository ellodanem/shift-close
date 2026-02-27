'use client'

import { useRouter } from 'next/navigation'

export default function SettingsPage() {
  const router = useRouter()

  const settingsOptions = [
    {
      id: 'fuel-data',
      title: 'Update Past Fuel Data',
      description: 'Manually enter or edit historical fuel data (2024-2025). 2026+ is tracked automatically.',
      icon: '⛽',
      route: '/settings/fuel-data'
    },
    {
      id: 'smtp',
      title: 'Email (SMTP)',
      description: 'Configure SMTP server for sending emails. Works with Gmail, Outlook, or any SMTP server.',
      icon: '📧',
      route: '/settings/smtp'
    },
    {
      id: 'email-recipients',
      title: 'Email recipients',
      description: 'Manage the list of common recipients for the "Email report" dropdown.',
      icon: '✉️',
      route: '/settings/email-recipients'
    },
    {
      id: 'pay-days',
      title: 'Pay Days',
      description: 'Set dates when accounting processes payments. Reminders sent 3 and 1 days before.',
      icon: '💰',
      route: '/settings/pay-days'
    },
    // Future settings can be added here
    // {
    //   id: 'system',
    //   title: 'System Settings',
    //   description: 'Configure system preferences and defaults',
    //   icon: '⚙️',
    //   route: '/settings/system'
    // }
  ]

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
        </div>

        {/* Settings Options */}
        <div className="space-y-4">
          {settingsOptions.map((option) => (
            <div
              key={option.id}
              onClick={() => router.push(option.route)}
              className="bg-white rounded-lg shadow-sm border-2 border-gray-200 p-6 cursor-pointer transition-all hover:border-blue-400 hover:shadow-md"
            >
              <div className="flex items-start gap-4">
                <div className="text-4xl">{option.icon}</div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">{option.title}</h3>
                  <p className="text-sm text-gray-600">{option.description}</p>
                </div>
                <div className="text-gray-400 text-xl">→</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

