import { createContext, useContext } from "react";
import type { Session, User } from "@supabase/supabase-js";
import type { Me } from "@/core/api/types";

export interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Me | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthState | undefined>(undefined);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
