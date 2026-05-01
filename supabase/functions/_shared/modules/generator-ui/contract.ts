// Generator-UI — backend contract.
// The Generator UI domain is primarily a frontend domain in Phase 3, but it
// owns a public ingress for "me" (session bootstrap) since the dashboard is
// the primary consumer. The contract defines the operations the gateway exposes.

export interface MeProfile {
  id: string;
  email: string;
  role: "user" | "admin";
  credits_balance: number;
  created_at: string;
}

export interface GeneratorUiBackendContract {
  /** Returns the caller's profile + role, used to bootstrap the dashboard. */
  getMe(): Promise<MeProfile>;
}
