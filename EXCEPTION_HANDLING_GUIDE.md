# 🛡️ PRODUCTION EXCEPTION HANDLING PATTERNS

**Purpose**: Standardize error handling across the codebase  
**Status**: Required before launch

---

## 📋 PATTERN 1: Basic Try-Catch with User Feedback

### ❌ Current Pattern (Bad)
```typescript
async function sendMessage(text: string) {
  try {
    const result = await encryptMessage(text);
    await wsManager.send('message', result);
  } catch (err) {
    console.error('Error:', err);  // ← Only logs, user sees nothing
  }
}
```

### ✅ Production Pattern
```typescript
async function sendMessage(text: string): Promise<{ success: boolean; error?: string }> {
  const startTime = Date.now();
  
  try {
    logger.info('Sending message', { textLength: text.length });
    
    // Validate input first (no network call needed)
    const validated = validateMessage(text);
    
    // Encrypt
    const encrypted = await encryptMessage(validated);
    
    // Send (with timeout)
    await withTimeout(
      wsManager.send('message', encrypted),
      5000  // 5 second timeout
    );
    
    const duration = Date.now() - startTime;
    logger.info('Message sent successfully', { duration });
    
    return { success: true };
    
  } catch (err: any) {
    const duration = Date.now() - startTime;
    
    // Classify error
    const errorType = classifyError(err);
    
    // Log with context
    logger.error('Failed to send message', {
      error: err.message,
      errorType,
      textLength: text.length,
      duration,
      stack: err.stack
    });
    
    // Report to monitoring
    reportError(err, {
      context: 'sendMessage',
      severity: 'high',
      user: currentUser.uid
    });
    
    // Return user-friendly error
    const userMessage = getErrorMessage(err);
    return { 
      success: false, 
      error: userMessage 
    };
  }
}

// In component
const handleSend = async () => {
  setLoading(true);
  const result = await sendMessage(text);
  
  if (result.success) {
    setText('');
    showToast('Message sent', 'success');
  } else {
    showToast(result.error || 'Failed to send', 'error');
    // Keep text in input for retry
  }
  setLoading(false);
};
```

---

## 📋 PATTERN 2: Network Error with Retry

### ❌ Current Pattern (Bad)
```typescript
connect(token?: string) {
  this.ws = new WebSocket(WS_URL);  // ← No retry on failure
  
  this.ws.onerror = () => {
    logger.error('Connection error');
  };
}
```

### ✅ Production Pattern
```typescript
class WebSocketManager {
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 50;  // Much higher
  private baseReconnectDelay = 1000;  // 1 second
  private maxReconnectDelay = 60000;  // 60 seconds max
  
  async connect(token?: string): Promise<boolean> {
    this.reconnectAttempts = 0;
    return this._connect(token);
  }
  
  private async _connect(token?: string): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        this.ws = new WebSocket(WS_URL);
        
        this.ws.onopen = () => {
          logger.info('WebSocket connected');
          this.reconnectAttempts = 0;  // Reset on success
          
          if (token) {
            this.sendAuthMessage(token);
          }
          
          this.flushMessageQueue();
          resolve(true);
        };
        
        this.ws.onerror = (event) => {
          logger.warn('WebSocket error', { 
            reason: event,
            attempt: this.reconnectAttempts 
          });
          
          // Report error
          reportError(new Error('WebSocket error'), {
            context: 'ws_error',
            attempt: this.reconnectAttempts
          });
        };
        
        this.ws.onclose = () => {
          logger.warn('WebSocket closed', {
            attempts: this.reconnectAttempts,
            maxAttempts: this.maxReconnectAttempts
          });
          
          this.attemptReconnect(token);
          resolve(false);  // Not connected yet
        };
        
      } catch (err) {
        logger.error('Failed to create WebSocket', err);
        this.attemptReconnect(token);
        resolve(false);
      }
    });
  }
  
  private attemptReconnect(token?: string) {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      // Give up after 50 attempts
      logger.error('Max reconnection attempts reached', {
        attempts: this.reconnectAttempts
      });
      
      reportError(new Error('WebSocket connection failed'), {
        context: 'max_reconnect',
        attempts: this.reconnectAttempts
      });
      
      // Notify user
      notifyUser('Unable to connect. Please check your internet connection.');
      return;
    }
    
    this.reconnectAttempts++;
    
    // Exponential backoff with jitter
    const exponentialDelay = Math.min(
      this.baseReconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1),
      this.maxReconnectDelay
    );
    
    // Add random jitter to prevent thundering herd
    const jitter = Math.random() * 1000;
    const totalDelay = exponentialDelay + jitter;
    
    logger.info('Reconnecting', {
      attempt: this.reconnectAttempts,
      delayMs: Math.round(totalDelay)
    });
    
    setTimeout(() => {
      this._connect(token);
    }, totalDelay);
  }
}
```

