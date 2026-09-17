import { useEffect } from 'react'

export function documentLanguageForLocale(locale: string): string {
  const normalized = locale.trim().toLowerCase()
  const languageNames: Record<string, string> = {
    english: 'en',
    persian: 'fa',
    farsi: 'fa',
    arabic: 'ar',
    french: 'fr',
    spanish: 'es',
    german: 'de',
    turkish: 'tr',
  }
  if (languageNames[normalized]) return languageNames[normalized]
  return normalized || 'en'
}

/** Keep the document language aligned while a localized surface is active. */
export function useDocumentLanguage(locale: string, active = true) {
  useEffect(() => {
    if (!active) return
    const language = documentLanguageForLocale(locale)
    const previous = document.documentElement.lang || 'en'
    document.documentElement.lang = language
    return () => {
      // Do not clobber a newer localized surface mounted after this one.
      if (document.documentElement.lang === language) {
        document.documentElement.lang = previous
      }
    }
  }, [active, locale])
}
