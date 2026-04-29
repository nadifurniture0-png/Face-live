'use client';

/**
 * ViewerRoom Component
 * ─────────────────────
 * The viewer's watching interface:
 *   1. Joins the Agora channel as AUDIENCE using the streaming SDK
 *   2. Subscribes to the host's remote video + audio tracks
 *   3. Plays the live stream on a <video> element
 *   4. Shows real-time chat overlay at the bottom
 *   5. Displays stream info (host name, viewer count, duration)
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
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
  Wifi,
  WifiOff,
  Loader2,
  Activity,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth-store';
import { useStreamStore } from '@/store/stream-store';
import { AgoraStreamingClient, createDefaultStreamConfig, getAgoraChannel } from '@/lib/streaming-client';
import { ChatBox } from './chat-box';
import type { LiveRoom } from '@/lib/types';

interface ViewerRoomProps {
  room: LiveRoom;
}

export function ViewerRoom({ room }: ViewerRoomProps) {
  const user = useAuthStore((s) => s.user);
  const { setView, updateViewerCount, updateStreamStats } = useStreamStore();

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
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

  // ─── Join Agora Channel & Subscribe ────────────────────────

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    let destroyed = false;

    const joinChannel = async () => {
      try {
        setIsConnecting(true);
        setConnectionError(null);

        const agoraChannel = getAgoraChannel();
        const viewerUid = `viewer_${user?.id || Date.now()}`;

        // Initialize Agora client for subscribing
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

        // Join the channel and subscribe — the remote video will be
        // played directly on the <video> element by Agora's play() method
        await client.subscribe(videoElement);

        if (destroyed) {
          await client.stop();
          return;
        }

        // Notify room of viewer count increase
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

    // Start elapsed time timer
    const startTime = Date.now();
    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
      const secs = (elapsed % 60).toString().padStart(2, '0');
      setElapsedTime(`${mins}:${secs}`);
    }, 1000);

    // Start stats polling
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

    // Cleanup on unmount
    return () => {
      destroyed = true;
      clearInterval(timer);
      if (statsIntervalRef.current) {
        clearInterval(statsIntervalRef.current);
      }
      if (clientRef.current) {
        clientRef.current.stop();
        clientRef.current = null;
      }
      updateViewerCount(room.id, -1);
    };
  }, [room.id, room.channelId, updateViewerCount, updateStreamStats, user?.id]);

  // ─── Toggle Mute ───────────────────────────────────────────

  const toggleMute = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.setRemoteAudioMuted(!isMuted);
    }
    setIsMuted((prev) => !prev);
  }, [isMuted]);

  // ─── Leave Room ────────────────────────────────────────────

  const leaveRoom = useCallback(async () => {
    if (clientRef.current) {
      await clientRef.current.stop();
      clientRef.current = null;
    }
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
    }
    updateViewerCount(room.id, -1);
    setView('home');
  }, [room.id, setView, updateViewerCount]);

  // ─── Floating Hearts Animation ─────────────────────────────

  const addHeart = () => {
    const id = Date.now();
    setFloatingHearts((prev) => [...prev, id]);
    setTimeout(() => {
      setFloatingHearts((prev) => prev.filter((h) => h !== id));
    }, 2000);
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
    <div className="flex flex-col h-full bg-black relative overflow-hidden">
      {/* ─── Main Video Area ──────────────────────────────── */}
      <div className="flex-1 relative flex items-center justify-center bg-gradient-to-b from-zinc-900 to-black">
        <div className="w-full h-full relative">
          {/* Agora remote video stream renders here */}
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            autoPlay
            muted={isMuted}
          />

          {/* Connecting spinner */}
          {isConnecting && !connectionError && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <div className="text-center space-y-3">
                <Loader2 className="w-10 h-10 text-purple-500 animate-spin mx-auto" />
                <p className="text-zinc-300 text-sm font-medium">Connecting to stream...</p>
                <p className="text-zinc-600 text-xs">Joining channel: {getAgoraChannel()}</p>
              </div>
            </div>
          )}

          {/* Connection error */}
          {connectionError && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80">
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

          {/* Stream not started yet — waiting for host */}
          {!isConnected && !isConnecting && !connectionError && (
            <div className="absolute inset-0 flex items-center justify-center">
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

          {/* Floating hearts animation */}
          {floatingHearts.map((id) => (
            <motion.div
              key={id}
              initial={{ opacity: 1, y: 0, scale: 1 }}
              animate={{ opacity: 0, y: -200, scale: 1.5 }}
              transition={{ duration: 2, ease: 'easeOut' }}
              className="absolute right-6 bottom-40 text-3xl pointer-events-none"
            >
              ❤️
            </motion.div>
          ))}

          {/* Top bar overlay */}
          <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/70 to-transparent p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={leaveRoom}
                  className="text-white/80 hover:text-white hover:bg-white/10"
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
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 bg-black/40 backdrop-blur-sm px-2.5 py-1 rounded-full">
                  <Clock className="w-3.5 h-3.5 text-zinc-400" />
                  <span className="text-white text-xs font-mono">{elapsedTime}</span>
                </div>
                <div className="flex items-center gap-1.5 bg-black/40 backdrop-blur-sm px-2.5 py-1 rounded-full">
                  <Users className="w-3.5 h-3.5 text-zinc-400" />
                  <span className="text-white text-xs">{room.viewerCount}</span>
                </div>
                {isConnected && (
                  <div className="flex items-center gap-1 bg-black/40 backdrop-blur-sm px-2 py-1 rounded-full text-[10px]">
                    <Activity className="w-3 h-3 text-green-400" />
                    <span className="text-zinc-400">{streamStats.bitrate}kbps</span>
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleMute}
                  className="text-white/80 hover:text-white hover:bg-white/10"
                >
                  {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white/80 hover:text-white hover:bg-white/10"
                >
                  <Maximize2 className="w-5 h-5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white/80 hover:text-white hover:bg-white/10"
                >
                  <Share2 className="w-5 h-5" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Bottom Interaction Bar ───────────────────────── */}
      <div className="relative">
        {/* Gift panel */}
        {showGifts && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="absolute bottom-full left-0 right-0 bg-zinc-900 border-t border-zinc-800 p-4"
          >
            <div className="grid grid-cols-3 gap-2 max-w-md mx-auto">
              {gifts.map((gift) => (
                <button
                  key={gift.name}
                  onClick={() => setShowGifts(false)}
                  className="flex flex-col items-center gap-1 p-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors"
                >
                  <span className="text-2xl">{gift.emoji}</span>
                  <span className="text-xs text-zinc-400">{gift.name}</span>
                  <span className="text-xs text-amber-500">{gift.cost} coins</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {/* Interaction buttons */}
        <div className="flex items-center gap-2 px-4 py-2 bg-zinc-950 border-t border-zinc-800/50">
          <Button
            variant="ghost"
            size="icon"
            onClick={addHeart}
            className="text-red-500 hover:text-red-400 hover:bg-red-500/10"
          >
            <Heart className="w-6 h-6" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowGifts(!showGifts)}
            className="text-amber-500 hover:text-amber-400 hover:bg-amber-500/10"
          >
            <Gift className="w-6 h-6" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsChatOpen(!isChatOpen)}
            className={`ml-auto ${
              isChatOpen ? 'text-purple-400' : 'text-zinc-400'
            }`}
          >
            <MessageCircle className="w-4 h-4 mr-1" />
            Chat
          </Button>
        </div>
      </div>

      {/* ─── Chat Overlay ──────────────────────────────────── */}
      {isChatOpen && <ChatBox roomId={room.id} />}
    </div>
  );
}
