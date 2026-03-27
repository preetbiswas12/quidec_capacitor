/**
 * Message encryption using Web Crypto API (AES-GCM)
 * All messages encrypted before storage in IndexedDB
 */

/**
 * Derive encryption key from seed/password
 */
export async function deriveKey(seed) {
  const encoder = new TextEncoder()
  const data = encoder.encode(seed)

  const importedKey = await window.crypto.subtle.importKey('raw', data, 'PBKDF2', false, [
    'deriveBits',
  ])

  const derivedBits = await window.crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: new Uint8Array(16), // Fixed salt for consistency
      iterations: 100000,
      hash: 'SHA-256',
    },
    importedKey,
    256
  )

  return await window.crypto.subtle.importKey('raw', derivedBits, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ])
}

/**
 * Get or create encryption key from local session
 * Uses browser's SubtleCrypto for secure operations
 */
let cachedKey = null

export async function getEncryptionKey(userId) {
  if (cachedKey) return cachedKey

  // In production, derive from userId + device fingerprint
  try {
    cachedKey = await deriveKey(userId)
    return cachedKey
  } catch (err) {
    console.error('❌ Failed to derive encryption key:', err)
    throw err
  }
}

/**
 * Encrypt a message
 */
export async function encryptMessage(message, encryptionKey) {
  try {
    const encoder = new TextEncoder()
    const data = encoder.encode(JSON.stringify(message))

    // Generate random IV for each message
    const iv = window.crypto.getRandomValues(new Uint8Array(12))

    const encrypted = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, encryptionKey, data)

    // Combine IV + encrypted data
    const combined = new Uint8Array(iv.length + encrypted.byteLength)
    combined.set(iv)
    combined.set(new Uint8Array(encrypted), iv.length)

    // Return as base64 for storage
    return btoa(String.fromCharCode.apply(null, combined))
  } catch (err) {
    console.error('❌ Encryption failed:', err)
    throw err
  }
}

/**
 * Decrypt a message
 */
export async function decryptMessage(encryptedData, encryptionKey) {
  try {
    // Decode from base64
    const combined = new Uint8Array(
      atob(encryptedData)
        .split('')
        .map((c) => c.charCodeAt(0))
    )

    // Extract IV (first 12 bytes)
    const iv = combined.slice(0, 12)
    const encrypted = combined.slice(12)

    const decrypted = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      encryptionKey,
      encrypted
    )

    const decoder = new TextDecoder()
    const data = decoder.decode(decrypted)

    return JSON.parse(data)
  } catch (err) {
    console.error('❌ Decryption failed:', err)
    throw err
  }
}

/**
 * Generate integrity hash for media files
 */
export async function generateHash(data) {
  try {
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(data))
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  } catch (err) {
    console.error('❌ Hash generation failed:', err)
    throw err
  }
}

/**
 * Encrypt sensitive metadata (URLs, etc)
 */
export async function encryptMetadata(metadata, key) {
  return encryptMessage(metadata, key)
}

export async function decryptMetadata(encryptedMetadata, key) {
  return decryptMessage(encryptedMetadata, key)
}