---

## 📋 PATTERN 3: Firestore Operations with Timeout

### ❌ Current Pattern (Bad)
```typescript
const users = await getDocs(collection(db, 'users'));  // ← No timeout
```

### ✅ Production Pattern
```typescript
// Wrapper function
function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = 10000,
  operation: string = 'Operation'
): Promise<T> {
  let timeoutHandle: NodeJS.Timeout;
  
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      const err = new Error(`${operation} timed out after ${timeoutMs}ms`);
      err.name = 'TimeoutError';
      reject(err);
    }, timeoutMs);
  });
  
  return Promise.race([promise, timeoutPromise])
    .finally(() => clearTimeout(timeoutHandle));
}

// Usage
async function getUser(username: string) {
  try {
    const docRef = doc(db, 'users', username);
    const docSnap = await withTimeout(
      getDoc(docRef),
      5000,  // 5 second timeout
      `getUser('${username}')`
    );
    
    if (!docSnap.exists()) {
      throw new Error('User not found');
    }
    
    return docSnap.data();
    
  } catch (err: any) {
    if (err.name === 'TimeoutError') {
      logger.warn('Firestore timeout', { username });
      showToast('Network slow. Try again.');
    } else {
      logger.error('Failed to fetch user', err);
      showToast('Failed to load user data');
    }
    
    throw err;
  }
}
```

---

## 📋 PATTERN 4: Firebase Auth Errors

### ❌ Current Pattern (Bad)
```typescript
async function loginUser(email: string, password: string) {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return userCredential;
  } catch (error: any) {
    console.error('Login error:', error.message);  // ← Generic message
    throw error;
  }
}
```

### ✅ Production Pattern
```typescript
function getAuthErrorMessage(errorCode: string): string {
  const errorMessages: Record<string, string> = {
    'auth/user-not-found': 'No account found with this email',
    'auth/wrong-password': 'Incorrect password',
    'auth/invalid-email': 'Invalid email address',
    'auth/weak-password': 'Password is too weak (min 6 characters)',
    'auth/email-already-in-use': 'Email already registered',
    'auth/too-many-requests': 'Too many attempts. Try again later.',
    'auth/user-disabled': 'Account has been disabled',
    'auth/invalid-credential': 'Invalid credentials',
    'auth/network-request-failed': 'Network error. Check your connection.',
    'auth/operation-not-allowed': 'Operation not allowed',
  };
  
  return errorMessages[errorCode] || 'Authentication failed. Try again.';
}

async function loginUser(email: string, password: string) {
  try {
    // Rate limit check (CRITICAL!)
    try {
      await loginLimiter.checkLimit(email);
    } catch (err) {
      logger.warn('Login rate limited', { email });
      throw new Error('Too many login attempts. Try again later.');
    }
    
    // Validate input
    validateEmail(email);
    
    // Auth
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    
    if (!userCredential.user.emailVerified) {
      return {
        success: false,
        verified: false,
        message: 'Please verify your email before logging in'
      };
    }
    
    logger.info('User logged in', { email, uid: userCredential.user.uid });
    return { success: true, verified: true, user: userCredential.user };
    
  } catch (error: any) {
    const errorCode = error.code;
    const userMessage = getAuthErrorMessage(errorCode);
    
    logger.warn('Login failed', {
      error: errorCode,
      email,
      message: error.message
    });
    
    reportError(error, {
      context: 'login',
      email,
      errorCode
    });
    
    return {
      success: false,
      verified: null,
      message: userMessage
    };
  }
}

// In component
const handleLogin = async () => {
  setLoading(true);
  setError('');
  
  try {
    const result = await loginUser(email, password);
    
    if (result.success) {
      if (result.verified) {
        navigate('/app');
      } else {
        navigate('/verify-email');
      }
    } else {
      setError(result.message);
    }
  } catch (err) {
    setError('An unexpected error occurred. Try again.');
    logger.error('Login component error', err);
  } finally {
    setLoading(false);
  }
};
```

