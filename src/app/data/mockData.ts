export interface Contact {
  id: string;
  userId: string;          // unique handle e.g. "@sarah.j"
  name: string;
  avatar: string | null;
  avatarColor: string;
  initials: string;
  isOnline: boolean;
  lastSeen: string;
  phone: string;
  email?: string;
  about: string;
  isGroup?: boolean;
  members?: string[];
}

export interface Message {
  id: string;
  chatId: string;
  content: string;
  type: 'text' | 'image' | 'audio' | 'system' | 'document' | 'link';
  senderId: string;
  timestamp: string;
  status: 'sent' | 'delivered' | 'read';
  reactions?: { emoji: string; count: number }[];
  isStarred?: boolean;
  replyToId?: string;
  replyToContent?: string;
  replyToSender?: string;
  linkUrl?: string;
  linkTitle?: string;
  linkDomain?: string;
  imageUrl?: string;
}

export interface Chat {
  id: string;
  contactId: string;
  lastMessage: string;
  lastMessageTime: string;
  lastMessageSender?: string;
  unreadCount: number;
  isPinned?: boolean;
  isMuted?: boolean;
  isArchived?: boolean;
}

export interface CallRecord {
  id: string;
  contactId: string;
  type: 'voice' | 'video';
  direction: 'incoming' | 'outgoing' | 'missed';
  duration?: string;
  timestamp: string;
}

export interface Status {
  id: string;
  contactId: string;
  content: string;
  type: 'text' | 'image';
  backgroundColor?: string;
  timestamp: string;
  viewed: boolean;
}

export interface ChatRequest {
  id: string;
  contactId: string;           // the contact who sent / we sent to
  direction: 'incoming' | 'outgoing';
  status: 'pending' | 'accepted' | 'declined';
  timestamp: string;
  previewMessage: string;
}

// ─── Main contacts (already in address book) ──────────────────────────────────
export const contacts: Contact[] = [
  {
    id: 'sarah',
    userId: '@sarah.j',
    name: 'Sarah Johnson',
    avatar: 'https://images.unsplash.com/photo-1762954419103-43708f0cf893?w=200&q=80',
    avatarColor: '#e91e8c',
    initials: 'SJ',
    isOnline: true,
    lastSeen: 'online',
    phone: '+1 (555) 234-5678',
    about: '✨ Living my best life',
  },
  {
    id: 'mike',
    userId: '@mike.w',
    name: 'Mike Williams',
    avatar: 'https://images.unsplash.com/photo-1758598305593-7c12d15687be?w=200&q=80',
    avatarColor: '#1976d2',
    initials: 'MW',
    isOnline: false,
    lastSeen: 'last seen 2 hours ago',
    phone: '+1 (555) 345-6789',
    about: '🚀 Product Manager at TechCorp',
  },
  {
    id: 'emily',
    userId: '@emily.c',
    name: 'Emily Chen',
    avatar: 'https://images.unsplash.com/photo-1569913486515-b74bf7751574?w=200&q=80',
    avatarColor: '#7b1fa2',
    initials: 'EC',
    isOnline: true,
    lastSeen: 'online',
    phone: '+1 (555) 456-7890',
    about: '🎨 Designer by day, reader by night',
  },
  {
    id: 'james',
    userId: '@james.a',
    name: 'James Anderson',
    avatar: 'https://images.unsplash.com/photo-1672685667592-0392f458f46f?w=200&q=80',
    avatarColor: '#388e3c',
    initials: 'JA',
    isOnline: false,
    lastSeen: 'last seen today at 3:45 PM',
    phone: '+1 (555) 567-8901',
    about: '📸 Photography enthusiast',
  },
  {
    id: 'olivia',
    userId: '@olivia.m',
    name: 'Olivia Martinez',
    avatar: 'https://images.unsplash.com/photo-1641900155667-80fabfe1f42b?w=200&q=80',
    avatarColor: '#f57c00',
    initials: 'OM',
    isOnline: false,
    lastSeen: 'last seen 10 minutes ago',
    phone: '+1 (555) 678-9012',
    about: '🎬 Series addict 📺',
  },
  {
    id: 'david',
    userId: '@david.k',
    name: 'David Kim',
    avatar: 'https://images.unsplash.com/photo-1767125956959-1c4d4e5f49bd?w=200&q=80',
    avatarColor: '#d32f2f',
    initials: 'DK',
    isOnline: true,
    lastSeen: 'online',
    phone: '+1 (555) 789-0123',
    about: '💻 Full-stack developer',
  },
  {
    id: 'tech-team',
    userId: '@tech.team',
    name: 'Tech Team 🚀',
    avatar: null,
    avatarColor: '#0288d1',
    initials: 'TT',
    isOnline: false,
    lastSeen: '',
    phone: '',
    about: 'Tech team discussions',
    isGroup: true,
    members: ['me', 'mike', 'david', 'james', 'emily'],
  },
  {
    id: 'family',
    userId: '@family.group',
    name: 'Family ❤️',
    avatar: null,
    avatarColor: '#43a047',
    initials: 'FA',
    isOnline: false,
    lastSeen: '',
    phone: '',
    about: 'Family group chat',
    isGroup: true,
    members: ['me', 'sarah', 'emily'],
  },
];

