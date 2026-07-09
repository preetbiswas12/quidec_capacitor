import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCreateUserWithEmailAndPassword, mockSignInWithEmailAndPassword, mockSignOut, mockSetPersistence, mockOnAuthStateChanged, mockUpdateProfile, mockSendEmailVerification, mockSendPasswordResetEmail, mockVerifyBeforeUpdateEmail, mockSetDoc, mockDoc, mockServerTimestamp, mockCollection, mockQuery, mockWhere, mockGetDocs, mockDeleteDoc, mockRtdbRef, mockRtdbSet, mockRtdbServerTimestamp } = vi.hoisted(() => ({
  mockCreateUserWithEmailAndPassword: vi.fn(),
  mockSignInWithEmailAndPassword: vi.fn(),
  mockSignOut: vi.fn(),
  mockSetPersistence: vi.fn(),
  mockOnAuthStateChanged: vi.fn(),
  mockUpdateProfile: vi.fn(),
  mockSendEmailVerification: vi.fn(),
  mockSendPasswordResetEmail: vi.fn(),
  mockVerifyBeforeUpdateEmail: vi.fn(),
  mockSetDoc: vi.fn(),
  mockDoc: vi.fn((_db: any, ...segments: string[]) => ({ _path: segments })),
  mockServerTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
  mockCollection: vi.fn(),
  mockQuery: vi.fn(),
  mockWhere: vi.fn(),
  mockGetDocs: vi.fn(),
  mockDeleteDoc: vi.fn(),
  mockRtdbRef: vi.fn((_db: any, path: string) => ({ path })),
  mockRtdbSet: vi.fn(),
  mockRtdbServerTimestamp: vi.fn(() => 'RTDB_TIMESTAMP'),
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(),
  createUserWithEmailAndPassword: mockCreateUserWithEmailAndPassword,
  signInWithEmailAndPassword: mockSignInWithEmailAndPassword,
  signOut: mockSignOut,
  setPersistence: mockSetPersistence,
  browserLocalPersistence: 'LOCAL',
  onAuthStateChanged: mockOnAuthStateChanged,
  updateProfile: mockUpdateProfile,
  sendEmailVerification: mockSendEmailVerification,
  sendPasswordResetEmail: mockSendPasswordResetEmail,
  verifyBeforeUpdateEmail: mockVerifyBeforeUpdateEmail,
}));

vi.mock('firebase/firestore', () => ({
  doc: mockDoc,
  setDoc: mockSetDoc,
  collection: mockCollection,
  query: mockQuery,
  where: mockWhere,
  getDocs: mockGetDocs,
  deleteDoc: mockDeleteDoc,
  serverTimestamp: mockServerTimestamp,
}));

vi.mock('firebase/database', () => ({
  ref: mockRtdbRef,
  set: mockRtdbSet,
  serverTimestamp: () => mockRtdbServerTimestamp(),
}));

vi.mock('../../firebase', () => ({
  db: {},
  auth: {
    currentUser: null,
  },
  realtimeDb: {},
  getFCMToken: vi.fn().mockResolvedValue('test-token'),
}));

vi.mock('../../errorMonitoring', () => ({
  setUserContext: vi.fn(),
  clearUserContext: vi.fn(),
}));

vi.mock('../../validators', () => ({
  validateEmail: vi.fn().mockReturnValue({ valid: true }),
  validatePassword: vi.fn().mockReturnValue({ valid: true }),
  validateUsername: vi.fn().mockReturnValue({ valid: true }),
  loginLimiter: {
    checkLimit: vi.fn().mockReturnValue(true),
    recordAttempt: vi.fn(),
  },
  registerLimiter: {
    checkLimit: vi.fn().mockReturnValue(true),
    recordAttempt: vi.fn(),
  },
}));

vi.mock('../../logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../shared', () => ({
  sanitizePathComponent: vi.fn((s: string) => s),
  getCustomUsernameByFirebaseUid: vi.fn().mockResolvedValue('testuser.1234'),
  generateUniqueUserId: vi.fn().mockResolvedValue('testuser.1234'),
}));

