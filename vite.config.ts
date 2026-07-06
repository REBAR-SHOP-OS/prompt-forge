import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/supabase/vite";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes("node_modules/@ffmpeg")) return "ffmpeg";
          if (id.includes("node_modules/recharts") || id.includes("node_modules/d3-") || id.includes("node_modules/victory-")) return "charts";
          if (id.includes("node_modules/wavesurfer")) return "wavesurfer";
          if (id.includes("node_modules/@radix-ui")) return "radix-ui";
          if (id.includes("node_modules/@supabase")) return "supabase";
          if (id.includes("node_modules/@tanstack")) return "tanstack";
          if (id.includes("node_modules/react-router-dom") || id.includes("node_modules/react-router/") || id.includes("node_modules/@remix-run")) return "router";
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom")) return "react";
          if (id.includes("node_modules/lucide-react")) return "lucide";
          if (id.includes("node_modules/")) return "vendor";
        },
      },
    },
  },
  // ffmpeg.wasm ships its own ES module worker that uses dynamic import().
  // Vite's dep-optimizer rewrites those imports and breaks the worker load,
  // leaving FFmpeg.load() hanging until timeout. Excluding the packages keeps
  // them served as native ESM so the worker spawns correctly.
  optimizeDeps: {
    exclude: ["@ffmpeg/ffmpeg", "@ffmpeg/util", "@ffmpeg/core"],
  },
}));
