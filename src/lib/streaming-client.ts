/**
 * Agora Streaming Client
 * ───────────────────────
 * Production Agora.io integration for the StreamLive application.
 * Uses dynamic imports for agora-rtc-sdk-ng to avoid SSR issues
 * with Next.js Turbopack.
 *
 * Host flow:
 *   1. Dynamically import AgoraRTC (client-side only)
 *   2. Create client in "live" mode, codec "vp8"
 *   3. Join channel as "host" role
 *   4. Create custom video track from canvas.captureStream()
 *   5. Create microphone audio track from getUserMedia()
 *   6. Publish both tracks to the channel
 *
 * Viewer flow:
 *   1. Dynamically import AgoraRTC (client-side only)
 *   2. Create client in "live" mode, codec "vp8"
 *   3. Join channel as "audience" role
 *   4. Subscribe to remote video + audio tracks
 *   5. Play the remote tracks on the viewer's <video> element
 */

import type { StreamConfig, StreamStats } from './types';

// Agora types — imported only for type annotations
type AgoraRTCType = typeof import('agora-rtc-sdk-ng').default;

// Re-export relevant Agora types for consumers
export type {
  IRemoteVideoTrack,
  IRemoteAudioTrack,
} from 'agora-rtc-sdk-ng';

export interface StreamingClientCallbacks {
  onStreamPublished?: () => void;
  onStreamSubscribed?: (videoTrack: import('agora-rtc-sdk-ng').IRemoteVideoTrack, audioTrack: import('agora-rtc-sdk-ng').IRemoteAudioTrack | undefined) => void;
  onViewerJoined?: (viewerCount: number) => void;
  onViewerLeft?: (viewerCount: number) => void;
  onError?: (error: string) => void;
  onDisconnected?: () => void;
  onConnectionStateChange?: (state: string, reason: string) => void;
}

// Module-level cache for the Agora SDK
let agoraModuleCache: AgoraRTCType | null = null;

/**
 * Dynamically load the Agora RTC SDK (client-side only).
 */
async function loadAgoraRTC(): Promise<AgoraRTCType> {
  if (agoraModuleCache) return agoraModuleCache;

  const AgoraRTC = await import('agora-rtc-sdk-ng');
  agoraModuleCache = AgoraRTC.default;
  return agoraModuleCache;
}

/**
 * AgoraStreamingClient — Real Agora.io SDK wrapper
 *
 * Manages the complete WebRTC publish/subscribe lifecycle.
 * All Agora SDK calls go through dynamic imports to ensure
 * compatibility with Next.js SSR/Turbopack.
 */
export class AgoraStreamingClient {
  private config: StreamConfig;
  private callbacks: StreamingClientCallbacks;

  // Agora SDK instances (stored as `any` to avoid static type imports)
  private client: any = null;
  private localVideoTrack: any = null;
  private localAudioTrack: any = null;
  private remoteVideoTrack: any = null;
  private remoteAudioTrack: any = null;
  private canvasStream: MediaStream | null = null;

  private isPublishing = false;
  private startTime: number = 0;

  constructor(config: StreamConfig, callbacks: StreamingClientCallbacks = {}) {
    this.config = config;
    this.callbacks = callbacks;
  }

  // ─── Host: Join Channel & Publish Canvas Stream ───────────

