/**
 * Media file handling using Capacitor Filesystem
 * Stores files in private app directory, not gallery
 */

import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { convertFileSrc } from '@capacitor/core'

export const MEDIA_PATHS = {
  IMAGES: 'media/images',
  VIDEOS: 'media/videos',
  AUDIO: 'media/audio',
  TEMP: 'temp',
}

/**
 * Save image/video to private app storage
 */
export async function saveMediaFile(base64Data, mediaType, filename) {
  try {
    // Create filename with timestamp if not provided
    if (!filename) {
      const timestamp = Date.now()
      filename =
        mediaType === 'image'
          ? `img_${timestamp}.jpg`
          : mediaType === 'video'
            ? `vid_${timestamp}.mp4`
            : `aud_${timestamp}.m4a`
    }

    // Determine directory
    const directory =
      mediaType === 'image'
        ? MEDIA_PATHS.IMAGES
        : mediaType === 'video'
          ? MEDIA_PATHS.VIDEOS
          : MEDIA_PATHS.AUDIO

    // Save file
    const result = await Filesystem.writeFile({
      path: `${directory}/${filename}`,
      data: base64Data,
      directory: Directory.Documents,
      recursive: true,
    })

    console.log(`✅ ${mediaType} saved:`, result.uri)
    return result.uri
  } catch (err) {
    console.error(`❌ Failed to save ${mediaType}:`, err)
    throw err
  }
}

/**
 * Get accessible file URI for WebView
 * Use this for displaying images/videos in the app
 */
export function getFileSourceUri(filePath) {
  try {
    return convertFileSrc(filePath)
  } catch (err) {
    console.error('❌ Failed to convert file source:', err)
    return filePath // Fallback to original path
  }
}

/**
 * Read file from storage
 */
export async function readMediaFile(filename, mediaType) {
  try {
    const directory =
      mediaType === 'image'
        ? MEDIA_PATHS.IMAGES
        : mediaType === 'video'
          ? MEDIA_PATHS.VIDEOS
          : MEDIA_PATHS.AUDIO

    const result = await Filesystem.readFile({
      path: `${directory}/${filename}`,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    })

    return result.data
  } catch (err) {
    console.error(`❌ Failed to read ${mediaType}:`, err)
    throw err
  }
}

/**
 * Delete media file
 */
export async function deleteMediaFile(filename, mediaType) {
  try {
    const directory =
      mediaType === 'image'
        ? MEDIA_PATHS.IMAGES
        : mediaType === 'video'
          ? MEDIA_PATHS.VIDEOS
          : MEDIA_PATHS.AUDIO

    await Filesystem.deleteFile({
      path: `${directory}/${filename}`,
      directory: Directory.Documents,
    })

    console.log(`✅ ${mediaType} deleted:`, filename)
  } catch (err) {
    console.error(`❌ Failed to delete ${mediaType}:`, err)
  }
}

/**
 * List all images
 */
export async function listMediaFiles(mediaType) {
  try {
    const directory =
      mediaType === 'image'
        ? MEDIA_PATHS.IMAGES
        : mediaType === 'video'
          ? MEDIA_PATHS.VIDEOS
          : MEDIA_PATHS.AUDIO

    const result = await Filesystem.readdir({
      path: directory,
      directory: Directory.Documents,
    })

    return result.files || []
  } catch (err) {
    console.error(`❌ Failed to list ${mediaType} files:`, err)
    return []
  }
}

/**
 * Delete old media files (older than days)
 */
export async function cleanupOldMedia(days = 30, mediaType = 'image') {
  try {
    const files = await listMediaFiles(mediaType)
    const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000

    for (const file of files) {
      // Parse timestamp from filename if using standard format
      const match = file.name.match(/(\d+)/)
      if (match) {
        const timestamp = parseInt(match[1])
        if (timestamp < cutoffTime) {
          await deleteMediaFile(file.name, mediaType)
          console.log(`✅ Cleaned up old ${mediaType}:`, file.name)
        }
      }
    }
  } catch (err) {
    console.error(`❌ Failed to cleanup old media:`, err)
  }
}

/**
 * Get storage usage
 */
export async function getStorageUsage() {
  try {
    const directories = [
      MEDIA_PATHS.IMAGES,
      MEDIA_PATHS.VIDEOS,
      MEDIA_PATHS.AUDIO,
      MEDIA_PATHS.TEMP,
    ]

    let totalSize = 0

    for (const dir of directories) {
      try {
        const files = await listMediaFiles(dir)
        // Note: Filesystem API doesn't provide file size directly
        // This is a simplified counter
        totalSize += files.length
      } catch (err) {
        // Directory might not exist yet
      }
    }

    return {
      totalFiles: totalSize,
      estimatedSize: `${(totalSize * 100) / (1024 * 1024)}MB`, // Rough estimate
    }
  } catch (err) {
    console.error('❌ Failed to get storage usage:', err)
    return { totalFiles: 0, estimatedSize: '0MB' }
  }
}

/**
 * Share media file (Android Share Sheet)
 */
export async function shareMediaFile(filename, mediaType) {
  try {
    // This requires additional implementation for Android intent handling
    const uri = await getFileUri(filename, mediaType)
    console.log('📤 Share file:', uri)
    // TODO: Implement via Capacitor Share plugin or Android intent bridge
  } catch (err) {
    console.error('❌ Failed to share file:', err)
  }
}

/**
 * Get full file path (internal use)
 */
async function getFileUri(filename, mediaType) {
  const directory =
    mediaType === 'image'
      ? MEDIA_PATHS.IMAGES
      : mediaType === 'video'
        ? MEDIA_PATHS.VIDEOS
        : MEDIA_PATHS.AUDIO

  const result = await Filesystem.getUri({
    path: `${directory}/${filename}`,
    directory: Directory.Documents,
  })

  return result.uri
}

/**
 * Compress image before saving (to reduce storage)
 */
export async function compressImage(imageData, maxWidth = 640, maxHeight = 640) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.src = imageData

    img.onload = () => {
      const canvas = document.createElement('canvas')
      let width = img.width
      let height = img.height

      // Calculate new dimensions
      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width)
          width = maxWidth
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height)
          height = maxHeight
        }
      }

      canvas.width = width
      canvas.height = height

      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, width, height)

      // Compress to JPEG
      const compressed = canvas.toDataURL('image/jpeg', 0.7)
      resolve(compressed)
    }

    img.onerror = () => reject(new Error('Failed to load image'))
  })
}