// ─── Discoverable users (not yet in contacts – found via ID search) ────────────
export const discoverableContacts: Contact[] = [
  {
    id: 'alex-t',
    userId: '@alex.t',
    name: 'Alex Thompson',
    avatar: 'https://images.unsplash.com/photo-1737574821698-862e77f044c1?w=200&q=80',
    avatarColor: '#00897b',
    initials: 'AT',
    isOnline: true,
    lastSeen: 'online',
    phone: '+1 (555) 321-0987',
    about: '🏄 Surfer & software engineer',
  },
  {
    id: 'priya-s',
    userId: '@priya.s',
    name: 'Priya Sharma',
    avatar: 'https://images.unsplash.com/photo-1577878317861-2a54eb46ed42?w=200&q=80',
    avatarColor: '#c2185b',
    initials: 'PS',
    isOnline: false,
    lastSeen: 'last seen 30 minutes ago',
    phone: '+1 (555) 654-3210',
    about: '📚 Book lover & startup founder',
  },
];

// ─── Initial chat requests ─────────────────────────────────────────────────────
export const initialChatRequests: ChatRequest[] = [
  {
    id: 'cr-alex',
    contactId: 'alex-t',
    direction: 'incoming',
    status: 'pending',
    timestamp: '2h ago',
    previewMessage: "Hey! Got your handle from Sarah. Hope it's okay to reach out! 👋",
  },
  {
    id: 'cr-priya',
    contactId: 'priya-s',
    direction: 'incoming',
    status: 'pending',
    timestamp: '5m ago',
    previewMessage: "Hi! I think we met at the conference last week? 😊",
  },
];

export const chats: Chat[] = [
  {
    id: 'chat-sarah',
    contactId: 'sarah',
    lastMessage: "Can't wait! See you at 7 🎉",
    lastMessageTime: '10:42 AM',
    unreadCount: 2,
    isPinned: false,
  },
  {
    id: 'chat-family',
    contactId: 'family',
    lastMessage: "Don't forget Sunday dinner! ❤️",
    lastMessageTime: '9:15 AM',
    lastMessageSender: 'Mom',
    unreadCount: 0,
    isPinned: true,
  },
  {
    id: 'chat-mike',
    contactId: 'mike',
    lastMessage: '✅ Thanks a lot Mike!',
    lastMessageTime: 'Yesterday',
    unreadCount: 0,
  },
  {
    id: 'chat-emily',
    contactId: 'emily',
    lastMessage: "She's making your favourite 😍",
    lastMessageTime: 'Yesterday',
    unreadCount: 1,
  },
  {
    id: 'chat-tech-team',
    contactId: 'tech-team',
    lastMessage: 'Can everyone review the PR by EOD?',
    lastMessageTime: 'Yesterday',
    lastMessageSender: 'David',
    unreadCount: 5,
  },
  {
    id: 'chat-james',
    contactId: 'james',
    lastMessage: 'No worries, I can wait 😊',
    lastMessageTime: 'Monday',
    unreadCount: 0,
  },
  {
    id: 'chat-olivia',
    contactId: 'olivia',
    lastMessage: "It's AMAZING!! You HAVE to watch it 🤩",
    lastMessageTime: 'Monday',
    unreadCount: 3,
  },
  {
    id: 'chat-david',
    contactId: 'david',
    lastMessage: "Classic dev mistake 😄 No worries!",
    lastMessageTime: 'Sunday',
    unreadCount: 0,
  },
];

