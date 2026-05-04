// Loads an external video through the authenticated video-proxy edge function
// and returns a local blob URL that can safely be handed to <video>.

import { supabase } from "@/integrations/supabase/client";
import { FUNCTIONS_BASE } from "@/core/api/client";

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID as string;
const OWN_SUPABASE_HOST = `${PROJECT_ID}.supabase.co`;

const proxiedVideoCache = new Map<string, Promise<string>>();

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchProxiedVideoBlobUrl(url: string): Promise<string> {
  const headers = await authHeader();
  if (!headers.Authorization) {
    return url;
  }

  const qs = new URLSearchParams({ url });
  const response = await fetch(`${FUNCTIONS_BASE}/video-proxy?${qs.toString()}`, {
    headers,
  });

  if (!response.ok) {
    throw new Error(`Video proxy failed with ${response.status}`);
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

export async function proxiedVideoUrl(url: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  if (typeof window !== "undefined" && parsed.host === window.location.host) {
    return url;
  }

  if (parsed.host === OWN_SUPABASE_HOST) {
    return url;
  }

  let pending = proxiedVideoCache.get(url);
  if (!pending) {
    pending = fetchProxiedVideoBlobUrl(url).catch((error) => {
      proxiedVideoCache.delete(url);
      throw error;
    });
    proxiedVideoCache.set(url, pending);
  }

  return await pending;
}
