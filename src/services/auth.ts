import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  User,
} from 'firebase/auth';
import { auth } from './firebase';

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true' || !import.meta.env.VITE_FIREBASE_PROJECT_ID;
const MOCK_USERS_KEY = 'ch_mock_users';
const MOCK_USER_KEY = 'ch_mock_current_user';
const MOCK_AUTH_EVENT = 'ch-mock-auth-change';

interface MockUser { uid: string; email: string; displayName: string | null }

function getMockUsers(): Array<{ email: string; password: string; name: string }> {
  try { return JSON.parse(localStorage.getItem(MOCK_USERS_KEY) ?? '[]'); } catch { return []; }
}

function setMockCurrentUser(user: MockUser | null) {
  if (user) localStorage.setItem(MOCK_USER_KEY, JSON.stringify(user));
  else localStorage.removeItem(MOCK_USER_KEY);
  window.dispatchEvent(new Event(MOCK_AUTH_EVENT));
}

export function getMockCurrentUser(): MockUser | null {
  try {
    const stored = localStorage.getItem(MOCK_USER_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch { return null; }
}

export { MOCK_AUTH_EVENT };

function requireAuth() {
  if (!auth) throw new Error('Firebase Auth is not configured. Add your Firebase credentials to .env to enable sign-in.');
}

export async function register(name: string, email: string, password: string): Promise<User> {
  if (USE_MOCK) {
    await new Promise(r => setTimeout(r, 500));
    const users = getMockUsers();
    if (users.find(u => u.email === email)) throw new Error('An account with this email already exists.');
    users.push({ email, password, name });
    localStorage.setItem(MOCK_USERS_KEY, JSON.stringify(users));
    const mockUser: MockUser = { uid: `mock-${email}`, email, displayName: name };
    setMockCurrentUser(mockUser);
    return mockUser as unknown as User;
  }
  requireAuth();
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName: name });
  return cred.user;
}

export async function login(email: string, password: string): Promise<User> {
  if (USE_MOCK) {
    await new Promise(r => setTimeout(r, 500));
    const users = getMockUsers();
    const found = users.find(u => u.email === email && u.password === password);
    if (!found) throw new Error('Invalid email or password.');
    const mockUser: MockUser = { uid: `mock-${email}`, email, displayName: found.name };
    setMockCurrentUser(mockUser);
    return mockUser as unknown as User;
  }
  requireAuth();
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function logout(): Promise<void> {
  if (USE_MOCK) {
    setMockCurrentUser(null);
    return;
  }
  if (!auth) return;
  await signOut(auth);
}
