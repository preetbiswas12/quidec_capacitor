// Free Cluely Web - Main JavaScript
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'ws://localhost:3000';

let ws = null;
let currentUser = null;
let currentChatWith = null;
let friends = [];
let messages = {};
let isTyping = false;

// DOM Elements
const loginScreen = document.getElementById('loginScreen');
const chatScreen = document.getElementById('chatScreen');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('loginBtn');
const registerBtn = document.getElementById('registerBtn');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const messagesDiv = document.getElementById('messages');
const chatWith = document.getElementById('chatWith');
const statusIndicator = document.getElementById('statusIndicator');
const lastSeen = document.getElementById('lastSeen');
const onlineFriends = document.getElementById('onlineFriends');
const friendsList = document.getElementById('friendsList');
const onlineCount = document.getElementById('onlineCount');
const totalCount = document.getElementById('totalCount');
const helpModal = document.getElementById('helpModal');
const friendRequestModal = document.getElementById('friendRequestModal');
const friendRequestFrom = document.getElementById('friendRequestFrom');
const acceptBtn = document.getElementById('acceptBtn');
const declineBtn = document.getElementById('declineBtn');
const loginError = document.getElementById('loginError');

let pendingFriendRequest = null;

// Event Listeners
loginBtn.addEventListener('click', login);
registerBtn.addEventListener('click', register);
sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
});
acceptBtn.addEventListener('click', () => respondToFriendRequest(true));
declineBtn.addEventListener('click', () => respondToFriendRequest(false));
document.addEventListener('click', (e) => {
  if (e.target === helpModal) helpModal.classList.add('hidden');
  if (e.target === friendRequestModal) friendRequestModal.classList.add('hidden');
});

// Initialize
async function login() {
  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();

  if (!username || !password) {
    loginError.textContent = 'Enter username and password';
    return;
  }

  try {
    const response = await fetch(`${SERVER_URL.replace('ws', 'http')}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      loginError.textContent = data.error || 'Login failed';
      return;
    }

    currentUser = username;
    initWebSocket();
    showChatScreen();
  } catch (err) {
    loginError.textContent = 'Server connection error';
    console.error(err);
  }
}

async function register() {
  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();

  if (!username || !password) {
    loginError.textContent = 'Enter username and password';
    return;
  }

  if (password.length < 6) {
    loginError.textContent = 'Password must be at least 6 characters';
    return;
  }

  try {
    const response = await fetch(`${SERVER_URL.replace('ws', 'http')}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      loginError.textContent = data.error || 'Registration failed';
      return;
    }

    loginError.textContent = '';
    loginError.style.color = '#667eea';
    loginError.textContent = 'Account created! Login to continue.';
    usernameInput.value = '';
    passwordInput.value = '';
  } catch (err) {
    loginError.textContent = 'Server connection error';
    console.error(err);
  }
}

function initWebSocket() {
  ws = new WebSocket(SERVER_URL);

  ws.onopen = () => {
    console.log('Connected to server');
    ws.send(JSON.stringify({ type: 'auth', username: currentUser }));
    fetchFriends();
  };

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    handleServerMessage(message);
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
    loginError.textContent = 'Connection error';
  };

  ws.onclose = () => {
    console.log('Disconnected');
    showLoginScreen();
  };
}

function handleServerMessage(message) {
  switch (message.type) {
    case 'message':
      if (message.from === currentChatWith) {
        addMessage(message.content, 'received');
      } else {
        addStatusMessage(`Message from ${message.from}`);
      }
      break;

    case 'friends-list':
      friends = message.friends;
      renderFriendsList();
      break;

    case 'chat-history':
      displayChatHistory(message.messages);
      break;

    case 'clear-chat':
      if (message.to === currentChatWith || message.from === currentChatWith) {
        messagesDiv.innerHTML = '';
        addStatusMessage('Chat cleared');
      }
      break;

    case 'user-status':
      updateFriendStatus(message.username, message.online);
      break;

    case 'friend-request':
      showFriendRequestDialog(message.from);
      break;

    case 'friend-request-response':
      if (message.accepted) {
        addStatusMessage(`${message.from} accepted your friend request!`);
        fetchFriends();
      }
      break;
  }
}

function sendMessage() {
  const content = messageInput.value.trim();
  if (!content || !currentChatWith) return;

  if (content.startsWith('/')) {
    handleCommand(content);
    messageInput.value = '';
    return;
  }

  ws.send(JSON.stringify({
    type: 'message',
    from: currentUser,
    to: currentChatWith,
    content,
  }));

  addMessage(content, 'sent');
  messageInput.value = '';
}

