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
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
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
  logout: () => Promise<boolean>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const googleProvider = new GoogleAuthProvider();
function getAuthErrorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : "";
}

function toJapaneseAuthError(error: unknown) {
  const code = getAuthErrorCode(error);
  if (code === "auth/popup-closed-by-user") return "ログインがキャンセルされました。もう一度お試しください。";
  if (code === "auth/popup-blocked") return "ログイン画面を開けませんでした。ブラウザのポップアップを許可して、もう一度お試しください。";
  if (code === "auth/cancelled-popup-request") return "ログイン処理が中断されました。少し待ってから、もう一度お試しください。";
  if (code === "auth/operation-not-supported-in-this-environment") return "このブラウザではログイン画面を開けません。SafariまたはChromeでお試しください。";
  if (code === "auth/network-request-failed") return "通信を確認して、もう一度お試しください。";
  if (code === "auth/unauthorized-domain") return "この環境ではログインを利用できません。管理者へご連絡ください。";
  return "ログインできませんでした。しばらくしてからもう一度お試しください。";
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
      } catch (error) {
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
      await signInWithPopup(firebaseAuth, googleProvider);
    } catch (error) {
      setAuthError(toJapaneseAuthError(error));
      signInLock.current = false;
      setSigningIn(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setAuthError(null);
    try {
      await signOut(firebaseAuth);
      return true;
    } catch {
      setAuthError("ログアウトできませんでした。もう一度お試しください。");
      return false;
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
