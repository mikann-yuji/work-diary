"use client";

import { useCallback, useRef, useState } from "react";
import { AppNavigation } from "@/components/app-navigation";
import { useAuth } from "@/components/auth-provider";
import { LoadingSpinner } from "@/components/loading-spinner";
import { Toast, type ToastMessage } from "@/components/toast";
import { WorkDiary, type DiaryTab } from "@/components/work-diary";

export function AppShell() {
  const { user, loading, signingIn, authError, databaseError, signInWithGoogle, logout } = useAuth();
  const [tab, setTab] = useState<DiaryTab>("today");
  const [loggingOut, setLoggingOut] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const toastIdRef = useRef(0);
  const closeToast = useCallback(() => setToast(null), []);

  if (loading) return <LoadingScreen />;
  if (!user) {
    return <LoginScreen signingIn={signingIn} error={authError} onLogin={signInWithGoogle} />;
  }

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    const succeeded = await logout();
    setLoggingOut(false);
    if (!succeeded) {
      toastIdRef.current += 1;
      setToast({ id: toastIdRef.current, message: "ログアウトできませんでした。もう一度お試しください", type: "error" });
    }
  }

  return (
    <main className="min-h-screen px-4 pb-6 pt-[calc(env(safe-area-inset-top)+5rem)] sm:pb-10">
      <AppNavigation user={user} currentTab={tab} loggingOut={loggingOut} onTabChange={setTab} onLogout={() => void handleLogout()} />
      <div className="mx-auto w-full max-w-md">
        {authError ? <MessageBanner>{authError}</MessageBanner> : null}
        {databaseError ? <MessageBanner>{databaseError}</MessageBanner> : null}
        <WorkDiary tab={tab} onTabChange={setTab} />
      </div>
      <Toast toast={toast} onClose={closeToast} />
    </main>
  );
}

function LoadingScreen() {
  return (
    <main className="min-h-screen px-4 py-6 sm:py-10">
      <div className="mx-auto w-full max-w-md">
        <AppHeader />
        <section className="overflow-hidden rounded-[28px] border border-white/80 bg-white/90 shadow-[0_18px_50px_rgba(43,89,85,0.10)] backdrop-blur"><LoadingSpinner className="min-h-[420px] bg-slate-50/50" /></section>
      </div>
    </main>
  );
}

function LoginScreen({ signingIn, error, onLogin }: { signingIn: boolean; error: string | null; onLogin: () => Promise<void> }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <section className="w-full max-w-sm rounded-[28px] border border-white/80 bg-white/90 p-6 shadow-[0_18px_50px_rgba(43,89,85,0.12)] backdrop-blur sm:p-8">
        <AppMark />
        <p className="mt-5 text-sm font-semibold tracking-[0.16em] text-teal-700">WORK NOTE</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-800">仕事上の傾向と対策</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">毎日の勤務や体調を、自分のペースで振り返るための記録アプリです。</p>

        {error ? <div className="mt-5"><MessageBanner>{error}</MessageBanner></div> : null}

        <button
          type="button"
          disabled={signingIn}
          onClick={() => void onLogin()}
          className="mt-6 flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 text-base font-bold text-slate-700 shadow-sm transition hover:border-teal-300 hover:bg-teal-50 disabled:cursor-wait disabled:opacity-60"
        >
          <GoogleMark />
          {signingIn ? "ログインしています…" : "Googleでログイン"}
        </button>

        <div className="mt-6 space-y-3 border-t border-slate-100 pt-5 text-xs leading-5 text-slate-500">
          <p>データは、ログインしたご本人のアカウントごとに管理されます。</p>
          <p>通信はHTTPSで保護され、記録へのアクセスはFirebase認証とセキュリティルールでアカウントごとに制限されます。</p>
        </div>
      </section>
    </main>
  );
}

function AppMark() {
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal-700 text-white shadow-sm shadow-teal-900/15">
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current" strokeWidth="1.8">
        <path d="M7 3v3M17 3v3M4.5 9h15M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
        <path d="m8 14 2.2 2.2L16 11" />
      </svg>
    </div>
  );
}

function AppHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="mb-6 px-1">
      <div className="flex items-start justify-between gap-3">
        <AppMark />
        {children}
      </div>
      <p className="mt-3 text-sm font-semibold tracking-[0.16em] text-teal-700">WORK NOTE</p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-800">仕事上の傾向と対策</h1>
      <p className="mt-2 text-[15px] leading-6 text-slate-500">今日の状況を、無理のないペースで記録しましょう。</p>
    </header>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0">
      <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.5-.2-2.2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.6h3.3c1.9-1.8 2.9-4.3 2.9-7.3Z" />
      <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.7-2.5l-3.3-2.6c-.9.6-2.1 1-3.4 1a5.9 5.9 0 0 1-5.5-4.1H3.1v2.7A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.5 13.8a6 6 0 0 1 0-3.7V7.5H3.1a10 10 0 0 0 0 9l3.4-2.7Z" />
      <path fill="#EA4335" d="M12 6.1c1.5 0 2.8.5 3.9 1.5l2.9-2.9A9.8 9.8 0 0 0 3.1 7.5l3.4 2.6A5.9 5.9 0 0 1 12 6.1Z" />
    </svg>
  );
}

function MessageBanner({ children }: { children: React.ReactNode }) {
  return <p role="alert" className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">{children}</p>;
}
