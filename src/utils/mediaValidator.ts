/**
 * Media Upload Validation
 * Validates file size, type, dimensions, and prevents DoS attacks
 * 
 * Constraints:
 * - Images: 10MB max, JPEG/PNG/WebP only
 * - Videos: 50MB max, MP4/WebM only
 * - Audio: 20MB max, MP3/WAV/OGG only
 * - Dimensions: Max 8000x8000 for images
 * - Prevents simultaneous uploads
 */

import logger from './logger';
import { reportError } from './errorMonitoring';

export interface ValidationResult {
  valid: boolean;
  error?: string;
  file?: File;
  metadata?: {
    size: number;
    type: string;
    width?: number;
    height?: number;
    duration?: number;
  };
}

// File type constraints
const FILE_CONSTRAINTS = {
  image: {
    maxSize: 10 * 1024 * 1024, // 10MB
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    extensions: ['jpg', 'jpeg', 'png', 'webp'],
    maxDimensions: { width: 8000, height: 8000 },
  },
  video: {
    maxSize: 50 * 1024 * 1024, // 50MB
    mimeTypes: ['video/mp4', 'video/webm'],
    extensions: ['mp4', 'webm'],
  },
  audio: {
    maxSize: 20 * 1024 * 1024, // 20MB
    mimeTypes: ['audio/mpeg', 'audio/wav', 'audio/ogg'],
    extensions: ['mp3', 'wav', 'ogg'],
  },
};

class MediaValidator {
  private activeUploads = new Map<string, AbortController>();
  private totalUploadSize = 0;
  private maxConcurrentUploads = 3;
  private maxTotalUploadSize = 200 * 1024 * 1024; // 200MB total across all uploads

  /**
   * Validate file before upload
   */
  async validateFile(file: File, type: 'image' | 'video' | 'audio'): Promise<ValidationResult> {
    // Check file exists
    if (!file || !(file instanceof File)) {
      return { valid: false, error: 'Invalid file object' };
    }

    // Check concurrent upload limit
    if (this.activeUploads.size >= this.maxConcurrentUploads) {
      return {
        valid: false,
        error: `Too many uploads in progress (max ${this.maxConcurrentUploads})`,
      };
    }

    // Check total upload size
    if (this.totalUploadSize + file.size > this.maxTotalUploadSize) {
      return {
        valid: false,
        error: 'Total upload size exceeded',
      };
    }

    // Get constraints for type
    const constraints = FILE_CONSTRAINTS[type];
    if (!constraints) {
      return { valid: false, error: `Unknown file type: ${type}` };
    }

    // Validate file size
    if (file.size === 0) {
      return { valid: false, error: 'File is empty' };
    }

    if (file.size > constraints.maxSize) {
      const maxMB = constraints.maxSize / (1024 * 1024);
      return {
        valid: false,
        error: `File too large (max ${Math.round(maxMB)}MB)`,
      };
    }

    // Validate MIME type
    if (!constraints.mimeTypes.includes(file.type)) {
      return {
        valid: false,
        error: `Invalid file type: ${file.type}. Allowed: ${constraints.mimeTypes.join(', ')}`,
      };
    }

    // Validate file extension
    const ext = this.getFileExtension(file.name);
    if (!constraints.extensions.includes(ext.toLowerCase())) {
      return {
        valid: false,
        error: `Invalid file extension: .${ext}`,
      };
    }

    // Additional validation for images
    let dimensionCheck: ValidationResult | undefined;
    if (type === 'image') {
      const imageConstraints = constraints as any; // Cast to access image-specific properties
      dimensionCheck = await this.validateImageDimensions(
        file,
        imageConstraints.maxDimensions || { width: 8000, height: 8000 }
      );
      if (!dimensionCheck.valid) {
        return dimensionCheck;
      }
    }

    logger.info('mediaValidator', `File validated: ${file.name} (${file.size} bytes)`);
    return {
      valid: true,
      file,
      metadata: {
        size: file.size,
        type: file.type,
        ...(dimensionCheck?.metadata || {}),
      },
    };
  }

  /**
   * Validate image dimensions
   */
  private async validateImageDimensions(
    file: File,
    maxDimensions: { width: number; height: number }
  ): Promise<ValidationResult> {
    return new Promise((resolve) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        const img = new Image();

        img.onload = () => {
          if (img.width > maxDimensions.width || img.height > maxDimensions.height) {
            resolve({
              valid: false,
              error: `Image dimensions too large (${img.width}x${img.height}, max ${maxDimensions.width}x${maxDimensions.height})`,
            });
          } else {
            resolve({
              valid: true,
              metadata: { size: file.size, type: file.type, width: img.width, height: img.height },
            });
          }
        };

        img.onerror = () => {
          resolve({ valid: false, error: 'Failed to read image dimensions' });
        };

        img.src = e.target?.result as string;
      };

      reader.onerror = () => {
        resolve({ valid: false, error: 'Failed to read file' });
      };

      reader.readAsDataURL(file);
    });
  }

  /**
   * Register active upload
   */
  registerUpload(uploadId: string, abortController: AbortController, fileSize: number): void {
    this.activeUploads.set(uploadId, abortController);
    this.totalUploadSize += fileSize;
    logger.debug('mediaValidator', `Upload registered: ${uploadId} (${this.activeUploads.size} active)`);
  }

  /**
   * Unregister completed upload
   */
  unregisterUpload(uploadId: string, fileSize: number): void {
    this.activeUploads.delete(uploadId);
    this.totalUploadSize = Math.max(0, this.totalUploadSize - fileSize);
    logger.debug('mediaValidator', `Upload unregistered: ${uploadId} (${this.activeUploads.size} active)`);
  }

  /**
   * Cancel upload by ID
   */
  cancelUpload(uploadId: string): void {
    const abort = this.activeUploads.get(uploadId);
    if (abort) {
      abort.abort();
      logger.info('mediaValidator', `Upload cancelled: ${uploadId}`);
    }
  }

  /**
   * Cancel all uploads
   */
  cancelAllUploads(): void {
    this.activeUploads.forEach((abort) => abort.abort());
    this.activeUploads.clear();
    this.totalUploadSize = 0;
    logger.info('mediaValidator', 'All uploads cancelled');
  }

  /**
   * Get active upload count
   */
  getActiveUploadCount(): number {
    return this.activeUploads.size;
  }

  /**
   * Get total upload size
   */
  getTotalUploadSize(): number {
    return this.totalUploadSize;
  }

  /**
   * Helper: get file extension
   */
  private getFileExtension(filename: string): string {
    return filename.split('.').pop() || '';
  }

  /**
   * Get validation stats
   */
  getStats() {
    return {
      activeUploads: this.activeUploads.size,
      totalUploadSize: this.totalUploadSize,
      totalUploadSizeMB: (this.totalUploadSize / (1024 * 1024)).toFixed(2),
      maxConcurrentUploads: this.maxConcurrentUploads,
      maxTotalUploadSize: this.maxTotalUploadSize,
      maxTotalUploadSizeMB: (this.maxTotalUploadSize / (1024 * 1024)).toFixed(0),
    };
  }
}

// Singleton instance
export const mediaValidator = new MediaValidator();

/**
 * Validate file and report errors
 */
export async function validateAndReportFile(
  file: File,
  type: 'image' | 'video' | 'audio'
): Promise<ValidationResult> {
  const result = await mediaValidator.validateFile(file, type);

  if (!result.valid) {
    reportError(result.error || 'File validation failed', {
      component: 'mediaValidator',
      operation: 'file_validation',
      severity: 'warning',
      extra: {
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        requestedType: type,
      },
    });
  }

  return result;
}
