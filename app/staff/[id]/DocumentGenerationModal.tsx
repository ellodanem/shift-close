'use client'

import { useState } from 'react'

interface DocumentGenerationModalProps {
  staffId: string
  staffName: string
  onClose: () => void
  onGenerate: (templateType: string) => void
}

export default function DocumentGenerationModal({
  staffId,
  staffName,
  onClose,
  onGenerate
}: DocumentGenerationModalProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<string>('')

  const templates = [
    { id: 'contract', label: 'Contract', description: 'Employment contract template' },
    { id: 'job-letter', label: 'Job Letter', description: 'Employment confirmation letter' },
    { id: 'reference-letter', label: 'Reference Letter', description: 'Professional reference letter' }
  ]

  const handleGenerate = () => {
    if (selectedTemplate) {
      onGenerate(selectedTemplate)
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Generate Document</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>
        <p className="text-sm text-gray-600 mb-4">Select a document template for <strong>{staffName}</strong>:</p>
        <div className="space-y-2 mb-4">
          {templates.map((template) => (
            <button
              key={template.id}
              onClick={() => setSelectedTemplate(template.id)}
              className={`w-full text-left px-4 py-3 rounded border-2 transition-colors ${
                selectedTemplate === template.id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="font-semibold text-gray-900">{template.label}</div>
              <div className="text-xs text-gray-500 mt-1">{template.description}</div>
            </button>
          ))}
        </div>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded font-semibold hover:bg-gray-300"
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={!selectedTemplate}
            className="px-4 py-2 bg-green-600 text-white rounded font-semibold hover:bg-green-700 disabled:bg-gray-400"
          >
            Generate
          </button>
        </div>
      </div>
    </div>
  )
}

