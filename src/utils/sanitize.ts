/**
 * Input Sanitization Utilities
 * Defense-in-depth layer for URL and text sanitization.
 */

/**
 * Validates a URL to ensure it uses a safe protocol (http/https only).
 * Blocks javascript:, data:, vbscript:, and other dangerous protocols.
 */
export function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Sanitizes a URL for use in href attributes.
 * Returns the URL if safe, or '#' if not.
 */
export function sanitizeUrl(url: string | undefined | null): string {
  if (!url) return '#';
  return isSafeUrl(url) ? url : '#';
}

/**
 * Sanitizes text content for safe display.
 * Strips any HTML tags and normalizes whitespace.
 * Defense-in-depth: React already escapes JSX text, but this
 * provides an additional layer for data from external sources.
 */
export function sanitizeText(text: string | undefined | null): string {
  if (!text) return '';
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