---

## 📋 PATTERN 5: Data Validation with Clear Errors

### ❌ Current Pattern (Bad)
```typescript
async function registerUser(email: string, username: string, password: string) {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  // ← What if email/username/password are invalid? No checks!
}
```

### ✅ Production Pattern
```typescript
import { validateEmail, validateUsername, validatePassword } from './validators';

async function registerUser(email: string, username: string, password: string) {
  const errors: Record<string, string> = {};
  
  // Validate all inputs first
  try {
    validateEmail(email);
  } catch (err) {
    errors.email = err.message;
  }
  
  try {
    validateUsername(username);
  } catch (err) {
    errors.username = err.message;
  }
  
  try {
    validatePassword(password);
  } catch (err) {
    errors.password = err.message;
  }
  
  // Return validation errors immediately
  if (Object.keys(errors).length > 0) {
    return {
      success: false,
      errors,
      message: 'Please fix the errors above'
    };
  }
  
  // All valid, proceed with Firebase
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    
    // Create user document
    const generatedUsername = await generateUniqueUserId(username);
    await setDoc(doc(db, 'users', generatedUsername), {
      uid: userCredential.user.uid,
      email,
      username: generatedUsername,
      createdAt: serverTimestamp()
    });
    
    // Send verification email
    await sendEmailVerification(userCredential.user);
    
    logger.info('User registered', { email, username: generatedUsername });
    
    return {
      success: true,
      message: 'Account created. Check your email to verify.'
    };
    
  } catch (error: any) {
    const errors: Record<string, string> = {};
    
    if (error.code === 'auth/email-already-in-use') {
      errors.email = 'Email already registered';
    } else if (error.code === 'auth/weak-password') {
      errors.password = 'Password is too weak';
    } else {
      errors.submit = 'Registration failed. Try again.';
    }
    
    logger.error('Registration failed', {
      errorCode: error.code,
      email
    });
    
    reportError(error, {
      context: 'register',
      email
    });
    
    return {
      success: false,
      errors,
      message: 'Registration failed'
    };
  }
}

// In component
const handleRegister = async () => {
  setErrors({});
  setLoading(true);
  
  const result = await registerUser(email, username, password);
  
  if (result.success) {
    showToast('Account created! Check your email.');
    navigate('/verify-email');
  } else {
    setErrors(result.errors);
    setError(result.message);
  }
  
  setLoading(false);
};
```

---

## 📋 PATTERN 6: Message Queue with Persistence

### ❌ Current Pattern (Bad)
```typescript
// Messages queued in memory only
private messageQueue: any[] = [];

// If app crashes, queue lost!
```

