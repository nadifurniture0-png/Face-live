'use client';

/**
 * StreamLive — Main Application Page
 * ────────────────────────────────────
 * Single-page application with view routing via Zustand state.
 * Views: Login → Home → Host Studio / Viewer Room
 *
 * Architecture:
 *   - Authentication via mock Firebase Auth (Prisma-backed API)
 *   - Room management via Firestore-like API (Prisma)
 *   - Streaming via Agora.io/LiveKit abstraction layer
 *   - Face swap processing on HTML5 Canvas
 */

import { useAuthStore } from '@/store/auth-store';
import { useStreamStore } from '@/store/stream-store';
import { LoginScreen } from '@/components/live/login-screen';
import { HomeScreen } from '@/components/live/home-screen';
import { HostStudio } from '@/components/live/host-studio';
import { ViewerRoom } from '@/components/live/viewer-room';
import { AnimatePresence, motion } from 'framer-motion';

export default function Home() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const currentView = useStreamStore((s) => s.currentView);
  const activeRoom = useStreamStore((s) => s.activeRoom);

  return (
    <div className="h-dvh w-full overflow-hidden bg-black">
      <AnimatePresence mode="wait">
        {!isAuthenticated ? (
          <motion.div
            key="login"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="h-full w-full"
          >
            <LoginScreen />
          </motion.div>
        ) : currentView === 'host-studio' ? (
          <motion.div
            key="host-studio"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.3 }}
            className="h-full w-full"
          >
            <HostStudio />
          </motion.div>
        ) : currentView === 'viewer-room' && activeRoom ? (
          <motion.div
            key="viewer-room"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.3 }}
            className="h-full w-full"
          >
            <ViewerRoom room={activeRoom} />
          </motion.div>
        ) : (
          <motion.div
            key="home"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="h-full w-full overflow-y-auto"
          >
            <HomeScreen />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
