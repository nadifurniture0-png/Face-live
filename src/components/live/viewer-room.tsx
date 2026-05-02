'use client';

/**
 * ViewerRoom Component — Full-Screen Overlay Layout
 * ─────────────────────────────────────────────────
 * TRUE full-screen immersive layout:
 *   - Video covers the ENTIRE screen (absolute inset-0)
 *   - ALL UI elements float ON TOP as absolute overlays
 *   - No flex-col, no bottom strips, no split layouts
 *
 * Uses a <div> container for Agora's track.play() instead of
 * a <video> element. The Agora SDK v4 creates its own <video>
 * element inside the container.
 *
 * When Agora is not configured, operates in DEMO MODE:
 *   - Shows a simulated "connected" state
 *   - UI works fully for testing
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  ArrowLeft,
  Users,
  Clock,
  Gift,
  Heart,
  Share2,
  Maximize2,
  Volume2,
  VolumeX,
  MessageCircle,
  WifiOff,
  Loader2,
  Activity,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth-store';
import { useStreamStore } from '@/store/stream-store';
import { AgoraStreamingClient, createDefaultStreamConfig, getAgoraChannel, isAgoraConfigured } from '@/lib/streaming-client';
import { ChatBox } from './chat-box';
import type { LiveRoom } from '@/lib/types';

interface ViewerRoomProps {
  room: LiveRoom;
}

export function ViewerRoom({ room }: ViewerRoomProps) {
  const user = useAuthStore((s) => s.user);
  const { setView, updateViewerCount, updateStreamStats } = useStreamStore();

  // ── Container ref for Agora to render video into (NOT a <video> ref) ──
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<AgoraStreamingClient | null>(null);
  const statsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // State
  const [isMuted, setIsMuted] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [elapsedTime, setElapsedTime] = useState('00:00');
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [showGifts, setShowGifts] = useState(false);
  const [floatingHearts, setFloatingHearts] = useState<number[]>([]);
  const [streamStats, setStreamStats] = useState({ bitrate: 0, fps: 0 });
  const [connectionState, setConnectionState] = useState<string>('disconnected');
  const [demoMode, setDemoMode] = useState(false);

  // ─── Join Agora Channel & Subscribe ────────────────────────

  useEffect(() => {
    const container = videoContainerRef.current;
    if (!container) return;

    let destroyed = false;

    const joinChannel = async () => {
      try {
        setIsConnecting(true);
        setConnectionError(null);

        // Check if Agora is configured
        if (!isAgoraConfigured()) {
          setDemoMode(true);
        }

        const agoraChannel = getAgoraChannel();
        const viewerUid = `viewer_${user?.id || Date.now()}`;

        const config = createDefaultStreamConfig(agoraChannel, viewerUid);
        const client = new AgoraStreamingClient(config, {
          onStreamSubscribed: (videoTrack) => {
            console.log('[ViewerRoom] Subscribed to remote stream');
            setIsConnecting(false);
            setIsConnected(true);
          },
          onConnectionStateChange: (state) => {
            setConnectionState(state);
            if (state === 'CONNECTED') {
              setIsConnecting(false);
              setIsConnected(true);
            }
            if (state === 'DISCONNECTED' || state === 'FAILED') {
              setIsConnecting(false);
              setIsConnected(false);
            }
          },
          onError: (err) => {
            setConnectionError(err);
            setIsConnecting(false);
          },
          onDisconnected: () => {
            setIsConnected(false);
          },
        });

        clientRef.current = client;
        await client.subscribe(container);

        if (destroyed) {
          await client.stop();
          return;
        }

        updateViewerCount(room.id, 1);
      } catch (err) {
        if (destroyed) return;
        console.error('[ViewerRoom] Join error:', err);
        setConnectionError(
          err instanceof Error ? err.message : 'Failed to join live stream'
        );
        setIsConnecting(false);
      }
    };

    joinChannel();

    const startTime = Date.now();
    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
      const secs = (elapsed % 60).toString().padStart(2, '0');
      setElapsedTime(`${mins}:${secs}`);
    }, 1000);

    statsIntervalRef.current = setInterval(async () => {
      if (clientRef.current && isConnected) {
        try {
          const stats = await clientRef.current.getStats();
          setStreamStats({ bitrate: stats.bitrate, fps: stats.fps });
          updateStreamStats({ viewers: stats.viewers });
        } catch {
          // Stats may fail temporarily
        }
      }
    }, 3000);

    return () => {
      destroyed = true;
      clearInterval(timer);
      if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
      if (clientRef.current) {
        clientRef.current.stop();
        clientRef.current = null;
      }
      if (container) container.innerHTML = '';
      updateViewerCount(room.id, -1);
    };
  }, [room.id, room.channelId, updateViewerCount, updateStreamStats, user?.id]);

  // ─── Toggle Mute ───────────────────────────────────────────

  const toggleMute = useCallback(() => {
    if (clientRef.current) clientRef.current.setRemoteAudioMuted(!isMuted);
    setIsMuted((prev) => !prev);
  }, [isMuted]);

  // ─── Leave Room ────────────────────────────────────────────

  const leaveRoom = useCallback(async () => {
    if (clientRef.current) {
      await clientRef.current.stop();
      clientRef.current = null;
    }
    if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
    updateViewerCount(room.id, -1);
    setView('home');
  }, [room.id, setView, updateViewerCount]);

  // ─── Floating Hearts ───────────────────────────────────────

  const addHeart = () => {
    const id = Date.now();
    setFloatingHearts((prev) => [...prev, id]);
    setTimeout(() => setFloatingHearts((prev) => prev.filter((h) => h !== id)), 2000);
  };

  // ─── Gift Reactions ────────────────────────────────────────

  const gifts = [
    { emoji: '🌹', name: 'Rose', cost: 1 },
    { emoji: '💎', name: 'Diamond', cost: 10 },
    { emoji: '🚀', name: 'Rocket', cost: 50 },
    { emoji: '👑', name: 'Crown', cost: 100 },
    { emoji: '🎆', name: 'Fireworks', cost: 200 },
    { emoji: '🏆', name: 'Trophy', cost: 500 },
  ];

  return (
    /*
     * ╔══════════════════════════════════════════════════════╗
     * ║  ROOT: Full-screen, no flex, no split               ║
     * ║  Video is absolute inset-0 → covers 100% of screen  ║
     * ║  Every UI element is an absolute overlay on top     ║
     * ╚══════════════════════════════════════════════════════╝
     */
    <div className="relative w-full h-full overflow-hidden bg-black">

      {/* ═══ LAYER 0: Video Background (covers entire screen) ═══ */}
      <div
        ref={videoContainerRef}
        data-video-container
        className="absolute inset-0 w-full h-full"
        style={{ overflow: 'hidden' }}
      />
      {/* Agora SDK inserts its own <video> element inside the container above.
          Force it to cover the full container: */}
      <style>{`
        [data-video-container] video,
        [data-video-container] .agora-video-player {
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
          background: #000 !important;
        }
      `}</style>

      {/* ═══ LAYER 1: LIVE Badge — Top-Right (z-50) ═══ */}
      {isConnected && (
        <div className="absolute top-4 right-4 z-50">
          <div className="flex items-center gap-2">
            {demoMode && (
              <div className="bg-amber-600/90 backdrop-blur-sm px-2.5 py-1 rounded-full shadow-lg shadow-amber-600/30">
                <span className="text-white text-[10px] font-bold tracking-wide">DEMO</span>
              </div>
            )}
            <div className="flex items-center gap-2 bg-red-600/90 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-lg shadow-red-600/30">
              <div className="w-2.5 h-2.5 bg-white rounded-full animate-pulse" />
              <span className="text-white text-sm font-bold tracking-wide">LIVE</span>
            </div>
          </div>
        </div>
      )}

      {/* ═══ LAYER 2: Top Bar Gradient Overlay (z-40) ═══ */}
      <div className="absolute top-0 left-0 right-0 z-40 bg-gradient-to-b from-black/80 via-black/40 to-transparent pt-safe-top">
        <div className="flex items-center justify-between px-4 py-3">
          {/* Left: Back + Status */}
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={leaveRoom}
              className="text-white/80 hover:text-white hover:bg-white/10 rounded-full"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-red-500 animate-pulse' : 'bg-zinc-500'
              }`} />
              <span className="text-white text-sm font-semibold">
                {isConnected ? 'LIVE' : 'OFFLINE'}
              </span>
              {demoMode && (
                <span className="text-amber-400 text-[10px] font-bold">(DEMO MODE)</span>
              )}
            </div>
          </div>

          {/* Right: Stats + Controls */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-black/40 backdrop-blur-sm px-2.5 py-1 rounded-full">
              <Clock className="w-3.5 h-3.5 text-zinc-300" />
              <span className="text-white text-xs font-mono">{elapsedTime}</span>
            </div>
            <div className="flex items-center gap-1.5 bg-black/40 backdrop-blur-sm px-2.5 py-1 rounded-full">
              <Users className="w-3.5 h-3.5 text-zinc-300" />
              <span className="text-white text-xs">{room.viewerCount}</span>
            </div>
            {isConnected && (
              <div className="hidden sm:flex items-center gap-1 bg-black/40 backdrop-blur-sm px-2 py-1 rounded-full text-[10px]">
                <Activity className="w-3 h-3 text-green-400" />
                <span className="text-zinc-300">{streamStats.bitrate}kbps</span>
              </div>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleMute}
              className="text-white/80 hover:text-white hover:bg-white/10 rounded-full"
            >
              {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-white/80 hover:text-white hover:bg-white/10 rounded-full hidden sm:flex"
            >
              <Maximize2 className="w-5 h-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-white/80 hover:text-white hover:bg-white/10 rounded-full hidden sm:flex"
            >
              <Share2 className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>

      {/* ═══ LAYER 3: Connecting Spinner (z-30) ═══ */}
      {isConnecting && !connectionError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-30">
          <div className="text-center space-y-3">
            <Loader2 className="w-10 h-10 text-purple-500 animate-spin mx-auto" />
            <p className="text-zinc-300 text-sm font-medium">
              {demoMode ? 'Connecting (Demo Mode)...' : 'Connecting to stream...'}
            </p>
            <p className="text-zinc-600 text-xs">Joining channel: {getAgoraChannel()}</p>
          </div>
        </div>
      )}

      {/* ═══ LAYER 3: Connection Error (z-30) ═══ */}
      {connectionError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-30">
          <div className="text-center space-y-4 max-w-xs">
            <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto">
              <WifiOff className="w-8 h-8 text-red-400" />
            </div>
            <div>
              <h3 className="text-white font-semibold">Connection Failed</h3>
              <p className="text-zinc-500 text-sm mt-1">{connectionError}</p>
            </div>
            <Button
              onClick={() => window.location.reload()}
              variant="outline"
              className="text-white border-zinc-700"
            >
              Retry Connection
            </Button>
          </div>
        </div>
      )}

      {/* ═══ LAYER 3: Waiting for Host (z-30) ═══ */}
      {!isConnected && !isConnecting && !connectionError && (
        <div className="absolute inset-0 flex items-center justify-center z-30">
          <div className="text-center space-y-4">
            <div className="relative inline-block">
              <Avatar className="w-20 h-20 border-2 border-zinc-700">
                <AvatarImage src={room.hostAvatar} />
                <AvatarFallback className="bg-zinc-800 text-2xl">
                  {room.hostName?.charAt(0) || 'H'}
                </AvatarFallback>
              </Avatar>
              <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-zinc-700 rounded-full flex items-center justify-center">
                <div className="w-2 h-2 bg-zinc-500 rounded-full" />
              </div>
            </div>
            <div>
              <h3 className="text-white text-lg font-bold">{room.hostName}</h3>
              <p className="text-zinc-500 text-sm mt-1">{room.title}</p>
            </div>
            <p className="text-zinc-600 text-xs">Waiting for host to start streaming...</p>
          </div>
        </div>
      )}

      {/* ═══ LAYER 4: Floating Hearts (z-20) ═══ */}
      {floatingHearts.map((id) => (
        <motion.div
          key={id}
          initial={{ opacity: 1, y: 0, scale: 1 }}
          animate={{ opacity: 0, y: -200, scale: 1.5 }}
          transition={{ duration: 2, ease: 'easeOut' }}
          className="absolute right-6 bottom-24 text-3xl pointer-events-none z-20"
        >
          ❤️
        </motion.div>
      ))}

      {/* ═══ LAYER 5: Gift Panel (z-30) ═══ */}
      <AnimatePresence>
        {showGifts && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            className="absolute bottom-16 left-0 right-0 z-30 px-4"
          >
            <div className="max-w-md mx-auto bg-zinc-900/95 backdrop-blur-xl border border-zinc-700/50 rounded-2xl p-4">
              <div className="grid grid-cols-3 gap-2">
                {gifts.map((gift) => (
                  <button
                    key={gift.name}
                    onClick={() => setShowGifts(false)}
                    className="flex flex-col items-center gap-1 p-3 rounded-xl bg-zinc-800/80 hover:bg-zinc-700/80 transition-colors"
                  >
                    <span className="text-2xl">{gift.emoji}</span>
                    <span className="text-xs text-zinc-300">{gift.name}</span>
                    <span className="text-[10px] text-amber-400">{gift.cost} coins</span>
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ LAYER 5: Bottom Interaction Bar (z-20) ═══ */}
      <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/90 via-black/50 to-transparent pb-safe-bottom">
        <div className="flex items-center gap-2 px-4 py-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={addHeart}
            className="text-red-500 hover:text-red-400 hover:bg-red-500/10 rounded-full"
          >
            <Heart className="w-6 h-6" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowGifts(!showGifts)}
            className="text-amber-500 hover:text-amber-400 hover:bg-amber-500/10 rounded-full"
          >
            <Gift className="w-6 h-6" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsChatOpen(!isChatOpen)}
            className={`ml-auto rounded-full px-4 ${
              isChatOpen
                ? 'bg-purple-600/20 text-purple-400 border border-purple-500/30'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <MessageCircle className="w-4 h-4 mr-1.5" />
            Chat
          </Button>
        </div>
      </div>

      {/* ═══ LAYER 6: Chat Overlay (z-10) ═══ */}
      <AnimatePresence>
        {isChatOpen && (
          <motion.div
            initial={{ y: 300, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 300, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="absolute bottom-14 left-0 right-0 z-10 max-h-[45vh]"
          >
            <ChatBox roomId={room.id} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
