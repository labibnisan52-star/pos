"use client";

import React, { useEffect, useState } from "react";
import {
  AlertCircle,
  Check,
  Loader2,
  Printer,
  Ruler,
  Usb,
  Unplug,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import {
  autoReconnectPrinter,
  connectPrinter,
  disconnectPrinter,
  getStatus,
  printCalibrationLabel,
  subscribeStatus,
  testPrint,
  type PrinterStatus,
} from "@/lib/printer";
import {
  loadUsbPrinterSettings,
  saveUsbPrinterSettings,
  type UsbPrinterSettings,
} from "@/lib/printer/settings";

export default function UsbPrinterSettingsCard() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<PrinterStatus>(() => getStatus());
  const [settings, setSettings] = useState<UsbPrinterSettings>(() =>
    loadUsbPrinterSettings()
  );
  const [busyAction, setBusyAction] = useState<
    "connect" | "test" | "calibrate" | null
  >(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    const unsub = subscribeStatus(setStatus);
    void autoReconnectPrinter();
    return unsub;
  }, []);

  const updateSetting = <K extends keyof UsbPrinterSettings>(
    key: K,
    value: UsbPrinterSettings[K]
  ) => {
    const next = saveUsbPrinterSettings({ [key]: value });
    setSettings(next);
  };

  const handleConnect = async () => {
    setBusyAction("connect");
    setFeedback(null);
    try {
      const nextStatus = await connectPrinter();
      setFeedback({
        type: "success",
        message: `${t("usbPrinter.connected")}: ${nextStatus.deviceName || "USB"}`,
      });
    } catch (err) {
      setFeedback({
        type: "error",
        message:
          err instanceof Error
            ? err.message
            : t("usbPrinter.permissionDenied"),
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleDisconnect = async () => {
    setFeedback(null);
    await disconnectPrinter();
  };

  const handleTestPrint = async () => {
    setBusyAction("test");
    setFeedback(null);
    try {
      await testPrint();
      setFeedback({
        type: "success",
        message: t("usbPrinter.printSuccess"),
      });
    } catch (err) {
      setFeedback({
        type: "error",
        message:
          err instanceof Error
            ? err.message
            : t("usbPrinter.deviceDisconnected"),
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleCalibrationPrint = async () => {
    setBusyAction("calibrate");
    setFeedback(null);
    try {
      await printCalibrationLabel();
      setFeedback({
        type: "success",
        message: t("usbPrinter.printSuccess"),
      });
    } catch (err) {
      setFeedback({
        type: "error",
        message:
          err instanceof Error
            ? err.message
            : t("usbPrinter.deviceDisconnected"),
      });
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div
      className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 space-y-5 shadow-2xs"
      style={{
        fontFamily:
          "var(--font-noto-bengali), var(--font-geist-sans), sans-serif",
      }}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
            <Usb className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-gray-900">
              {t("usbPrinter.sectionTitle")}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {t("usbPrinter.sectionDesc")}
            </p>
          </div>
        </div>

        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border self-start sm:self-auto shrink-0 ${
            status.connected
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : "bg-gray-100 text-gray-600 border-gray-200"
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              status.connected ? "bg-emerald-500" : "bg-gray-400"
            }`}
          />
          {status.connected
            ? `${t("usbPrinter.connected")}${
                status.deviceName ? ` (${status.deviceName})` : ""
              }`
            : t("usbPrinter.disconnected")}
        </span>
      </div>

      {!status.supported && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-900 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{t("usbPrinter.unsupported")}</span>
        </div>
      )}

      {feedback && (
        <div
          className={`p-3 rounded-xl border text-xs font-semibold flex items-start gap-2 ${
            feedback.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : "bg-red-50 border-red-200 text-red-800"
          }`}
        >
          {feedback.type === "success" ? (
            <Check className="w-4 h-4 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2.5">
        {!status.connected ? (
          <button
            type="button"
            disabled={!status.supported || busyAction !== null}
            onClick={handleConnect}
            className="min-h-[44px] px-4 py-2.5 rounded-xl bg-black text-white text-xs font-bold flex items-center gap-2 hover:bg-gray-800 disabled:opacity-50"
          >
            {busyAction === "connect" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Usb className="w-4 h-4" />
            )}
            <span>{t("usbPrinter.connect")}</span>
          </button>
        ) : (
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={handleDisconnect}
            className="min-h-[44px] px-4 py-2.5 rounded-xl border border-gray-300 bg-white text-gray-800 text-xs font-bold flex items-center gap-2 hover:bg-gray-50 disabled:opacity-50"
          >
            <Unplug className="w-4 h-4" />
            <span>{t("usbPrinter.disconnect")}</span>
          </button>
        )}

        <button
          type="button"
          disabled={!status.supported || busyAction !== null || status.busy}
          onClick={handleTestPrint}
          className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[#f3f0ea] text-gray-900 text-xs font-bold flex items-center gap-2 hover:bg-gray-200 disabled:opacity-50"
        >
          {busyAction === "test" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Printer className="w-4 h-4" />
          )}
          <span>{t("usbPrinter.testPrint")}</span>
        </button>

        <button
          type="button"
          disabled={!status.supported || busyAction !== null || status.busy}
          onClick={handleCalibrationPrint}
          className="min-h-[44px] px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-800 text-xs font-bold flex items-center gap-2 hover:bg-gray-50 disabled:opacity-50"
        >
          {busyAction === "calibrate" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Ruler className="w-4 h-4" />
          )}
          <span>{t("usbPrinter.calibrationPrint")}</span>
        </button>
      </div>

      {/* Hardware & Label Settings */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 pt-2 border-t border-gray-100">
        <div>
          <label className="block text-xs font-bold text-gray-600 mb-1">
            {t("usbPrinter.paperWidth")}
          </label>
          <div className="grid grid-cols-2 gap-1.5 bg-gray-100 p-1 rounded-xl">
            {([58, 80] as const).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => updateSetting("paperWidthMm", w)}
                className={`min-h-[38px] rounded-lg text-xs font-bold transition-colors ${
                  settings.paperWidthMm === w
                    ? "bg-black text-white"
                    : "text-gray-700 hover:text-gray-900"
                }`}
              >
                {w}mm ({w === 58 ? 384 : 576})
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-600 mb-1">
            {t("usbPrinter.density")} ({settings.density})
          </label>
          <input
            type="range"
            min={0}
            max={15}
            value={settings.density}
            onChange={(e) => updateSetting("density", Number(e.target.value))}
            className="w-full h-10 accent-black"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-600 mb-1">
            {t("usbPrinter.receiptFeedLines")}
          </label>
          <input
            type="number"
            min={0}
            max={12}
            value={settings.receiptExtraFeedLines}
            onChange={(e) =>
              updateSetting("receiptExtraFeedLines", Number(e.target.value))
            }
            className="w-full min-h-[42px] px-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-900"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-600 mb-1">
            {t("usbPrinter.labelWidthMm")}
          </label>
          <input
            type="number"
            min={20}
            max={80}
            value={settings.labelWidthMm}
            onChange={(e) =>
              updateSetting("labelWidthMm", Number(e.target.value))
            }
            className="w-full min-h-[42px] px-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-900"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-600 mb-1">
            {t("usbPrinter.labelHeightMm")}
          </label>
          <input
            type="number"
            min={12}
            max={100}
            value={settings.labelHeightMm}
            onChange={(e) =>
              updateSetting("labelHeightMm", Number(e.target.value))
            }
            className="w-full min-h-[42px] px-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-900"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-600 mb-1">
            {t("usbPrinter.labelFeedMm")}
          </label>
          <input
            type="number"
            min={0}
            max={30}
            step={0.5}
            value={settings.labelFeedMm}
            onChange={(e) =>
              updateSetting("labelFeedMm", Number(e.target.value))
            }
            className="w-full min-h-[42px] px-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-900"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-600 mb-1">
            {t("usbPrinter.defaultCopies")}
          </label>
          <input
            type="number"
            min={1}
            max={100}
            value={settings.defaultCopies}
            onChange={(e) =>
              updateSetting("defaultCopies", Number(e.target.value))
            }
            className="w-full min-h-[42px] px-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-900"
          />
        </div>
      </div>
    </div>
  );
}

