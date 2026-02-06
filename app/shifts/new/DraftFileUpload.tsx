'use client'

import { useState, useRef } from 'react'

interface DraftFileUploadProps {
  type: 'deposit' | 'debit'
  currentUrls: string[]
  onUploadComplete: (urls: string[]) => void
}

interface FilePreview {
  file: File
  preview: string | null // URL for image preview, null for PDF
  type: 'image' | 'pdf'
}

export default function DraftFileUpload({ type, currentUrls, onUploadComplete }: DraftFileUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filePreviews, setFilePreviews] = useState<FilePreview[]>([])
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    // Validate files
    const validFiles: File[] = []
    const errors: string[] = []

    Array.from(files).forEach((file) => {
      // Validate file type
      const validTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf']
      if (!validTypes.includes(file.type)) {
        errors.push(`${file.name}: Invalid file type. Must be JPEG, PNG, or PDF`)
        return
      }

      // Validate file size (max 10MB)
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
      // Reset input so same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      return
    }

    // Create previews for all valid files
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
          
          // Update the preview in state
          setFilePreviews(prev => {
            const updated = prev.map(p => {
              if (p.file === preview.file) {
                return preview
              }
              return p
            })
            
            // When all images are loaded, show the modal
            if (imagesLoaded === imagesToLoad) {
              setTimeout(() => setShowPreviewModal(true), 0)
            }
            
            return updated
          })
        }
        reader.readAsDataURL(file)
      }
      
      newPreviews.push(preview)
    })

    // Set previews immediately (PDFs will show, images will update when loaded)
    setFilePreviews(newPreviews)

    // If there are no images, show modal immediately
    if (imagesToLoad === 0) {
      setShowPreviewModal(true)
    }

    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleUpload = async () => {
    if (filePreviews.length === 0) return

    setUploading(true)
    setError(null)
    setShowPreviewModal(false)

    try {
      const uploadPromises = filePreviews.map(async (filePreview) => {
        const formData = new FormData()
        formData.append('file', filePreview.file)
        formData.append('type', type)

        const res = await fetch('/api/shifts/draft-upload', {
          method: 'POST',
          body: formData
        })

        if (!res.ok) {
          const errorData = await res.json()
          throw new Error(errorData.error || `Failed to upload ${filePreview.file.name}`)
        }

        const data = await res.json()
        return data.url
      })

      const uploadedUrls = await Promise.all(uploadPromises)
      onUploadComplete([...currentUrls, ...uploadedUrls])
      setFilePreviews([]) // Clear previews after successful upload
    } catch (err: any) {
      setError(err.message || 'Failed to upload files. Please try again.')
      setShowPreviewModal(true) // Reopen modal on error
      console.error('Upload error:', err)
    } finally {
      setUploading(false)
    }
  }

  const handleCancel = () => {
    setFilePreviews([])
    setShowPreviewModal(false)
    setError(null)
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

  const handleRemove = (urlToRemove: string) => {
    onUploadComplete(currentUrls.filter(url => url !== urlToRemove))
  }

  const label = type === 'deposit' ? '📄 Deposit Scans' : '💳 Debit Scans'
  const description = type === 'deposit' 
    ? 'Upload deposit receipt scans or images'
    : 'Upload debit receipt scans or images'

  return (
    <>
      {/* Preview Modal */}
      {showPreviewModal && filePreviews.length > 0 && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-900">
                Review Files Before Upload
              </h3>
              <button
                onClick={handleCancel}
                className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            
            <div className="p-6">
              <p className="text-sm text-gray-600 mb-4">
                {filePreviews.length} file(s) selected. Review and confirm before uploading.
              </p>
              
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                  {error}
                </div>
              )}
              
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                {filePreviews.map((filePreview, index) => (
                  <div
                    key={index}
                    className="relative bg-gray-50 rounded-lg border border-gray-200 p-3"
                  >
                    {filePreview.type === 'image' && filePreview.preview ? (
                      <img
                        src={filePreview.preview}
                        alt={filePreview.file.name}
                        className="w-full h-48 object-contain rounded mb-2 bg-white"
                      />
                    ) : (
                      <div className="w-full h-48 flex flex-col items-center justify-center bg-white rounded mb-2">
                        <div className="text-5xl mb-2">📄</div>
                        <div className="text-xs text-gray-500">PDF Document</div>
                      </div>
                    )}
                    <div className="text-xs text-gray-700 font-medium truncate mb-1">
                      {filePreview.file.name}
                    </div>
                    <div className="text-xs text-gray-500">
                      {formatFileSize(filePreview.file.size)}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemovePreview(index)}
                      className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm hover:bg-red-600 font-bold"
                      aria-label="Remove"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              
              <div className="flex gap-3 justify-end border-t border-gray-200 pt-4">
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={uploading}
                  className="px-6 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 disabled:bg-gray-200 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleUpload}
                  disabled={uploading || filePreviews.length === 0}
                  className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 font-semibold"
                >
                  {uploading ? 'Uploading...' : `Upload ${filePreviews.length} File(s)`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 bg-gray-50 hover:border-blue-400 transition-colors">
        <label className="block text-sm font-semibold text-gray-700 mb-3">
          {label}
        </label>
        <div className="text-xs text-gray-500 mb-3">
          {description}
        </div>
        
        {/* Existing uploaded files */}
        {currentUrls.length > 0 && (
          <div className="space-y-2 mb-4">
            <div className="text-xs text-green-600 mb-2">✓ {currentUrls.length} file(s) uploaded</div>
            <div className="grid grid-cols-2 gap-2">
              {currentUrls.map((url, index) => (
                <div
                  key={index}
                  className="relative bg-white p-2 rounded border border-gray-200"
                >
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    {url.toLowerCase().endsWith('.pdf') ? (
                      <div className="text-center py-4">
                        <div className="text-3xl mb-2">📄</div>
                        <div className="text-xs text-gray-600">PDF Document</div>
                      </div>
                    ) : (
                      <img
                        src={url}
                        alt={`Preview ${index + 1}`}
                        className="w-full h-32 object-contain rounded"
                      />
                    )}
                  </a>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRemove(url)
                    }}
                    className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm hover:bg-red-600"
                    aria-label="Remove file"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* File selection */}
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/jpg,application/pdf"
            onChange={handleFileSelect}
            disabled={uploading}
            multiple
            className="hidden"
          />
          
          {/* Upload area */}
          {filePreviews.length === 0 && (
            <div
              onClick={handleClick}
              className="text-center py-8 border-2 border-dashed border-gray-300 rounded bg-white hover:bg-blue-50 hover:border-blue-400 transition-colors cursor-pointer"
            >
              {uploading ? (
                <div className="space-y-2">
                  <div className="text-2xl">⏳</div>
                  <span className="text-sm text-gray-600 block">Uploading...</span>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-4xl mb-2">📤</div>
                  <span className="text-sm text-blue-600 hover:text-blue-800 block font-medium">
                    Click to select files
                  </span>
                  <span className="text-xs text-gray-500 block">
                    PDF or Images only (max 10MB each)
                  </span>
                  <span className="text-xs text-gray-400 block mt-1">
                    Select multiple files
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
