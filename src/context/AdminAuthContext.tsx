import React, { createContext, useContext, useState, useEffect } from 'react';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { auth } from '../services/firebase';

interface AdminAuthContextType {
  isAdminAuthenticated: boolean;
  initializing: boolean;
  adminLogin: (email: string, password: string) => Promise<void>;
  adminLogout: () => void;
}

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true' || !import.meta.env.VITE_FIREBASE_PROJECT_ID;
const MOCK_EMAIL = 'admin@candleheaven.lk';
const MOCK_PASSWORD = 'admin123';
const SESSION_KEY = 'ch_admin_session';

const AdminAuthContext = createContext<AdminAuthContextType>({
  isAdminAuthenticated: false,
  initializing: false,
  adminLogin: async () => {},
  adminLogout: () => {},
});

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(
    () => USE_MOCK && sessionStorage.getItem(SESSION_KEY) === 'true',
  );
  // In production, wait for onAuthStateChanged before rendering protected routes
  const [initializing, setInitializing] = useState(!USE_MOCK);

  useEffect(() => {
    if (USE_MOCK) return;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const token = await user.getIdTokenResult();
        setIsAdminAuthenticated(token.claims.admin === true);
      } else {
        setIsAdminAuthenticated(false);
      }
      setInitializing(false);
    });
    return unsubscribe;
  }, []);

  async function adminLogin(email: string, password: string) {
    if (USE_MOCK) {
      await new Promise(r => setTimeout(r, 600));
      if (email === MOCK_EMAIL && password === MOCK_PASSWORD) {
        sessionStorage.setItem(SESSION_KEY, 'true');
        setIsAdminAuthenticated(true);
        return;
      }
      throw new Error('Invalid credentials');
    }
    const credential = await signInWithEmailAndPassword(auth, email, password);
    const token = await credential.user.getIdTokenResult();
    if (token.claims.admin !== true) {
      await signOut(auth);
      throw new Error('Access denied. This portal is for employees only.');
    }
    setIsAdminAuthenticated(true);
  }

  function adminLogout() {
    if (USE_MOCK) {
      sessionStorage.removeItem(SESSION_KEY);
      setIsAdminAuthenticated(false);
      return;
    }
    signOut(auth);
    setIsAdminAuthenticated(false);
  }

  return (
    <AdminAuthContext.Provider value={{ isAdminAuthenticated, initializing, adminLogin, adminLogout }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  return useContext(AdminAuthContext);
}
