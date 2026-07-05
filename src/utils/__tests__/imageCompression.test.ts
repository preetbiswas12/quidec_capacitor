import { describe, it, expect } from 'vitest';
import { formatBytes } from '../imageCompression';

describe('formatBytes', () => {
  it('formats bytes under 1KB', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1)).toBe('1 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1023)).toBe('1023 B');
  });

  it('formats kilobytes', () => {
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('2 KB');
    expect(formatBytes(10240)).toBe('10 KB');
    expect(formatBytes(1048575)).toBe('1024 KB');
  });

  it('formats megabytes', () => {
    expect(formatBytes(1048576)).toBe('1.0 MB');
    expect(formatBytes(2621440)).toBe('2.5 MB');
    expect(formatBytes(5242880)).toBe('5.0 MB');
  });

  it('rounds KB to nearest integer', () => {
    expect(formatBytes(1500)).toBe('1 KB');
    expect(formatBytes(1900)).toBe('2 KB');
  });

  it('rounds MB to one decimal', () => {
    expect(formatBytes(1572864)).toBe('1.5 MB');
    expect(formatBytes(3670016)).toBe('3.5 MB');
  });
});
