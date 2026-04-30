// Shared core: env access.
export function getEnv(name: string, required = true): string {
  const v = Deno.env.get(name);
  if (required && !v) throw new Error(`Missing env var: ${name}`);
  return v ?? "";
}
