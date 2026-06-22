import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '../services/firebase';
import { getMockCurrentUser, MOCK_AUTH_EVENT } from '../services/auth';

interface AuthContextType {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, loading: false });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth) {
      // Mock mode: initialize from localStorage and listen for changes
      const sync = () => {
        setUser(getMockCurrentUser() as unknown as User | null);
      };
      sync();
      setLoading(false);
      window.addEventListener(MOCK_AUTH_EVENT, sync);
      return () => window.removeEventListener(MOCK_AUTH_EVENT, sync);
    }

    // Firebase mode
    const unsub = onAuthStateChanged(auth, u => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
