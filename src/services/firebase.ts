import { initializeApp, FirebaseApp } from 'firebase/app';
import { initializeFirestore, Firestore } from 'firebase/firestore';
import { getAuth, Auth } from 'firebase/auth';
import { getStorage, FirebaseStorage } from 'firebase/storage';

const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;

let app: FirebaseApp | null = null;
let _db: Firestore | null = null;
let _auth: Auth | null = null;
let _storage: FirebaseStorage | null = null;

if (projectId) {
  app = initializeApp({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  });
  _db = initializeFirestore(app, { ignoreUndefinedProperties: true });
  _auth = getAuth(app);
  _storage = getStorage(app);
}

export { app };
export const db = _db as Firestore;
export const auth = _auth as Auth;
export const storage = _storage as FirebaseStorage;

export default app;
