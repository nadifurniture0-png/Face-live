'use client';

/**
 * HostStudio Component â€” Full-Screen Overlay Layout
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * The host's broadcasting interface:
 *   1. Accesses the host's webcam via getUserMedia()
 *   2. Renders webcam feed onto a <canvas> element
 *   3. Applies real-time face swap effect on the canvas
 *      (Video is mirrored programmatically in face-swap.ts via
 *       ctx.scale(-1, 1) â€” NO CSS transform on the canvas)
 *   4. Captures the processed stream via canvas.captureStream(30)
 *   5. Publishes video + audio tracks to the Agora channel
 *
 * Layout: TRUE full-screen overlay â€” canvas covers entire screen,
 * all controls float on top as absolute overlays.
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  Radio,
  Square,
  Sparkles,
  MonitorPlay,
  ArrowLeft,
  Users,
  Clock,
  Activity,
  Wifi,
  WifiOff,
  Loader2,
  X,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth-store';
import { useStreamStore } from '@/store/stream-store';
import { applyFaceSwapEffect } from '@/lib/face-swap';
import { AgoraStreamingClient, createDefaultStreamConfig, getAgoraChannel } from '@/lib/streaming-client';
import type { FaceFilterType } from '@/lib/types';

export function HostStudio() {
  const user = useAuthStore((s) => s.user);
  const {
    setView, setIsStreaming, faceSwapConfig,
    setFaceSwapFilter, setFaceSwapIntensity,
    createRoom, endRoom, setActiveRoom, updateStreamStats,
  } = useStreamStore();

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const clientRef = useRef<AgoraStreamingClient | null>(null);
  const animationFrameRef = useRef<number>(0);
  const statsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // State
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isLive, setIsLive] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [elapsedTime, setElapsedTime] = useState('00:00');
  const [streamStats, setStreamStats] = useState({ bitrate: 0, fps: 0, viewers: 0 });
  const [error, setError] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<string>('disconnected');
  const [isGoingLive, setIsGoingLive] = useState(false);

  const filterOptions: { value: FaceFilterType; label: string; icon: string }[] = [
    { value: 'none', label: 'No Filter', icon: 'âšª' },
    { value: 'face-swap', label: 'Face Swap', icon: 'ðŸ”„' },
    { value: 'beauty', label: 'Beauty', icon: 'âœ¨' },
    { value: 'cartoon', label: 'Cartoon', icon: 'ðŸŽ¨' },
    { value: 'neon', label: 'Neon Edge', icon: 'ðŸ’œ' },
  ];

  // â”€â”€â”€ Camera Access â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const startCamera = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
        },
        audio: true,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsCameraOn(true);
      }
    } catch (err) {
      console.error('Camera access error:', err);
      setError('Camera access denied. Please allow camera permissions.');
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsCameraOn(false);
  }, []);

  // â”€â”€â”€ Face Swap Render Loop â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  useEffect(() => {
    if (!isCameraOn || !videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    const renderLoop = () => {
      if (video.readyState >= 2) {
        applyFaceSwapEffect(video, canvas, faceSwapConfig);
      }
      animationFrameRef.current = requestAnimationFrame(renderLoop);
    };

    renderLoop();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isCameraOn, faceSwapConfig]);

  // â”€â”€â”€ Go Live (Publish to Agora) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const goLive = useCallback(async () => {
    if (!user || !canvasRef.current) return;

    setIsGoingLive(true);
    setError(null);

    try {
      // Create room in Firestore
      const agoraChannel = getAgoraChannel();
      const room = await createRoom({
        title: `${user.name}'s Live Stream`,
        hostId: user.id,
        hostName: user.name,
        hostAvatar: user.avatar,
        channelId: agoraChannel,
      });
      setActiveRoom(room);

      // Initialize Agora streaming client
      const config = createDefaultStreamConfig(agoraChannel, user.id);
      const client = new AgoraStreamingClient(config, {
        onStreamPublished: () => {
          console.log('[HostStudio] Published to Agora channel:', agoraChannel);
        },
        onViewerJoined: (count) => {
          setStreamStats((prev) => ({ ...prev, viewers: count }));
          updateStreamStats({ viewers: count });
        },
        onViewerLeft: (count) => {
          setStreamStats((prev) => ({ ...prev, viewers: count }));
          updateStreamStats({ viewers: count });
        },
        onConnectionStateChange: (state) => {
          setConnectionState(state);
        },
        onError: (err) => {
          setError(err);
        },
      });

      // Publish the canvas stream + microphone to Agora
      await client.publish(canvasRef.current, isMicOn);
      clientRef.current = client;

      setIsLive(true);
      setIsStreaming(true);
      setIsGoingLive(false);

      // Start elapsed timer + stats polling
      const startTime = Date.now();
      statsIntervalRef.current = setInterval(async () => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
        const secs = (elapsed % 60).toString().padStart(2, '0');
        setElapsedTime(`${mins}:${secs}`);

        // Fetch real stats from Agora SDK
        try {
          const stats = await client.getStats();
          setStreamStats({
            bitrate: stats.bitrate,
            fps: stats.fps,
            viewers: stats.viewers,
          });
        } catch {
          // Stats may temporarily fail
        }
      }, 1000);

    } catch (err) {
      console.error('[HostStudio] Go live error:', err);
      setError(err instanceof Error ? err.message : 'Failed to start live stream');
      setIsGoingLive(false);
    }
  }, [user, createRoom, setActiveRoom, setIsStreaming, updateStreamStats, isMicOn]);

  // â”€â”€â”€ Toggle Mic â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const toggleMic = useCallback(async () => {
    if (!clientRef.current) {
      setIsMicOn((prev) => !prev);
      return;
    }

    const newMutedState = !isMicOn;
    await clientRef.current.setMuted(newMutedState);
    setIsMicOn(newMutedState);
  }, [isMicOn]);

  // â”€â”€â”€ End Stream â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const endStream = useCallback(async () => {
    if (clientRef.current) {
      await clientRef.current.stop();
      clientRef.current = null;
    }

    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
      statsIntervalRef.current = null;
    }

    setIsLive(false);
    setIsStreaming(false);
    setConnectionState('disconnected');
    setElapsedTime('00:00');
    setStreamStats({ bitrate: 0, fps: 0, viewers: 0 });

    // Mark room as ended in Firestore
    const { activeRoom } = useStreamStore.getState();
    if (activeRoom) {
      await endRoom(activeRoom.id);
      setActiveRoom(null);
    }
  }, [setIsStreaming, endRoom, setActiveRoom]);

  // â”€â”€â”€ Cleanup â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  useEffect(() => {
    return () => {
      stopCamera();
      if (clientRef.current) {
        clientRef.current.stop();
        clientRef.current = null;
      }
      if (statsIntervalRef.current) {
        clearInterval(statsIntervalRef.current);
      }
    };
  }, [stopCamera]);

  return (
    /*
     * â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—
     * â•‘  HOST STUDIO: Full-Screen Overlay Layout              â•‘
     * â•‘  Canvas covers ENTIRE screen (absolute inset-0)       â•‘
     * â•‘  ALL controls float ON TOP as absolute overlays       â•‘
     * â•‘  No flex-col, no bottom strips, no split layouts     â•‘
     * â•‘                                                      â•‘
     * â•‘  NOTE: Video is mirrored programmatically inside      â•‘
     * â•‘  face-swap.ts via ctx.scale(-1,1) â€” NOT via CSS     â•‘
     * â•‘  transform on the canvas. Text remains readable.     â•‘
     * â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
     */
    <div className="relative w-full h-full overflow-hidden bg-black">

      {/* Hidden video element for raw webcam feed */}
      <video
        ref={videoRef}
        playsInline
        muted
        className="hidden"
      />

      {/* â•â•â• LAYER 0: Full-Screen Canvas Background â•â•â• */}
      <div className="absolute inset-0 w-full h-full bg-gradient-to-b from-zinc-900 to-black flex items-center justify-center">
        {isCameraOn ? (
          <canvas
            ref={canvasRef}
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="flex flex-col items-center gap-4 text-zinc-500">
            <MonitorPlay className="w-20 h-20" strokeWidth={1} />
            <p className="text-lg font-medium">Camera is off</p>
            <p className="text-sm text-zinc-600">
              Start your camera to preview the face swap effect
            </p>
            <Button
              onClick={startCamera}
              className="bg-red-600 hover:bg-red-700 text-white px-8"
            >
              <Video className="w-4 h-4 mr-2" />
              Start Camera
            </Button>
          </div>
        )}
      </div>

      {/* â•â•â• LAYER 1: Top Bar â€” LIVE Stats (z-40) â•â•â• */}
      <AnimatePresence>
        {isLive && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-0 left-0 right-0 z-40 bg-gradient-to-b from-black/80 via-black/40 to-transparent"
          >
            <div className="flex items-center justify-between px-4 py-3">
              {/* Left: LIVE badge + stats */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 bg-red-600/90 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-lg shadow-red-600/30">
                  <div className="w-2.5 h-2.5 bg-white rounded-full animate-pulse" />
                  <span className="text-white text-sm font-bold">LIVE</span>
                </div>
                <div className="flex items-center gap-1.5 bg-black/40 backdrop-blur-sm px-2.5 py-1 rounded-full">
                  <Clock className="w-3.5 h-3.5 text-zinc-300" />
                  <span className="text-white text-xs font-mono">{elapsedTime}</span>
                </div>
                <div className="flex items-center gap-1.5 bg-black/40 backdrop-blur-sm px-2.5 py-1 rounded-full">
                  <Users className="w-3.5 h-3.5 text-zinc-300" />
                  <span className="text-white text-xs">{streamStats.viewers}</span>
                </div>
                {/* Connection indicator */}
                <div className={`hidden sm:flex items-center gap-1 backdrop-blur-sm px-2 py-1.5 rounded-full ${
                  connectionState === 'CONNECTED'
                    ? 'bg-green-600/60'
                    : connectionState === 'CONNECTING'
                    ? 'bg-amber-600/60'
                    : 'bg-zinc-600/60'
                }`}>
                  {connectionState === 'CONNECTED' ? (
                    <Wifi className="w-3.5 h-3.5 text-green-300" />
                  ) : (
                    <WifiOff className="w-3.5 h-3.5 text-zinc-400" />
                  )}
                </div>
              </div>

              {/* Right: Stream stats */}
              <div className="flex items-center gap-1.5 bg-black/40 backdrop-blur-sm px-2.5 py-1 rounded-full text-[10px]">
                <Activity className="w-3 h-3 text-green-400" />
                <span className="text-zinc-300">{streamStats.bitrate}kbps</span>
                <span className="text-zinc-600">|</span>
                <span className="text-zinc-300">{streamStats.fps}fps</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* â•â•â• LAYER 2: Error Display (z-30) â•â•â• */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 bg-red-600/90 backdrop-blur-sm text-white px-6 py-3 rounded-xl text-sm max-w-[90%] text-center shadow-lg"
        >
          {error}
        </motion.div>
      )}

      {/* â•â•â• LAYER 3: Filter Panel (z-30) â€” floats above bottom controls â•â•â• */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            className="absolute bottom-20 left-4 right-4 z-30 sm:left-auto sm:right-4 sm:w-96"
          >
            <div className="bg-zinc-900/95 backdrop-blur-xl border border-zinc-700/50 rounded-2xl p-4 shadow-2xl">
              {/* Filter panel header with Close (X) button */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span className="text-sm font-medium text-zinc-300">Face Filters</span>
                </div>
                <button
                  onClick={() => setShowFilters(false)}
                  className="flex items-center justify-center w-7 h-7 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
                  aria-label="Close filters"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {filterOptions.map((filter) => (
                  <button
                    key={filter.value}
                    onClick={() => setFaceSwapFilter(filter.value)}
                    className={`flex-shrink-0 px-3 py-2 rounded-lg text-sm transition-all ${
                      faceSwapConfig.filterType === filter.value
                        ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20'
                        : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                    }`}
                  >
                    <span className="mr-1.5">{filter.icon}</span>
                    {filter.label}
                  </button>
                ))}
              </div>
              {faceSwapConfig.filterType !== 'none' && (
                <div className="flex items-center gap-3 mt-3">
                  <span className="text-xs text-zinc-500 w-16">Intensity</span>
                  <Slider
                    value={[faceSwapConfig.intensity]}
                    onValueChange={([v]) => setFaceSwapIntensity(v)}
                    min={10}
                    max={100}
                    step={5}
                    className="flex-1"
                  />
                  <span className="text-xs text-zinc-500 w-8 text-right">
                    {faceSwapConfig.intensity}%
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* â•â•â• LAYER 4: Bottom Controls Bar (z-20) â€” gradient overlay â•â•â• */}
      <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/90 via-black/50 to-transparent pb-safe-bottom">
        <div className="flex items-center justify-between px-4 py-3">
          {/* Left: Back button */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                if (isLive) endStream();
                stopCamera();
                setView('home');
              }}
              className="text-white/80 hover:text-white hover:bg-white/10 rounded-full"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </div>

          {/* Right: Controls */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Camera toggle */}
            <Button
              variant="outline"
              size="icon"
              onClick={isCameraOn ? stopCamera : startCamera}
              className={`rounded-full w-11 h-11 sm:w-12 sm:h-12 bg-black/40 border-zinc-600/50 backdrop-blur-sm ${
                isCameraOn ? 'text-white' : 'text-red-400'
              }`}
            >
              {isCameraOn ? (
                <Video className="w-5 h-5" />
              ) : (
                <VideoOff className="w-5 h-5" />
              )}
            </Button>

            {/* Mic toggle */}
            <Button
              variant="outline"
              size="icon"
              onClick={toggleMic}
              disabled={!isCameraOn}
              className={`rounded-full w-11 h-11 sm:w-12 sm:h-12 bg-black/40 border-zinc-600/50 backdrop-blur-sm ${
                isMicOn ? 'text-white' : 'text-red-400'
              }`}
            >
              {isMicOn ? (
                <Mic className="w-5 h-5" />
              ) : (
                <MicOff className="w-5 h-5" />
              )}
            </Button>

            {/* Go Live / End Stream */}
            {isLive ? (
              <Button
                onClick={endStream}
                className="bg-red-600 hover:bg-red-700 text-white rounded-full px-5 sm:px-6 h-11 sm:h-12 font-semibold shadow-lg shadow-red-600/30"
              >
                <Square className="w-4 h-4 mr-2 fill-current" />
                <span className="hidden sm:inline">End Stream</span>
                <span className="sm:hidden">End</span>
              </Button>
            ) : (
              <Button
                onClick={goLive}
                disabled={!isCameraOn || isGoingLive}
                className="bg-red-600 hover:bg-red-700 text-white rounded-full px-5 sm:px-6 h-11 sm:h-12 font-semibold disabled:opacity-50 shadow-lg shadow-red-600/30"
              >
                {isGoingLive ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Radio className="w-4 h-4 mr-2" />
                )}
                {isGoingLive ? 'Connecting...' : 'Go Live'}
              </Button>
            )}

            {/* Filter toggle */}
            <Button
              variant="outline"
              size="icon"
              onClick={() => setShowFilters(!showFilters)}
              className={`rounded-full w-11 h-11 sm:w-12 sm:h-12 bg-black/40 border-zinc-600/50 backdrop-blur-sm ${
                showFilters
                  ? 'text-purple-400 border-purple-500/50'
                  : 'text-zinc-400'
              }`}
            >
              <Sparkles className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
