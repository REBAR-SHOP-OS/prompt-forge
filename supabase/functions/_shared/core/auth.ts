// Shared core: authentication. JWT verification via supabase-js getUser(token).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getEnv } from "./env.ts";

const MAX_BEARER_TOKEN_LENGTH = 8_192;

const anonClient = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_ANON_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

export interface AuthContext {
  userId: string;
  email: string | null;
  authHeader: string;
}

function bearerToken(req: Request): string | null {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(\S+)$/i);
  if (!match) return null;
  const token = match[1];
  if (!token || token.length > MAX_BEARER_TOKEN_LENGTH) return null;
  return token;
}

export async function authenticate(req: Request): Promise<AuthContext | null> {
  const token = bearerToken(req);
  if (!token) return null;

  const { data, error } = await anonClient.auth.getUser(token);
  if (error || !data?.user?.id) return null;

  return {
    userId: data.user.id,
    email: data.user.email ?? null,
    authHeader: `Bearer ${token}`,
  };
}
