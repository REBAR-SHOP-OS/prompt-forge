                {/* Camera angle selector */}
                <div className="space-y-2">
                  <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    <ZoomIn className="h-3.5 w-3.5" />
                    Camera angle
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    aria-label={`Camera angle: ${selectedCameraLabel}`}
                    onClick={() => setCameraPickerOpen(true)}
                    className="flex h-9 w-full items-center justify-between gap-2 border-white/10 bg-white/[0.03] px-3 text-xs text-zinc-100 hover:bg-white/[0.06]"
                  >
                    <span className="truncate">{selectedCameraLabel}</span>
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden="true" />
                  </Button>
                </div>

                {/* Theme selector */}
                <div className="space-y-2">
                  <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    <Clapperboard className="h-3.5 w-3.5" />
                    Visual theme
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    aria-label={`Visual theme: ${selectedThemeLabel}`}
                    onClick={() => setThemePickerOpen(true)}
                    className="flex h-9 w-full items-center justify-between gap-2 border-white/10 bg-white/[0.03] px-3 text-xs text-zinc-100 hover:bg-white/[0.06]"
                  >
                    <span className="truncate">{selectedThemeLabel}</span>
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden="true" />
                  </Button>
                </div>
