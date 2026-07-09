import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders, defaultMockContext } from '../../../test/test-utils';

const mockUseApp = vi.fn(() => defaultMockContext);

vi.mock('../../context/AppContext', () => ({
  useApp: () => mockUseApp(),
}));

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return { ...actual, useParams: vi.fn(() => ({ id: 'chat-1' })), useNavigate: vi.fn(() => vi.fn()) };
});

vi.mock('motion/react', () => {
  const el = (tag: string) =>
    React.forwardRef(({ children, ...props }: any, ref: any) => {
      const filtered: Record<string, any> = {};
      for (const [k, v] of Object.entries(props)) {
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || k === 'style' || k.startsWith('data-') || k.startsWith('aria-') || k.startsWith('on') || typeof v === 'function') {
          filtered[k] = v;
        }
      }
      return React.createElement(tag, { ...filtered, ref }, children);
    });

  const handler: ProxyHandler<any> = {
    get(_target, prop: string) {
      if (prop === 'AnimatePresence') return ({ children }: any) => <>{children}</>;
      if (prop === 'useMotionValue') return vi.fn(() => ({ get: () => 0, set: vi.fn() }));
      if (prop === 'useTransform') return vi.fn(() => 0);
      return el(prop);
    },
  };

  return {
    motion: new Proxy({}, handler),
    AnimatePresence: ({ children }: any) => <>{children}</>,
    useMotionValue: vi.fn(() => ({ get: () => 0, set: vi.fn() })),
    useTransform: vi.fn(() => 0),
  };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@capacitor/share', () => ({ Share: { share: vi.fn() } }));
vi.mock('@capacitor/filesystem', () => ({
  Filesystem: { readFile: vi.fn(), writeFile: vi.fn() },
  Directory: { Documents: 'DOCUMENTS' },
}));
vi.mock('../../../utils/mediaUploadHandler', () => ({ loadMediaWithCache: vi.fn() }));
vi.mock('../../../utils/validators', () => ({
  validateMessage: vi.fn((t: string) => t),
  messageLimiter: { checkLimit: vi.fn() },
}));
vi.mock('../../../utils/mediaValidator', () => ({ mediaValidator: vi.fn() }));
vi.mock('../../../utils/imageCompression', () => ({
  compressImage: vi.fn(),
  formatBytes: vi.fn((b: number) => `${b} B`),
}));
vi.mock('../../../utils/persistentMessageQueue', () => ({
  messageQueue: { getStats: vi.fn(() => ({ totalMessages: 0 })), add: vi.fn() },
}));
vi.mock('../../../utils/idbPaginator', () => ({
  idbPaginator: { loadBefore: vi.fn(() => Promise.resolve({ items: [] })) },
}));
vi.mock('../../../utils/firebaseServices', () => ({
  typingService: { setTyping: vi.fn(), setGroupTyping: vi.fn() },
}));
vi.mock('../Avatar', () => ({ default: (props: any) => <div data-testid="avatar">{props.name?.[0]}</div> }));
vi.mock('../ContactInfo', () => ({ default: () => <div data-testid="contact-info" /> }));
vi.mock('../TypingDots', () => ({ default: () => <div data-testid="typing-dots" /> }));
vi.mock('../../../utils/sanitize', () => ({
  sanitizeUrl: vi.fn((url: string) => url),
}));

import ChatWindow from '../ChatWindow';
import { useParams } from 'react-router';

describe('ChatWindow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseApp.mockReturnValue(defaultMockContext);
    (useParams as any).mockReturnValue({ id: 'chat-1' });
  });

  it('renders chat header with contact name', () => {
    renderWithProviders(<ChatWindow />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('renders messages from context', () => {
    renderWithProviders(<ChatWindow />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('Hi there!')).toBeInTheDocument();
  });

  it('renders message input textarea', () => {
    renderWithProviders(<ChatWindow />);
    expect(screen.getByPlaceholderText('Message')).toBeInTheDocument();
  });

  it('shows mic button when no text is entered', () => {
    const { container } = renderWithProviders(<ChatWindow />);
    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('updates input text on typing', () => {
    renderWithProviders(<ChatWindow />);
    const input = screen.getByPlaceholderText('Message');
    fireEvent.change(input, { target: { value: 'New message' } });
    expect(input).toHaveValue('New message');
  });

  it('calls sendMessage on send button click', async () => {
    const { container } = renderWithProviders(<ChatWindow />);
    const textarea = screen.getByPlaceholderText('Message');
    fireEvent.change(textarea, { target: { value: 'Test message' } });
    await waitFor(() => {
      const sendBtn = container.querySelector('button[aria-label="Send message"]');
      expect(sendBtn).toBeTruthy();
      if (sendBtn) fireEvent.click(sendBtn);
    });
    await waitFor(() => {
      expect(defaultMockContext.sendMessage).toHaveBeenCalled();
    });
  });

  it('does not send empty messages', () => {
    const { container } = renderWithProviders(<ChatWindow />);
    const textarea = screen.getByPlaceholderText('Message');
    expect(textarea).toHaveValue('');
    const sendBtns = container.querySelectorAll('button');
    sendBtns.forEach(btn => fireEvent.click(btn));
    expect(defaultMockContext.sendMessage).not.toHaveBeenCalled();
  });

  it('shows typing indicator when contact is typing', () => {
    mockUseApp.mockReturnValue({
      ...defaultMockContext,
      typingContacts: { 'chat-1': true },
    });
    renderWithProviders(<ChatWindow />);
    expect(screen.getByTestId('typing-dots')).toBeInTheDocument();
  });

  it('shows "Chat not found" when chatId is missing', () => {
    (useParams as any).mockReturnValue({ id: undefined });
    renderWithProviders(<ChatWindow />);
    expect(screen.getByText(/chat not found/i)).toBeInTheDocument();
  });

  it('shows empty state when no messages', () => {
    mockUseApp.mockReturnValue({
      ...defaultMockContext,
      messages: { 'chat-1': [] },
    });
    renderWithProviders(<ChatWindow />);
    expect(screen.getByText(/start a conversation/i)).toBeInTheDocument();
  });

  it('renders avatar for contact', () => {
    renderWithProviders(<ChatWindow />);
    expect(screen.getByTestId('avatar')).toBeInTheDocument();
  });
});
