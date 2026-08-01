import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { normalizeIndianPhone } from "@/lib/phone";
import { recoverIncompleteRegistration } from "@/lib/registrationCompletion";

function getEmailRedirectTo() {
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/auth`;
  }
  return process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL || "https://www.sabsewa.in/auth";
}

export type AppUser = User | null;

export type AuthContextType = {
  user: AppUser;
  session: Session | null;
  loading: boolean;
  isLoading: boolean;
  firebaseUser: AppUser;
  hasActiveSubscription: boolean;
  signInWithOtp: (phone: string, metadata?: Record<string, unknown>) => Promise<{ data?: unknown; error?: unknown }>;
  signInWithEmailOtp: (email: string, metadata?: Record<string, unknown>) => Promise<{ data?: unknown; error?: unknown }>;
  signInWithEmailPassword: (email: string, password: string) => Promise<{ data?: any; error?: unknown }>;
  signUpWithEmailPassword: (email: string, password: string, metadata?: Record<string, unknown>) => Promise<{ data?: any; error?: unknown }>;
  verifyEmailOtp: (email: string, token: string) => Promise<{ data?: any; error?: unknown }>;
  verifyOtp: (phone: string, token: string) => Promise<{ data?: any; error?: unknown }>;
  signInWithGoogle: () => Promise<{ data?: unknown; error?: unknown }>;
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

  useEffect(() => {
    refreshSession().finally(() => setLoading(false));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user?.id) return;
    recoverIncompleteRegistration(session.user, session).catch((error) => {
      console.warn("Registration recovery failed", error?.message || error);
    });
  }, [session?.user?.id]);

  const value = useMemo<AuthContextType>(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
      isLoading: loading,
      firebaseUser: session?.user ?? null,
      hasActiveSubscription: true,
      signInWithOtp: async (phone: string, metadata = {}) => {
        const normalizedPhone = normalizeIndianPhone(phone);
        const { data, error } = await supabase.auth.signInWithOtp({
          phone: normalizedPhone,
          options: Object.keys(metadata).length ? { data: metadata } : undefined,
        });
        return { data, error };
      },
      signInWithEmailOtp: async (email: string, metadata = {}) => {
        const { data, error } = await supabase.auth.signInWithOtp({
          email: String(email || "").trim().toLowerCase(),
          options: {
            data: metadata,
            shouldCreateUser: true,
            emailRedirectTo: getEmailRedirectTo(),
          },
        });
        return { data, error };
      },
      signInWithEmailPassword: async (email: string, password: string) => {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: String(email || "").trim().toLowerCase(),
          password,
        });
        return { data, error };
      },
      signUpWithEmailPassword: async (email: string, password: string, metadata = {}) => {
        const { data, error } = await supabase.auth.signUp({
          email: String(email || "").trim().toLowerCase(),
          password,
          options: {
            data: metadata,
            emailRedirectTo: getEmailRedirectTo(),
          },
        });
        return { data, error };
      },
      verifyOtp: async (phone: string, token: string) => {
        const normalizedPhone = normalizeIndianPhone(phone);
        const { data, error } = await supabase.auth.verifyOtp({
          phone: normalizedPhone,
          token,
          type: "sms"
        });
        return { data, error };
      },
      verifyEmailOtp: async (email: string, token: string) => {
        const { data, error } = await supabase.auth.verifyOtp({
          email: String(email || "").trim().toLowerCase(),
          token,
          type: "email",
        });
        return { data, error };
      },
      signInWithGoogle: async () => {
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: "google",
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
