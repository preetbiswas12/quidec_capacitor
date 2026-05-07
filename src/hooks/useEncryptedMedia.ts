/**
 * React Hook for Encrypted Chunked Media
 * Simplifies media loading, caching, and display in UI components
 */

import { useState, useEffect, useCallback } from 'react'
import { loadMediaWithCache, deleteMediaFile, mediaCache, StoredMediaReference } from '../utils/mediaUploadHandler'

export interface UseEncryptedMediaOptions {
  user1: string
  user2: string
  onError?: (error: Error) => void
}

/**
 * Hook to load and display encrypted media
 * Handles caching, loading states, and error handling
 */
export function useEncryptedMedia(
  fileId: string | null,
  mediaType: 'image' | 'video' | 'audio',
  options: UseEncryptedMediaOptions
) {
  const [displayUrl, setDisplayUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!fileId) {
      setDisplayUrl(null)
      return
    }

    const loadMedia = async () => {
      setLoading(true)
      setError(null)

      try {
        const url = await loadMediaWithCache(fileId, mediaType, options.user1, options.user2)
        setDisplayUrl(url)
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        setError(error)
        options.onError?.(error)
      } finally {
        setLoading(false)
      }
    }

    loadMedia()

    // Cleanup: Revoke URL on unmount
    return () => {
      // Note: Don't revoke here as it might be used elsewhere
      // The mediaCache handles TTL and cleanup
    }
  }, [fileId, mediaType, options.user1, options.user2, options])

  return { displayUrl, loading, error }
}

/**
 * Hook for managing multiple encrypted media files
 * Useful for chat lists with multiple attachments
 */
export function useEncryptedMediaBatch(
  mediaReferences: Array<{ fileId: string; mediaType: 'image' | 'video' | 'audio' }>,
  options: UseEncryptedMediaOptions
) {
  const [mediaMap, setMediaMap] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError(null)

    const newMap = new Map<string, string>()

    for (const { fileId, mediaType } of mediaReferences) {
      try {
        const url = await loadMediaWithCache(fileId, mediaType, options.user1, options.user2)
        newMap.set(fileId, url)
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        console.error(`Failed to load media ${fileId}:`, error)
      }
    }

    setMediaMap(newMap)
    setLoading(false)
  }, [mediaReferences, options.user1, options.user2, options])

  useEffect(() => {
    if (mediaReferences.length > 0) {
      loadAll()
    }
  }, [mediaReferences, loadAll])

  const getMediaUrl = useCallback(
    (fileId: string): string | undefined => {
      return mediaMap.get(fileId)
    },
    [mediaMap]
  )

  return { mediaMap, loading, error, getMediaUrl, reload: loadAll }
}

/**
 * Hook for media upload with progress tracking
 */
export function useMediaUpload(options: UseEncryptedMediaOptions) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<Error | null>(null)
  const [uploadedMedia, setUploadedMedia] = useState<StoredMediaReference | null>(null)

  const upload = useCallback(
    async (file: File, mediaType: 'image' | 'video' | 'audio') => {
      setUploading(true)
      setProgress(0)
      setError(null)

      try {
        const { uploadMediaWithProgress } = await import('../utils/mediaUploadHandler')

        const result = await uploadMediaWithProgress(
          file,
          mediaType,
          options.user1,
          options.user2,
          (progress) => {
            setProgress(progress.percentComplete)
          }
        )

        setUploadedMedia(result)
        return result
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        setError(error)
        options.onError?.(error)
        throw error
      } finally {
        setUploading(false)
      }
    },
    [options]
  )

  return { uploading, progress, error, uploadedMedia, upload }
}

/**
 * Hook to delete encrypted media
 */
export function useMediaDelete(options: UseEncryptedMediaOptions) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const deleteMedia = useCallback(
    async (fileId: string, totalChunks: number) => {
      setDeleting(true)
      setError(null)

      try {
        await deleteMediaFile(fileId, totalChunks)
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        setError(error)
        options.onError?.(error)
        throw error
      } finally {
        setDeleting(false)
      }
    },
    [options]
  )

  return { deleting, error, deleteMedia }
}

/**
 * Hook to manage media cache
 */
export function useMediaCache() {
  const [cacheSize, setCacheSize] = useState(mediaCache.size())

  const clearCache = useCallback(() => {
    mediaCache.clear()
    setCacheSize(0)
  }, [])

  const getCacheSize = useCallback(() => {
    return mediaCache.size()
  }, [])

  return { cacheSize, clearCache, getCacheSize }
}