vi.mock('../../e2ee', () => ({
  ensureKeyPair: vi.fn().mockResolvedValue(undefined),
  encryptUserData: vi.fn((_uid: string, data: any) => Promise.resolve(data)),
}));

import { authService } from '../authService';
import { auth, getFCMToken } from '../../firebase';
import { validateEmail, validatePassword, validateUsername, loginLimiter, registerLimiter } from '../../validators';
import { getCustomUsernameByFirebaseUid, generateUniqueUserId } from '../shared';
import { setUserContext, clearUserContext } from '../../errorMonitoring';

const mockAuth = vi.mocked(auth) as any;
const mockGetFCMToken = vi.mocked(getFCMToken);
const mockValidateEmail = vi.mocked(validateEmail);
const mockValidatePassword = vi.mocked(validatePassword);
const mockValidateUsername = vi.mocked(validateUsername);
const mockRegisterLimiter = vi.mocked(registerLimiter);
const mockLoginLimiter = vi.mocked(loginLimiter);
const mockGetCustomUsernameByFirebaseUid = vi.mocked(getCustomUsernameByFirebaseUid);
const mockGenerateUniqueUserId = vi.mocked(generateUniqueUserId);
const mockSetUserContext = vi.mocked(setUserContext);
const mockClearUserContext = vi.mocked(clearUserContext);

beforeEach(() => {
  vi.resetAllMocks();
  mockAuth.currentUser = null;
  mockDoc.mockImplementation((_db: any, ...segments: string[]) => ({ _path: segments }));
  mockSetDoc.mockResolvedValue(undefined);
  mockRtdbSet.mockResolvedValue(undefined);
  mockUpdateProfile.mockResolvedValue(undefined);
  mockSendEmailVerification.mockResolvedValue(undefined);
  mockSendPasswordResetEmail.mockResolvedValue(undefined);
  mockSignOut.mockResolvedValue(undefined);
  mockCreateUserWithEmailAndPassword.mockReset();
  mockSignInWithEmailAndPassword.mockReset();
  mockOnAuthStateChanged.mockReset();
  mockRtdbRef.mockReset();
  mockGenerateUniqueUserId.mockResolvedValue('testuser.1234');
  mockGetCustomUsernameByFirebaseUid.mockResolvedValue('testuser.1234');
  mockSetUserContext.mockReset();
  mockClearUserContext.mockReset();
  mockGetFCMToken.mockResolvedValue('test-token');
});