export const messages: Record<string, Message[]> = {
  'chat-sarah': [
    { id: 'sm1', chatId: 'chat-sarah', content: "Messages and calls are end-to-end encrypted. No one outside of this chat can read or listen to them.", type: 'system', senderId: 'system', timestamp: '', status: 'read' },
    { id: 'sm2', chatId: 'chat-sarah', content: 'Hey! Are you free tonight? 🎉', type: 'text', senderId: 'sarah', timestamp: '10:30 AM', status: 'read' },
    { id: 'sm3', chatId: 'chat-sarah', content: "We're having a little get together at my place. A few friends are coming over!", type: 'text', senderId: 'sarah', timestamp: '10:31 AM', status: 'read' },
    { id: 'sm4', chatId: 'chat-sarah', content: 'Oh nice! What time were you thinking?', type: 'text', senderId: 'me', timestamp: '10:35 AM', status: 'read' },
    { id: 'sm5', chatId: 'chat-sarah', content: 'Around 7pm! Bring whatever you want to drink 😄', type: 'text', senderId: 'sarah', timestamp: '10:38 AM', status: 'read' },
    { id: 'sm5b', chatId: 'chat-sarah', content: '', type: 'image', senderId: 'sarah', timestamp: '10:39 AM', status: 'read', imageUrl: 'https://images.unsplash.com/photo-1598439473183-42c9301db5dc?w=400&q=80' },
    { id: 'sm5c', chatId: 'chat-sarah', content: 'Look at this view from my rooftop! 😍', type: 'text', senderId: 'sarah', timestamp: '10:39 AM', status: 'read' },
    { id: 'sm6', chatId: 'chat-sarah', content: "Perfect! I'll be there for sure 🙌", type: 'text', senderId: 'me', timestamp: '10:40 AM', status: 'read' },
    { id: 'sm6b', chatId: 'chat-sarah', content: 'https://open.spotify.com/playlist/37i9dQZF', type: 'link', senderId: 'me', timestamp: '10:41 AM', status: 'read', linkUrl: 'https://open.spotify.com/playlist/37i9dQZF', linkTitle: 'Party Playlist 🎵', linkDomain: 'open.spotify.com' },
    { id: 'sm7', chatId: 'chat-sarah', content: "Can't wait! See you at 7 🎉", type: 'text', senderId: 'sarah', timestamp: '10:42 AM', status: 'read' },
  ],
  'chat-mike': [
    { id: 'mm1', chatId: 'chat-mike', content: "Messages and calls are end-to-end encrypted. No one outside of this chat can read or listen to them.", type: 'system', senderId: 'system', timestamp: '', status: 'read' },
    { id: 'mm2', chatId: 'chat-mike', content: 'Hey Mike, did you manage to finish the Q3 report?', type: 'text', senderId: 'me', timestamp: 'Yesterday, 2:10 PM', status: 'read' },
    { id: 'mm3', chatId: 'chat-mike', content: 'Almost done! Just reviewing the final numbers. Give me about an hour', type: 'text', senderId: 'mike', timestamp: 'Yesterday, 2:25 PM', status: 'read' },
    { id: 'mm4', chatId: 'chat-mike', content: 'No rush, just checking in 👍', type: 'text', senderId: 'me', timestamp: 'Yesterday, 2:26 PM', status: 'read' },
    { id: 'mm5', chatId: 'chat-mike', content: 'Actually just finished! Sending it over to the team now', type: 'text', senderId: 'mike', timestamp: 'Yesterday, 3:15 PM', status: 'read' },
    { id: 'mm6', chatId: 'chat-mike', content: '📎 Q3_Report_Final.pdf', type: 'document', senderId: 'mike', timestamp: 'Yesterday, 3:15 PM', status: 'read' },
    { id: 'mm6b', chatId: 'chat-mike', content: '📎 Budget_2025.xlsx', type: 'document', senderId: 'me', timestamp: 'Yesterday, 3:18 PM', status: 'read' },
    { id: 'mm7', chatId: 'chat-mike', content: '✅ Thanks a lot Mike!', type: 'text', senderId: 'me', timestamp: 'Yesterday, 3:20 PM', status: 'read' },
  ],
  'chat-emily': [
    { id: 'em1', chatId: 'chat-emily', content: "Messages and calls are end-to-end encrypted. No one outside of this chat can read or listen to them.", type: 'system', senderId: 'system', timestamp: '', status: 'read' },
    { id: 'em2', chatId: 'chat-emily', content: "Hey! Mum called and she wants to know if you're coming for Sunday dinner 😊", type: 'text', senderId: 'emily', timestamp: 'Yesterday, 11:00 AM', status: 'read' },
    { id: 'em3', chatId: 'chat-emily', content: 'Yes definitely! What time is she thinking?', type: 'text', senderId: 'me', timestamp: 'Yesterday, 11:05 AM', status: 'read' },
    { id: 'em4', chatId: 'chat-emily', content: "She said 2pm but you know how she is... probably means 12:30 😂", type: 'text', senderId: 'emily', timestamp: 'Yesterday, 11:06 AM', status: 'read' },
    { id: 'em5', chatId: 'chat-emily', content: "Haha so true! I'll be there by 1:30 just to be safe 😄", type: 'text', senderId: 'me', timestamp: 'Yesterday, 11:10 AM', status: 'read' },
    { id: 'em6', chatId: 'chat-emily', content: "She's making your favourite 😍", type: 'text', senderId: 'emily', timestamp: 'Yesterday, 11:12 AM', status: 'delivered' },
  ],
  'chat-tech-team': [
    { id: 'tt1', chatId: 'chat-tech-team', content: "Messages and calls are end-to-end encrypted. No one outside of this chat can read or listen to them.", type: 'system', senderId: 'system', timestamp: '', status: 'read' },
    { id: 'tt2', chatId: 'chat-tech-team', content: 'Morning team! Stand-up in 10 mins ☕', type: 'text', senderId: 'mike', timestamp: 'Yesterday, 9:50 AM', status: 'read' },
    { id: 'tt3', chatId: 'chat-tech-team', content: 'On my way! Had a rough commute', type: 'text', senderId: 'james', timestamp: 'Yesterday, 9:52 AM', status: 'read' },
    { id: 'tt4', chatId: 'chat-tech-team', content: 'Just pushed the new feature branch. Please pull latest 🔄', type: 'text', senderId: 'david', timestamp: 'Yesterday, 11:30 AM', status: 'read' },
    { id: 'tt4b', chatId: 'chat-tech-team', content: '📎 sprint_plan_v3.pdf', type: 'document', senderId: 'mike', timestamp: 'Yesterday, 11:40 AM', status: 'read' },
    { id: 'tt4c', chatId: 'chat-tech-team', content: '', type: 'image', senderId: 'david', timestamp: 'Yesterday, 12:00 PM', status: 'read', imageUrl: 'https://images.unsplash.com/photo-1633457689664-8b62c897e185?w=400&q=80' },
    { id: 'tt4d', chatId: 'chat-tech-team', content: 'New office setup 🚀', type: 'text', senderId: 'david', timestamp: 'Yesterday, 12:00 PM', status: 'read' },
    { id: 'tt5', chatId: 'chat-tech-team', content: 'Got it, pulling now', type: 'text', senderId: 'me', timestamp: 'Yesterday, 11:35 AM', status: 'read' },
    { id: 'tt5b', chatId: 'chat-tech-team', content: 'https://github.com/team/repo/pull/42', type: 'link', senderId: 'david', timestamp: 'Yesterday, 4:40 PM', status: 'read', linkUrl: 'https://github.com/team/repo/pull/42', linkTitle: 'PR #42: Feature/auth-refactor', linkDomain: 'github.com' },
    { id: 'tt6', chatId: 'chat-tech-team', content: 'Hey everyone, can everyone review the PR by EOD? Link in the channel', type: 'text', senderId: 'david', timestamp: 'Yesterday, 4:45 PM', status: 'delivered' },
    { id: 'tt7', chatId: 'chat-tech-team', content: "Will do! I'll get to it after the 5pm call", type: 'text', senderId: 'emily', timestamp: 'Yesterday, 4:50 PM', status: 'delivered' },
  ],
  'chat-family': [
    { id: 'fm1', chatId: 'chat-family', content: "Messages and calls are end-to-end encrypted. No one outside of this chat can read or listen to them.", type: 'system', senderId: 'system', timestamp: '', status: 'read' },
    { id: 'fm2', chatId: 'chat-family', content: 'Good morning everyone! ☀️', type: 'text', senderId: 'sarah', timestamp: '8:00 AM', status: 'read' },
    { id: 'fm2b', chatId: 'chat-family', content: '', type: 'image', senderId: 'sarah', timestamp: '8:05 AM', status: 'read', imageUrl: 'https://images.unsplash.com/photo-1645536024589-0c25fb936d74?w=400&q=80' },
    { id: 'fm2c', chatId: 'chat-family', content: 'Made breakfast for everyone 🍳', type: 'text', senderId: 'sarah', timestamp: '8:05 AM', status: 'read' },
    { id: 'fm3', chatId: 'chat-family', content: 'Morning! ❤️', type: 'text', senderId: 'me', timestamp: '8:15 AM', status: 'read' },
    { id: 'fm3b', chatId: 'chat-family', content: '', type: 'image', senderId: 'emily', timestamp: '8:50 AM', status: 'read', imageUrl: 'https://images.unsplash.com/photo-1575260526066-cac1342382ad?w=400&q=80' },
    { id: 'fm3c', chatId: 'chat-family', content: 'Beautiful night out last night 🌃', type: 'text', senderId: 'emily', timestamp: '8:50 AM', status: 'read' },
    { id: 'fm4', chatId: 'chat-family', content: "Don't forget Sunday dinner! I'm making everyone's favourites ❤️", type: 'text', senderId: 'emily', timestamp: '9:15 AM', status: 'read' },
  ],
  'chat-james': [
    { id: 'jm1', chatId: 'chat-james', content: "Messages and calls are end-to-end encrypted. No one outside of this chat can read or listen to them.", type: 'system', senderId: 'system', timestamp: '', status: 'read' },
    { id: 'jm2', chatId: 'chat-james', content: 'Hey are you at the cafe already?', type: 'text', senderId: 'me', timestamp: 'Monday, 2:00 PM', status: 'read' },
    { id: 'jm3', chatId: 'chat-james', content: 'Running a bit late, traffic is crazy 😅 Be there in 20', type: 'text', senderId: 'james', timestamp: 'Monday, 2:05 PM', status: 'read' },
    { id: 'jm4', chatId: 'chat-james', content: "No worries, I can wait 😊 I'll order a coffee", type: 'text', senderId: 'me', timestamp: 'Monday, 2:06 PM', status: 'read' },
  ],
  'chat-olivia': [
    { id: 'om1', chatId: 'chat-olivia', content: "Messages and calls are end-to-end encrypted. No one outside of this chat can read or listen to them.", type: 'system', senderId: 'system', timestamp: '', status: 'read' },
    { id: 'om2', chatId: 'chat-olivia', content: 'Oh my god did you see the new season dropped?? 😱😱', type: 'text', senderId: 'olivia', timestamp: 'Monday, 8:30 PM', status: 'read' },
    { id: 'om3', chatId: 'chat-olivia', content: 'Not yet! Please no spoilers 🙈', type: 'text', senderId: 'me', timestamp: 'Monday, 8:35 PM', status: 'read' },
    { id: 'om4', chatId: 'chat-olivia', content: "Don't worry I won't! But seriously you NEED to watch it ASAP", type: 'text', senderId: 'olivia', timestamp: 'Monday, 8:36 PM', status: 'delivered' },
    { id: 'om5', chatId: 'chat-olivia', content: "It's AMAZING!! You HAVE to watch it 🤩", type: 'text', senderId: 'olivia', timestamp: 'Monday, 8:37 PM', status: 'delivered' },
  ],
  'chat-david': [
    { id: 'dm1', chatId: 'chat-david', content: "Messages and calls are end-to-end encrypted. No one outside of this chat can read or listen to them.", type: 'system', senderId: 'system', timestamp: '', status: 'read' },
    { id: 'dm2', chatId: 'chat-david', content: 'Hey David, can I pick your brain about something?', type: 'text', senderId: 'me', timestamp: 'Sunday, 3:00 PM', status: 'read' },
    { id: 'dm3', chatId: 'chat-david', content: "Sure! What's up?", type: 'text', senderId: 'david', timestamp: 'Sunday, 3:02 PM', status: 'read' },
    { id: 'dm4', chatId: 'chat-david', content: 'The API keeps returning 404 errors and I have no idea why', type: 'text', senderId: 'me', timestamp: 'Sunday, 3:03 PM', status: 'read' },
    { id: 'dm5', chatId: 'chat-david', content: 'Did you double-check the endpoint URL in your config?', type: 'text', senderId: 'david', timestamp: 'Sunday, 3:05 PM', status: 'read' },
    { id: 'dm6', chatId: 'chat-david', content: "I... actually didn't. Let me check 😅", type: 'text', senderId: 'me', timestamp: 'Sunday, 3:06 PM', status: 'read' },
    { id: 'dm7', chatId: 'chat-david', content: "Classic dev mistake 😄 No worries!", type: 'text', senderId: 'david', timestamp: 'Sunday, 3:08 PM', status: 'read' },
    { id: 'dm8', chatId: 'chat-david', content: 'Found it!! There was a typo in the base URL 🤦 Thanks so much!', type: 'text', senderId: 'me', timestamp: 'Sunday, 3:10 PM', status: 'read' },
  ],
};

