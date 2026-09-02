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
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    const { data: authData, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setErrorMsg(error.message);
      setLoading(false);
    } else if (authData.user) {
      // Check if profile exists, if not, create a default 'salesman' profile
      const { data: profile, error: selectError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", authData.user.id)
        .maybeSingle();
        
      if (!profile) {
        const { error: insertError } = await supabase.from("profiles").insert({
          id: authData.user.id,
          role: "salesman" // Default role
        });
        
        if (insertError) {
          console.error("Error creating profile:", insertError);
          setErrorMsg("Failed to create profile: " + insertError.message);
          setLoading(false);
          return;
        }
      }
      
      router.push("/dashboard");
    }
  };

  return (
    <div className="min-h-screen bg-neutral-100 flex items-center justify-center p-4 font-sans">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-[420px] p-8 sm:p-10 flex flex-col items-center">
        {/* Header */}
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 mb-2">RIZQ POS</h1>
        <p className="text-gray-500 text-sm mb-8">Sign in to manage your inventory.</p>

        {/* Form */}
        <form onSubmit={handleLogin} className="w-full space-y-4">
          {errorMsg && (
            <div className="p-3 bg-red-50 text-red-600 text-sm rounded-xl text-center">
              {errorMsg}
            </div>
          )}

          {/* Email Input */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <User className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              className="w-full pl-11 pr-4 py-3 bg-[#f3f0ea] border-none rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 transition-shadow"
              placeholder="Email or Phone"
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
              className="w-full pl-11 pr-12 py-3 bg-[#f3f0ea] border-none rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 transition-shadow"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              className="absolute inset-y-0 right-0 pr-4 flex items-center"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? (
                <EyeOff className="h-5 w-5 text-gray-400 hover:text-gray-600 transition-colors" />
              ) : (
                <Eye className="h-5 w-5 text-gray-400 hover:text-gray-600 transition-colors" />
              )}
            </button>
          </div>

          {/* Options: Remember Me & Forgot Password */}
          <div className="flex items-center justify-between pt-2">
            <label className="flex items-center space-x-2 cursor-pointer group">
              <div className="relative flex items-center justify-center w-5 h-5 bg-[#f3f0ea] rounded transition-colors group-hover:bg-gray-200">
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                {rememberMe && (
                  <svg className="w-3 h-3 text-gray-800" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <span className="text-sm text-gray-500 group-hover:text-gray-700 transition-colors">Remember me</span>
            </label>

            <a href="#" className="text-sm text-gray-500 hover:text-gray-800 transition-colors">
              Forgot password?
            </a>
          </div>

          {/* Log In Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full mt-4 bg-black text-white font-semibold py-3.5 rounded-xl hover:bg-gray-800 transition-colors shadow-md active:scale-[0.98] transform duration-100 ease-in-out disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {loading ? "Logging in..." : "Log In"}
          </button>
        </form>

        {/* Footer */}
        <div className="mt-10 text-center">
          <p className="text-xs text-gray-400">Contact your admin for account access.</p>
        </div>
      </div>
    </div>
  );
}
