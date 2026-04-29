/**
 * Firebase Initialization
 * ────────────────────────
 * Client-side Firebase App and Firestore setup for Next.js App Router.
 *
 * Uses dynamic lazy-initialization pattern to ensure Firebase is only
 * created once in the browser (avoids SSR hydration mismatch and
 * duplicate "Firebase App already exists" errors in dev mode HMR).
 */

import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  enableIndexedDbPersistence,
  type Firestore,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// ─── Singleton App Instance ─────────────────────────────────

let app: FirebaseApp;
let db: Firestore;

function getFirebaseApp(): FirebaseApp {
  if (!getApps().length) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApp();
  }
  return app;
}

/**
 * Get the Firestore database instance.
 * Enables offline persistence via IndexedDB so the chat works
 * even when the network drops temporarily.
 */
export function getDb(): Firestore {
  if (!db) {
    const firebaseApp = getFirebaseApp();
    db = getFirestore(firebaseApp);

    // Enable offline persistence (client-side only)
    if (typeof window !== 'undefined') {
      enableIndexedDbPersistence(db).catch((err) => {
        if (err.code === 'failed-precondition') {
          console.warn(
            '[Firebase] Firestore persistence failed: multiple tabs open. ' +
            'Persistence only works in a single tab.'
          );
        } else if (err.code === 'unimplemented') {
          console.warn(
            '[Firebase] Firestore persistence not available in this browser.'
          );
        }
      });
    }
  }
  return db;
}

export { app };
