'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
} from 'firebase/auth';
import {
  doc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db, googleProvider } from './firebase';

export interface Organization {
  id: string;
  name: string;
  industry: string;
  teamSize?: number;
  ownerId: string;
  members: string[];
  createdAt: Date;
}

interface AuthContextType {
  user: User | null;
  org: Organization | null;
  loading: boolean;
  orgLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  createOrganization: (name: string, industry: string, teamSize?: number) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [org, setOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [orgLoading, setOrgLoading] = useState(true);

  // Fetch organization for user
  const fetchOrg = useCallback(async (uid: string) => {
    if (!db) {
      setOrgLoading(false);
      return;
    }
    setOrgLoading(true);
    try {
      const orgsRef = collection(db, 'organizations');
      const q = query(orgsRef, where('members', 'array-contains', uid));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const docData = snap.docs[0];
        setOrg({
          id: docData.id,
          ...docData.data(),
          createdAt: docData.data().createdAt?.toDate?.() || new Date(),
        } as Organization);
      } else {
        setOrg(null);
      }
    } catch (err) {
      console.error('Failed to fetch org:', err);
      setOrg(null);
    } finally {
      setOrgLoading(false);
    }
  }, []);

  // Listen to auth state
  useEffect(() => {
    if (!auth) {
      setLoading(false);
      setOrgLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
      if (firebaseUser) {
        await fetchOrg(firebaseUser.uid);
      } else {
        setOrg(null);
        setOrgLoading(false);
      }
    });
    return () => unsub();
  }, [fetchOrg]);

  const signIn = async (email: string, password: string) => {
    if (!auth) throw new Error('Firebase not configured');
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signUp = async (email: string, password: string, displayName: string) => {
    if (!auth) throw new Error('Firebase not configured');
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName });
  };

  const signInWithGoogle = async () => {
    if (!auth || !googleProvider) throw new Error('Firebase not configured');
    await signInWithPopup(auth, googleProvider);
  };

  const signOutUser = async () => {
    if (!auth) return;
    await firebaseSignOut(auth);
    setOrg(null);
  };

  const createOrganization = async (name: string, industry: string, teamSize?: number) => {
    if (!user) throw new Error('Must be logged in');
    if (!db) throw new Error('Firebase not configured');
    const orgRef = doc(collection(db, 'organizations'));
    const orgData = {
      name,
      industry,
      teamSize: teamSize || null,
      ownerId: user.uid,
      members: [user.uid],
      createdAt: serverTimestamp(),
    };
    await setDoc(orgRef, orgData);
    setOrg({
      id: orgRef.id,
      ...orgData,
      createdAt: new Date(),
    } as Organization);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        org,
        loading,
        orgLoading,
        signIn,
        signUp,
        signInWithGoogle,
        signOutUser,
        createOrganization,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
