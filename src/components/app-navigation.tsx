"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import type { DiaryTab } from "@/components/work-diary";

const menuItems: Array<{ id: DiaryTab; label: string }> = [
  { id: "today", label: "今日の記録" },
  { id: "medical", label: "通院記録" },
  { id: "calendar", label: "カレンダー" },
  { id: "history", label: "履歴" },
];

export function AppNavigation({
  user,
  currentTab,
  loggingOut,
  onTabChange,
  onLogout,
}: {
  user: User;
  currentTab: DiaryTab;
  loggingOut: boolean;
  onTabChange: (tab: DiaryTab) => void;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [openedBy, setOpenedBy] = useState<HTMLElement | null>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const displayName = user.displayName?.trim() || "ユーザー";

  function openMenu(trigger: HTMLElement) {
    setOpenedBy(trigger);
    setOpen(true);
  }

  const closeMenu = useCallback((restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) requestAnimationFrame(() => openedBy?.focus());
  }, [openedBy]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawerRef.current?.querySelector<HTMLElement>("button:not(:disabled)")?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeMenu();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = drawerRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled)");
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }

    function closeForNavigation() { closeMenu(false); }
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("popstate", closeForNavigation);
    window.addEventListener("hashchange", closeForNavigation);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("popstate", closeForNavigation);
      window.removeEventListener("hashchange", closeForNavigation);
    };
  }, [open, closeMenu]);

  function selectTab(tab: DiaryTab) {
    onTabChange(tab);
    closeMenu(false);
  }

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-40 border-b border-white/80 bg-white/90 pt-[env(safe-area-inset-top)] shadow-sm backdrop-blur print:hidden">
        <div className="mx-auto flex h-16 w-full max-w-md items-center justify-between px-4">
          <button type="button" aria-label="メニューを開く" aria-expanded={open} aria-controls="app-navigation-drawer" onClick={(event) => open ? closeMenu() : openMenu(event.currentTarget)} className="flex h-11 w-11 touch-manipulation items-center justify-center rounded-full ring-offset-2 transition hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
            <AccountAvatar user={user} size={40} />
          </button>
          <button type="button" aria-label="メニューを開く" aria-expanded={open} aria-controls="app-navigation-drawer" onClick={(event) => open ? closeMenu() : openMenu(event.currentTarget)} className="flex h-11 w-11 touch-manipulation flex-col items-center justify-center gap-1.5 rounded-xl text-teal-800 transition hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
            <span aria-hidden="true" className="h-0.5 w-6 rounded-full bg-current" />
            <span aria-hidden="true" className="h-0.5 w-6 rounded-full bg-current" />
            <span aria-hidden="true" className="h-0.5 w-6 rounded-full bg-current" />
          </button>
        </div>
      </header>

      <div className={`fixed inset-0 z-[60] print:hidden ${open ? "pointer-events-auto" : "pointer-events-none"}`} aria-hidden={!open}>
        <button type="button" tabIndex={open ? 0 : -1} aria-label="メニューを閉じる" onClick={() => closeMenu()} className={`absolute inset-0 h-full w-full bg-slate-950/40 transition-opacity ${open ? "opacity-100" : "opacity-0"}`} />
        <nav ref={drawerRef} id="app-navigation-drawer" aria-label="メインメニュー" inert={!open} className={`absolute right-0 top-0 flex h-full w-[min(84vw,22rem)] flex-col bg-white pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] shadow-2xl transition-transform duration-200 motion-reduce:transition-none ${open ? "translate-x-0" : "translate-x-full"}`}>
          <div className="flex min-w-0 items-center gap-3 border-b border-slate-100 p-4">
            <AccountAvatar user={user} size={48} />
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-800">{displayName}</p>{user.email ? <p className="mt-0.5 truncate text-xs text-slate-500">{user.email}</p> : null}</div>
            <button type="button" onClick={() => closeMenu()} aria-label="メニューを閉じる" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-2xl text-slate-500 hover:bg-slate-50">×</button>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {menuItems.map((item) => <button key={item.id} type="button" aria-current={currentTab === item.id ? "page" : undefined} onClick={() => selectTab(item.id)} className={`relative flex min-h-12 w-full items-center rounded-xl px-4 text-left text-base font-bold transition ${currentTab === item.id ? "bg-teal-50 text-teal-800 before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-full before:bg-teal-700" : "text-slate-600 hover:bg-slate-50"}`}>{item.label}</button>)}
          </div>

          <div className="border-t border-slate-100 p-3">
            <button type="button" onClick={onLogout} disabled={loggingOut} className="min-h-12 w-full rounded-xl px-4 text-left text-base font-bold text-rose-700 transition hover:bg-rose-50 disabled:cursor-wait disabled:opacity-60">{loggingOut ? "ログアウトしています…" : "ログアウト"}</button>
          </div>
        </nav>
      </div>
    </>
  );
}

function AccountAvatar({ user, size }: { user: User; size: number }) {
  const [failed, setFailed] = useState(false);
  const displayName = user.displayName?.trim() || "ユーザー";
  if (!user.photoURL || failed) return <span aria-hidden="true" style={{ width: size, height: size }} className="flex shrink-0 items-center justify-center rounded-full bg-teal-100 text-sm font-bold text-teal-800">{displayName.charAt(0) || "人"}</span>;
  return <Image src={user.photoURL} alt={`${displayName}のプロフィール画像`} width={size} height={size} unoptimized onError={() => setFailed(true)} className="shrink-0 rounded-full object-cover" />;
}
