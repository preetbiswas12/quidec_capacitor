import { describe, it, expect } from 'vitest';
import { getMessagePreview, getReplyPreviewText } from '../ChatWindow';
import type { Message } from '../../context/AppContext';

function baseMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'msg-1',
    chatId: 'chat-1',
    content: 'Hello world',
    type: 'text',
    senderId: 'user-1',
    timestamp: new Date().toISOString(),
    status: 'delivered',
    ...overrides,
  };
}

describe('getMessagePreview', () => {
  it('returns content for text messages', () => {
    const msg = baseMessage({ type: 'text', content: 'Hi there' });
    expect(getMessagePreview(msg)).toBe('Hi there');
  });

  it('returns fallback emoji for image messages', () => {
    const msg = baseMessage({ type: 'image' });
    expect(getMessagePreview(msg)).toBe('📷 Photo');
  });

  it('returns fallback emoji for video messages', () => {
    const msg = baseMessage({ type: 'video' });
    expect(getMessagePreview(msg)).toBe('🎥 Video');
  });

  it('returns fallback emoji for audio messages', () => {
    const msg = baseMessage({ type: 'audio' });
    expect(getMessagePreview(msg)).toBe('🎵 Audio');
  });

  it('returns content for document messages when content exists', () => {
    const msg = baseMessage({ type: 'document', content: 'report.pdf' });
    expect(getMessagePreview(msg)).toBe('report.pdf');
  });

  it('returns fallback emoji for document messages when content is empty', () => {
    const msg = baseMessage({ type: 'document', content: '' });
    expect(getMessagePreview(msg)).toBe('📎 Document');
  });

  it('returns link with title for link messages when linkTitle exists', () => {
    const msg = baseMessage({
      type: 'link',
      content: 'https://example.com',
      linkTitle: 'Example Site',
      linkUrl: 'https://example.com',
    });
    expect(getMessagePreview(msg)).toBe('🔗 Example Site');
  });

  it('returns link with url for link messages when linkTitle is missing', () => {
    const msg = baseMessage({
      type: 'link',
      content: 'https://example.com',
      linkUrl: 'https://example.com',
    });
    expect(getMessagePreview(msg)).toBe('🔗 https://example.com');
  });

  it('falls back to content for link messages when linkTitle and linkUrl are missing', () => {
    const msg = baseMessage({
      type: 'link',
      content: 'click me',
    });
    expect(getMessagePreview(msg)).toBe('🔗 click me');
  });

  it('returns empty string for unknown type with no content', () => {
    const msg = baseMessage({ type: 'text' as any, content: '' });
    expect(getMessagePreview(msg)).toBe('');
  });
});

describe('getReplyPreviewText', () => {
  it('returns replyToContent for text messages', () => {
    const msg = baseMessage({
      type: 'text',
      replyToId: 'msg-0',
      replyToContent: 'Original message',
    });
    expect(getReplyPreviewText(msg)).toBe('Original message');
  });

  it('returns fallback for image reply', () => {
    const msg = baseMessage({
      type: 'image',
      replyToId: 'msg-0',
      replyToContent: 'https://example.com/photo.jpg',
    });
    expect(getReplyPreviewText(msg)).toBe('📷 Photo');
  });

  it('returns fallback for video reply', () => {
    const msg = baseMessage({
      type: 'video',
      replyToId: 'msg-0',
      replyToContent: 'https://example.com/clip.mp4',
    });
    expect(getReplyPreviewText(msg)).toBe('🎥 Video');
  });

  it('returns fallback for audio reply', () => {
    const msg = baseMessage({
      type: 'audio',
      replyToId: 'msg-0',
      replyToContent: 'https://example.com/voice.mp3',
    });
    expect(getReplyPreviewText(msg)).toBe('🎵 Audio');
  });

  it('returns content for document reply when replyToContent exists', () => {
    const msg = baseMessage({
      type: 'document',
      replyToId: 'msg-0',
      replyToContent: 'invoice.pdf',
    });
    expect(getReplyPreviewText(msg)).toBe('invoice.pdf');
  });

  it('returns "Message" for document reply when replyToContent is empty (falsy)', () => {
    const msg = baseMessage({
      type: 'document',
      replyToId: 'msg-0',
      replyToContent: '',
    });
    expect(getReplyPreviewText(msg)).toBe('Message');
  });

  it('returns prefixed replyToContent for link replies', () => {
    const msg = baseMessage({
      type: 'link',
      replyToId: 'msg-0',
      replyToContent: 'https://example.com',
    });
    expect(getReplyPreviewText(msg)).toBe('🔗 https://example.com');
  });

  it('returns "Message" when replyToContent is absent', () => {
    const msg = baseMessage({
      replyToId: 'msg-0',
    });
    expect(getReplyPreviewText(msg)).toBe('Message');
  });

  it('returns "Message" when neither replyToContent nor replyToId present', () => {
    const msg = baseMessage();
    expect(getReplyPreviewText(msg)).toBe('Message');
  });
});
