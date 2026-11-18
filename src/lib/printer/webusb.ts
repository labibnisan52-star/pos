"use client";

import { translate } from "@/lib/i18n";

export interface PrinterStatus {
  supported: boolean;
  connected: boolean;
  deviceName: string | null;
  busy: boolean;
  lastError: string | null;
}

const CHUNK_SIZE = 4096;
const CHUNK_DELAY_MS = 8;

let activeDevice: USBDevice | null = null;
let activeInterfaceNumber: number | null = null;
let activeEndpointNumber: number | null = null;
let listenersAttached = false;
let jobQueue: Promise<void> = Promise.resolve();
let isBusy = false;
let lastErrorMsg: string | null = null;

type StatusListener = (status: PrinterStatus) => void;
const statusListeners = new Set<StatusListener>();

export function isSupported(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }
  const hasUsb = "usb" in navigator && Boolean(navigator.usb);
  const secure =
    window.isSecureContext ||
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";
  return hasUsb && secure;
}

export function getPrinterStatus(): PrinterStatus {
  const connected = Boolean(
    activeDevice &&
      activeDevice.opened &&
      activeEndpointNumber !== null
  );
  return {
    supported: isSupported(),
    connected,
    deviceName: activeDevice
      ? activeDevice.productName ||
        activeDevice.manufacturerName ||
        "USB ESC/POS Printer"
      : null,
    busy: isBusy,
    lastError: lastErrorMsg,
  };
}

function notifyStatus() {
  const snapshot = getPrinterStatus();
  statusListeners.forEach((fn) => fn(snapshot));
}

export function subscribePrinterStatus(listener: StatusListener): () => void {
  statusListeners.add(listener);
  listener(getPrinterStatus());
  return () => {
    statusListeners.delete(listener);
  };
}

// প্রিন্টারের টেকনিক্যাল ত্রুটিকে সহজ বাংলা বার্তায় রূপান্তর
export function toFriendlyUsbError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err || "");
  const name = err instanceof Error ? err.name : "";
  const lower = raw.toLowerCase();

  if (!isSupported()) {
    return translate("usbPrinter.unsupported");
  }
  if (
    name === "NotFoundError" ||
    name === "NotAllowedError" ||
    lower.includes("no device selected") ||
    lower.includes("access denied")
  ) {
    return translate("usbPrinter.permissionDenied");
  }
  if (
    name === "SecurityError" ||
    name === "NetworkError" ||
    lower.includes("claim") ||
    lower.includes("unable to claim") ||
    lower.includes("busy") ||
    lower.includes("in use")
  ) {
    return translate("usbPrinter.claimInterfaceError");
  }
  if (
    lower.includes("disconnected") ||
    lower.includes("transfer") ||
    lower.includes("not open")
  ) {
    return translate("usbPrinter.deviceDisconnected");
  }
  return raw || translate("usbPrinter.deviceDisconnected");
}

function attachUsbEvents() {
  if (listenersAttached || !isSupported() || !navigator.usb) return;
  listenersAttached = true;

  navigator.usb.addEventListener("connect", (event) => {
    const dev = (event as USBConnectionEvent).device;
    if (!activeDevice && dev) {
      void openDevice(dev).catch(() => {});
    }
  });

  navigator.usb.addEventListener("disconnect", (event) => {
    const dev = (event as USBConnectionEvent).device;
    if (activeDevice && dev === activeDevice) {
      activeDevice = null;
      activeInterfaceNumber = null;
      activeEndpointNumber = null;
      lastErrorMsg = translate("usbPrinter.deviceDisconnected");
      notifyStatus();
    }
  });
}

/**
 * Opens configuration 1 if needed, locates a bulk OUT endpoint (preferring USB Printer class 7),
 * and claims the interface.
 */
export async function openDevice(device: USBDevice): Promise<void> {
  try {
    if (!device.opened) {
      await device.open();
    }
    if (!device.configuration) {
      await device.selectConfiguration(1);
    }

    const interfaces = device.configuration?.interfaces || [];
    let chosenIface: number | null = null;
    let chosenEndpoint: number | null = null;

    // First pass: prefer USB Printer Class (classCode === 7)
    for (const iface of interfaces) {
      for (const alt of iface.alternates) {
        if (alt.interfaceClass !== 7) continue;
        const outEp = alt.endpoints.find(
          (ep) => ep.direction === "out" && ep.type === "bulk"
        );
        if (outEp) {
          chosenIface = iface.interfaceNumber;
          chosenEndpoint = outEp.endpointNumber;
          break;
        }
      }
      if (chosenEndpoint !== null) break;
    }

    // Second pass: any interface with a bulk OUT endpoint
    if (chosenEndpoint === null) {
      for (const iface of interfaces) {
        for (const alt of iface.alternates) {
          const outEp = alt.endpoints.find(
            (ep) => ep.direction === "out" && ep.type === "bulk"
          );
          if (outEp) {
            chosenIface = iface.interfaceNumber;
            chosenEndpoint = outEp.endpointNumber;
            break;
          }
        }
        if (chosenEndpoint !== null) break;
      }
    }

    if (chosenIface === null || chosenEndpoint === null) {
      throw new Error("No bulk OUT endpoint found on this USB device.");
    }

    await device.claimInterface(chosenIface);

    activeDevice = device;
    activeInterfaceNumber = chosenIface;
    activeEndpointNumber = chosenEndpoint;
    lastErrorMsg = null;
    attachUsbEvents();
    notifyStatus();
  } catch (err) {
    activeDevice = null;
    activeInterfaceNumber = null;
    activeEndpointNumber = null;
    const friendly = toFriendlyUsbError(err);
    lastErrorMsg = friendly;
    notifyStatus();
    throw new Error(friendly);
  }
}

