"use client";

import { useEffect, useState } from "react";

/**
 * Tracks the software keyboard height using the Visual Viewport API.
 * Used as a fallback for browsers/PWAs (such as iOS Safari or older Android WebViews)
 * where `interactiveWidget: "resizes-content"` does not resize the layout viewport.
 */
export function useKeyboardInset(): number {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      const raw = window.innerHeight - vv.height - vv.offsetTop;
      const clamped = raw > 0 ? Math.round(raw) : 0;
      setKeyboardHeight(clamped);
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    window.addEventListener("resize", update);

    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return keyboardHeight;
}

