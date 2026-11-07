"use client";

import React, { useState } from "react";
import { User, Lock, Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    const { data: authData, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setErrorMsg(error.message);
      setLoading(false);
      return;
    }

    if (authData.user) {
      let resolvedRole = "salesman";
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", authData.user.id)
        .maybeSingle();

      if (!profile) {
        const { error: insertError } = await supabase.from("profiles").insert({
          id: authData.user.id,
          role: "salesman",
        });

        if (insertError) {
          setErrorMsg("Failed to create profile: " + insertError.message);
          setLoading(false);
          return;
        }
      } else if (profile.role) {
        resolvedRole = profile.role;
      }

      router.push(resolvedRole === "owner" ? "/dashboard" : "/dashboard/pos");
    }
  };

  return (
    <div className="min-h-dvh bg-[#faf9f6] flex items-center justify-center p-4 font-sans">
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-[420px] p-6 sm:p-10 flex flex-col items-center">
        {/* Header */}
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-gray-900 mb-1.5">
          RIZQ POS
        </h1>
        <p className="text-gray-500 text-sm mb-8 text-center">
          Sign in to manage sales and shoe inventory.
        </p>

        {/* Form */}
        <form onSubmit={handleLogin} className="w-full space-y-4">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-100 text-red-700 text-sm font-medium rounded-xl text-center">
              {errorMsg}
            </div>
          )}

          {/* Email Input */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <User className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              className="w-full min-h-[48px] pl-11 pr-4 py-3 bg-[#f3f0ea] border border-transparent rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:bg-white focus:border-gray-900 transition-colors"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          {/* Password Input */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Lock className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              className="w-full min-h-[48px] pl-11 pr-12 py-3 bg-[#f3f0ea] border border-transparent rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:bg-white focus:border-gray-900 transition-colors"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 w-12 flex items-center justify-center"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? (
                <EyeOff className="h-5 w-5 text-gray-500 hover:text-gray-800 transition-colors" />
              ) : (
                <Eye className="h-5 w-5 text-gray-500 hover:text-gray-800 transition-colors" />
              )}
            </button>
          </div>

          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2.5 cursor-pointer min-h-[44px]">
              <input
                type="checkbox"
                className="w-4 h-4 rounded accent-black"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <span className="text-sm text-gray-600">Keep me signed in</span>
            </label>
          </div>

          {/* Log In Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full min-h-[50px] mt-2 bg-black text-white font-bold py-3.5 rounded-xl hover:bg-gray-800 transition-colors shadow-md active:scale-[0.99] disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <div className="mt-8 text-center">
          <p className="text-xs text-gray-400">
            Contact the store owner for account or password assistance.
          </p>
        </div>
      </div>
    </div>
  );
}