function handleCommand(command) {
  const cmd = command.toLowerCase();

  switch (cmd) {
    case '/clear':
      ws.send(JSON.stringify({
        type: 'clear-chat',
        from: currentUser,
        to: currentChatWith,
      }));
      messagesDiv.innerHTML = '';
      addStatusMessage('Chat cleared for both users');
      break;

    case '/online':
      ws.send(JSON.stringify({ type: 'get-online' }));
      break;

    case '/friends':
      displayFriendsList();
      break;

    case '/help':
      helpModal.classList.remove('hidden');
      break;

    default:
      addStatusMessage(`Unknown command: ${cmd}`);
  }
}

function renderFriendsList() {
  const online = friends.filter((f) => f.online);
  const offline = friends.filter((f) => !f.online);

  onlineCount.textContent = online.length;
  totalCount.textContent = friends.length;

  onlineFriends.innerHTML = '';
  online.forEach((friend) => {
    onlineFriends.appendChild(createFriendItem(friend));
  });

  friendsList.innerHTML = '';
  friends.forEach((friend) => {
    friendsList.appendChild(createFriendItem(friend));
  });
}

function createFriendItem(friend) {
  const item = document.createElement('div');
  item.className = 'friend-item';
  item.innerHTML = `
    <span class="online-dot ${friend.online ? '' : 'offline'}"></span>
    <div class="friend-content">
      <div class="friend-name">${friend.username}</div>
      <div class="last-seen">${friend.online ? 'online' : 'offline'}</div>
    </div>
  `;

  item.addEventListener('click', () => selectFriend(friend.username));
  return item;
}

function selectFriend(username) {
  currentChatWith = username;
  chatWith.textContent = username;

  const friend = friends.find((f) => f.username === username);
  if (friend) {
    statusIndicator.classList.toggle('online', friend.online);
    lastSeen.textContent = friend.online ? 'Online' : 'Offline';
  }

  document.querySelectorAll('.friend-item').forEach((item) => {
    item.classList.remove('active');
  });

  document.querySelectorAll('.friend-item').forEach((item) => {
    if (item.textContent.includes(username)) {
      item.classList.add('active');
    }
  });

  ws.send(JSON.stringify({
    type: 'get-chat-history',
    with: username,
  }));

  messageInput.focus();
}

function addMessage(content, type) {
  const msg = document.createElement('div');
  msg.className = `message ${type}`;

  const timestamp = new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  msg.innerHTML = `
    ${content}
    <div class="message-info">${timestamp}</div>
  `;

  messagesDiv.appendChild(msg);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function addStatusMessage(text) {
  const msg = document.createElement('div');
  msg.className = 'message status';
  msg.textContent = text;
  messagesDiv.appendChild(msg);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function displayChatHistory(messages) {
  messagesDiv.innerHTML = '';

  if (messages.length === 0) {
    addStatusMessage('No previous messages');
    return;
  }

  messages.forEach((msg) => {
    const messageType = msg.from === currentUser ? 'sent' : 'received';
    const msgEl = document.createElement('div');
    msgEl.className = `message ${messageType}`;

    const timestamp = new Date(msg.timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

    msgEl.innerHTML = `
      ${msg.content}
      <div class="message-info">${timestamp}</div>
    `;

    messagesDiv.appendChild(msgEl);
  });

  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function displayFriendsList() {
  let text = 'Your friends:\n';
  friends.forEach((f) => {
    text += `- ${f.username} (${f.online ? 'online' : 'offline'})\n`;
  });
  addStatusMessage(text);
}

function updateFriendStatus(username, online) {
  const friend = friends.find((f) => f.username === username);
  if (friend) {
    friend.online = online;
    renderFriendsList();

    if (username === currentChatWith) {
      statusIndicator.classList.toggle('online', online);
      addStatusMessage(`${username} is ${online ? 'online' : 'offline'}`);
    }
  }
}

function showFriendRequestDialog(from) {
  pendingFriendRequest = from;
  friendRequestFrom.textContent = `${from} sent you a friend request`;
  friendRequestModal.classList.remove('hidden');
}

function respondToFriendRequest(accept) {
  if (!pendingFriendRequest) return;

  ws.send(JSON.stringify({
    type: 'friend-response',
    from: currentUser,
    to: pendingFriendRequest,
    accept: accept,
  }));

  friendRequestModal.classList.add('hidden');
  const requestFrom = pendingFriendRequest;
  pendingFriendRequest = null;

  if (accept) {
    addStatusMessage(`You accepted the friend request from ${requestFrom}`);
    fetchFriends();
  } else {
    addStatusMessage(`You declined the friend request from ${requestFrom}`);
  }
}

function fetchFriends() {
  ws.send(JSON.stringify({ type: 'get-friends' }));
}

function showLoginScreen() {
  loginScreen.classList.remove('hidden');
  chatScreen.classList.add('hidden');
  usernameInput.focus();
}

function showChatScreen() {
  loginScreen.classList.add('hidden');
  chatScreen.classList.remove('hidden');
  messageInput.focus();
}
