import { render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { documentLanguageForLocale, useDocumentLanguage } from './useDocumentLanguage'

function Harness({ locale, active = true }: { locale: string; active?: boolean }) {
  useDocumentLanguage(locale, active)
  return null
}

describe('useDocumentLanguage', () => {
  afterEach(() => {
    document.documentElement.lang = 'en'
  })

  it('synchronizes the document language through locale changes, including Farsi', () => {
    document.documentElement.lang = 'en'
    const { rerender, unmount } = render(<Harness locale="en" />)
    expect(document.documentElement.lang).toBe('en')

    rerender(<Harness locale="fa" />)
    expect(document.documentElement.lang).toBe('fa')

    rerender(<Harness locale="ar" />)
    expect(document.documentElement.lang).toBe('ar')

    unmount()
    expect(document.documentElement.lang).toBe('en')
  })

  it('maps human-readable locale names and stays inert while inactive', () => {
    expect(documentLanguageForLocale('Persian')).toBe('fa')
    expect(documentLanguageForLocale('English')).toBe('en')
    expect(documentLanguageForLocale('Arabic')).toBe('ar')
    document.documentElement.lang = 'en'
    render(<Harness locale="fa" active={false} />)
    expect(document.documentElement.lang).toBe('en')
  })
})
