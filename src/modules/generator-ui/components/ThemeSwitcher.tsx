import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Check, Monitor, Moon, Palette, Sun } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type ThemeId = "light" | "dark" | "system" | "midnight" | "neon" | "slate";

const THEMES: { id: ThemeId; label: string; icon: typeof Sun }[] = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "system", label: "System", icon: Monitor },
  { id: "midnight", label: "Midnight", icon: Palette },
  { id: "neon", label: "Neon", icon: Palette },
  { id: "slate", label: "Slate", icon: Palette },
];

/**
 * Header theme switcher. UI-only: selecting a theme swaps the CSS palette and
 * persists the choice per-user in localStorage (via next-themes). "System"
 * follows prefers-color-scheme. No generator/backend state is touched.
 */
export function ThemeSwitcher({
  triggerClassName,
}: {
  triggerClassName?: string;
}) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid a hydration mismatch: only render the active check after mount.
  useEffect(() => setMounted(true), []);

  const active = theme ?? "dark";
  const resolved = resolvedTheme ?? "dark";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Change theme"
          title="Theme"
          className={cn(
            "grid h-9 w-9 place-items-center rounded-md border border-transparent text-zinc-200/80 transition hover:border-white/10 hover:bg-white/[0.045] hover:text-zinc-100",
            triggerClassName,
          )}
        >
          {resolved === "light" ? (
            <Sun className="h-[18px] w-[18px]" aria-hidden="true" />
          ) : (
            <Moon className="h-[18px] w-[18px]" aria-hidden="true" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-44 border-white/10 bg-[#0b0c0e]/95 p-1.5 text-zinc-200 shadow-[0_22px_70px_rgba(0,0,0,0.5)] backdrop-blur-xl"
      >
        <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          Theme
        </div>
        {THEMES.map(({ id, label, icon: Icon }) => {
          const isActive = mounted && active === id;
          return (
            <button
              key={id}
              type="button"
              role="menuitemradio"
              aria-checked={isActive}
              onClick={() => setTheme(id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-normal transition",
                isActive
                  ? "bg-white/[0.08] text-zinc-100"
                  : "text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200",
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="flex-1 text-left">{label}</span>
              {isActive && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
