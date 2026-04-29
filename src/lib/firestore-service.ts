/**
 * Firestore Service Layer
 * ─────────────────────────
 * Provides typed, production-ready Firestore CRUD operations for:
 *   - Live Rooms (rooms/{roomId})
 *   - Chat Messages (rooms/{roomId}/messages/{messageId})
 *
 * All methods are client-side and use the Firestore SDK directly
 * (no API routes needed).
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

import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  increment,
  Timestamp,
  type Unsubscribe,
  type DocumentData,
  type QueryConstraint,
} from 'firebase/firestore';

import { getDb } from './firebase';
import type { LiveRoom, ChatMessage } from './types';

// ─── Room Operations ────────────────────────────────────────

/**
 * Create a new live room document in Firestore.
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
  const db = getDb();

  const roomRef = await addDoc(collection(db, 'rooms'), {
    title: params.title,
    description: params.description || null,
    hostId: params.hostId,
    hostName: params.hostName,
    hostAvatar: params.hostAvatar || null,
    channelId: params.channelId,
    isLive: true,
    viewerCount: 0,
    tags: params.tags || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
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
}

/**
 * End a live room (set isLive = false).
 */
export async function endRoomInFirestore(roomId: string): Promise<void> {
  const db = getDb();
  const roomRef = doc(db, 'rooms', roomId);
  await updateDoc(roomRef, {
    isLive: false,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Subscribe to all live rooms in real-time via onSnapshot.
 * Returns an unsubscribe function for cleanup.
 */
export function subscribeToLiveRooms(
  callback: (rooms: LiveRoom[]) => void
): Unsubscribe {
  const db = getDb();

  const q = query(
    collection(db, 'rooms'),
    where('isLive', '==', true),
    orderBy('createdAt', 'desc'),
    limit(50)
  );

  return onSnapshot(q, (snapshot) => {
    const rooms: LiveRoom[] = snapshot.docs.map((doc) => {
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
  }, (error) => {
    console.error('[Firestore] subscribeToLiveRooms error:', error);
    callback([]);
  });
}

/**
 * Increment/decrement the viewer count on a room.
 */
export async function updateViewerCountInFirestore(
  roomId: string,
  delta: number
): Promise<void> {
  const db = getDb();
  const roomRef = doc(db, 'rooms', roomId);
  await updateDoc(roomRef, {
    viewerCount: increment(delta),
  });
}

// ─── Chat Operations ────────────────────────────────────────

/**
 * Send a chat message to a room's messages sub-collection.
 */
export async function sendMessageToFirestore(params: {
  roomId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  message: string;
  type: 'text' | 'system' | 'gift';
}): Promise<string> {
  const db = getDb();

  const messagesRef = collection(db, 'rooms', params.roomId, 'messages');
  const docRef = await addDoc(messagesRef, {
    userId: params.userId,
    userName: params.userName,
    userAvatar: params.userAvatar || null,
    message: params.message,
    type: params.type,
    createdAt: serverTimestamp(),
  });

  return docRef.id;
}

/**
 * Subscribe to chat messages for a room in real-time via onSnapshot.
 * Messages are ordered by createdAt ascending (oldest first).
 * Returns an unsubscribe function for cleanup.
 */
export function subscribeToChatMessages(
  roomId: string,
  callback: (messages: ChatMessage[]) => void,
  messageLimit: number = 100
): Unsubscribe {
  const db = getDb();

  const messagesRef = collection(db, 'rooms', roomId, 'messages');
  const q = query(
    messagesRef,
    orderBy('createdAt', 'asc'),
    limit(messageLimit)
  );

  return onSnapshot(q, (snapshot) => {
    const messages: ChatMessage[] = snapshot.docs.map((doc) => {
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
  }, (error) => {
    console.error('[Firestore] subscribeToChatMessages error:', error);
    callback([]);
  });
}

// ─── Helpers ────────────────────────────────────────────────

/**
 * Convert a Firestore Timestamp or Date to ISO string.
 */
function toISO(value: Timestamp | Date | undefined | null): string {
  if (!value) return new Date().toISOString();
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return new Date().toISOString();
}
