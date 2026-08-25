// Account Center: a large responsive dialog opened from the top-left User menu
// (Email/Profile). Shows the caller's editable profile, usage & credits,
// remaining generations, and a daily-spend activity calendar.
//
// Profile section is editable (avatar + first/last name). All usage data
// comes from the shared useUsageStats hook (single source of truth with
// UsageStatsPopover). No billing writes, no schema changes, no route changes —
// opening it never resets the workspace/generator.
import { useRef } from 'react'
import {
  RefreshCw, Loader2, Film, Coins, CalendarClock, Gauge, UserRound,
  ChevronLeft, ChevronRight, AlertTriangle, Camera, Upload, Trash2, Check,
} from 'lucide-react'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useAuth } from '@/core/auth/AuthProvider'
import {
  useUsageStats, fmtUsd, monthLabel, PER_CLIP_USD,
} from '@/modules/generator-ui/hooks/useUsageStats'
import { useProfileEdit } from '@/modules/generator-ui/hooks/useProfileEdit'

interface AccountCenterDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function initialsFor(email: string | undefined | null): string {
  const raw = (email ?? '').trim()
  if (!raw) return '?'
  const local = raw.split('@')[0] ?? ''
  const parts = local.split(/[._-]+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return (local[0] ?? '?').toUpperCase()
}

function initialsForName(first: string, last: string, email: string): string {
  const f = first.trim()[0] ?? ''
  const l = last.trim()[0] ?? ''
  if (f && l) return (f + l).toUpperCase()
  if (f) return f.toUpperCase()
  return initialsFor(email)
}

export function AccountCenterDialog({ open, onOpenChange }: AccountCenterDialogProps) {
  const { user, profile } = useAuth()
  const {
    stats, loading, error, calLoading, dailySpend, viewMonth, setViewMonth,
    loadStats, loadCalendar, dailyLeft, dailyPct, monthPct, remainingVideos,
    avgUsdPerVideo, calendar, monthTotalCredits, todayKey, isCurrentMonthView, heatBg,
  } = useUsageStats(open)

  const profileEdit = useProfileEdit()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const email = profile?.email ?? user?.email ?? ''

  const lowCredits = stats !== null && stats.creditsBalance < 100

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) void profileEdit.uploadAvatar(file)
    e.target.value = ''
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-2xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Gauge className="h-4 w-4 text-amber-300" />
            Account Center
          </DialogTitle>
          <DialogDescription className="sr-only">
            Your profile, usage and credits, remaining generations, and activity.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[calc(90vh-4rem)] space-y-5 overflow-y-auto px-5 py-5 text-sm">
          {/* Profile — editable */}
          <section className="space-y-4">
            {/* Avatar */}
            <div className="flex flex-col items-center gap-2">
              <div className="group relative">
                <Avatar className="h-24 w-24 ring-2 ring-border">
                  {profileEdit.avatarUrl ? (
                    <AvatarImage src={profileEdit.avatarUrl} alt="Profile avatar" />
                  ) : null}
                  <AvatarFallback className="bg-accent text-lg font-semibold text-foreground/90">
                    {initialsForName(profileEdit.firstName, profileEdit.lastName, email)}
                  </AvatarFallback>
                </Avatar>
                {profileEdit.uploading ? (
                  <div className="absolute inset-0 grid place-items-center rounded-full bg-black/40">
                    <Loader2 className="h-5 w-5 animate-spin text-white" />
                  </div>
                ) : (
                  <button
                    type="button"
                    className="absolute bottom-0 right-0 grid h-7 w-7 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
                    onClick={() => fileInputRef.current?.click()}
                    aria-label="Upload profile photo"
                  >
                    <Camera className="h-3.5 w-3.5" />
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
              {/* Avatar actions */}
              <div className="flex items-center gap-2">
                <Button
                  size="sm" variant="ghost" className="h-7 px-2 text-xs"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={profileEdit.uploading}
                >
                  <Upload className="mr-1 h-3 w-3" />
                  {profileEdit.avatarUrl ? 'Replace' : 'Upload'}
                </Button>
                {profileEdit.avatarUrl ? (
                  <Button
                    size="sm" variant="ghost" className="h-7 px-2 text-xs text-rose-300 hover:text-rose-200"
                    onClick={() => void profileEdit.removeAvatar()}
                    disabled={profileEdit.uploading}
                  >
                    <Trash2 className="mr-1 h-3 w-3" />
                    Remove
                  </Button>
                ) : null}
              </div>
            </div>

            {/* Name fields */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="ac-first-name" className="text-xs text-muted-foreground">First name</Label>
                <Input
                  id="ac-first-name"
                  value={profileEdit.firstName}
                  onChange={(e) => { profileEdit.setFirstName(e.target.value); profileEdit.resetStatus() }}
                  placeholder="First name"
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ac-last-name" className="text-xs text-muted-foreground">Last name</Label>
                <Input
                  id="ac-last-name"
                  value={profileEdit.lastName}
                  onChange={(e) => { profileEdit.setLastName(e.target.value); profileEdit.resetStatus() }}
                  placeholder="Last name"
                  className="h-9"
                />
              </div>
            </div>

            {/* Email — read-only */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Email</Label>
              <div className="flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                <UserRound className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{email || 'Account'}</span>
              </div>
            </div>

            {/* Save button + status */}
            <div className="flex items-center gap-2">
              <Button
                size="sm" className="h-8"
                onClick={() => void profileEdit.saveProfile()}
                disabled={profileEdit.saveStatus === 'saving' || profileEdit.uploading}
              >
                {profileEdit.saveStatus === 'saving' ? (
                  <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Saving…</>
                ) : profileEdit.saveStatus === 'success' ? (
                  <><Check className="mr-1.5 h-3.5 w-3.5" /> Saved</>
                ) : (
                  'Save profile'
                )}
              </Button>
              {profileEdit.saveError ? (
                <span className="text-xs text-rose-300">{profileEdit.saveError}</span>
              ) : null}
            </div>
          </section>

          {error ? (
            <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
              <Button
                size="sm" variant="ghost" className="ml-auto h-6 px-2 text-xs"
                onClick={() => { void loadStats(); void loadCalendar(viewMonth) }}
              >
                Retry
              </Button>
            </div>
          ) : !stats ? (
            <div className="flex items-center justify-center py-10 text-xs text-muted-foreground">
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Loading…
            </div>
          ) : (
            <>
              {lowCredits ? (
                <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    Your credit balance is low ({stats.creditsBalance.toLocaleString()} credits).
                    You may not be able to generate many more videos.
                  </span>
                </div>
              ) : null}

              {/* Usage & Credits */}
              <section>
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Usage &amp; credits
                </h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <div className="rounded-md border border-border bg-accent/20 p-3">
                    <Coins className="mb-1 h-4 w-4 text-emerald-300" />
                    <div className="text-lg font-semibold tabular-nums">{stats.creditsBalance.toLocaleString()}</div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Available credits</div>
                  </div>
                  <div className="rounded-md border border-border bg-accent/20 p-3">
                    <CalendarClock className="mb-1 h-4 w-4 text-muted-foreground" />
                    <div className="text-lg font-semibold tabular-nums">
                      {stats.usedToday.toLocaleString()}
                      <span className="text-xs font-normal text-muted-foreground"> / {stats.dailyLimit.toLocaleString()}</span>
                    </div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Used today / daily limit</div>
                  </div>
                  <div className="rounded-md border border-border bg-accent/20 p-3">
                    <CalendarClock className="mb-1 h-4 w-4 text-muted-foreground" />
                    <div className="text-lg font-semibold tabular-nums">
                      {stats.usedMonth.toLocaleString()}
                      <span className="text-xs font-normal text-muted-foreground"> / {stats.monthlyLimit.toLocaleString()}</span>
                    </div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Used this month / monthly limit</div>
                  </div>
                  <div className="rounded-md border border-border bg-accent/20 p-3">
                    <Coins className="mb-1 h-4 w-4 text-amber-300" />
                    <div className="text-lg font-semibold tabular-nums">{stats.lifetimeSpend.toLocaleString()}</div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Lifetime credits spent</div>
                  </div>
                  <div className="rounded-md border border-border bg-accent/20 p-3">
                    <Film className="mb-1 h-4 w-4 text-muted-foreground" />
                    <div className="text-lg font-semibold tabular-nums">{stats.completedJobs}</div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Completed videos</div>
                  </div>
                  <div className="rounded-md border border-border bg-accent/20 p-3">
                    <Gauge className="mb-1 h-4 w-4 text-muted-foreground" />
                    <div className="text-lg font-semibold tabular-nums">{fmtUsd(avgUsdPerVideo)}</div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Average cost</div>
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Today</span>
                      <span className="tabular-nums text-foreground/80">{dailyPct.toFixed(0)}%</span>
                    </div>
                    <Progress value={dailyPct} className="h-1.5" />
                    <div className="text-[11px] text-muted-foreground">{dailyLeft.toLocaleString()} credits left today</div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">This month</span>
                      <span className="tabular-nums text-foreground/80">{monthPct.toFixed(0)}%</span>
                    </div>
                    <Progress value={monthPct} className="h-1.5" />
                  </div>
                </div>
              </section>

              {/* Remaining generations */}
              <section>
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Remaining generations
                </h3>
                <div className="space-y-1.5 rounded-md border border-border bg-accent/20 p-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Veo 3 Fast (5s)</span>
                    <span className="tabular-nums text-foreground/90">
                      {remainingVideos(PER_CLIP_USD.veoFast5s)}
                      <span className="ml-1 text-muted-foreground">· {Math.round(PER_CLIP_USD.veoFast5s * 100)} cr</span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Veo 3.1 Pro (5s)</span>
                    <span className="tabular-nums text-foreground/90">
                      {remainingVideos(PER_CLIP_USD.veoPro5s)}
                      <span className="ml-1 text-muted-foreground">· {Math.round(PER_CLIP_USD.veoPro5s * 100)} cr</span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Wan 2.7 (1 clip)</span>
                    <span className="tabular-nums text-foreground/90">
                      {remainingVideos(PER_CLIP_USD.wan)}
                      <span className="ml-1 text-muted-foreground">· {Math.round(PER_CLIP_USD.wan * 100)} cr</span>
                    </span>
                  </div>
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    Estimates. Limited by daily quota and wallet balance.
                  </div>
                </div>
              </section>

              {/* Activity calendar */}
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Activity
                  </h3>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon" variant="ghost" className="h-6 w-6"
                      onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}
                      aria-label="Previous month"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <div className="min-w-[110px] text-center text-[11px] text-foreground/80">
                      {monthLabel(viewMonth)}
                    </div>
                    <Button
                      size="icon" variant="ghost" className="h-6 w-6"
                      onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}
                      disabled={isCurrentMonthView}
                      aria-label="Next month"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="rounded-md border border-border bg-accent/20 p-3">
                  <div className="mb-1 grid grid-cols-7 gap-1 text-[9px] uppercase tracking-wide text-muted-foreground">
                    {['S','M','T','W','T','F','S'].map((d, i) => (
                      <div key={i} className="text-center">{d}</div>
                    ))}
                  </div>

                  <TooltipProvider delayDuration={150}>
                    <div className="grid grid-cols-7 gap-1">
                      {calendar.map((cell) => {
                        if (!cell.date || !cell.iso) {
                          return <div key={cell.key} className="aspect-square" />
                        }
                        const data = dailySpend.get(cell.iso)
                        const credits = data?.credits ?? 0
                        const count = data?.count ?? 0
                        const usd = credits / 100
                        const isToday = cell.iso === todayKey
                        return (
                          <Tooltip key={cell.key}>
                            <TooltipTrigger asChild>
                              <div
                                className={[
                                  'flex aspect-square flex-col items-center justify-center rounded-[4px] border text-[9px] leading-none',
                                  isToday ? 'border-amber-300/60' : 'border-border/50',
                                  heatBg(credits),
                                ].join(' ')}
                              >
                                <div className={isToday ? 'text-amber-200' : 'text-foreground/80'}>
                                  {cell.date.getDate()}
                                </div>
                                {credits > 0 ? (
                                  <div className="mt-0.5 tabular-nums text-[8.5px] text-foreground/90">
                                    ${usd.toFixed(usd >= 10 ? 0 : 2)}
                                  </div>
                                ) : null}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">
                              <div className="font-medium">{cell.date.toDateString()}</div>
                              {credits > 0 ? (
                                <div className="text-muted-foreground">
                                  {fmtUsd(usd)} · {credits.toLocaleString()} cr · {count} {count === 1 ? 'gen' : 'gens'}
                                </div>
                              ) : (
                                <div className="text-muted-foreground">No spend</div>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        )
                      })}
                    </div>
                  </TooltipProvider>

                  <div className="mt-2 flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">
                      {calLoading ? 'Loading…' : `${monthTotalCredits.count} ${monthTotalCredits.count === 1 ? 'generation' : 'generations'}`}
                    </span>
                    <span className="tabular-nums text-foreground/80">
                      Total: {fmtUsd(monthTotalCredits.credits / 100)} · {monthTotalCredits.credits.toLocaleString()} cr
                    </span>
                  </div>
                </div>
              </section>
            </>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="relative grid h-1.5 w-1.5 place-items-center">
              <span className="absolute inline-flex h-1.5 w-1.5 animate-ping rounded-full bg-emerald-400/70" />
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            Live updates
          </span>
          <Button
            size="sm" variant="ghost" className="h-7"
            onClick={() => { void loadStats(); void loadCalendar(viewMonth) }}
            disabled={loading || calLoading}
          >
            {(loading || calLoading) ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
            Refresh
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
