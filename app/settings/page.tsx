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
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
          <div className="flex gap-4">
            <button
              onClick={() => router.push('/dashboard')}
              className="px-4 py-2 bg-indigo-600 text-white rounded font-semibold hover:bg-indigo-700"
            >
              Dashboard
            </button>
            <button
              onClick={() => router.push('/shifts')}
              className="px-4 py-2 bg-gray-600 text-white rounded font-semibold hover:bg-gray-700"
            >
              Shift List
            </button>
          </div>
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

