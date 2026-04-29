'use client';

/**
 * HostStudio Component
 * ─────────────────────
 * The host's broadcasting interface:
 *   1. Accesses the host's webcam via getUserMedia()
 *   2. Renders webcam feed onto a <canvas> element
 *   3. Applies real-time face swap effect on the canvas
 *   4. Captures the processed stream via canvas.captureStream(30)
 *   5. Publishes video + audio tracks to the Agora channel using AgoraRTC
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
    { value: 'none', label: 'No Filter', icon: '⚪' },
    { value: 'face-swap', label: 'Face Swap', icon: '🔄' },
    { value: 'beauty', label: 'Beauty', icon: '✨' },
    { value: 'cartoon', label: 'Cartoon', icon: '🎨' },
    { value: 'neon', label: 'Neon Edge', icon: '💜' },
  ];

  // ─── Camera Access ─────────────────────────────────────────

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

  // ─── Face Swap Render Loop ─────────────────────────────────

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

  // ─── Go Live (Publish to Agora) ────────────────────────────

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

  // ─── Toggle Mic ───────────────────────────────────────────

  const toggleMic = useCallback(async () => {
    if (!clientRef.current) {
      setIsMicOn((prev) => !prev);
      return;
    }

    const newMutedState = !isMicOn;
    await clientRef.current.setMuted(newMutedState);
    setIsMicOn(newMutedState);
  }, [isMicOn]);

  // ─── End Stream ────────────────────────────────────────────

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

  // ─── Cleanup ───────────────────────────────────────────────

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
    <div className="flex flex-col h-full bg-black relative overflow-hidden">
      {/* Hidden video element for raw webcam feed */}
      <video
        ref={videoRef}
        playsInline
        muted
        className="hidden"
        style={{ transform: 'scaleX(-1)' }}
      />

      {/* ─── Main Canvas: Processed Stream Output ──────────── */}
      <div className="flex-1 relative flex items-center justify-center bg-gradient-to-b from-zinc-900 to-black">
        {isCameraOn ? (
          <canvas
            ref={canvasRef}
            className="w-full h-full object-contain"
            style={{ transform: 'scaleX(-1)' }}
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

        {/* Live indicator overlay */}
        <AnimatePresence>
          {isLive && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="absolute top-4 left-4 flex items-center gap-3"
            >
              <div className="flex items-center gap-2 bg-red-600/90 backdrop-blur-sm px-3 py-1.5 rounded-full">
                <div className="w-2.5 h-2.5 bg-white rounded-full animate-pulse" />
                <span className="text-white text-sm font-bold">LIVE</span>
              </div>
              <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-full">
                <Clock className="w-3.5 h-3.5 text-red-400" />
                <span className="text-white text-sm font-mono">{elapsedTime}</span>
              </div>
              <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-full">
                <Users className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-white text-sm">{streamStats.viewers}</span>
              </div>
              {/* Agora connection indicator */}
              <div className={`flex items-center gap-1.5 backdrop-blur-sm px-2 py-1.5 rounded-full ${
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
            </motion.div>
          )}
        </AnimatePresence>

        {/* Stream stats (top-right) */}
        {isLive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute top-4 right-4 bg-black/60 backdrop-blur-sm px-3 py-2 rounded-lg"
          >
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <Activity className="w-3 h-3 text-green-400" />
              <span>{streamStats.bitrate} kbps</span>
              <span className="text-zinc-600">|</span>
              <span>{streamStats.fps} fps</span>
            </div>
          </motion.div>
        )}

        {/* Agora channel info (bottom-left when live) */}
        {isLive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute bottom-36 left-4 bg-black/40 backdrop-blur-sm px-3 py-1.5 rounded-lg"
          >
            <div className="flex items-center gap-2 text-[10px] text-zinc-500">
              <span>Agora Channel:</span>
              <span className="text-zinc-400 font-mono">{getAgoraChannel()}</span>
            </div>
          </motion.div>
        )}

        {/* Error display */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute bottom-32 left-1/2 -translate-x-1/2 bg-red-600/90 text-white px-4 py-2 rounded-lg text-sm max-w-[90%] text-center"
          >
            {error}
          </motion.div>
        )}
      </div>

      {/* ─── Bottom Controls Panel ──────────────────────────── */}
      <div className="bg-zinc-950 border-t border-zinc-800/50">
        {/* Filter bar */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-b border-zinc-800/50"
            >
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span className="text-sm font-medium text-zinc-300">
                    Face Filters
                  </span>
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
                  <div className="flex items-center gap-3">
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

        {/* Main controls */}
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                if (isLive) endStream();
                stopCamera();
                setView('home');
              }}
              className="text-zinc-400 hover:text-white"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </div>

          <div className="flex items-center gap-3">
            {/* Camera toggle */}
            <Button
              variant="outline"
              size="icon"
              onClick={isCameraOn ? stopCamera : startCamera}
              className={`rounded-full w-12 h-12 ${
                isCameraOn
                  ? 'bg-zinc-800 border-zinc-700 text-white'
                  : 'bg-zinc-800 border-zinc-700 text-red-500'
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
              className={`rounded-full w-12 h-12 ${
                isMicOn
                  ? 'bg-zinc-800 border-zinc-700 text-white'
                  : 'bg-zinc-800 border-zinc-700 text-red-500'
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
                className="bg-red-600 hover:bg-red-700 text-white rounded-full px-6 h-12 font-semibold"
              >
                <Square className="w-4 h-4 mr-2 fill-current" />
                End Stream
              </Button>
            ) : (
              <Button
                onClick={goLive}
                disabled={!isCameraOn || isGoingLive}
                className="bg-red-600 hover:bg-red-700 text-white rounded-full px-6 h-12 font-semibold disabled:opacity-50"
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
              className={`rounded-full w-12 h-12 ${
                showFilters
                  ? 'bg-purple-600/20 border-purple-500 text-purple-400'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-400'
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
