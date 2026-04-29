/**
 * Zustand Auth Store
 * ─────────────────────
 * Manages user authentication state.
 *
 * On login, the user record is upserted into Firestore so that
 * chat messages and room documents can reference the user by name/avatar.
 */
import { create } from 'zustand';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import type { User, LoginCredentials, AuthState } from '@/lib/types';
import { getDb } from '@/lib/firebase';

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

      // Upsert user document into Firestore
      const db = getDb();
      const userRef = doc(db, 'users', emailId);

      await setDoc(userRef, {
        email: credentials.email,
        name: credentials.name,
        avatar: `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(credentials.name)}`,
        role: 'viewer',
        updatedAt: serverTimestamp(),
      }, { merge: true });

      const user: User = {
        id: emailId,
        email: credentials.email,
        name: credentials.name,
        avatar: `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(credentials.name)}`,
        role: 'viewer',
        createdAt: new Date().toISOString(),
      };

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

      // Persist role change to Firestore
      try {
        const db = getDb();
        const userRef = doc(db, 'users', user.id);
        setDoc(userRef, { role }, { merge: true });
      } catch {
        // Non-critical — role is already updated locally
      }
    }
  },
}));
