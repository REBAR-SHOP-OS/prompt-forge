import { describe, expect, it } from 'vitest'
// ?raw is resolved by Vite at transform time, matching the pattern used by the
// other DashboardPage source assertions in this directory.
import source from './DashboardPage.tsx?raw'

/**
 * Restaging the product as the Start frame now fires on its own — once when a
 * product is picked, and again on every aspect-ratio change. Both paths route
 * through `handleUseImageAsStart`, which replaces whatever occupies the Start
 * slot. Without a guard, clicking an aspect chip silently destroys a Start
 * frame the user uploaded themselves.
 *
 * The guard cannot be "only when there is no Start frame": the product-select
 * path stages one, so that test would be false from the second click onward and
 * aspect changes would stop restaging at all — which is the bug this PR set out
 * to fix. It has to distinguish a frame this page staged from a product from a
 * frame the user supplied, which is what `source: 'product'` records.
 */
describe('product Start-frame restaging', () => {
  it('marks the frames it stages from a product so it can tell them apart later', () => {
    expect(source).toMatch(/source\?:\s*'product'/)
    expect(source).toContain("...(productAspect ? { source: 'product' as const } : {})")
  })

  it('only restages over a frame it staged itself, never over a user upload', () => {
    expect(source).toContain('function canRestageProductStartFrame()')
    expect(source).toMatch(
      /const startFrame = uploadedFiles\.find\(\(file\) => file\.target === 'Start'\)\s*\n\s*return !startFrame \|\| startFrame\.source === 'product'/,
    )
  })

  it('applies the guard on both automatic restage paths', () => {
    // Aspect chip.
    expect(source).toContain('if (selectedProduct && canRestageProductStartFrame()) {')
    // Product picker.
    expect(source).toContain('if (canRestageProductStartFrame()) {')

    // Passing a second argument (the product aspect) is what marks a call as an
    // automatic product restage; the single-argument calls are user-initiated
    // "use this image as the start frame" actions and are correctly unguarded.
    // Every product restage must be guarded, so pin the count as well as the
    // two known sites — a third one added later fails here rather than silently
    // reintroducing the clobber.
    // The lookbehind skips the declaration itself, whose parameter list also
    // contains a comma.
    const productStageCalls = source.match(/(?<!function )handleUseImageAsStart\([^)]*,[^)]*\)/g) ?? []
    expect(productStageCalls).toHaveLength(2)

    for (const call of ['selectedProduct.url, opt.value', 'product.url, aspectRatio']) {
      const index = source.indexOf(`void handleUseImageAsStart(${call})`)
      expect(index).toBeGreaterThan(-1)
      // The guard must sit within the same handler, immediately above the call.
      expect(source.slice(Math.max(0, index - 300), index)).toContain('canRestageProductStartFrame()')
    }
  })
})
