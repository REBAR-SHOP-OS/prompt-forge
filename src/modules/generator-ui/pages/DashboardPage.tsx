import { type FormEvent, useMemo, useState } from 'react'
import { ArrowRight, ChevronDown, ChevronsRight, Hammer, LayoutGrid, Sparkles, Upload } from 'lucide-react'

type ForgeMode = 'Prompt' | 'Image' | 'Video' | 'Agent'

const modes: ForgeMode[] = ['Prompt', 'Image', 'Video', 'Agent']

export default function DashboardPage() {
  const [promptText, setPromptText] = useState('')
  const [mode, setMode] = useState<ForgeMode>('Prompt')
  const [isDragging, setIsDragging] = useState(false)
  const [startContext] = useState('Start')
  const [endGoal] = useState('End')

  const canSubmit = promptText.trim().length > 0

  const emptyStateLabel = useMemo(() => {
    if (isDragging) {
      return 'Drop context into the forge'
    }

    return promptText.trim().length > 0 ? 'Shape the next version' : 'Start forging a prompt'
  }, [isDragging, promptText])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!canSubmit) {
      return
    }

    setPromptText('')
  }

  return (
    <section
      className="relative min-h-screen overflow-hidden bg-black text-zinc-100"
      style={{
        backgroundImage:
          'linear-gradient(rgba(255,255,255,0.018) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.018) 1px, transparent 1px)',
        backgroundSize: '64px 64px'
      }}
      onDragEnter={() => setIsDragging(true)}
      onDragOver={(event) => {
        event.preventDefault()
        setIsDragging(true)
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) {
          setIsDragging(false)
        }
      }}
      onDrop={(event) => {
        event.preventDefault()
        setIsDragging(false)
      }}
    >
      <div
        className={`pointer-events-none absolute inset-0 border transition duration-200 ${
          isDragging ? 'border-amber-300/40 bg-amber-300/[0.045]' : 'border-transparent'
        }`}
      />

      <button
        className="fixed left-4 top-4 z-20 grid h-9 w-9 place-items-center rounded-md border border-transparent text-zinc-200/80 transition hover:border-white/10 hover:bg-white/[0.045] hover:text-zinc-100 sm:left-5 sm:top-5"
        type="button"
        aria-label="Open workspace menu"
      >
        <LayoutGrid className="h-[18px] w-[18px]" aria-hidden="true" />
      </button>

      <button
        className="fixed bottom-5 left-5 z-20 hidden h-9 w-9 place-items-center rounded-md border border-transparent text-zinc-200/80 transition hover:border-white/10 hover:bg-white/[0.045] hover:text-zinc-100 sm:grid"
        type="button"
        aria-label="Attach context"
      >
        <Upload className="h-[18px] w-[18px]" aria-hidden="true" />
      </button>

      <main className="grid min-h-screen place-items-center px-4 pb-40" aria-live="polite">
        <div className="-translate-y-10 text-center sm:-translate-y-8">
          <div className="relative mx-auto mb-4 grid h-14 w-14 place-items-center text-zinc-100" aria-hidden="true">
            <Hammer className="h-10 w-10 -rotate-12 stroke-[1.7]" />
            <Sparkles className="absolute right-0 top-0 h-5 w-5 text-amber-300 stroke-[1.8]" />
          </div>
          <p className="m-0 text-base font-medium text-zinc-400 sm:text-lg">{emptyStateLabel}</p>
        </div>
      </main>

      <form
        className="fixed bottom-4 left-1/2 z-30 grid w-[min(45rem,calc(100vw-1rem))] -translate-x-1/2 gap-3 rounded-[22px] border border-white/10 bg-[#111214]/95 p-3 shadow-[0_22px_70px_rgba(0,0,0,0.48)] backdrop-blur-xl sm:bottom-[clamp(1rem,4.8vh,3.4rem)] sm:w-[min(45rem,calc(100vw-2rem))] sm:p-4"
        onSubmit={handleSubmit}
      >
        <div className="flex min-h-11 items-center gap-2 sm:min-h-12 sm:gap-3" aria-label="Prompt path">
          <button
            className="inline-flex h-11 min-w-12 items-center justify-center rounded-md border border-[#2a2d32] bg-black/10 px-3 text-xs font-semibold text-zinc-200/70 sm:h-12 sm:min-w-[3.25rem]"
            type="button"
          >
            {startContext}
          </button>
          <ChevronsRight className="h-4 w-4 shrink-0 text-zinc-600" aria-hidden="true" />
          <button
            className="inline-flex h-11 min-w-12 items-center justify-center rounded-md border border-[#2a2d32] bg-black/10 px-3 text-xs font-semibold text-zinc-200/70 sm:h-12 sm:min-w-[3.25rem]"
            type="button"
          >
            {endGoal}
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <label className="sr-only" htmlFor="prompt-input">
            Prompt
          </label>
          <textarea
            id="prompt-input"
            value={promptText}
            onChange={(event) => setPromptText(event.target.value)}
            placeholder="What do you want to forge?"
            rows={1}
            className="min-h-12 max-h-40 w-full resize-y border-0 bg-transparent text-[15px] leading-6 text-zinc-100 outline-none placeholder:text-zinc-500/70"
          />

          <div className="flex items-center justify-between gap-2 sm:justify-end">
            <label className="relative inline-flex h-10 min-w-32 items-center rounded-full border border-[#2a2d32] bg-black/20 text-sm font-semibold text-zinc-200/80">
              <span className="sr-only">Output mode</span>
              <select
                value={mode}
                onChange={(event) => setMode(event.target.value as ForgeMode)}
                className="h-full w-full appearance-none rounded-full bg-transparent py-0 pl-4 pr-10 outline-none"
              >
                {modes.map((item) => (
                  <option key={item} value={item} className="text-zinc-950">
                    {item}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-zinc-500" aria-hidden="true" />
            </label>

            <button
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-zinc-100 text-zinc-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
              type="submit"
              disabled={!canSubmit}
              aria-label="Forge prompt"
            >
              <ArrowRight className="h-5 w-5 stroke-[2.2]" aria-hidden="true" />
            </button>
          </div>
        </div>
      </form>
    </section>
  )
}
