'use client';

/**
 * HostStudio Component
 * ─────────────────────
 * The host's broadcasting interface
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

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const clientRef = useRef<AgoraStreamingClient | null>(null);
  const animationFrameRef = useRef<number>(0);
  const statsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const startCamera = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
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

  const goLive = useCallback(async () => {
    if (!user || !canvasRef.current) return;

    setIsGoingLive(true);
    setError(null);

    try {
      const agoraChannel = getAgoraChannel();
      const room = await createRoom({
        title: `${user.name}'s Live Stream`,
        hostId: user.id,
        hostName: user.name,
        hostAvatar: user.avatar,
        channelId: agoraChannel,
      });
      setActiveRoom(room);

      const config = createDefaultStreamConfig(agoraChannel, user.id);
      const client = new AgoraStreamingClient(config, {
        onStreamPublished: () => console.log('[HostStudio] Published to Agora'),
        onViewerJoined: (count) => {
          setStreamStats((prev) => ({ ...prev, viewers: count }));
          updateStreamStats({ viewers: count });
        },
        onViewerLeft: (count) => {
          setStreamStats((prev) => ({ ...prev, viewers: count }));
          updateStreamStats({ viewers: count });
        },
        onConnectionStateChange: (state) => setConnectionState(state),
        onError: (err) => setError(err),
      });

      await client.publish(canvasRef.current, isMicOn);
      clientRef.current = client;

      setIsLive(true);
      setIsStreaming(true);
      setIsGoingLive(false);

      const startTime = Date.now();
      statsIntervalRef.current = setInterval(async () => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
        const secs = (elapsed % 60).toString().padStart(2, '0');
        setElapsedTime(`${mins}:${secs}`);

        try {
          const stats = await client.getStats();
          setStreamStats({ bitrate: stats.bitrate, fps: stats.fps, viewers: stats.viewers });
        } catch {}
      }, 1000);

    } catch (err) {
      console.error('[HostStudio] Go live error:', err);
      setError(err instanceof Error ? err.message : 'Failed to start live stream');
      setIsGoingLive(false);
    }
  }, [user, createRoom, setActiveRoom, setIsStreaming, updateStreamStats, isMicOn]);

  const toggleMic = useCallback(async () => {
    if (!clientRef.current) {
      setIsMicOn((prev) => !prev);
      return;
    }
    const newMutedState = !isMicOn;
    await clientRef.current.setMuted(newMutedState);
    setIsMicOn(newMutedState);
  }, [isMicOn]);

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

    const { activeRoom } = useStreamStore.getState();
    if (activeRoom) {
      await endRoom(activeRoom.id);
      setActiveRoom(null);
    }
  }, [setIsStreaming, endRoom, setActiveRoom]);

  useEffect(() => {
    return () => {
      stopCamera();
      if (clientRef.current) {
        clientRef.current.stop();
        clientRef.current = null;
      }
      if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
    };
  }, [stopCamera]);

  return (
    /* Full Screen Main Container */
    <div className="relative w-full h-screen bg-black overflow-hidden font-sans">
      
      {/* Hidden raw video */}
      <video ref={videoRef} playsInline muted className="hidden" style={{ transform: 'scaleX(-1)' }} />

      {/* ─── FULL SCREEN Processed Canvas ──────────── */}
      {isCameraOn ? (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full object-cover z-0"
          style={{ transform: 'scaleX(-1)' }}
        />
      ) : (
        <div className="absolute inset-0 z-0 flex flex-col items-center justify-center bg-zinc-900">
          <MonitorPlay className="w-20 h-20 text-zinc-600 mb-4" strokeWidth={1} />
          <p className="text-lg font-medium text-zinc-400">Camera is off</p>
          <Button onClick={startCamera} className="mt-6 bg-red-600 hover:bg-red-700 text-white px-8 rounded-full">
            <Video className="w-4 h-4 mr-2" /> Start Camera
          </Button>
        </div>
      )}

      {/* ─── TOP RIGHT Overlay: LIVE Badge & Stats ──────────── */}
      <AnimatePresence>
        {isLive && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-10 right-4 z-50 flex flex-col items-end gap-2"
          >
            {/* LIVE Badge */}
            <div className="flex items-center gap-2 bg-red-600/90 backdrop-blur-md px-4 py-1.5 rounded-full shadow-lg border border-red-500/50">
              <div className="w-2.5 h-2.5 bg-white rounded-full animate-pulse" />
              <span className="text-white text-sm font-bold tracking-wider">LIVE</span>
            </div>

            {/* Viewer Count & Time */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full border border-white/10">
                <Users className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-white text-xs font-semibold">{streamStats.viewers}</span>
              </div>
              <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full border border-white/10">
                <Clock className="w-3.5 h-3.5 text-red-400" />
                <span className="text-white text-xs font-mono">{elapsedTime}</span>
              </div>
            </div>
            
            {/* Connection Status */}
            <div className="flex items-center gap-2 text-[10px] text-white/70 bg-black/40 backdrop-blur-md px-2 py-1 rounded-full">
              <Activity className="w-3 h-3 text-green-400" />
              <span>{streamStats.bitrate} kbps</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── TOP LEFT Overlay: Controls & Channel Info ──────────── */}
      <div className="absolute top-10 left-4 z-50 flex flex-col gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            if (isLive) endStream();
            stopCamera();
            setView('home');
          }}
          className="bg-black/40 backdrop-blur-md hover:bg-black/60 text-white rounded-full w-10 h-10 border border-white/10"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        
        {isLive && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 mt-2">
            <div className="flex items-center gap-2 text-[10px] text-zinc-300">
              {connectionState === 'CONNECTED' ? <Wifi className="w-3 h-3 text-green-400" /> : <WifiOff className="w-3 h-3 text-red-400" />}
              <span className="font-mono">{getAgoraChannel()}</span>
            </div>
          </motion.div>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="absolute top-28 left-1/2 -translate-x-1/2 z-50 bg-red-600/90 backdrop-blur-md text-white px-4 py-2 rounded-lg text-sm max-w-[90%] text-center shadow-lg border border-red-500">
          {error}
        </motion.div>
      )}

      {/* ─── BOTTOM FLOATING Overlay: Controls & Filters ──────────── */}
      <div className="absolute bottom-0 left-0 w-full z-50 bg-gradient-to-t from-black via-black/80 to-transparent pt-32 pb-8 px-4 flex flex-col gap-4">
        
        {/* Filters Panel */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl p-4 mb-2 shadow-2xl"
            >
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-purple-400" />
                <span className="text-sm font-medium text-white">Face Filters</span>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                {filterOptions.map((filter) => (
                  <button
                    key={filter.value}
                    onClick={() => setFaceSwapFilter(filter.value)}
                    className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                      faceSwapConfig.filterType === filter.value
                        ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/30'
                        : 'bg-white/10 text-zinc-300 hover:bg-white/20'
                    }`}
                  >
                    <span className="mr-2">{filter.icon}</span>
                    {filter.label}
                  </button>
                ))}
              </div>
              {faceSwapConfig.filterType !== 'none' && (
                <div className="flex items-center gap-4 mt-3 bg-white/5 p-3 rounded-xl">
                  <span className="text-xs font-medium text-zinc-400 w-16">Intensity</span>
                  <Slider
                    value={[faceSwapConfig.intensity]}
                    onValueChange={([v]) => setFaceSwapIntensity(v)}
                    min={10} max={100} step={5}
                    className="flex-1"
                  />
                  <span className="text-xs font-mono text-zinc-400 w-8 text-right">{faceSwapConfig.intensity}%</span>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action Buttons Row */}
        <div className="flex items-center justify-between">
          <div className="flex gap-3">
            <Button
              variant="outline" size="icon"
              onClick={isCameraOn ? stopCamera : startCamera}
              className={`rounded-full w-12 h-12 border-0 shadow-lg backdrop-blur-md ${isCameraOn ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-red-500/20 text-red-500 hover:bg-red-500/30'}`}
            >
              {isCameraOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
            </Button>
            
            <Button
              variant="outline" size="icon"
              onClick={toggleMic} disabled={!isCameraOn}
              className={`rounded-full w-12 h-12 border-0 shadow-lg backdrop-blur-md ${isMicOn ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-red-500/20 text-red-500 hover:bg-red-500/30'} disabled:opacity-30`}
            >
              {isMicOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
            </Button>
            
            <Button
              variant="outline" size="icon"
              onClick={() => setShowFilters(!showFilters)}
              className={`rounded-full w-12 h-12 border-0 shadow-lg backdrop-blur-md ${showFilters ? 'bg-purple-500/30 text-purple-300' : 'bg-white/10 text-white hover:bg-white/20'}`}
            >
              <Sparkles className="w-5 h-5" />
            </Button>
          </div>

          <div>
            {isLive ? (
              <Button onClick={endStream} className="bg-zinc-800 hover:bg-zinc-700 text-red-400 rounded-full px-6 h-12 font-bold shadow-xl border border-red-900/50 transition-all">
                <Square className="w-4 h-4 mr-2 fill-current" /> End
              </Button>
            ) : (
              <Button onClick={goLive} disabled={!isCameraOn || isGoingLive} className="bg-red-600 hover:bg-red-500 text-white rounded-full px-8 h-12 font-bold shadow-lg shadow-red-600/30 transition-all disabled:opacity-50">
                {isGoingLive ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Radio className="w-5 h-5 mr-2" />}
                {isGoingLive ? 'Starting...' : 'GO LIVE'}
              </Button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
