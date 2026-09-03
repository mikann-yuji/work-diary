"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  browserLocalPersistence,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from "firebase/auth";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { firebaseAuth, firestore } from "@/lib/firebase/client";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  signingIn: boolean;
  authError: string | null;
  databaseError: string | null;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const googleProvider = new GoogleAuthProvider();
const redirectFallbackCodes = new Set([
  "auth/popup-blocked",
  "auth/cancelled-popup-request",
  "auth/operation-not-supported-in-this-environment",
]);

function getAuthErrorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : "";
}

function toJapaneseAuthError(error: unknown) {
  const code = getAuthErrorCode(error);
  if (code === "auth/popup-closed-by-user") return "ログインがキャンセルされました。もう一度お試しください。";
  if (code === "auth/network-request-failed") return "通信を確認して、もう一度お試しください。";
  if (code === "auth/unauthorized-domain") return "この環境ではログインを利用できません。管理者へご連絡ください。";
  return "ログインできませんでした。しばらくしてからもう一度お試しください。";
}

function shouldUseRedirect() {
  const standalone = window.matchMedia("(display-mode: standalone)").matches
    || ("standalone" in navigator && navigator.standalone === true);
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  return standalone || mobile;
}

async function updateUserDocument(uid: string) {
  const userRef = doc(firestore, "users", uid);
  const snapshot = await getDoc(userRef);
  if (snapshot.exists()) {
    await updateDoc(userRef, { lastLoginAt: serverTimestamp(), schemaVersion: 1 });
    return;
  }
  await setDoc(userRef, {
    createdAt: serverTimestamp(),
    lastLoginAt: serverTimestamp(),
    schemaVersion: 1,
  });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [databaseError, setDatabaseError] = useState<string | null>(null);
  const signInLock = useRef(false);

  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};

    async function initializeAuth() {
      try {
        await setPersistence(firebaseAuth, browserLocalPersistence);
        await getRedirectResult(firebaseAuth);
      } catch (error) {
        console.error("Firebase redirect authentication failed", error);
        if (active) setAuthError(toJapaneseAuthError(error));
      }

      if (!active) return;
      unsubscribe = onAuthStateChanged(firebaseAuth, (currentUser) => {
        setUser(currentUser);
        setLoading(false);
        setSigningIn(false);
        signInLock.current = false;
        setDatabaseError(null);

        if (currentUser) {
          updateUserDocument(currentUser.uid).catch((error) => {
            console.error("Firestore connection check failed", error);
            if (active) setDatabaseError("データベースへの接続を確認できませんでした");
          });
        }
      });
    }

    void initializeAuth();
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (signInLock.current) return;
    signInLock.current = true;
    setSigningIn(true);
    setAuthError(null);

    try {
      if (shouldUseRedirect()) {
        await signInWithRedirect(firebaseAuth, googleProvider);
        return;
      }
      await signInWithPopup(firebaseAuth, googleProvider);
    } catch (error) {
      if (redirectFallbackCodes.has(getAuthErrorCode(error))) {
        try {
          await signInWithRedirect(firebaseAuth, googleProvider);
          return;
        } catch (redirectError) {
          console.error("Firebase redirect fallback failed", redirectError);
          setAuthError(toJapaneseAuthError(redirectError));
        }
      } else {
        console.error("Firebase popup authentication failed", error);
        setAuthError(toJapaneseAuthError(error));
      }
      signInLock.current = false;
      setSigningIn(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setAuthError(null);
    try {
      await signOut(firebaseAuth);
    } catch (error) {
      console.error("Firebase logout failed", error);
      setAuthError("ログアウトできませんでした。もう一度お試しください。");
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, signingIn, authError, databaseError, signInWithGoogle, logout }),
    [user, loading, signingIn, authError, databaseError, signInWithGoogle, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