### ✅ Production Pattern
```typescript
class PersistentMessageQueue {
  private memoryQueue: any[] = [];
  private readonly STORAGE_KEY = 'pending_messages_queue';
  private readonly MAX_QUEUE_SIZE = 1000;
  private readonly MAX_QUEUE_AGE_MS = 24 * 60 * 60 * 1000;  // 24 hours
  
  async initialize() {
    // Load queue from localStorage
    const stored = localStorage.getItem(this.STORAGE_KEY);
    
    if (stored) {
      try {
        const items = JSON.parse(stored);
        const now = Date.now();
        
        // Filter out expired messages (older than 24 hours)
        this.memoryQueue = items.filter((item: any) => 
          now - item.queuedAt < this.MAX_QUEUE_AGE_MS
        );
        
        if (this.memoryQueue.length < items.length) {
          logger.info('Removed expired messages from queue');
          this.persistQueue();
        }
        
        logger.info('Queue loaded', { count: this.memoryQueue.length });
      } catch (err) {
        logger.error('Failed to load queue', err);
        this.memoryQueue = [];
      }
    }
  }
  
  private persistQueue() {
    try {
      // Don't exceed localStorage limit
      if (this.memoryQueue.length > this.MAX_QUEUE_SIZE) {
        this.memoryQueue = this.memoryQueue.slice(0, this.MAX_QUEUE_SIZE);
      }
      
      localStorage.setItem(
        this.STORAGE_KEY,
        JSON.stringify(this.memoryQueue)
      );
    } catch (err) {
      logger.warn('Failed to persist queue (localStorage full?)', err);
    }
  }
  
  add(message: any) {
    const item = {
      ...message,
      queuedAt: Date.now(),
      retries: 0,
      id: generateId()
    };
    
    this.memoryQueue.push(item);
    this.persistQueue();
    
    logger.info('Message queued', { id: item.id, count: this.memoryQueue.length });
  }
  
  async flush(sendFn: (msg: any) => Promise<void>) {
    if (this.memoryQueue.length === 0) return;
    
    logger.info('Flushing queue', { count: this.memoryQueue.length });
    
    const failed = [];
    
    for (const item of this.memoryQueue) {
      try {
        await sendFn(item);
        logger.info('Sent queued message', { id: item.id });
        
      } catch (err: any) {
        logger.warn('Failed to send queued message', {
          id: item.id,
          error: err.message,
          retries: item.retries
        });
        
        // Retry up to 3 times
        if (item.retries < 3) {
          item.retries++;
          failed.push(item);
        } else {
          // Give up after 3 retries
          logger.error('Max retries reached, discarding message', { id: item.id });
        }
      }
    }
    
    // Update queue with failed items
    this.memoryQueue = failed;
    this.persistQueue();
    
    if (this.memoryQueue.length > 0) {
      logger.warn('Queue has failed messages', { count: this.memoryQueue.length });
    }
  }
  
  size(): number {
    return this.memoryQueue.length;
  }
}

// Usage
const queue = new PersistentMessageQueue();

// On app startup
await queue.initialize();

// On reconnect
wsManager.on('open', async () => {
  await queue.flush((msg) => wsManager.send('message', msg));
});

// When sending new message
const handleSend = async (text: string) => {
  try {
    const encrypted = await encryptMessage(text);
    const sent = wsManager.send('message', encrypted);
    
    if (!sent) {
      // Not connected, queue it
      queue.add({ type: 'message', payload: encrypted });
      showToast('Will send when online');
    }
  } catch (err) {
    queue.add({ type: 'message', payload: text });  // Queue raw
    showToast('Message queued, will send when online');
  }
};
```

---

## 📋 PATTERN 7: Error Classification & Reporting

### ✅ Production Pattern
```typescript
enum ErrorSeverity {
  LOW = 'low',           // User input error
  MEDIUM = 'medium',     // Temporary issue (retry needed)
  HIGH = 'high',         // System issue (monitoring needed)
  CRITICAL = 'critical'  // Crash or data loss risk
}

interface ErrorContext {
  feature: string;        // e.g., 'messaging', 'calls'
  action: string;        // e.g., 'send_message'
  userId?: string;
  [key: string]: any;
}

function classifyError(error: any): {
  type: string;
  severity: ErrorSeverity;
  recoverable: boolean;
  message: string;
} {
  const message = error.message || String(error);
  
  // Network errors (recoverable)
  if (
    message.includes('Network') ||
    message.includes('timeout') ||
    message.includes('offline')
  ) {
    return {
      type: 'NETWORK_ERROR',
      severity: ErrorSeverity.MEDIUM,
      recoverable: true,
      message: 'Network error. Check your connection.'
    };
  }
  
  // Auth errors (not recoverable in session)
  if (error.code?.startsWith('auth/')) {
    return {
      type: 'AUTH_ERROR',
      severity: ErrorSeverity.HIGH,
      recoverable: false,
      message: 'Authentication failed. Please log in again.'
    };
  }
  
  // Validation errors (not recoverable, user must fix)
  if (error.message?.includes('Invalid')) {
    return {
      type: 'VALIDATION_ERROR',
      severity: ErrorSeverity.LOW,
      recoverable: false,
      message: error.message
    };
  }
  
  // Firestore errors
  if (error.code?.startsWith('firestore/')) {
    return {
      type: 'FIRESTORE_ERROR',
      severity: ErrorSeverity.HIGH,
      recoverable: true,  // Might be temporary
      message: 'Database error. Try again.'
    };
  }
  
  // Unknown
  return {
    type: 'UNKNOWN_ERROR',
    severity: ErrorSeverity.HIGH,
    recoverable: true,
    message: 'Something went wrong. Try again.'
  };
}

async function reportError(
  error: any,
  context: ErrorContext
) {
  const classified = classifyError(error);
  
  const report = {
    timestamp: new Date().toISOString(),
    error: {
      type: classified.type,
      message: error.message,
      code: error.code,
      stack: error.stack
    },
    context,
    severity: classified.severity,
    recoverable: classified.recoverable,
    userAgent: navigator.userAgent,
    url: window.location.href
  };
  
  // Log locally
  logger.error(`[${classified.severity}] ${classified.type}`, report);
  
  // Send to backend (only for MEDIUM and above)
  if (
    classified.severity === ErrorSeverity.MEDIUM ||
    classified.severity === ErrorSeverity.HIGH ||
    classified.severity === ErrorSeverity.CRITICAL
  ) {
    try {
      await fetch('/api/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report)
      }).catch(() => {
        // Ignore network errors when reporting errors
      });
    } catch (err) {
      // Silently fail
    }
  }
}
```

