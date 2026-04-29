'use client';

/**
 * StreamCard Component
 * ─────────────────────
 * Displays a preview card for a live stream room in the browse/list view.
 * Shows thumbnail, host info, viewer count, and tags.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Users, Clock } from 'lucide-react';
import type { LiveRoom } from '@/lib/types';

interface StreamCardProps {
  room: LiveRoom;
  onJoin: (room: LiveRoom) => void;
  index?: number;
}

export function StreamCard({ room, onJoin, index = 0 }: StreamCardProps) {
  // Parse tags
  const tags = room.tags?.split(',').filter(Boolean) || [];

  // Format relative time
  const getRelativeTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      onClick={() => onJoin(room)}
      className="group cursor-pointer bg-zinc-900 border border-zinc-800/50 rounded-xl overflow-hidden hover:border-zinc-700/80 transition-all hover:shadow-lg hover:shadow-purple-500/5"
    >
      {/* Thumbnail */}
      <div className="relative aspect-video bg-gradient-to-br from-zinc-800 to-zinc-900 overflow-hidden">
        {/* Simulated stream thumbnail */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <Avatar className="w-16 h-16 mx-auto border-2 border-zinc-700 mb-2">
              <AvatarImage src={room.hostAvatar} />
              <AvatarFallback className="bg-zinc-800 text-lg">
                {room.hostName?.charAt(0) || 'H'}
              </AvatarFallback>
            </Avatar>
            <p className="text-xs text-zinc-600">Stream Preview</p>
          </div>
        </div>

        {/* LIVE badge */}
        <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-red-600/90 backdrop-blur-sm px-2 py-0.5 rounded">
          <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
          <span className="text-white text-[10px] font-bold tracking-wider">LIVE</span>
        </div>

        {/* Viewer count */}
        <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded">
          <Users className="w-3 h-3 text-zinc-400" />
          <span className="text-white text-[10px]">{room.viewerCount}</span>
        </div>

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-purple-600/0 group-hover:bg-purple-600/10 transition-colors" />
      </div>

      {/* Info */}
      <div className="p-3 space-y-2">
        <div className="flex items-start gap-2">
          <Avatar className="w-8 h-8 mt-0.5 flex-shrink-0">
            <AvatarImage src={room.hostAvatar} />
            <AvatarFallback className="bg-zinc-800 text-xs">
              {room.hostName?.charAt(0) || 'H'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-zinc-200 truncate group-hover:text-white transition-colors">
              {room.title}
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">{room.hostName}</p>
          </div>
        </div>

        {room.description && (
          <p className="text-xs text-zinc-600 line-clamp-2">{room.description}</p>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10px] text-zinc-600">
            <Clock className="w-3 h-3" />
            {getRelativeTime(room.createdAt)}
          </div>
          <div className="flex gap-1">
            {tags.slice(0, 3).map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="text-[10px] px-1.5 py-0 bg-zinc-800 text-zinc-400 border-zinc-700"
              >
                {tag.trim()}
              </Badge>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