describe('registerUser', () => {
  const mockUserCredential = {
    user: {
      uid: 'firebase-uid-123',
      email: 'test@example.com',
      displayName: null,
      emailVerified: false,
    },
  };

  beforeEach(() => {
    mockCreateUserWithEmailAndPassword.mockResolvedValue(mockUserCredential);
  });

  it('creates user doc with correct fields', async () => {
    const result = await authService.registerUser('test@example.com', 'TestUser', 'password123');

    expect(result.success).toBe(true);
    expect(result.username).toBe('testuser.1234');
    expect(result.uid).toBe('firebase-uid-123');

    expect(mockGenerateUniqueUserId).toHaveBeenCalledWith('TestUser');
    expect(mockUpdateProfile).toHaveBeenCalledWith(mockUserCredential.user, { displayName: 'testuser.1234' });
    expect(mockSendEmailVerification).toHaveBeenCalledWith(mockUserCredential.user);

    expect(mockSetDoc).toHaveBeenCalledTimes(2);

    const [userDocRef, userDocData] = mockSetDoc.mock.calls[0];
    expect(userDocRef._path).toEqual(['users', 'testuser.1234']);
    expect(userDocData.uid).toBe('firebase-uid-123');
    expect(userDocData.username).toBe('testuser.1234');
    expect(userDocData.email).toBe('test@example.com');
    expect(userDocData.displayName).toBe('TestUser');
    expect(userDocData.photoURL).toBeNull();
    expect(userDocData.emailVerified).toBe(false);
    expect(userDocData.isOnline).toBe(false);
    expect(userDocData.createdAt).toBe('SERVER_TIMESTAMP');
    expect(userDocData.updatedAt).toBe('SERVER_TIMESTAMP');

    const [friendDocRef, friendDocData] = mockSetDoc.mock.calls[1];
    expect(friendDocRef._path).toEqual(['friendships', 'testuser.1234']);
    expect(friendDocData.friends).toEqual([]);
    expect(friendDocData.blockedUsers).toEqual([]);
  });

  it('sets RTDB presence on register', async () => {
    await authService.registerUser('test@example.com', 'TestUser', 'password123');

    expect(mockRtdbRef).toHaveBeenCalledWith({}, 'presence/firebase-uid-123');
    expect(mockRtdbSet).toHaveBeenCalledTimes(1);
    const [, presenceData] = mockRtdbSet.mock.calls[0];
    expect(presenceData.online).toBe(false);
    expect(presenceData.username).toBe('TestUser');
  });

  it('calls setUserContext after registration', async () => {
    await authService.registerUser('test@example.com', 'TestUser', 'password123');

    expect(mockSetUserContext).toHaveBeenCalledWith('firebase-uid-123', 'testuser.1234', 'test@example.com');
  });

  it('returns validation errors when email is invalid', async () => {
    mockValidateEmail.mockImplementation(() => { throw new Error('Invalid email'); });

    const result = await authService.registerUser('bad', 'TestUser', 'password123');

    expect(result.success).toBe(false);
    expect((result as any).errors?.email).toBe('Invalid email');
    expect(mockCreateUserWithEmailAndPassword).not.toHaveBeenCalled();
  });

  it('returns validation errors when username is invalid', async () => {
    mockValidateUsername.mockImplementation(() => { throw new Error('Invalid username'); });

    const result = await authService.registerUser('test@example.com', 'ab', 'password123');

    expect(result.success).toBe(false);
    expect((result as any).errors?.username).toBe('Invalid username');
    expect(mockCreateUserWithEmailAndPassword).not.toHaveBeenCalled();
  });

  it('returns validation errors when password is invalid', async () => {
    mockValidatePassword.mockImplementation(() => { throw new Error('Weak password'); });

    const result = await authService.registerUser('test@example.com', 'TestUser', '123');

    expect(result.success).toBe(false);
    expect((result as any).errors?.password).toBe('Weak password');
    expect(mockCreateUserWithEmailAndPassword).not.toHaveBeenCalled();
  });

  it('returns error when rate limit is exceeded', async () => {
    mockRegisterLimiter.checkLimit.mockRejectedValue(new Error('Rate limit exceeded'));

    const result = await authService.registerUser('test@example.com', 'TestUser', 'password123');

    expect(result.success).toBe(false);
    expect((result as any).errors?.submit).toBe('Rate limit exceeded');
    expect(mockCreateUserWithEmailAndPassword).not.toHaveBeenCalled();
  });

  it('handles email-already-in-use error', async () => {
    const error = new Error('email-already-in-use') as any;
    error.code = 'auth/email-already-in-use';
    mockCreateUserWithEmailAndPassword.mockRejectedValue(error);

    const result = await authService.registerUser('test@example.com', 'TestUser', 'password123');

    expect(result.success).toBe(false);
    expect((result as any).errors?.email).toBe('Email already registered');
  });

  it('handles weak-password error', async () => {
    const error = new Error('weak-password') as any;
    error.code = 'auth/weak-password';
    mockCreateUserWithEmailAndPassword.mockRejectedValue(error);

    const result = await authService.registerUser('test@example.com', 'TestUser', '123');

    expect(result.success).toBe(false);
    expect((result as any).errors?.password).toBe('Password is too weak. Use at least 6 characters');
  });

  it('handles generic registration error', async () => {
    mockCreateUserWithEmailAndPassword.mockRejectedValue(new Error('Something broke'));

    const result = await authService.registerUser('test@example.com', 'TestUser', 'password123');

    expect(result.success).toBe(false);
    expect((result as any).errors?.submit).toBe('Registration failed. Try again later.');
  });
});

