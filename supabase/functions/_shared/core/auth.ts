// Shared core: authentication. JWT verification via supabase-js getUser(token).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getEnv } from "./env.ts";

export interface AuthContext {
  userId: string;
  email: string | null;
  authHeader: string;
}

export async function authenticate(req: Request): Promise<AuthContext | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length);

  const client = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_ANON_KEY"));
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user?.id) return null;

  return {
    userId: data.user.id,
    email: data.user.email ?? null,
    authHeader,
  };
}
