import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { apiUrl } from "@/lib/backend";
import { getDeviceMetadata } from "@/lib/deviceIdentity";

export type AppUser = User | null;

export type AuthContextType = {
  user: AppUser;
  session: Session | null;
  loading: boolean;
  isLoading: boolean;
  firebaseUser: AppUser;
  hasActiveSubscription: boolean;
  signInWithOtp: (phone: string) => Promise<{ data?: unknown; error?: unknown }>;
  verifyOtp: (phone: string, token: string) => Promise<{ data?: any; error?: unknown }>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextType | null>(null);

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  async function refreshSession() {
    const { data } = await supabase.auth.getSession();
    setSession(data.session ?? null);
  }

  async function registerTrustedDevice(nextSession: Session | null) {
    if (!nextSession?.user?.id) return;
    try {
      const device = await getDeviceMetadata();
      await fetch(apiUrl("/api/auth/trusted-device"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: nextSession.user.id,
          device_id: device.device_id,
          device_name: device.device_name,
          platform: device.platform,
          app_version: device.app_version,
        }),
      });
    } catch {
      // Device registration must not block login; backend audit will catch live failures.
    }
  }

  useEffect(() => {
    refreshSession().finally(() => setLoading(false));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) registerTrustedDevice(nextSession);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthContextType>(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
      isLoading: loading,
      firebaseUser: session?.user ?? null,
      hasActiveSubscription: true,
      signInWithOtp: async (phone: string) => {
        const { data, error } = await supabase.auth.signInWithOtp({ phone });
        return { data, error };
      },
      verifyOtp: async (phone: string, token: string) => {
        const { data, error } = await supabase.auth.verifyOtp({
          phone,
          token,
          type: "sms"
        });
        return { data, error };
      },
      signOut: async () => {
        await supabase.auth.signOut();
        setSession(null);
      },
      refreshSession
    }),
    [session, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