describe('loginUser', () => {
  const mockVerifiedUser = {
    uid: 'firebase-uid-456',
    email: 'login@example.com',
    emailVerified: true,
    displayName: 'existinguser.5678',
  };

  const mockUserCredential = {
    user: mockVerifiedUser,
  };

  beforeEach(() => {
    mockSignInWithEmailAndPassword.mockResolvedValue(mockUserCredential);
  });

  it('updates presence to online on login', async () => {
    const result = await authService.loginUser('login@example.com', 'password123');

    expect(result.success).toBe(true);
    expect(result.emailVerified).toBe(true);
    expect(result.username).toBe('testuser.1234');

    expect(mockRtdbRef).toHaveBeenCalledWith({}, 'presence/firebase-uid-456');
    expect(mockRtdbSet).toHaveBeenCalledTimes(1);
    const [, presenceData] = mockRtdbSet.mock.calls[0];
    expect(presenceData.online).toBe(true);
    expect(presenceData.username).toBe('testuser.1234');
  });

  it('updates Firestore user doc with online status', async () => {
    await authService.loginUser('login@example.com', 'password123');

    expect(mockSetDoc).toHaveBeenCalled();
    const [ref, data, options] = mockSetDoc.mock.calls[0];
    expect(ref._path).toEqual(['users', 'testuser.1234']);
    expect(data.isOnline).toBe(true);
    expect(data.emailVerified).toBe(true);
    expect(options).toEqual({ merge: true });
  });

  it('saves FCM token after login', async () => {
    await authService.loginUser('login@example.com', 'password123');

    expect(mockSetDoc).toHaveBeenCalledTimes(2);
    const [fcmRef, fcmData, fcmOptions] = mockSetDoc.mock.calls[1];
    expect(fcmRef._path).toEqual(['users', 'testuser.1234']);
    expect(fcmData.fcmToken).toBe('test-token');
    expect(fcmOptions).toEqual({ merge: true });
  });

  it('calls setUserContext after login', async () => {
    await authService.loginUser('login@example.com', 'password123');

    expect(mockSetUserContext).toHaveBeenCalledWith('firebase-uid-456', 'testuser.1234', 'login@example.com');
  });

  it('returns error for invalid email validation', async () => {
    mockValidateEmail.mockImplementation(() => { throw new Error('Invalid email format'); });

    const result = await authService.loginUser('bad', 'password123');

    expect(result.success).toBe(false);
    expect(result.emailVerified).toBeNull();
    expect((result as any).errors?.email).toBe('Invalid email format');
    expect(mockSignInWithEmailAndPassword).not.toHaveBeenCalled();
  });

  it('returns error when rate limit exceeded', async () => {
    mockLoginLimiter.checkLimit.mockRejectedValue(new Error('Too many attempts'));

    const result = await authService.loginUser('login@example.com', 'password123');

    expect(result.success).toBe(false);
    expect(result.emailVerified).toBeNull();
    expect((result as any).errors?.submit).toBe('Too many attempts');
  });

  it('returns error when email is not verified', async () => {
    const unverifiedUser = {
      uid: 'firebase-uid-789',
      email: 'unverified@example.com',
      emailVerified: false,
    };
    mockSignInWithEmailAndPassword.mockResolvedValue({ user: unverifiedUser });

    const result = await authService.loginUser('unverified@example.com', 'password123');

    expect(result.success).toBe(false);
    expect(result.emailVerified).toBe(false);
    expect(result.message).toBe('Please verify your email before logging in');
  });

  it('returns error when custom username not found', async () => {
    mockGetCustomUsernameByFirebaseUid.mockResolvedValueOnce(null);

    const result = await authService.loginUser('login@example.com', 'password123');

    expect(result.success).toBe(false);
    expect(result.message).toBe('User profile not found. Please re-register.');
  });

  it('handles user-not-found error', async () => {
    const error = new Error('user-not-found') as any;
    error.code = 'auth/user-not-found';
    mockSignInWithEmailAndPassword.mockRejectedValue(error);

    const result = await authService.loginUser('unknown@example.com', 'password123');

    expect(result.success).toBe(false);
    expect((result as any).errors?.email).toBe('No account found with this email');
  });

  it('handles wrong-password error', async () => {
    const error = new Error('wrong-password') as any;
    error.code = 'auth/wrong-password';
    mockSignInWithEmailAndPassword.mockRejectedValue(error);

    const result = await authService.loginUser('login@example.com', 'wrong');

    expect(result.success).toBe(false);
    expect((result as any).errors?.password).toBe('Incorrect password');
  });

  it('handles invalid-credential error', async () => {
    const error = new Error('invalid-credential') as any;
    error.code = 'auth/invalid-credential';
    mockSignInWithEmailAndPassword.mockRejectedValue(error);

    const result = await authService.loginUser('login@example.com', 'password123');

    expect(result.success).toBe(false);
    expect((result as any).errors?.submit).toBe('Invalid credentials');
  });

  it('handles generic login error', async () => {
    mockSignInWithEmailAndPassword.mockRejectedValue(new Error('Unknown error'));

    const result = await authService.loginUser('login@example.com', 'password123');

    expect(result.success).toBe(false);
    expect((result as any).errors?.submit).toBe('Login failed. Try again.');
  });
});

