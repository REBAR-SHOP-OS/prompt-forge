// Shared core: shape of /me response and common envelope types.
export interface Me {
  id: string;
  email: string;
  role: "user" | "admin";
  credits_balance: number;
  created_at: string;
  first_name?: string | null;
  last_name?: string | null;
  avatar_url?: string | null;
  requestId?: string;
}
