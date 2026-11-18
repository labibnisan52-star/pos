"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { User } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/client";

type Role = "owner" | "salesman" | null;

const CACHED_AUTH_KEY = "rizq_cached_auth_v1";

interface CachedAuthPayload {
  user: User;
  role: Role;
}

function readCachedAuth(): CachedAuthPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHED_AUTH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedAuthPayload;
    if (parsed?.user?.id) return parsed;
    return null;
  } catch {
    return null;
  }
}

function writeCachedAuth(user: User, role: Role) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CACHED_AUTH_KEY, JSON.stringify({ user, role }));
  } catch {
    // Ignore storage quota errors
  }
}

function clearCachedAuth() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(CACHED_AUTH_KEY);
  } catch {
    // Ignore
  }
}

interface AuthContextType {
  user: User | null;
  role: Role;
  loading: boolean;
  setRole: (role: Role) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  role: null,
  loading: true,
  setRole: () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [loading, setLoading] = useState(true);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    const fetchUserAndRole = async () => {
      setLoading(true);
      const cached = readCachedAuth();

      // If offline, immediately restore cached user + role and never log out
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        if (cached) {
          setUser(cached.user);
          setRole(cached.role);
        }
        setLoading(false);
        return;
      }

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session?.user) {
          setUser(session.user);
          let resolvedRole: Role = cached?.user?.id === session.user.id ? cached.role : null;

          try {
            const { data: profile } = await supabase
              .from("profiles")
              .select("role")
              .eq("id", session.user.id)
              .single();

            if (profile?.role) {
              resolvedRole = profile.role as Role;
            }
          } catch {
            // Keep cached role if profile lookup fails due to flaky network
          }

          setRole(resolvedRole);
          writeCachedAuth(session.user, resolvedRole);
        } else if (cached && typeof navigator !== "undefined" && !navigator.onLine) {
          setUser(cached.user);
          setRole(cached.role);
        }
      } catch {
        // Network error during session check: preserve cached session
        if (cached) {
          setUser(cached.user);
          setRole(cached.role);
        }
      }

      setLoading(false);
    };

    void fetchUserAndRole();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        const cached = readCachedAuth();

        if (event === "SIGNED_OUT") {
          clearCachedAuth();
          setUser(null);
          setRole(null);
          setLoading(false);
          return;
        }

        if (session?.user) {
          setUser(session.user);
          let resolvedRole: Role = cached?.user?.id === session.user.id ? cached.role : null;

          if (typeof navigator === "undefined" || navigator.onLine) {
            try {
              const { data: profile } = await supabase
                .from("profiles")
                .select("role")
                .eq("id", session.user.id)
                .single();

              if (profile?.role) {
                resolvedRole = profile.role as Role;
              }
            } catch {
              // Keep cached role on network error
            }
          }

          setRole(resolvedRole);
          writeCachedAuth(session.user, resolvedRole);
        } else if (typeof navigator !== "undefined" && !navigator.onLine && cached) {
          // Do not log out when token refresh fails offline
          setUser(cached.user);
          setRole(cached.role);
        } else {
          clearCachedAuth();
          setUser(null);
          setRole(null);
        }
        setLoading(false);
      }
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [supabase]);

  return (
    <AuthContext.Provider value={{ user, role, loading, setRole }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
