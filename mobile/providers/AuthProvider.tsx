import React, { createContext, useContext, useEffect, useState } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { useRouter, useSegments } from "expo-router";

type AuthContextType = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
  signInWithOtp: (phone: string) => Promise<any>;
  verifyOtp: (phone: string, token: string) => Promise<any>;
  signInWithEmailOtp: (email: string) => Promise<any>;
  verifyEmailOtp: (email: string, token: string) => Promise<any>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    let mounted = true;

    async function initializeAuth() {
      try {
        const { data } = await supabase.auth.getSession();
        if (mounted) {
          setSession(data.session);
          setUser(data.session?.user ?? null);
        }
      } catch (e) {
        console.warn("Auth initialization error:", e);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    initializeAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  // Automatic Routing Guard based on Persistent Session State
  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === "auth";
    const role = user?.user_metadata?.role;

    if (user && inAuthGroup) {
      if (role === "vendor") {
        router.replace("/vendor/dashboard" as any);
      } else {
        router.replace("/customer/dashboard" as any);
      }
    }
  }, [user, loading, segments]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    router.replace("/auth/Login" as any);
  };

  const signInWithOtp = (phone: string) => supabase.auth.signInWithOtp({ phone });
  const verifyOtp = (phone: string, token: string) => supabase.auth.verifyOtp({ phone, token, type: "sms" });
  const signInWithEmailOtp = (email: string) => supabase.auth.signInWithOtp({ email });
  const verifyEmailOtp = (email: string, token: string) => supabase.auth.verifyOtp({ email, token, type: "email" });

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        signOut,
        signInWithOtp,
        verifyOtp,
        signInWithEmailOtp,
        verifyEmailOtp,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}