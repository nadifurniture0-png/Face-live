/**
 * Firestore Service Layer
 * ─────────────────────────
 * Provides typed, production-ready Firestore CRUD operations for:
 *   - Live Rooms (rooms/{roomId})
 *   - Chat Messages (rooms/{roomId}/messages/{messageId})
 *
 * ALL functions are guarded by isFirebaseConfigured().
 * If Firebase env vars are missing, every function returns a safe
 * default (empty array, no-op) instead of crashing.
 *
 * Firestore Collection Structure:
 *   rooms/
 *     {roomId}/
 *       channelId: string
 *       title: string
 *       description?: string
 *       hostId: string
 *       hostName: string
 *       hostAvatar?: string
 *       isLive: boolean
 *       viewerCount: number
 *       tags?: string
 *       createdAt: serverTimestamp
 *       updatedAt: serverTimestamp
 *       messages/
 *         {messageId}/
 *           userId: string
 *           userName: string
 *           userAvatar?: string
 *           message: string
 *           type: 'text' | 'system' | 'gift'
 *           createdAt: serverTimestamp
 */

import type { LiveRoom, ChatMessage } from './types';
import type { Unsubscribe, Timestamp } from 'firebase/firestore';

// ─── Lazy-loaded Firebase modules ────────────────────────────
// We use a function to dynamically import Firebase only when
// actually needed. This prevents crashes at module load time
// when env vars are missing.

let _firebaseModules: {
  collection: any;
  doc: any;
  addDoc: any;
  updateDoc: any;
  query: any;
  where: any;
  orderBy: any;
  limit: any;
  onSnapshot: any;
  serverTimestamp: any;
  increment: any;
  getDb: any;
  isFirebaseConfigured: any;
} | null = null;

async function loadFirebase() {
  if (_firebaseModules) return _firebaseModules;

  const [
    { collection, doc, addDoc, updateDoc, query, where, orderBy, limit, onSnapshot, serverTimestamp, increment },
    { getDb, isFirebaseConfigured },
  ] = await Promise.all([
    import('firebase/firestore'),
    import('./firebase'),
  ]);

  _firebaseModules = {
    collection, doc, addDoc, updateDoc, query, where, orderBy, limit,
    onSnapshot, serverTimestamp, increment, getDb, isFirebaseConfigured,
  };
  return _firebaseModules;
}

// ─── Room Operations ────────────────────────────────────────

/**
 * Create a new live room document in Firestore.
 * If Firebase is not configured, returns a local-only room.
 */