  /**
   * Join the Agora channel as a HOST and publish the canvas stream.
   *
   * @param canvas - The <canvas> element with the face-swap processed video
   * @param micEnabled - Whether to capture and publish microphone audio
   */
  async publish(canvas: HTMLCanvasElement, micEnabled: boolean = true): Promise<void> {
    const appId = process.env.NEXT_PUBLIC_AGORA_APP_ID;
    const token = process.env.NEXT_PUBLIC_AGORA_TOKEN;

    if (!appId) {
      throw new Error('NEXT_PUBLIC_AGORA_APP_ID is not configured');
    }

    try {
      // 1. Dynamically load the Agora SDK
      const AgoraRTC = await loadAgoraRTC();

      // 2. Capture stream from the canvas (face-swap processed output)
      this.canvasStream = canvas.captureStream(this.config.fps);
      const canvasVideoTrack = this.canvasStream.getVideoTracks()[0];

      if (!canvasVideoTrack) {
        throw new Error('No video track found in canvas stream');
      }
      console.log('[AgoraClient] Canvas stream captured:', canvasVideoTrack.getSettings());

      // 3. Create Agora client in "live" mode
      this.client = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' });

      // 4. Listen for connection state changes
      this.client.on('connection-state-change', (state: string, reason: string) => {
        console.log('[AgoraClient] Connection state:', state, 'Reason:', reason);
        this.callbacks.onConnectionStateChange?.(state, reason);
      });

      // 5. Create a custom video track from the canvas media stream track
      this.localVideoTrack = AgoraRTC.createCustomVideoTrack({
        mediaStreamTrack: canvasVideoTrack,
        optimizationMode: 'detail',
      });
      console.log('[AgoraClient] Custom video track created from canvas');

      // 6. Create microphone audio track if enabled
      if (micEnabled) {
        try {
          this.localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack({
            encoderConfig: 'music_standard',
          });
          console.log('[AgoraClient] Microphone audio track created');
        } catch (micErr) {
          console.warn('[AgoraClient] Microphone access denied, publishing video-only:', micErr);
        }
      }

      // 7. Join the Agora channel as HOST
      const uid = typeof this.config.uid === 'string' ? this.config.uid : String(this.config.uid);
      await this.client.join(appId, this.config.channelId, token || undefined, uid);
      console.log('[AgoraClient] Joined channel as host:', this.config.channelId);

      // 8. Publish tracks
      const tracksToPublish: any[] = [this.localVideoTrack];
      if (this.localAudioTrack) {
        tracksToPublish.push(this.localAudioTrack);
      }
      await this.client.publish(tracksToPublish);
      console.log('[AgoraClient] Published', tracksToPublish.length, 'track(s)');

      // 9. Enable dual-stream for adaptive quality delivery
      try {
        await this.client.enableDualStream();
      } catch {
        console.warn('[AgoraClient] Dual stream not available');
      }

      this.isPublishing = true;
      this.startTime = Date.now();

      // 10. Listen for viewer join/leave events
      this.client.on('user-joined', (user: any) => {
        const viewerCount = this.client ? this.client.remoteUsers.length : 0;
        console.log('[AgoraClient] Viewer joined:', user.uid, 'Total viewers:', viewerCount);
        this.callbacks.onViewerJoined?.(viewerCount);
      });

      this.client.on('user-left', (user: any) => {
        const viewerCount = this.client ? this.client.remoteUsers.length : 0;
        console.log('[AgoraClient] Viewer left:', user.uid, 'Total viewers:', viewerCount);
        this.callbacks.onViewerLeft?.(viewerCount);
      });

      // 11. Notify that publishing is complete
      this.callbacks.onStreamPublished?.();

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to publish stream';
      console.error('[AgoraClient] Publish error:', message);
      this.callbacks.onError?.(message);
      await this.cleanup();
      throw error;
    }
  }

  // ─── Viewer: Join Channel & Subscribe to Remote Stream ────

  /**
   * Join the Agora channel as an AUDIENCE member and subscribe to the
   * host's remote video + audio tracks. The tracks are played directly
   * on the provided <video> element.
   *
   * @param videoElement - The <video> element to play the remote stream on
   */
  async subscribe(videoElement: HTMLVideoElement): Promise<void> {
    const appId = process.env.NEXT_PUBLIC_AGORA_APP_ID;
    const token = process.env.NEXT_PUBLIC_AGORA_TOKEN;

    if (!appId) {
      throw new Error('NEXT_PUBLIC_AGORA_APP_ID is not configured');
    }

    try {
      // 1. Dynamically load the Agora SDK
      const AgoraRTC = await loadAgoraRTC();

      // 2. Create Agora client in "live" mode
      this.client = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' });

      // 3. Connection state monitoring
      this.client.on('connection-state-change', (state: string, reason: string) => {
        console.log('[AgoraClient] Connection state:', state, 'Reason:', reason);
        this.callbacks.onConnectionStateChange?.(state, reason);

        if (state === 'DISCONNECTED') {
          this.callbacks.onDisconnected?.();
        }
      });

      // 4. Join as AUDIENCE
      const uid = typeof this.config.uid === 'string' ? this.config.uid : String(this.config.uid);
      await this.client.join(appId, this.config.channelId, token || undefined, uid);
      await this.client.setClientRole('audience');
      console.log('[AgoraClient] Joined channel as audience:', this.config.channelId);

      // 5. Handle remote user publishing events
      this.client.on('user-published', async (user: any, mediaType: string) => {
        try {
          await this.client!.subscribe(user, mediaType);
          console.log('[AgoraClient] Subscribed to', mediaType, 'from user:', user.uid);

          if (mediaType === 'video' && user.videoTrack) {
            this.remoteVideoTrack = user.videoTrack;
            user.videoTrack.play(videoElement);
            console.log('[AgoraClient] Remote video playing on viewer element');
          }

          if (mediaType === 'audio' && user.audioTrack) {
            this.remoteAudioTrack = user.audioTrack;
            user.audioTrack.play();
            console.log('[AgoraClient] Remote audio playing');
          }

          if (this.remoteVideoTrack) {
            this.callbacks.onStreamSubscribed?.(this.remoteVideoTrack, this.remoteAudioTrack ?? undefined);
          }
        } catch (subErr) {
          console.error('[AgoraClient] Subscribe error:', subErr);
        }
      });

      // 6. Handle remote user going offline
      this.client.on('user-unpublished', (user: any, mediaType: string) => {
        console.log('[AgoraClient] User unpublished', mediaType, ':', user.uid);
        if (mediaType === 'video') {
          this.remoteVideoTrack = null;
        }
        if (mediaType === 'audio') {
          this.remoteAudioTrack = null;
        }
      });

      // 7. Handle host leaving entirely
      this.client.on('user-left', (user: any) => {
        console.log('[AgoraClient] User left:', user.uid);
        this.remoteVideoTrack = null;
        this.remoteAudioTrack = null;
      });

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to subscribe to stream';
      console.error('[AgoraClient] Subscribe error:', message);
      this.callbacks.onError?.(message);
      await this.cleanup();
      throw error;
    }
  }