describe('logoutUser', () => {
  const mockUser = {
    uid: 'firebase-uid-100',
    displayName: 'testuser.1234',
    email: 'user@example.com',
  };

  beforeEach(() => {
    mockAuth.currentUser = mockUser as any;
  });

  it('updates presence to offline on logout', async () => {
    const result = await authService.logoutUser();

    expect(result.success).toBe(true);
    expect(mockRtdbRef).toHaveBeenCalledWith({}, 'presence/firebase-uid-100');
    expect(mockRtdbSet).toHaveBeenCalledTimes(1);
    const [, presenceData] = mockRtdbSet.mock.calls[0];
    expect(presenceData.online).toBe(false);
  });

  it('updates Firestore user doc to offline', async () => {
    await authService.logoutUser();

    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    const [ref, data, options] = mockSetDoc.mock.calls[0];
    expect(ref._path).toEqual(['users', 'testuser.1234']);
    expect(data.isOnline).toBe(false);
    expect(options).toEqual({ merge: true });
  });

  it('calls signOut and clearUserContext', async () => {
    await authService.logoutUser();

    expect(mockSignOut).toHaveBeenCalled();
    expect(mockClearUserContext).toHaveBeenCalled();
  });

  it('still signs out even if presence update fails', async () => {
    mockGetCustomUsernameByFirebaseUid.mockRejectedValueOnce(new Error('Firestore error'));

    const result = await authService.logoutUser();

    expect(result.success).toBe(true);
    expect(mockSignOut).toHaveBeenCalled();
    expect(mockClearUserContext).toHaveBeenCalled();
  });

  it('works when no currentUser is set', async () => {
    mockAuth.currentUser = null;

    const result = await authService.logoutUser();

    expect(result.success).toBe(true);
    expect(mockSignOut).toHaveBeenCalled();
    expect(mockClearUserContext).toHaveBeenCalled();
  });
});

describe('getCurrentUser', () => {
  it('returns the current user when auth state resolves', async () => {
    const mockUser = { uid: 'uid-1', email: 'user@test.com' };
    mockOnAuthStateChanged.mockImplementation((_auth: any, callback: any) => {
      callback(mockUser);
      return vi.fn();
    });

    const user = await authService.getCurrentUser();

    expect(user).toBe(mockUser);
    expect(mockOnAuthStateChanged).toHaveBeenCalled();
  });

  it('returns null when no user is authenticated', async () => {
    mockOnAuthStateChanged.mockImplementation((_auth: any, callback: any) => {
      callback(null);
      return vi.fn();
    });

    const user = await authService.getCurrentUser();

    expect(user).toBeNull();
  });
});