export const calls: CallRecord[] = [
  { id: 'c1', contactId: 'sarah', type: 'video', direction: 'incoming', duration: '12:34', timestamp: 'Today, 9:15 AM' },
  { id: 'c2', contactId: 'mike', type: 'voice', direction: 'outgoing', duration: '5:20', timestamp: 'Today, 8:30 AM' },
  { id: 'c3', contactId: 'olivia', type: 'voice', direction: 'missed', timestamp: 'Yesterday, 7:45 PM' },
  { id: 'c4', contactId: 'david', type: 'video', direction: 'outgoing', duration: '45:12', timestamp: 'Yesterday, 3:00 PM' },
  { id: 'c5', contactId: 'james', type: 'voice', direction: 'incoming', duration: '2:10', timestamp: 'Monday, 1:00 PM' },
  { id: 'c6', contactId: 'emily', type: 'video', direction: 'missed', timestamp: 'Monday, 11:30 AM' },
  { id: 'c7', contactId: 'sarah', type: 'voice', direction: 'outgoing', duration: '8:45', timestamp: 'Sunday, 6:00 PM' },
  { id: 'c8', contactId: 'mike', type: 'video', direction: 'incoming', duration: '22:10', timestamp: 'Sunday, 2:00 PM' },
];

export const statuses: Status[] = [
  { id: 'st1', contactId: 'sarah', content: 'https://images.unsplash.com/photo-1516637090014-cb1ab78511f5?w=600&q=80', type: 'image', timestamp: '10 minutes ago', viewed: false },
  { id: 'st2', contactId: 'emily', content: 'Design is not just what it looks like... design is how it works ✨', type: 'text', backgroundColor: '#7b1fa2', timestamp: '1 hour ago', viewed: false },
  { id: 'st3', contactId: 'david', content: 'Coffee + Code = ❤️', type: 'text', backgroundColor: '#d32f2f', timestamp: '2 hours ago', viewed: true },
  { id: 'st4', contactId: 'olivia', content: 'New season is OUT!! Go watch it NOW!! 🎬🍿', type: 'text', backgroundColor: '#f57c00', timestamp: '3 hours ago', viewed: true },
];

