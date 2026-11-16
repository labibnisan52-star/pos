"use client";

import { useEffect } from "react";

/**
 * Reloads the page once when a new service worker activates and takes control
 * of an already-controlled tab, so users get newly deployed versions automatically.
 */
export default function ServiceWorkerUpdater() {
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      process.env.NODE_ENV === "development"
    ) {
      return;
    }

    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloading = false;

    const handleControllerChange = () => {
      if (!hadController || reloading) return;
      reloading = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener(
      "controllerchange",
      handleControllerChange
    );

    const checkForUpdate = () => {
      navigator.serviceWorker
        .getRegistration()
        .then((reg) => reg?.update().catch(() => {}))
        .catch(() => {});
    };

    checkForUpdate();
    window.addEventListener("focus", checkForUpdate);

    return () => {
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        handleControllerChange
      );
      window.removeEventListener("focus", checkForUpdate);
    };
  }, []);

  return null;
}

