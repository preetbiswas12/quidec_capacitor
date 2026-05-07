/**
 * Example: Encrypted Media Upload Component
 * Shows how to upload media with progress tracking
 * Integrates with encrypted chunked storage system
 */

import React, { useState, useRef } from 'react'
import { useMediaUpload, useEncryptedMedia } from '../hooks/useEncryptedMedia'

interface EncryptedMediaUploadProps {
  mediaType: 'image' | 'video' | 'audio'
  currentUserId: string
  otherUserId: string
  onUploadComplete?: (fileId: string, mediaType: string) => void
  onError?: (error: Error) => void
  acceptedFormats?: string // e.g., "image/*" or ".jpg,.png"
}

export function EncryptedMediaUpload({
  mediaType,
  currentUserId,
  otherUserId,
  onUploadComplete,
  onError,
  acceptedFormats,
}: EncryptedMediaUploadProps) {
  const [preview, setPreview] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { uploading, progress, error: uploadError, uploadedMedia, upload } = useMediaUpload({
    user1: currentUserId,
    user2: otherUserId,
    onError,
  })

  const defaultFormats = {
    image: 'image/*',
    video: 'video/*',
    audio: 'audio/*',
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setSelectedFile(file)

    // Create preview for images
    if (mediaType === 'image') {
      const reader = new FileReader()
      reader.onload = (e) => {
        setPreview(e.target?.result as string)
      }
      reader.readAsDataURL(file)
    } else {
      setPreview(null)
    }
  }

  const handleUpload = async () => {
    if (!selectedFile) {
      alert('Please select a file first')
      return
    }

    try {
      const result = await upload(selectedFile, mediaType)
      onUploadComplete?.(result.fileId, result.mediaType)

      // Reset form
      setSelectedFile(null)
      setPreview(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch (err) {
      console.error('Upload failed:', err)
    }
  }

  const handleCancel = () => {
    setSelectedFile(null)
    setPreview(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const getMediaTypeLabel = () => {
    const labels = {
      image: 'Image',
      video: 'Video',
      audio: 'Audio',
    }
    return labels[mediaType]
  }

  return (
    <div className="encrypted-media-upload border-2 border-dashed border-gray-300 rounded-lg p-6">
      <div className="space-y-4">
        {/* File Input */}
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept={acceptedFormats || defaultFormats[mediaType]}
            onChange={handleFileSelect}
            disabled={uploading}
            className="hidden"
          />

          {!selectedFile ? (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full py-8 border-2 border-dashed border-gray-300 rounded-lg hover:border-gray-400 disabled:opacity-50 transition"
            >
              <div className="text-center">
                <svg
                  className="mx-auto h-12 w-12 text-gray-400"
                  stroke="currentColor"
                  fill="none"
                  viewBox="0 0 48 48"
                >
                  <path
                    d="M28 8H12a4 4 0 00-4 4v20m32-12v12a4 4 0 01-4 4H12a4 4 0 01-4-4V12a4 4 0 014-4h16m0-4v16m0 0L28 20m4 4l-4-4"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <p className="mt-2 text-sm font-medium text-gray-700">
                  Click to select {getMediaTypeLabel().toLowerCase()}
                </p>
                <p className="text-xs text-gray-500">
                  File will be encrypted in chunks on your device
                </p>
              </div>
            </button>
          ) : (
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-700">{selectedFile.name}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>

                  {/* Preview */}
                  {preview && mediaType === 'image' && (
                    <div className="mt-3">
                      <img
                        src={preview}
                        alt="Preview"
                        className="max-h-32 rounded"
                      />
                    </div>
                  )}
                </div>

                {!uploading && (
                  <button
                    onClick={handleCancel}
                    className="text-gray-400 hover:text-gray-600 ml-2"
                  >
                    <svg
                      className="w-5 h-5"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Progress Bar */}
        {uploading && (
          <div>
            <div className="mb-2 flex justify-between text-sm">
              <span className="text-gray-600">Encrypting and uploading...</span>
              <span className="font-medium text-gray-900">{progress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          </div>
        )}

        {/* Error Message */}
        {uploadError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm font-medium text-red-800">Upload failed</p>
            <p className="text-xs text-red-700 mt-1">{uploadError.message}</p>
          </div>
        )}

        {/* Success Message */}
        {uploadedMedia && !uploading && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <p className="text-sm font-medium text-green-800">✅ Upload complete</p>
            <p className="text-xs text-green-700 mt-1">
              Media encrypted in {uploadedMedia.totalChunks} chunks
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          {selectedFile && !uploading && (
            <>
              <button
                onClick={handleUpload}
                className="flex-1 bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition font-medium"
              >
                Upload & Encrypt
              </button>
              <button
                onClick={handleCancel}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              >
                Cancel
              </button>
            </>
          )}

          {uploading && (
            <button
              disabled
              className="flex-1 bg-gray-400 text-white px-4 py-2 rounded-lg cursor-not-allowed opacity-50"
            >
              Uploading...
            </button>
          )}

          {!selectedFile && !uploading && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition font-medium"
            >
              Select {getMediaTypeLabel()}
            </button>
          )}
        </div>

        {/* Info */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
          <strong>🔐 Privacy:</strong> Media is encrypted in chunks using AES-256 and verified with SHA-256.
          Files are stored on your device only.
        </div>
      </div>
    </div>
  )
}

export default EncryptedMediaUpload