---

## 📋 PATTERN 8: Component Error Boundary

### ✅ Production Pattern (React)
```typescript
import { ReactNode } from 'react';
import logger from '../utils/logger';
import { reportError } from '../utils/errorReporting';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error) => void;
  context?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const context = this.props.context || 'unknown_component';
    
    logger.error('Component error boundary caught', {
      context,
      error: error.message,
      component: errorInfo.componentStack
    });
    
    reportError(error, {
      feature: 'ui',
      action: 'component_error',
      context,
      componentStack: errorInfo.componentStack
    });
    
    this.props.onError?.(error);
  }
  
  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="flex items-center justify-center h-screen bg-red-50">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-red-600">Something went wrong</h1>
              <p className="text-gray-600 mt-2">An error occurred in the app</p>
              <button
                onClick={() => window.location.reload()}
                className="mt-4 px-4 py-2 bg-red-600 text-white rounded"
              >
                Reload App
              </button>
            </div>
          </div>
        )
      );
    }
    
    return this.props.children;
  }
}

// Usage in App.tsx
<ErrorBoundary context="chat_window">
  <ChatWindow />
</ErrorBoundary>
```

---

## 📋 PATTERN 9: Async Hook Error Handling

### ✅ Production Pattern
```typescript
function useAsync<T>(
  asyncFunction: () => Promise<T>,
  immediate: boolean = true
) {
  const [status, setStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [value, setValue] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  
  const execute = useCallback(async () => {
    setStatus('pending');
    setValue(null);
    setError(null);
    
    try {
      const response = await asyncFunction();
      setValue(response);
      setStatus('success');
      return response;
      
    } catch (err: any) {
      logger.error('useAsync error', err);
      reportError(err, { feature: 'hook', action: 'async' });
      setError(err);
      setStatus('error');
      throw err;
    }
  }, [asyncFunction]);
  
  useEffect(() => {
    if (immediate) {
      execute();
    }
  }, [execute, immediate]);
  
  return { execute, status, value, error };
}

// Usage
const { status, value: messages, error } = useAsync(
  () => loadMessages(chatId),
  true
);

return (
  <div>
    {status === 'pending' && <LoadingSpinner />}
    {status === 'error' && (
      <ErrorMessage 
        error={error?.message} 
        onRetry={() => execute()}
      />
    )}
    {status === 'success' && <MessageList messages={value} />}
  </div>
);
```

---

## 🎯 IMPLEMENTATION CHECKLIST

- [ ] Add error classification function
- [ ] Add error reporting service (Sentry/Firebase)
- [ ] Wrap all async functions in try-catch
- [ ] Add retry logic for network errors
- [ ] Implement message persistence queue
- [ ] Add timeout wrappers for Firestore
- [ ] Implement proper error messages (user-friendly)
- [ ] Add error boundary to React components
- [ ] Add error logging with context
- [ ] Add user-facing error UI (toast/modal)
- [ ] Test error scenarios (network offline, timeouts, auth failures)

**Estimated Time**: 16 hours  
**Impact**: Critical for production reliability

