import AuthForm from "@/components/auth/AuthForm";
import brandLogo from "@/assets/brand-logo.webp.asset.json";

export default function LoginPage() {
  return (
    <div className="relative grid min-h-screen w-full overflow-hidden bg-background lg:grid-cols-2">
      {/* Ambient brand glow (visible on all sizes) */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[-10%] h-[480px] w-[480px] -translate-x-1/2 rounded-full bg-amber-400/10 blur-[120px]" />
        <div className="absolute bottom-[-15%] right-[-10%] h-[420px] w-[420px] rounded-full bg-primary/15 blur-[120px]" />
      </div>

      {/* Showcase column */}
      <div className="relative hidden flex-col items-center justify-center gap-10 overflow-hidden bg-gradient-to-br from-[hsl(222_47%_8%)] via-background to-[hsl(222_47%_5%)] p-12 lg:flex">
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-400/15 blur-[140px]" />
        <div className="relative flex flex-col items-center gap-8 text-center">
          <div className="relative">
            <div className="absolute inset-0 -z-10 animate-pulse rounded-full bg-amber-400/25 blur-3xl" />
            <img
              src={brandLogo.url}
              alt="Prompt Forge"
              className="h-56 w-56 animate-[float_6s_ease-in-out_infinite] drop-shadow-[0_25px_60px_rgba(0,0,0,0.55)] xl:h-72 xl:w-72"
            />
          </div>
          <div className="space-y-3">
            <h2 className="bg-gradient-to-r from-amber-200 via-amber-400 to-amber-200 bg-clip-text text-4xl font-bold tracking-tight text-transparent">
              Prompt Forge
            </h2>
            <p className="max-w-sm text-balance text-sm leading-relaxed text-muted-foreground">
              Forge cinematic AI videos, soundtracks, and voiceovers — all in one studio.
            </p>
          </div>
        </div>
      </div>

      {/* Form column */}
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm space-y-8">
          {/* Compact brand mark (mobile + as anchor) */}
          <div className="flex flex-col items-center gap-4 text-center">
            <img
              src={brandLogo.url}
              alt="Prompt Forge"
              className="h-16 w-16 drop-shadow-[0_10px_30px_rgba(0,0,0,0.5)] lg:hidden"
            />
            <div className="space-y-1.5">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Welcome back
              </h1>
              <p className="text-sm text-muted-foreground">
                Sign in to your account
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-card/40 p-6 shadow-2xl backdrop-blur-xl supports-[backdrop-filter]:bg-card/30">
            <AuthForm mode="login" />
          </div>
        </div>
      </div>
    </div>
  );
}
