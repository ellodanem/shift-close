'use client'

import { useRouter } from 'next/navigation'
import { useAuth } from '@/app/components/AuthContext'

export default function SettingsPage() {
  const router = useRouter()
  const { canManageUsers, loading } = useAuth()

  const settingsOptions = [
    ...(!loading && canManageUsers
      ? [
          {
            id: 'users',
            title: 'User accounts',
            description: 'Create and manage app logins, roles, and passwords.',
            icon: '👤',
            route: '/settings/users'
          }
        ]
      : []),
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
      id: 'end-of-day-email',
      title: 'End of day email',
      description:
        'Optional daily email with the previous day\'s End of Day summary. Turn off or set recipients here.',
      icon: '🌅',
      route: '/settings/end-of-day-email'
    },
    {
      id: 'pay-days',
      title: 'Pay Days',
      description: 'Set dates when accounting processes payments. Reminders sent 3 and 1 days before.',
      icon: '💰',
      route: '/settings/pay-days'
    },
    {
      id: 'public-holidays',
      title: 'Public holidays',
      description:
        'St. Lucia public holiday dates for the roster. Mark which days the station is fully closed (no shifts).',
      icon: '📅',
      route: '/settings/public-holidays'
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