  // ─── Audio Controls ───────────────────────────────────────

  async setMuted(muted: boolean): Promise<void> {
    if (this.localAudioTrack) {
      await this.localAudioTrack.setEnabled(!muted);
    }
  }

  setRemoteAudioMuted(muted: boolean): void {
    if (this.remoteAudioTrack) {
      this.remoteAudioTrack.setVolume(muted ? 0 : 100);
    }
  }

  // ─── Remote Users ─────────────────────────────────────────

  getRemoteUserCount(): number {
    return this.client?.remoteUsers?.length ?? 0;
  }

  // ─── Get Stats ────────────────────────────────────────────

  async getStats(): Promise<StreamStats> {
    const duration = this.startTime
      ? Math.floor((Date.now() - this.startTime) / 1000)
      : 0;

    let bitrate = 0;
    let fps = this.config.fps;
    let viewers = 0;

    if (this.client) {
      viewers = this.client.remoteUsers?.length ?? 0;

      try {
        if (this.isPublishing && this.localVideoTrack) {
          const localStats = this.client.getLocalVideoStats();
          bitrate = localStats.sendBitrate ?? 0;
          fps = localStats.sendFrameRate ?? this.config.fps;
        } else if (!this.isPublishing && this.remoteVideoTrack) {
          const remoteStats = this.client.getRemoteVideoStats();
          const firstKey = Object.keys(remoteStats)[0];
          if (firstKey) {
            bitrate = remoteStats[firstKey].receiveBitrate ?? 0;
            fps = remoteStats[firstKey].receiveFrameRate ?? this.config.fps;
          }
        }
      } catch {
        // Stats may not be available yet
      }
    }

    return {
      bitrate: Math.round(bitrate),
      fps: Math.round(fps),
      resolution: `${this.config.resolution.width}x${this.config.resolution.height}`,
      duration,
      viewers,
    };
  }

  // ─── Stop & Cleanup ───────────────────────────────────────

  async stop(): Promise<void> {
    await this.cleanup();
    this.callbacks.onDisconnected?.();
  }

  private async cleanup(): Promise<void> {
    this.isPublishing = false;

    if (this.localVideoTrack) {
      this.localVideoTrack.stop();
      this.localVideoTrack.close();
      this.localVideoTrack = null;
    }

    if (this.localAudioTrack) {
      this.localAudioTrack.stop();
      this.localAudioTrack.close();
      this.localAudioTrack = null;
    }

    if (this.canvasStream) {
      this.canvasStream.getTracks().forEach((track) => track.stop());
      this.canvasStream = null;
    }

    this.remoteVideoTrack = null;
    this.remoteAudioTrack = null;

    if (this.client) {
      try {
        const state = this.client.connectionState;
        if (state !== 'DISCONNECTED' && state !== 'DISCONNECTING') {
          await this.client.leave();
        }
      } catch (err) {
        console.warn('[AgoraClient] Leave error:', err);
      }
      this.client.removeAllListeners();
      this.client = null;
    }

    console.log('[AgoraClient] Cleaned up and disconnected');
  }
}

/**
 * Create a default stream configuration using the channel from env.
 */
export function createDefaultStreamConfig(
  channelId: string,
  userId: string
): StreamConfig {
  return {
    channelId: channelId || process.env.NEXT_PUBLIC_AGORA_CHANNEL || 'test-live-room',
    uid: userId,
    quality: 'high',
    fps: 30,
    resolution: { width: 1280, height: 720 },
  };
}

/**
 * Get the configured Agora channel name from env.
 */
export function getAgoraChannel(): string {
  return process.env.NEXT_PUBLIC_AGORA_CHANNEL || 'test-live-room';
}

// ─── Added this line to fix the Vercel Error ───────────────
export const isAgoraConfigured = !!process.env.NEXT_PUBLIC_AGORA_APP_ID;
