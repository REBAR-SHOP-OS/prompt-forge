import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // supabase/functions/_shared holds Deno-free pure TS modules with their own
    // vitest coverage (e.g. identity-eval.ts). Scoped to _shared/ only so this
    // never sweeps in the Deno-runtime tests elsewhere under supabase/functions
    // (e.g. jobs-create/local-video-router.test.ts, which imports from
    // https://deno.land and cannot resolve under Node/vitest).
    include: ["src/**/*.{test,spec}.{ts,tsx}", "supabase/functions/_shared/**/*.{test,spec}.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
