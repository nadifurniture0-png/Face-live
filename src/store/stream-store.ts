/**
 * Zustand Stream Store
 * ──────────────────────
 * Manages streaming state: rooms, active stream, face filters.
 *
 * Room operations now go directly to Firestore (no API routes).
 * The `fetchRooms` method sets up a real-time onSnapshot listener
 * that keeps the rooms list automatically in sync.
 */
import { create } from 'zustand';
import type {
  LiveRoom,
  AppView,
  FaceFilterType,
  FaceSwapConfig,
  StreamStats,
} from '@/lib/types';
import {
  subscribeToLiveRooms,
  createRoomInFirestore,
  endRoomInFirestore,
  updateViewerCountInFirestore,
} from '@/lib/firestore-service';
import type { Unsubscribe } from 'firebase/firestore';

interface StreamStore {
  // Navigation
  currentView: AppView;
  setView: (view: AppView) => void;

  // Rooms
  rooms: LiveRoom[];
  isLoadingRooms: boolean;
  fetchRooms: () => () => void; // returns unsubscribe fn
  createRoom: (params: {
    title: string;
    description?: string;
    hostId: string;
    hostName: string;
    hostAvatar?: string;
    channelId: string;
    tags?: string;
  }) => Promise<LiveRoom>;
  endRoom: (roomId: string) => Promise<void>;

  // Active stream
  activeRoom: LiveRoom | null;
  setActiveRoom: (room: LiveRoom | null) => void;
  updateViewerCount: (roomId: string, delta: number) => void;

  // Host stream
  isStreaming: boolean;
  streamDuration: number;
  setIsStreaming: (streaming: boolean) => void;
  incrementDuration: () => void;

  // Face swap
  faceSwapConfig: FaceSwapConfig;
  setFaceSwapFilter: (filterType: FaceFilterType) => void;
  setFaceSwapIntensity: (intensity: number) => void;

  // Stats
  streamStats: StreamStats;
  updateStreamStats: (stats: Partial<StreamStats>) => void;

  // Internal
  _roomsUnsub: Unsubscribe | null;
}

export const useStreamStore = create<StreamStore>((set, get) => ({
  // Navigation
  currentView: 'login',
  setView: (view) => set({ currentView: view }),

  // Rooms
  rooms: [],
  isLoadingRooms: false,
  _roomsUnsub: null,

  /**
   * Subscribe to live rooms via Firestore onSnapshot.
   * Returns an unsubscribe function — call it on unmount to prevent leaks.
   */
  fetchRooms: () => {
    const { _roomsUnsub } = get();

    // Unsubscribe from any previous listener
    if (_roomsUnsub) {
      _roomsUnsub();
    }

    set({ isLoadingRooms: true });

    const unsub = subscribeToLiveRooms((rooms) => {
      set({ rooms, isLoadingRooms: false });
    });

    // Store unsubscribe handle for cleanup
    set({ _roomsUnsub: unsub });

    return unsub;
  },

  /**
   * Create a new live room in Firestore.
   * The room will appear in the list automatically via the onSnapshot listener.
   */
  createRoom: async (params) => {
    const room = await createRoomInFirestore(params);
    // The onSnapshot listener will pick up the new room automatically,
    // but we also push it locally for immediate UI feedback.
    set((state) => ({
      rooms: [room, ...state.rooms],
    }));
    return room;
  },

  /**
   * Mark a room as ended (isLive = false) in Firestore.
   * It will be removed from the live list by the onSnapshot query filter.
   */
  endRoom: async (roomId) => {
    try {
      await endRoomInFirestore(roomId);
    } catch (err) {
      console.error('[StreamStore] endRoom error:', err);
    }
  },

  // Active stream
  activeRoom: null,
  setActiveRoom: (room) => set({ activeRoom: room }),

  updateViewerCount: (roomId, delta) => {
    // Update local state optimistically
    set((state) => ({
      rooms: state.rooms.map((r) =>
        r.id === roomId ? { ...r, viewerCount: r.viewerCount + delta } : r
      ),
      activeRoom:
        state.activeRoom?.id === roomId
          ? { ...state.activeRoom, viewerCount: state.activeRoom.viewerCount + delta }
          : state.activeRoom,
    }));

    // Persist to Firestore (fire-and-forget)
    updateViewerCountInFirestore(roomId, delta).catch((err) => {
      console.error('[StreamStore] updateViewerCount error:', err);
    });
  },

  // Host stream
  isStreaming: false,
  streamDuration: 0,
  setIsStreaming: (streaming) => set({ isStreaming: streaming, streamDuration: 0 }),
  incrementDuration: () =>
    set((state) => ({ streamDuration: state.streamDuration + 1 })),

  // Face swap
  faceSwapConfig: { filterType: 'none', intensity: 75 },
  setFaceSwapFilter: (filterType) =>
    set((state) => ({ faceSwapConfig: { ...state.faceSwapConfig, filterType } })),
  setFaceSwapIntensity: (intensity) =>
    set((state) => ({ faceSwapConfig: { ...state.faceSwapConfig, intensity } })),

  // Stats
  streamStats: { bitrate: 0, fps: 30, resolution: '1280x720', duration: 0, viewers: 0 },
  updateStreamStats: (stats) =>
    set((state) => ({ streamStats: { ...state.streamStats, ...stats } })),
}));
