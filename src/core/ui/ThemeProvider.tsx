import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

/**
 * Theme provider wrapping next-themes. Themes are UI-only: they swap the CSS
 * design-token palette (light / dark / midnight / neon / slate) and never touch
 * generator state, projects, the library, video playback, or any backend logic.
 *
 * `attribute="class"` keeps the existing `.dark` class contract; dynamic themes
 * are additionally exposed as `data-theme` on <html> so the CSS can override the
 * palette without changing layout.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
      themes={["light", "dark", "midnight", "neon", "slate"]}
    >
      {children}
    </NextThemesProvider>
  );
}
