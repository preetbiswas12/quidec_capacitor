/**
 * Example: Encrypted Media Display Component
 * Shows how to display decrypted images/videos in the UI
 * Handles loading states and error boundaries
 */

import React from 'react'
import { useEncryptedMedia } from '../hooks/useEncryptedMedia'

interface EncryptedMediaDisplayProps {
  fileId: string | null
  mediaType: 'image' | 'video' | 'audio'
  currentUserId: string
  otherUserId: string
  alt?: string
  maxHeight?: number
  maxWidth?: number
  onError?: (error: Error) => void
}

export function EncryptedMediaDisplay({
  fileId,
  mediaType,
  currentUserId,
  otherUserId,
  alt = 'Encrypted media',
  maxHeight = 400,
  maxWidth = '100%',
  onError,
}: EncryptedMediaDisplayProps) {
  const { displayUrl, loading, error } = useEncryptedMedia(fileId, mediaType, {
    user1: currentUserId,
    user2: otherUserId,
    onError,
  })

  if (!fileId) {
    return <div className="text-gray-500 text-sm">No media</div>
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center bg-gray-100 rounded" style={{ height: maxHeight }}>
        <div className="text-center">
          <div className="inline-block">
            <svg className="animate-spin h-8 w-8 text-gray-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>
          <p className="text-sm text-gray-600 mt-2">Decrypting media...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center bg-red-50 rounded border border-red-200 p-4">
        <div className="text-center">
          <p className="text-sm font-semibold text-red-700">Failed to load media</p>
          <p className="text-xs text-red-600 mt-1">{error.message}</p>
        </div>
      </div>
    )
  }

  if (!displayUrl) {
    return <div className="text-gray-500 text-sm">Media not ready</div>
  }

  return (
    <div className="encrypted-media-container rounded overflow-hidden">
      {mediaType === 'image' && (
        <img
          src={displayUrl}
          alt={alt}
          style={{ maxHeight, maxWidth, objectFit: 'contain' }}
          className="rounded"
        />
      )}

      {mediaType === 'video' && (
        <video
          src={displayUrl}
          controls
          style={{ maxHeight, maxWidth }}
          className="rounded bg-black"
        >
          Your browser does not support the video tag.
        </video>
      )}

      {mediaType === 'audio' && (
        <audio
          src={displayUrl}
          controls
          className="w-full"
          style={{ maxWidth }}
        >
          Your browser does not support the audio tag.
        </audio>
      )}
    </div>
  )
}

export default EncryptedMediaDisplay