describe('getCurrentUserSync', () => {
  it('returns auth.currentUser', () => {
    const mockUser = { uid: 'uid-sync' };
    mockAuth.currentUser = mockUser as any;

    expect(authService.getCurrentUserSync()).toBe(mockUser);
  });

  it('returns null when no user', () => {
    mockAuth.currentUser = null;

    expect(authService.getCurrentUserSync()).toBeNull();
  });
});

describe('updateUserProfile', () => {
  const mockUser = { uid: 'uid-profile' };
  const updates = { name: 'New Name', avatar: 'https://img.url', about: 'Hello world', userId: 'user.1234' };

  beforeEach(() => {
    mockAuth.currentUser = mockUser as any;
  });

  it('updates Firestore doc with provided fields', async () => {
    const result = await authService.updateUserProfile(updates);

    expect(result.success).toBe(true);
    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    const [ref, data, options] = mockSetDoc.mock.calls[0];
    expect(ref._path).toEqual(['users', 'user.1234']);
    expect(data.displayName).toBe('New Name');
    expect(data.photoURL).toBe('https://img.url');
    expect(data.about).toBe('Hello world');
    expect(data.updatedAt).toBe('SERVER_TIMESTAMP');
    expect(options).toEqual({ merge: true });
  });

  it('calls updateProfile when name is provided', async () => {
    await authService.updateUserProfile(updates);

    expect(mockUpdateProfile).toHaveBeenCalledWith(mockUser, { displayName: 'New Name' });
  });

  it('updates only provided fields', async () => {
    await authService.updateUserProfile({ userId: 'user.1234', about: 'Just about' });

    const [, data] = mockSetDoc.mock.calls[0];
    expect(data.about).toBe('Just about');
    expect(data.displayName).toBeUndefined();
    expect(data.photoURL).toBeUndefined();
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });

  it('throws when no authenticated user', async () => {
    mockAuth.currentUser = null;

    await expect(
      authService.updateUserProfile({ userId: 'user.1234', name: 'Name' })
    ).rejects.toThrow('No authenticated user');
  });
});

describe('resendEmailVerification', () => {
  it('sends verification email', async () => {
    mockAuth.currentUser = { uid: 'uid-verify', emailVerified: false } as any;

    const result = await authService.resendEmailVerification();

    expect(result.success).toBe(true);
    expect(mockSendEmailVerification).toHaveBeenCalledWith(mockAuth.currentUser);
  });

  it('throws when no user is logged in', async () => {
    mockAuth.currentUser = null;

    await expect(authService.resendEmailVerification()).rejects.toThrow('No user logged in');
  });

  it('throws when email is already verified', async () => {
    mockAuth.currentUser = { uid: 'uid-verify', emailVerified: true } as any;

    await expect(authService.resendEmailVerification()).rejects.toThrow('Email is already verified');
  });
});

describe('sendPasswordReset', () => {
  it('sends password reset email', async () => {
    const result = await authService.sendPasswordReset('user@example.com');

    expect(result.success).toBe(true);
    expect(mockSendPasswordResetEmail).toHaveBeenCalledWith({ currentUser: null }, 'user@example.com');
  });

  it('propagates errors from Firebase', async () => {
    mockSendPasswordResetEmail.mockRejectedValue(new Error('User not found'));

    await expect(authService.sendPasswordReset('unknown@example.com')).rejects.toThrow('User not found');
  });
});

describe('onAuthStateChange', () => {
  it('wraps Firebase onAuthStateChanged listener', () => {
    const mockUnsubscribe = vi.fn();
    mockOnAuthStateChanged.mockReturnValue(mockUnsubscribe);

    const callback = vi.fn();
    const unsub = authService.onAuthStateChange(callback);

    expect(mockOnAuthStateChanged).toHaveBeenCalledWith({ currentUser: null }, callback);
    expect(unsub).toBe(mockUnsubscribe);
  });
});