export const autoReplies: Record<string, string[]> = {
  sarah: ["Haha sounds great! 😄", "Sure thing! 🙌", "Oh wow really?! That's amazing!", "Can't wait!! 🎉", "Yes yes yes!! 🎊", "Let's do it!"],
  mike: ["Got it, will check now", "Makes sense, thanks!", "I'll circle back on that", "Sure, no problem 👍", "Noted, will follow up", "Sounds good to me"],
  emily: ["Oh that's so sweet! ❤️", "Haha you're so funny 😂", "Yes!! Love that idea", "Aww thanks! 😊", "That sounds perfect!", "Can't wait to see you! 🤗"],
  james: ["No worries at all!", "Take your time 😊", "Cool, see you soon", "Sounds good!", "Perfect, works for me 👌"],
  olivia: ["YESSS you'll love it!! 😱", "I know right?! So good!!", "The best thing I've watched all year 🔥", "Don't sleep on it!!", "Just watch it, trust me!! 🤩"],
  david: ["Happy to help! 🚀", "Good catch! Always double-check configs 😄", "Let me know if you need anything else", "Classic! Been there haha", "That should fix it!"],
  'tech-team': ["Got it! 👍", "On it!", "Will do", "Thanks for the heads up", "+1 on that"],
  family: ["Love you all! ❤️", "See you Sunday!", "Can't wait! 😄", "Miss you guys!"],
  'alex-t': ["Sure, let's chat! 😄", "Hey! Thanks for reaching out 👋", "Of course! What's up?", "Great to connect! 🤝"],
  'priya-s': ["Hi! Yes we did meet! Small world 😊", "Of course! Great to hear from you!", "Hey! How are you? 😊"],
};

// ─── Utility ──────────────────────────────────────────────────────────────────
export function generateUserId(name: string): string {
  const base = name.trim().toLowerCase().split(' ')[0].replace(/[^a-z0-9]/g, '');
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `@${base}.${suffix}`;
}