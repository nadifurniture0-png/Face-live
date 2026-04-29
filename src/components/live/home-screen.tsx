'use client';

/**
 * HomeScreen Component
 * ─────────────────────
 * Main browse screen showing:
 *   - Active live streams (fetched via Firestore onSnapshot in the store)
 *   - "Go Live" button for hosts
 *   - Search / filter controls
 */

import React, { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Radio,
  Search,
  Plus,
  TrendingUp,
  LogOut,
  User,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth-store';
import { useStreamStore } from '@/store/stream-store';
import { StreamCard } from './stream-card';
import type { LiveRoom } from '@/lib/types';

export function HomeScreen() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { setView, rooms, isLoadingRooms, fetchRooms, setActiveRoom } =
    useStreamStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const unsubRef = useRef<(() => void) | null>(null);

  const filters = ['all', 'gaming', 'music', 'chat', 'creative'];

  // Subscribe to live rooms on mount via Firestore onSnapshot
  useEffect(() => {
    const unsub = fetchRooms();
    unsubRef.current = unsub;

    return () => {
      if (unsubRef.current) {
        unsubRef.current();
        unsubRef.current = null;
      }
    };
  }, [fetchRooms]);

  // Filter rooms (client-side search/filter on the live list)
  const filteredRooms = rooms.filter((room) => {
    const matchesSearch =
      !searchQuery ||
      room.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      room.hostName.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesFilter =
      activeFilter === 'all' ||
      room.tags?.toLowerCase().includes(activeFilter.toLowerCase());

    return matchesSearch && matchesFilter;
  });

  const handleJoinRoom = (room: LiveRoom) => {
    setActiveRoom(room);
    setView('viewer-room');
  };

  const handleGoLive = () => {
    useAuthStore.getState().updateUserRole('host');
    setView('host-studio');
  };

  const handleLogout = () => {
    logout();
    setView('login');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-black to-zinc-950">
      {/* ─── Header ────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-zinc-950/90 backdrop-blur-xl border-b border-zinc-800/50">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600 to-red-600 flex items-center justify-center">
              <Radio className="w-4 h-4 text-white" />
            </div>
            <span className="text-white font-bold text-lg">
              Stream<span className="text-purple-500">Live</span>
            </span>
          </div>

          {/* Search */}
          <div className="hidden sm:flex items-center flex-1 max-w-xs mx-4">
            <div className="relative w-full">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search streams..."
                className="pl-9 bg-zinc-900 border-zinc-800 text-sm h-9 placeholder:text-zinc-600 focus:border-purple-500/50"
              />
            </div>
          </div>

          {/* User actions */}
          <div className="flex items-center gap-2">
            <Button
              onClick={handleGoLive}
              className="bg-red-600 hover:bg-red-700 text-white text-sm h-9 px-4"
            >
              <Radio className="w-3.5 h-3.5 mr-1.5" />
              Go Live
            </Button>

            <div className="hidden sm:flex items-center gap-2 ml-2">
              <Avatar className="w-7 h-7">
                <AvatarImage src={user?.avatar} />
                <AvatarFallback className="bg-zinc-800 text-xs">
                  <User className="w-3.5 h-3.5" />
                </AvatarFallback>
              </Avatar>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleLogout}
                className="text-zinc-500 hover:text-white h-8 w-8"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-4">
        {/* Mobile search */}
        <div className="sm:hidden mb-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search streams..."
              className="pl-9 bg-zinc-900 border-zinc-800 text-sm h-10 placeholder:text-zinc-600"
            />
          </div>
        </div>

        {/* ─── Category Filters ────────────────────────────── */}
        <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
          {filters.map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                activeFilter === filter
                  ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20'
                  : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300 border border-zinc-800'
              }`}
            >
              {filter.charAt(0).toUpperCase() + filter.slice(1)}
            </button>
          ))}
        </div>

        {/* ─── Welcome Banner ─────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 bg-gradient-to-r from-purple-600/10 via-zinc-900 to-red-600/10 border border-zinc-800/50 rounded-xl p-5"
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-white text-lg font-bold">
                Welcome back, {user?.name || 'Streamer'}!
              </h2>
              <p className="text-zinc-500 text-sm mt-1">
                {isLoadingRooms
                  ? 'Loading streams...'
                  : rooms.length === 0
                  ? 'No streams are live right now. Be the first to go live!'
                  : `${rooms.length} stream${rooms.length !== 1 ? 's' : ''} live now`}
              </p>
            </div>
            <Button
              onClick={handleGoLive}
              className="bg-gradient-to-r from-purple-600 to-red-600 hover:from-purple-700 hover:to-red-700 text-white hidden sm:flex"
            >
              <Plus className="w-4 h-4 mr-2" />
              Start Streaming
            </Button>
          </div>
        </motion.div>

        {/* ─── Streams Grid ───────────────────────────────── */}
        {isLoadingRooms ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="aspect-video bg-zinc-900 rounded-xl animate-pulse"
              />
            ))}
          </div>
        ) : filteredRooms.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredRooms.map((room, index) => (
              <StreamCard
                key={room.id}
                room={room}
                onJoin={handleJoinRoom}
                index={index}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 rounded-full bg-zinc-900 flex items-center justify-center mb-4">
              <TrendingUp className="w-8 h-8 text-zinc-700" />
            </div>
            <h3 className="text-zinc-400 font-semibold text-lg">No Streams Found</h3>
            <p className="text-zinc-600 text-sm mt-2 max-w-xs">
              {searchQuery || activeFilter !== 'all'
                ? 'Try adjusting your search or filter'
                : 'Start your own live stream to get the party started!'}
            </p>
            {!searchQuery && activeFilter === 'all' && (
              <Button
                onClick={handleGoLive}
                className="mt-4 bg-red-600 hover:bg-red-700 text-white"
              >
                <Radio className="w-4 h-4 mr-2" />
                Go Live Now
              </Button>
            )}
          </div>
        )}

        {/* Firestore indicator */}
        <div className="mt-8 text-center">
          <div className="flex items-center justify-center gap-1.5 text-zinc-700 text-xs">
            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
            <span>Real-time sync via Firebase Firestore</span>
          </div>
        </div>
      </main>
    </div>
  );
}