/**
 * Prompts the user to select a USB printer (must be triggered from a user click).
 * First filters by USB Printer Class 7; if none found, falls back to listing all USB devices.
 */
export async function connect(): Promise<PrinterStatus> {
  if (!isSupported() || !navigator.usb) {
    throw new Error(translate("usbPrinter.unsupported"));
  }

  attachUsbEvents();

  let device: USBDevice;
  try {
    device = await navigator.usb.requestDevice({
      filters: [{ classCode: 7 }],
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    // If user canceled or no class-7 device matched, offer unfiltered picker
    if (name === "NotFoundError") {
      try {
        device = await navigator.usb.requestDevice({ filters: [] });
      } catch (fallbackErr) {
        throw new Error(toFriendlyUsbError(fallbackErr));
      }
    } else {
      throw new Error(toFriendlyUsbError(err));
    }
  }

  await openDevice(device);
  return getPrinterStatus();
}

/**
 * Reuses an already-permitted USB printer without prompting.
 */
export async function autoReconnect(): Promise<boolean> {
  if (!isSupported() || !navigator.usb) return false;
  attachUsbEvents();

  if (activeDevice?.opened && activeEndpointNumber !== null) {
    return true;
  }

  try {
    const devices = await navigator.usb.getDevices();
    if (devices.length === 0) return false;

    // Prefer class 7 printer device if available
    const preferred =
      devices.find((d) =>
        d.configuration?.interfaces.some((i) =>
          i.alternates.some((a) => a.interfaceClass === 7)
        )
      ) || devices[0];

    await openDevice(preferred);
    return true;
  } catch {
    return false;
  }
}

export async function disconnect(): Promise<void> {
  const dev = activeDevice;
  const iface = activeInterfaceNumber;
  activeDevice = null;
  activeInterfaceNumber = null;
  activeEndpointNumber = null;

  if (dev) {
    try {
      if (iface !== null && dev.opened) {
        await dev.releaseInterface(iface).catch(() => {});
      }
      if (dev.opened) {
        await dev.close().catch(() => {});
      }
    } catch {
      // Ignore close errors
    }
  }
  notifyStatus();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Writes raw ESC/POS bytes to the USB printer in 4096-byte chunks.
 * Serialized through a single-flight queue; never auto-retries failed jobs.
 */
export function write(bytes: Uint8Array): Promise<void> {
  const run = async () => {
    if (!isSupported()) {
      throw new Error(translate("usbPrinter.unsupported"));
    }
    if (!activeDevice || !activeDevice.opened || activeEndpointNumber === null) {
      const reconnected = await autoReconnect();
      if (!reconnected || !activeDevice || activeEndpointNumber === null) {
        throw new Error(translate("usbPrinter.deviceDisconnected"));
      }
    }

    isBusy = true;
    lastErrorMsg = null;
    notifyStatus();

    try {
      for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
        const end = Math.min(bytes.length, offset + CHUNK_SIZE);
        const chunk = bytes.slice(offset, end);
        const result = await activeDevice.transferOut(
          activeEndpointNumber,
          chunk
        );
        if (result.status !== "ok") {
          throw new Error(`USB transfer failed (${result.status})`);
        }
        if (end < bytes.length) {
          await sleep(CHUNK_DELAY_MS);
        }
      }
    } catch (err) {
      const friendly = toFriendlyUsbError(err);
      lastErrorMsg = friendly;
      if (
        err instanceof Error &&
        (err.message.toLowerCase().includes("disconnect") ||
          err.name === "NetworkError")
      ) {
        activeDevice = null;
        activeInterfaceNumber = null;
        activeEndpointNumber = null;
      }
      throw new Error(friendly);
    } finally {
      isBusy = false;
      notifyStatus();
    }
  };

  // Serialize jobs so two prints never overlap; reset chain cleanly on error
  const next = jobQueue.then(run, run);
  jobQueue = next.catch(() => {});
  return next;
}

