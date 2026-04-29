/**
 * Zustand Auth Store
 * ─────────────────────
 * Manages user authentication state.
 *
 * Login always works LOCALLY (no Firebase dependency).
 * If Firebase env vars are properly configured, the user profile
 * is synced to Firestore for chat/room references. If Firebase is
 * unconfigured (missing NEXT_PUBLIC_FIREBASE_*), login still
 * succeeds with local state only — no errors thrown.
 */
import { create } from 'zustand';
import type { User, LoginCredentials, AuthState } from '@/lib/types';

interface AuthStore extends AuthState {
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => void;
  updateUserRole: (role: 'host' | 'viewer') => void;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,

  login: async (credentials: LoginCredentials) => {
    set({ isLoading: true });
    try {
      // Generate a deterministic user ID from email
      const emailId = credentials.email
        .replace(/[^a-z0-9]/gi, '_')
        .toLowerCase();

      const avatar = `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(credentials.name)}`;

      // Create user locally — login always succeeds
      const user: User = {
        id: emailId,
        email: credentials.email,
        name: credentials.name,
        avatar,
        role: 'viewer',
        createdAt: new Date().toISOString(),
      };

      // Sync user to Firestore ONLY if Firebase is configured
      try {
        const { isFirebaseConfigured, getDb } = await import('@/lib/firebase');

        if (!isFirebaseConfigured()) {
          console.info('[AuthStore] Firebase not configured — skipping Firestore sync');
        } else {
          const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
          const db = getDb();
          const userRef = doc(db, 'users', emailId);

          await setDoc(userRef, {
            email: credentials.email,
            name: credentials.name,
            avatar,
            role: 'viewer',
            updatedAt: serverTimestamp(),
          }, { merge: true });

          console.info('[AuthStore] User synced to Firestore');
        }
      } catch (firebaseErr) {
        console.warn('[AuthStore] Firestore sync failed (non-critical):', firebaseErr);
      }

      set({ user, isAuthenticated: true, isLoading: false });
    } catch (error) {
      console.error('[AuthStore] Login error:', error);
      set({ isLoading: false });
      throw error;
    }
  },

  logout: () => {
    set({ user: null, isAuthenticated: false });
  },

  updateUserRole: (role: 'host' | 'viewer') => {
    const { user } = get();
    if (user) {
      set({ user: { ...user, role } });

      // Optionally persist role change to Firestore (non-critical)
      (async () => {
        try {
          const { isFirebaseConfigured, getDb } = await import('@/lib/firebase');
          if (!isFirebaseConfigured()) return;

          const { doc, setDoc } = await import('firebase/firestore');
          const db = getDb();
          const userRef = doc(db, 'users', user.id);
          await setDoc(userRef, { role }, { merge: true });
        } catch {
          // Non-critical — role is already updated locally
        }
      })();
    }
  },
}));
