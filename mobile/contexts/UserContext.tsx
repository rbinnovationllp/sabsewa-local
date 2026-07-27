import React, { createContext, useContext, useMemo } from "react";
import { useAuth } from "@/providers/AuthProvider";

const UserContext = createContext<{ user: any }>({ user: null });

export function UserProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const value = useMemo(() => ({ user }), [user]);
  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  return useContext(UserContext);
}
