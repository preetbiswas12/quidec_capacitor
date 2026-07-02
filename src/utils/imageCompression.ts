import logger from './logger';

export interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
}

const DEFAULT_OPTIONS: Required<CompressionOptions> = {
  maxWidth: 1920,
  maxHeight: 1080,
  quality: 0.82,
};

function getMimeType(file: File): string {
  if (file.type === 'image/png') return 'image/png';
  return 'image/jpeg';
}

function clampDimensions(
  width: number,
  height: number,
  maxW: number,
  maxH: number,
): { width: number; height: number } {
  if (width <= maxW && height <= maxH) return { width, height };

  const aspectRatio = width / height;
  let newWidth = width;
  let newHeight = height;

  if (width > maxW) {
    newWidth = maxW;
    newHeight = Math.round(maxW / aspectRatio);
  }
  if (newHeight > maxH) {
    newHeight = maxH;
    newWidth = Math.round(maxH * aspectRatio);
  }

  return { width: newWidth, height: newHeight };
}

function blobToFile(blob: Blob, original: File): File {
  const ext = getMimeType(original) === 'image/png' ? '.png' : '.jpg';
  const baseName = original.name.replace(/\.[^.]+$/, '');
  return new File([blob], `${baseName}${ext}`, { type: blob.type, lastModified: Date.now() });
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image for compression'));
    img.src = URL.createObjectURL(file);
  });
}

function imageToBlob(
  img: HTMLImageElement,
  width: number,
  height: number,
  mimeType: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return reject(new Error('Canvas 2D context not available'));

    ctx.drawImage(img, 0, 0, width, height);

    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas toBlob returned null'));
      },
      mimeType,
      mimeType === 'image/png' ? undefined : quality,
    );
  });
}

export async function compressImage(
  file: File,
  options?: CompressionOptions,
): Promise<File> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  let img: HTMLImageElement;
  try {
    img = await loadImage(file);
  } catch (err) {
    logger.warn('imageCompression', `Failed to load image, returning original: ${err}`);
    return file;
  }

  const { width: drawW, height: drawH } = clampDimensions(
    img.width,
    img.height,
    opts.maxWidth,
    opts.maxHeight,
  );

  const mimeType = getMimeType(file);

  let blob: Blob;
  try {
    blob = await imageToBlob(img, drawW, drawH, mimeType, opts.quality);
  } catch (err) {
    logger.warn('imageCompression', `Canvas compression failed, returning original: ${err}`);
    return file;
  } finally {
    URL.revokeObjectURL(img.src);
  }

  if (blob.size >= file.size) {
    logger.info('imageCompression', `Compressed version is larger (${blob.size}B vs ${file.size}B), keeping original`);
    return file;
  }

  const saved = file.size - blob.size;
  const savedPercent = ((saved / file.size) * 100).toFixed(1);
  logger.info(
    'imageCompression',
    `Compressed ${file.name}: ${(file.size / 1024).toFixed(0)}KB → ${(blob.size / 1024).toFixed(0)}KB (${savedPercent}% saved)`,
  );

  return blobToFile(blob, file);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
