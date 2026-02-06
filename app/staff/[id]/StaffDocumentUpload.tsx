'use client'

import { useState, useRef } from 'react'

interface StaffDocumentUploadProps {
  staffId: string
  onUploadComplete: () => void
}

interface FilePreview {
  file: File
  preview: string | null
  type: 'image' | 'pdf'
}

export default function StaffDocumentUpload({ staffId, onUploadComplete }: StaffDocumentUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filePreviews, setFilePreviews] = useState<FilePreview[]>([])
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [documentType, setDocumentType] = useState<string>('sick-leave')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const validFiles: File[] = []
    const errors: string[] = []

    Array.from(files).forEach((file) => {
      const validTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf']
      if (!validTypes.includes(file.type)) {
        errors.push(`${file.name}: Invalid file type. Must be JPEG, PNG, or PDF`)
        return
      }

      if (file.size > 10 * 1024 * 1024) {
        errors.push(`${file.name}: File size must be less than 10MB`)
        return
      }

      validFiles.push(file)
    })

    if (errors.length > 0) {
      setError(errors.join(', '))
    }

    if (validFiles.length === 0) {
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      return
    }

    const newPreviews: FilePreview[] = []
    let imagesToLoad = 0
    let imagesLoaded = 0

    validFiles.forEach((file) => {
      const isImage = file.type.startsWith('image/')
      const preview: FilePreview = {
        file,
        preview: null,
        type: isImage ? 'image' : 'pdf'
      }

      if (isImage) {
        imagesToLoad++
        const reader = new FileReader()
        reader.onload = (e) => {
          preview.preview = e.target?.result as string
          imagesLoaded++
          if (imagesLoaded === imagesToLoad) {
            setFilePreviews([...newPreviews])
            setShowPreviewModal(true)
          }
        }
        reader.readAsDataURL(file)
      } else {
        newPreviews.push(preview)
        if (imagesToLoad === 0) {
          setFilePreviews([...newPreviews])
          setShowPreviewModal(true)
        }
      }

      newPreviews.push(preview)
    })

    if (imagesToLoad === 0) {
      setFilePreviews(newPreviews)
      setShowPreviewModal(true)
    }
  }

  const handleUpload = async () => {
    if (filePreviews.length === 0) return

    setUploading(true)
    setError(null)

    try {
      for (const filePreview of filePreviews) {
        const formData = new FormData()
        formData.append('file', filePreview.file)
        formData.append('type', documentType)

        const res = await fetch(`/api/staff/${staffId}/documents`, {
          method: 'POST',
          body: formData
        })

        if (!res.ok) {
          throw new Error(`Failed to upload ${filePreview.file.name}`)
        }
      }

      onUploadComplete()
      setFilePreviews([])
      setShowPreviewModal(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch (err: any) {
      setError(err.message || 'Failed to upload files. Please try again.')
      console.error('Upload error:', err)
    } finally {
      setUploading(false)
    }
  }

  const handleCancel = () => {
    setFilePreviews([])
    setShowPreviewModal(false)
    setError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleRemovePreview = (index: number) => {
    const newPreviews = filePreviews.filter((_, i) => i !== index)
    setFilePreviews(newPreviews)
    if (newPreviews.length === 0) {
      setShowPreviewModal(false)
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  return (
    <>
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Document Type
          </label>
          <select
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="sick-leave">Sick Leave</option>
            <option value="contract">Contract</option>
            <option value="id">ID/Passport</option>
            <option value="other">Other</option>
          </select>
        </div>
        <button
          type="button"
          onClick={handleClick}
          className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-semibold hover:bg-blue-700"
        >
          Upload Document
        </button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".jpg,.jpeg,.png,.pdf"
        onChange={handleFileSelect}
        className="hidden"
      />

      {showPreviewModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">Preview Documents</h3>
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-800 text-sm">
                {error}
              </div>
            )}
            <div className="space-y-4 mb-4">
              {filePreviews.map((preview, index) => (
                <div key={index} className="border border-gray-300 rounded p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">
                      {preview.file.name}
                    </span>
                    <button
                      onClick={() => handleRemovePreview(index)}
                      className="text-red-600 hover:text-red-800 text-sm"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="text-xs text-gray-500 mb-2">
                    {formatFileSize(preview.file.size)} • {preview.type.toUpperCase()}
                  </div>
                  {preview.preview && (
                    <img
                      src={preview.preview}
                      alt="Preview"
                      className="max-w-full h-auto max-h-48 rounded border border-gray-200"
                    />
                  )}
                  {preview.type === 'pdf' && (
                    <div className="text-center py-4 bg-gray-50 rounded">
                      <span className="text-gray-500">PDF Preview not available</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleCancel}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded font-semibold hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={uploading || filePreviews.length === 0}
                className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700 disabled:bg-gray-400"
              >
                {uploading ? 'Uploading...' : 'Upload'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

