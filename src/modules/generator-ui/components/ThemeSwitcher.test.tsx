import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ThemeProvider } from '@/core/ui/ThemeProvider'
import { ThemeSwitcher } from './ThemeSwitcher'

// next-themes reads/writes localStorage under the "theme" key and listens to
// matchMedia for the "system" resolution. It resolves system via
// `matchMedia('(prefers-color-scheme: dark)')`, so `matches: true` => dark.
function setPrefersDark(dark: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: dark,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

function renderSwitcher() {
  return render(
    <ThemeProvider>
      <ThemeSwitcher />
    </ThemeProvider>,
  )
}

describe('ThemeSwitcher', () => {
  beforeEach(() => {
    localStorage.clear()
    setPrefersDark(true)
  })

  it('renders a theme trigger button', () => {
    renderSwitcher()
    expect(screen.getByRole('button', { name: /change theme/i })).toBeInTheDocument()
  })

  it('opens a popover listing Light, Dark, System, Midnight, Neon, Slate', async () => {
    renderSwitcher()
    fireEvent.click(screen.getByRole('button', { name: /change theme/i }))
    for (const label of ['Light', 'Dark', 'System', 'Midnight', 'Neon', 'Slate']) {
      expect(await screen.findByRole('menuitemradio', { name: new RegExp(label) })).toBeInTheDocument()
    }
  })

  it('persists the selected theme to localStorage', async () => {
    renderSwitcher()
    fireEvent.click(screen.getByRole('button', { name: /change theme/i }))
    fireEvent.click(await screen.findByRole('menuitemradio', { name: /Neon/ }))
    await waitFor(() => expect(localStorage.getItem('theme')).toBe('neon'))
  })

  it('applies the dark class for the dark theme', async () => {
    renderSwitcher()
    fireEvent.click(screen.getByRole('button', { name: /change theme/i }))
    fireEvent.click(await screen.findByRole('menuitemradio', { name: /Dark/ }))
    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(true)
    })
  })

  it('applies the light class for the light theme', async () => {
    renderSwitcher()
    fireEvent.click(screen.getByRole('button', { name: /change theme/i }))
    fireEvent.click(await screen.findByRole('menuitemradio', { name: /Light/ }))
    await waitFor(() => {
      expect(document.documentElement.classList.contains('light')).toBe(true)
    })
  })

  it('sets the midnight class for a dynamic theme', async () => {
    renderSwitcher()
    fireEvent.click(screen.getByRole('button', { name: /change theme/i }))
    fireEvent.click(await screen.findByRole('menuitemradio', { name: /Midnight/ }))
    await waitFor(() => {
      expect(document.documentElement.classList.contains('midnight')).toBe(true)
    })
  })

  it('resolves "system" to dark when prefers-color-scheme is dark', async () => {
    setPrefersDark(true)
    renderSwitcher()
    fireEvent.click(screen.getByRole('button', { name: /change theme/i }))
    fireEvent.click(await screen.findByRole('menuitemradio', { name: /System/ }))
    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(true)
    })
  })

  it('resolves "system" to light when prefers-color-scheme is light', async () => {
    setPrefersDark(false)
    renderSwitcher()
    fireEvent.click(screen.getByRole('button', { name: /change theme/i }))
    fireEvent.click(await screen.findByRole('menuitemradio', { name: /System/ }))
    await waitFor(() => {
      expect(document.documentElement.classList.contains('light')).toBe(true)
    })
  })
})