export async function createRoomInFirestore(params: {
  title: string;
  description?: string;
  hostId: string;
  hostName: string;
  hostAvatar?: string;
  channelId: string;
  tags?: string;
}): Promise<LiveRoom> {
  try {
    const fb = await loadFirebase();
    if (!fb.isFirebaseConfigured()) {
      console.warn('[Firestore] Not configured — creating local-only room');
      return localRoom(params);
    }

    const db = fb.getDb();
    const roomRef = await fb.addDoc(fb.collection(db, 'rooms'), {
      title: params.title,
      description: params.description || null,
      hostId: params.hostId,
      hostName: params.hostName,
      hostAvatar: params.hostAvatar || null,
      channelId: params.channelId,
      isLive: true,
      viewerCount: 0,
      tags: params.tags || null,
      createdAt: fb.serverTimestamp(),
      updatedAt: fb.serverTimestamp(),
    });

    return {
      id: roomRef.id,
      title: params.title,
      description: params.description,
      hostId: params.hostId,
      hostName: params.hostName,
      hostAvatar: params.hostAvatar,
      channelId: params.channelId,
      isLive: true,
      viewerCount: 0,
      tags: params.tags,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[Firestore] createRoom error:', err);
    return localRoom(params);
  }
}

/**
 * End a live room (set isLive = false).
 * No-op if Firebase is not configured.
 */
export async function endRoomInFirestore(roomId: string): Promise<void> {
  try {
    const fb = await loadFirebase();
    if (!fb.isFirebaseConfigured()) return;

    const db = fb.getDb();
    const roomRef = fb.doc(db, 'rooms', roomId);
    await fb.updateDoc(roomRef, {
      isLive: false,
      updatedAt: fb.serverTimestamp(),
    });
  } catch (err) {
    console.error('[Firestore] endRoom error:', err);
  }
}

/**
 * Subscribe to all live rooms in real-time via onSnapshot.
 * If Firebase is not configured, returns an empty unsubscribe fn.
 */
export function subscribeToLiveRooms(
  callback: (rooms: LiveRoom[]) => void
): Unsubscribe {
  // Dynamic async setup — callback gets [] until Firebase is ready
  (async () => {
    try {
      const fb = await loadFirebase();
      if (!fb.isFirebaseConfigured()) {
        console.warn('[Firestore] Not configured — rooms list is empty');
        callback([]);
        return;
      }

      const db = fb.getDb();
      const q = fb.query(
        fb.collection(db, 'rooms'),
        fb.where('isLive', '==', true),
        fb.orderBy('createdAt', 'desc'),
        fb.limit(50)
      );

      fb.onSnapshot(q, (snapshot: any) => {
        const rooms: LiveRoom[] = snapshot.docs.map((doc: any) => {
          const data = doc.data();
          return {
            id: doc.id,
            title: data.title || '',
            description: data.description || undefined,
            hostId: data.hostId || '',
            hostName: data.hostName || 'Unknown',
            hostAvatar: data.hostAvatar || undefined,
            channelId: data.channelId || '',
            isLive: data.isLive ?? false,
            viewerCount: data.viewerCount ?? 0,
            tags: data.tags || undefined,
            createdAt: toISO(data.createdAt),
            updatedAt: toISO(data.updatedAt),
          };
        });
        callback(rooms);
      }, (error: any) => {
        console.error('[Firestore] subscribeToLiveRooms error:', error);
        callback([]);
      });
    } catch (err) {
      console.error('[Firestore] subscribeToLiveRooms error:', err);
      callback([]);
    }
  })();

  // Return a no-op unsubscribe immediately
  return () => {};
}

/**
 * Increment/decrement the viewer count on a room.
 * No-op if Firebase is not configured.
 */
export async function updateViewerCountInFirestore(
  roomId: string,
  delta: number
): Promise<void> {
  try {
    const fb = await loadFirebase();
    if (!fb.isFirebaseConfigured()) return;

    const db = fb.getDb();
    const roomRef = fb.doc(db, 'rooms', roomId);
    await fb.updateDoc(roomRef, {
      viewerCount: fb.increment(delta),
    });
  } catch (err) {
    console.error('[Firestore] updateViewerCount error:', err);
  }
}

// ─── Chat Operations ────────────────────────────────────────

/**
 * Send a chat message to a room's messages sub-collection.
 * If Firebase is not configured, returns a fake message ID.
 */
export async function sendMessageToFirestore(params: {
  roomId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  message: string;
  type: 'text' | 'system' | 'gift';
}): Promise<string> {
  try {
    const fb = await loadFirebase();
    if (!fb.isFirebaseConfigured()) {
      return `local_${Date.now()}`;
    }

    const db = fb.getDb();
    const messagesRef = fb.collection(db, 'rooms', params.roomId, 'messages');
    const docRef = await fb.addDoc(messagesRef, {
      userId: params.userId,
      userName: params.userName,
      userAvatar: params.userAvatar || null,
      message: params.message,
      type: params.type,
      createdAt: fb.serverTimestamp(),
    });

    return docRef.id;
  } catch (err) {
    console.error('[Firestore] sendMessage error:', err);
    return `local_${Date.now()}`;
  }
}

/**
 * Subscribe to chat messages for a room in real-time via onSnapshot.
 * If Firebase is not configured, returns an empty unsubscribe fn.
 */
export function subscribeToChatMessages(
  roomId: string,
  callback: (messages: ChatMessage[]) => void,
  messageLimit: number = 100
): Unsubscribe {
  // Dynamic async setup
  (async () => {
    try {
      const fb = await loadFirebase();
      if (!fb.isFirebaseConfigured()) {
        console.warn('[Firestore] Not configured — chat is local-only');
        callback([]);
        return;
      }

      const db = fb.getDb();
      const messagesRef = fb.collection(db, 'rooms', roomId, 'messages');
      const q = fb.query(
        messagesRef,
        fb.orderBy('createdAt', 'asc'),
        fb.limit(messageLimit)
      );

      fb.onSnapshot(q, (snapshot: any) => {
        const messages: ChatMessage[] = snapshot.docs.map((doc: any) => {
          const data = doc.data();
          return {
            id: doc.id,
            roomId,
            userId: data.userId || '',
            userName: data.userName || 'Anonymous',
            userAvatar: data.userAvatar || undefined,
            message: data.message || '',
            type: data.type || 'text',
            createdAt: toISO(data.createdAt),
          };
        });
        callback(messages);
      }, (error: any) => {
        console.error('[Firestore] subscribeToChatMessages error:', error);
        callback([]);
      });
    } catch (err) {
      console.error('[Firestore] subscribeToChatMessages error:', err);
      callback([]);
    }
  })();

  // Return a no-op unsubscribe immediately
  return () => {};
}

// ─── Helpers ────────────────────────────────────────────────

/**
 * Create a local-only room (fallback when Firebase is unavailable).
 */
function localRoom(params: {
  title: string;
  description?: string;
  hostId: string;
  hostName: string;
  hostAvatar?: string;
  channelId: string;
  tags?: string;
}): LiveRoom {
  return {
    id: `local_${Date.now()}`,
    title: params.title,
    description: params.description,
    hostId: params.hostId,
    hostName: params.hostName,
    hostAvatar: params.hostAvatar,
    channelId: params.channelId,
    isLive: true,
    viewerCount: 0,
    tags: params.tags,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Convert a Firestore Timestamp or Date to ISO string.
 */
function toISO(value: Timestamp | Date | undefined | null): string {
  if (!value) return new Date().toISOString();
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return new Date().toISOString();
}
