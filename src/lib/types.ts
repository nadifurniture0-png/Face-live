/**
 * StreamLive - TypeScript Types & Interfaces
 * Complete type definitions for the live streaming application
 */

// ─── User & Auth Types ───────────────────────────────────────────
export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  role: 'host' | 'viewer';
  createdAt: string;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface LoginCredentials {
  email: string;
  name: string;
  password?: string; // mock — not validated
}

// ─── Live Room Types ─────────────────────────────────────────────
export interface LiveRoom {
  id: string;
  title: string;
  description?: string;
  hostId: string;
  hostName: string;
  hostAvatar?: string;
  channelId: string;
  isLive: boolean;
  viewerCount: number;
  tags?: string;
  thumbnail?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRoomPayload {
  title: string;
  description?: string;
  tags?: string;
}

// ─── Chat Types ──────────────────────────────────────────────────
export interface ChatMessage {
  id: string;
  roomId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  message: string;
  type: 'text' | 'system' | 'gift';
  createdAt: string;
}

export interface SendMessagePayload {
  roomId: string;
  message: string;
  type?: 'text' | 'gift';
}

// ─── Streaming / Agora Types ─────────────────────────────────────
export type StreamQuality = 'low' | 'medium' | 'high' | 'ultra';

export interface StreamConfig {
  channelId: string;
  uid: number | string;
  token?: string;
  quality: StreamQuality;
  fps: number;
  resolution: { width: number; height: number };
}

export interface StreamStats {
  bitrate: number;
  fps: number;
  resolution: string;
  duration: number;
  viewers: number;
}

// ─── Face Swap Types ─────────────────────────────────────────────
export type FaceFilterType = 'none' | 'face-swap' | 'beauty' | 'cartoon' | 'neon';

export interface FaceSwapConfig {
  filterType: FaceFilterType;
  intensity: number; // 0 - 100
  targetImage?: string; // URL for face swap target
}

// ─── App View States ─────────────────────────────────────────────
export type AppView = 'login' | 'home' | 'host-studio' | 'viewer-room';

export interface AppNotification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  duration?: number;
}
