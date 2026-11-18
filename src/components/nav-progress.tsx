"use client";

import React, { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

type Listener = () => void;
const startListeners = new Set<Listener>();
const doneListeners = new Set<Listener>();

export function startNavProgress() {
  startListeners.forEach((fn) => fn());
}

export function completeNavProgress() {
  doneListeners.forEach((fn) => fn());
}

export default function NavProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  useEffect(() => {
    const handleStart = () => {
      clearTimers();
      setVisible(true);
      setProgress(18);
      timerRef.current = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 88) return prev;
          const step = prev < 50 ? 9 : prev < 75 ? 4 : 1.5;
          return Math.min(88, prev + step);
        });
      }, 120);
    };

    const handleDone = () => {
      clearTimers();
      setProgress(100);
      hideTimerRef.current = setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 220);
    };

    startListeners.add(handleStart);
    doneListeners.add(handleDone);

    // Intercept internal <Link> clicks immediately in capture phase
    const onDocumentClick = (e: MouseEvent) => {
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return;
      }
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest("a");
      if (!anchor) return;
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;

      const href = anchor.getAttribute("href");
      if (
        !href ||
        href.startsWith("#") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:")
      ) {
        return;
      }

      try {
        const nextUrl = new URL(href, window.location.origin);
        if (nextUrl.origin !== window.location.origin) return;
        const currentFull = `${window.location.pathname}${window.location.search}`;
        const nextFull = `${nextUrl.pathname}${nextUrl.search}`;
        if (nextFull !== currentFull) {
          handleStart();
        }
      } catch {
        // Ignore malformed URLs
      }
    };

    // Intercept programmatic router.push() via history.pushState
    const origPushState = window.history.pushState.bind(window.history);
    window.history.pushState = function (
      data: unknown,
      unused: string,
      url?: string | URL | null
    ) {
      if (url) {
        try {
          const nextUrl = new URL(String(url), window.location.origin);
          const currentFull = `${window.location.pathname}${window.location.search}`;
          const nextFull = `${nextUrl.pathname}${nextUrl.search}`;
          if (nextFull !== currentFull) {
            handleStart();
          }
        } catch {
          // Ignore
        }
      }
      return origPushState(data, unused, url);
    };

    const onPopState = () => handleStart();

    document.addEventListener("click", onDocumentClick, true);
    window.addEventListener("popstate", onPopState);

    return () => {
      clearTimers();
      startListeners.delete(handleStart);
      doneListeners.delete(handleDone);
      document.removeEventListener("click", onDocumentClick, true);
      window.removeEventListener("popstate", onPopState);
      window.history.pushState = origPushState;
    };
  }, []);

  // Complete progress bar whenever the route commits
  useEffect(() => {
    const t = setTimeout(() => {
      completeNavProgress();
    }, 60);
    return () => clearTimeout(t);
  }, [pathname, searchParams]);

  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      className="fixed top-0 inset-x-0 z-[9999] h-[3px] pointer-events-none bg-transparent"
    >
      <div
        className="h-full bg-gradient-to-r from-gray-900 via-emerald-600 to-gray-900 shadow-[0_0_8px_rgba(16,185,129,0.5)] transition-[width] duration-150 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

