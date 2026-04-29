'use client';

/**
 * ChatBox Component
 * ──────────────────
 * Real-time chat for live streams using Firestore onSnapshot.
 *
 * Architecture:
 *   - Messages are stored in Firestore at: rooms/{roomId}/messages/{messageId}
 *   - onSnapshot listener provides real-time updates (no polling)
 *   - New messages are written via addDoc with serverTimestamp()
 *   - Unsubscribe on unmount prevents memory leaks
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuthStore } from '@/store/auth-store';
import { Send } from 'lucide-react';
import type { ChatMessage } from '@/lib/types';
import { subscribeToChatMessages, sendMessageToFirestore } from '@/lib/firestore-service';

interface ChatBoxProps {
  roomId: string;
}

export function ChatBox({ roomId }: ChatBoxProps) {
  const user = useAuthStore((s) => s.user);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ─── Real-time Message Listener (Firestore onSnapshot) ─────

  useEffect(() => {
    // Subscribe to the room's messages sub-collection.
    // Firestore will call the callback every time a message is added,
    // modified, or removed — giving us true real-time updates.
    const unsubscribe = subscribeToChatMessages(roomId, (updatedMessages) => {
      setMessages(updatedMessages);
    }, 100);

    // Cleanup: stop listening when component unmounts or roomId changes
    return () => {
      unsubscribe();
    };
  }, [roomId]);

  // ─── Auto-scroll to bottom on new messages ────────────────

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // ─── Send Message ─────────────────────────────────────────

  const sendMessage = useCallback(async () => {
    if (!user || !newMessage.trim()) return;

    const message = newMessage.trim();
    setNewMessage('');

    try {
      await sendMessageToFirestore({
        roomId,
        userId: user.id,
        userName: user.name,
        userAvatar: user.avatar,
        message,
        type: 'text',
      });
      // The onSnapshot listener will pick up the new message
      // and trigger a re-render automatically — no manual state update needed.
    } catch (err) {
      console.error('[ChatBox] Send message error:', err);
    } finally {
      inputRef.current?.focus();
    }
  }, [user, newMessage, roomId]);

  // ─── Send Gift ────────────────────────────────────────────

  const sendGift = useCallback(
    async (emoji: string, giftName: string) => {
      if (!user) return;

      try {
        await sendMessageToFirestore({
          roomId,
          userId: user.id,
          userName: user.name,
          userAvatar: user.avatar,
          message: `sent a ${emoji} ${giftName}!`,
          type: 'gift',
        });
      } catch (err) {
        console.error('[ChatBox] Send gift error:', err);
      }
    },
    [user, roomId]
  );

  // ─── Format Time ──────────────────────────────────────────

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="bg-zinc-950/95 backdrop-blur-sm border-t border-zinc-800/50">
      {/* Chat header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800/30">
        <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
          Live Chat
        </span>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
          <span className="text-xs text-zinc-600">Real-time</span>
          <span className="text-xs text-zinc-700 ml-1">{messages.length}</span>
        </div>
      </div>

      {/* Messages area */}
      <div
        ref={scrollRef}
        className="h-48 overflow-y-auto px-4 py-2 space-y-2 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent"
      >
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className={`flex items-start gap-2 ${
                msg.type === 'system' || msg.type === 'gift'
                  ? 'justify-center'
                  : ''
              }`}
            >
              {msg.type === 'system' ? (
                <div className="text-xs text-zinc-500 bg-zinc-900 px-3 py-1 rounded-full">
                  {msg.message}
                </div>
              ) : msg.type === 'gift' ? (
                <div className="text-sm bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full">
                  <span className="text-amber-400 font-medium">{msg.userName}</span>
                  <span className="text-zinc-400"> {msg.message}</span>
                </div>
              ) : (
                <>
                  <Avatar className="w-6 h-6 mt-0.5 flex-shrink-0">
                    <AvatarImage src={msg.userAvatar} />
                    <AvatarFallback className="text-[10px] bg-zinc-800">
                      {msg.userName.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-semibold text-cyan-400 truncate">
                        {msg.userName}
                      </span>
                      <span className="text-[10px] text-zinc-600">
                        {formatTime(msg.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm text-zinc-300 break-words">{msg.message}</p>
                  </div>
                </>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-zinc-600 text-sm">
            No messages yet — say hello!
          </div>
        )}
      </div>

      {/* Quick gift buttons */}
      <div className="flex items-center gap-1 px-4 py-1 border-t border-zinc-800/20">
        <span className="text-xs text-zinc-600 mr-1">Gifts:</span>
        {['🌹', '💎', '🚀', '👑'].map((emoji) => (
          <button
            key={emoji}
            onClick={() => {
              const names: Record<string, string> = {
                '🌹': 'Rose',
                '💎': 'Diamond',
                '🚀': 'Rocket',
                '👑': 'Crown',
              };
              sendGift(emoji, names[emoji] || 'Gift');
            }}
            className="hover:scale-125 transition-transform text-sm"
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* Message input */}
      <div className="flex items-center gap-2 px-4 py-2">
        <Input
          ref={inputRef}
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="Say something..."
          className="flex-1 bg-zinc-900 border-zinc-800 text-sm h-9 placeholder:text-zinc-600 focus:border-purple-500/50 focus:ring-purple-500/20"
          disabled={!user}
        />
        <Button
          onClick={sendMessage}
          disabled={!newMessage.trim() || !user}
          size="icon"
          className="h-9 w-9 bg-purple-600 hover:bg-purple-700 text-white flex-shrink-0"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
