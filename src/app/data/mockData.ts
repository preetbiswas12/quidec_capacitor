// Mock data for development
export type Message = {
  id: string;
  senderId: string;
  content: string;
  type: 'text' | 'image' | 'link' | 'video' | 'audio';
  timestamp: number;
  isRead: boolean;
  replyTo?: string;
  imageUrl?: string;
  linkUrl?: string;
  linkTitle?: string;
  linkDomain?: string;
  videoUrl?: string;
  audioUrl?: string;
};

export type Contact = {
  id: string;
  name: string;
  username: string;
  avatar?: string;
  status: 'online' | 'offline' | 'away';
  lastSeen: number;
  isGroup: boolean;
};

export const mockContacts: Contact[] = [
  {
    id: 'user1',
    name: 'Alice Johnson',
    username: 'alice',
    avatar: 'https://avatar.placeholder.com/alice',
    status: 'online',
    lastSeen: Date.now(),
    isGroup: false,
  },
  {
    id: 'user2',
    name: 'Bob Smith',
    username: 'bob',
    avatar: 'https://avatar.placeholder.com/bob',
    status: 'offline',
    lastSeen: Date.now() - 3600000,
    isGroup: false,
  },
];

export const mockMessages: Message[] = [
  {
    id: 'msg1',
    senderId: 'user1',
    content: 'Hey! How are you?',
    type: 'text',
    timestamp: Date.now() - 300000,
    isRead: true,
  },
  {
    id: 'msg2',
    senderId: 'currentUser',
    content: 'I am doing great! How about you?',
    type: 'text',
    timestamp: Date.now() - 240000,
    isRead: true,
  },
];
