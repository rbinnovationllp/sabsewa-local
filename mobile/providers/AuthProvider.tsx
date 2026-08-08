import React, { createContext, useContext, useEffect, useState } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { usePathname, useRouter, useSegments } from "expo-router";

type AppRole = "customer" | "vendor" | "rider" | "admin" | "company_admin" | "super_admin" | string;

type AuthContextType = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  role: AppRole | null;
  roleLoading: boolean;
  signOut: () => Promise<void>;
  signInWithOtp: (phone: string) => Promise<any>;
  verifyOtp: (phone: string, token: string) => Promise<any>;
  signInWithEmailOtp: (email: string) => Promise<any>;
  verifyEmailOtp: (email: string, token: string) => Promise<any>;
};

const AuthContext = createContext<AuthContextType | null>(null);

function cleanRole(value: unknown): AppRole | null {
  const role = String(value || "").trim().toLowerCase();
  return role || null;
}

function roleHome(role: AppRole | null) {
  if (role === "vendor") return "/vendor/dashboard";
  if (role === "rider") return "/rider";
  if (role === "admin" || role === "company_admin" || role === "super_admin") return "/company";
  return "/customer/dashboard";
}

async function resolveUserRole(user: User | null): Promise<AppRole | null> {
  if (!user?.id) return null;

  const metadataRole = cleanRole(user.user_metadata?.role || user.app_metadata?.role);
  if (metadataRole) return metadataRole;

  try {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();
    const profileRole = cleanRole(profile?.role);
    if (profileRole) return profileRole;
  } catch (error) {
    console.warn("Role profile lookup skipped", error);
  }

  try {
    const { data: vendor } = await supabase
      .from("vendors")
      .select("id")
      .eq("owner_user_id", user.id)
      .maybeSingle();
    if (vendor?.id) return "vendor";
  } catch (error) {
    console.warn("Vendor role lookup skipped", error);
  }

  return null;
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<AppRole | null>(null);
  const [roleLoading, setRoleLoading] = useState(false);
  const router = useRouter();
  const segments = useSegments();
  const pathname = usePathname();

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

  useEffect(() => {
    let active = true;

    async function loadRole() {
      if (!user?.id) {
        setRole(null);
        setRoleLoading(false);
        return;
      }

      setRoleLoading(true);
      const resolved = await resolveUserRole(user);
      if (active) {
        setRole(resolved);
        setRoleLoading(false);
      }
    }

    loadRole();
    return () => {
      active = false;
    };
  }, [user?.id, user?.user_metadata?.role, user?.app_metadata?.role]);

  useEffect(() => {
    if (loading || roleLoading || !user || !role) return;

    const firstSegment = String(segments[0] || "");
    const inAuthGroup = firstSegment === "auth";
    const onPublicHome = pathname === "/" || pathname === "/index";
    const inCustomerArea = firstSegment === "customer" || firstSegment === "hlm" || firstSegment === "hyperlocal";
    const inVendorArea = firstSegment === "vendor";

    if (role === "vendor" && (inAuthGroup || onPublicHome || inCustomerArea)) {
      router.replace("/vendor/dashboard" as any);
      return;
    }

    if (role !== "vendor" && inVendorArea) {
      router.replace(roleHome(role) as any);
      return;
    }

    if (inAuthGroup) {
      router.replace(roleHome(role) as any);
    }
  }, [user, role, loading, roleLoading, segments, pathname, router]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setRole(null);
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
        role,
        roleLoading,
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
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}