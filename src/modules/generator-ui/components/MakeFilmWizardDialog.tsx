                {/* Camera angle selector - now opens dialog */}
                <div className="space-y-2">
                  <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    <Clapperboard className="h-3.5 w-3.5" />
                    Camera angle
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setCameraPickerOpen(true)}
                    aria-label={`Camera angle: ${selectedCameraLabel}`}
                    className="w-full h-10 justify-between border-white/10 bg-white/[0.03] text-zinc-100 hover:bg-white/[0.06]"
                  >
                    <span className="text-sm">{selectedCameraLabel}</span>
                    <span className="text-xs text-zinc-500">Click to change</span>
                  </Button>
                </div>

                {/* Visual theme selector - now opens dialog */}
                <div className="space-y-2">
                  <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    <Film className="h-3.5 w-3.5" />
                    Visual theme
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setThemePickerOpen(true)}
                    aria-label={`Visual theme: ${selectedThemeLabel}`}
                    className="w-full h-10 justify-between border-white/10 bg-white/[0.03] text-zinc-100 hover:bg-white/[0.06]"
                  >
                    <span className="text-sm">{selectedThemeLabel}</span>
                    <span className="text-xs text-zinc-500">Click to change</span>
                  </Button>
                </div>