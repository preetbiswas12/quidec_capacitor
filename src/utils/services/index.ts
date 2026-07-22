/**
 * Firebase Services - Index Barrel
 * Re-exports all modular service files for clean imports.
 */

// Core services (extracted from firebaseServices.ts)
export { authService } from './authService';
export { presenceService } from './presenceService';
export { typingService } from './typingService';
export { friendRequestService } from './friendRequestService';
export { notificationService } from './notificationService';
export { userService } from './userService';
export { conversationService } from './conversationService';
export { messageService } from './messageService';
export { groupService } from './groupService';
export { statusService } from './statusService';
export { callService } from './callService';

// Shared utilities
export {
  MESSAGE_STATUS,
  sanitizePathComponent,
  normalizeFirestoreTimestamp,
  getCustomUsernameByFirebaseUid,
  generateUniqueUserId,
  generateUserIdSync,
  getConversationId,
  getGroupKey,
} from './shared';

// Default export for backward compatibility
import { authService } from './authService';
import { presenceService } from './presenceService';
import { typingService } from './typingService';
import { friendRequestService } from './friendRequestService';
import { notificationService } from './notificationService';
import { userService } from './userService';
import { conversationService } from './conversationService';
import { messageService } from './messageService';
import { groupService } from './groupService';
import { statusService } from './statusService';
import { callService } from './callService';
import { generateUniqueUserId, MESSAGE_STATUS } from './shared';

export default {
  authService,
  presenceService,
  messageService,
  typingService,
  friendRequestService,
  notificationService,
  userService,
  conversationService,
  groupService,
  statusService,
  callService,
  generateUniqueUserId,
  MESSAGE_STATUS,
};