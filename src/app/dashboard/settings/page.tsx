"use client";

import React, { useEffect, useState } from "react";
import { Check, LogOut, Printer, Store, User } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { createClient } from "@/utils/supabase/client";
import { loadStoreSettings } from "@/components/ReceiptModal";

export default function SettingsPage() {
  const { user, role } = useAuth();
  const supabase = createClient();

  const [shopName, setShopName] = useState("RIZQ");
  const [shopTagline, setShopTagline] = useState("Footwear & Shoes");
  const [shopAddress, setShopAddress] = useState("");
  const [shopPhone, setShopPhone] = useState("");
  const [receiptFooter, setReceiptFooter] = useState(
    "Thank you for shopping at Rizq!"
  );
  const [paperWidth, setPaperWidth] = useState<"80mm" | "58mm">("80mm");
  const [savedBanner, setSavedBanner] = useState(false);

  useEffect(() => {
    const s = loadStoreSettings();
    setShopName(s.shopName);
    setShopTagline(s.shopTagline);
    setShopAddress(s.shopAddress);
    setShopPhone(s.shopPhone);
    setReceiptFooter(s.receiptFooter);
    setPaperWidth(s.paperWidth);
  }, []);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem(
      "rizq_store_settings",
      JSON.stringify({
        shopName: shopName.trim() || "RIZQ",
        shopTagline: shopTagline.trim(),
        shopAddress: shopAddress.trim(),
        shopPhone: shopPhone.trim(),
        receiptFooter:
          receiptFooter.trim() || "Thank you for shopping at Rizq!",
        paperWidth,
      })
    );
    setSavedBanner(true);
    setTimeout(() => setSavedBanner(false), 2500);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  return (
    <div className="flex-1 h-full overflow-y-auto bg-[#faf9f6] p-4 sm:p-6 lg:p-8 no-scrollbar">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900">
            Settings
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
            Store receipt configuration, thermal printer width, and account
          </p>
        </div>

        {/* Store & Receipt Settings */}
        <form
          onSubmit={handleSave}
          className="bg-white rounded-2xl border border-gray-200/80 p-5 sm:p-6 space-y-4"
        >
          <div className="flex items-center gap-2.5 pb-3 border-b border-gray-100">
            <div className="w-9 h-9 rounded-xl bg-[#f3f0ea] flex items-center justify-center">
              <Store className="w-4 h-4 text-gray-800" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">
                Rizq Store &amp; Thermal Receipt
              </h2>
              <p className="text-xs text-gray-500">
                Printed at the top and bottom of every POS receipt (Tax is
                always 0)
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase text-gray-600 mb-1.5">
                Shop Name
              </label>
              <input
                type="text"
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                className="w-full min-h-[46px] px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-gray-900 focus:outline-none focus:bg-white focus:border-gray-900"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-gray-600 mb-1.5">
                Subtitle / Tagline
              </label>
              <input
                type="text"
                value={shopTagline}
                onChange={(e) => setShopTagline(e.target.value)}
                placeholder="Footwear & Shoes"
                className="w-full min-h-[46px] px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:bg-white focus:border-gray-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase text-gray-600 mb-1.5">
                Shop Phone
              </label>
              <input
                type="tel"
                inputMode="tel"
                value={shopPhone}
                onChange={(e) => setShopPhone(e.target.value)}
                placeholder="01XXXXXXXXX"
                className="w-full min-h-[46px] px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:bg-white focus:border-gray-900"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-gray-600 mb-1.5">
                Thermal Paper Width
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(["80mm", "58mm"] as const).map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setPaperWidth(w)}
                    className={`min-h-[46px] rounded-xl text-sm font-bold border-2 flex items-center justify-center gap-1.5 transition-colors ${
                      paperWidth === w
                        ? "border-black bg-gray-900 text-white"
                        : "border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    <Printer className="w-4 h-4" />
                    <span>{w}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-gray-600 mb-1.5">
              Shop Address
            </label>
            <input
              type="text"
              value={shopAddress}
              onChange={(e) => setShopAddress(e.target.value)}
              placeholder="Shop address for receipt header"
              className="w-full min-h-[46px] px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:bg-white focus:border-gray-900"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-gray-600 mb-1.5">
              Receipt Footer Message
            </label>
            <input
              type="text"
              value={receiptFooter}
              onChange={(e) => setReceiptFooter(e.target.value)}
              placeholder="Thank you for shopping at Rizq!"
              className="w-full min-h-[46px] px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:bg-white focus:border-gray-900"
            />
          </div>

          <div className="flex items-center justify-between gap-3 pt-2">
            {savedBanner ? (
              <span className="text-xs font-bold text-emerald-700 flex items-center gap-1.5">
                <Check className="w-4 h-4" /> Settings saved!
              </span>
            ) : (
              <span />
            )}
            <button
              type="submit"
              className="min-h-[46px] px-6 py-2.5 bg-black text-white rounded-xl text-sm font-bold hover:bg-gray-800 transition-colors"
            >
              Save Receipt Settings
            </button>
          </div>
        </form>

        {/* Account Card */}
        <div className="bg-white rounded-2xl border border-gray-200/80 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
              <User className="w-5 h-5 text-gray-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900 capitalize">
                Role: {role || "Staff"}
              </p>
              <p className="text-xs text-gray-500 truncate">
                {user?.email || "Signed in"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="min-h-[46px] px-5 py-2.5 rounded-xl bg-red-50 text-red-700 hover:bg-red-100 text-sm font-bold flex items-center justify-center gap-2 transition-colors shrink-0"
          >
            <LogOut className="w-4 h-4" />
            <span>Log Out</span>
          </button>
        </div>
      </div>
    </div>
  );
}

