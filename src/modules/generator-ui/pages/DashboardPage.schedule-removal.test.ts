import { describe, expect, it } from 'vitest'
import dashboardSource from './DashboardPage.tsx?raw'

describe('DashboardPage Schedule removal', () => {
  it('removes the Final Film scheduling control, popup, and hand-off wiring', () => {
    expect(dashboardSource).not.toContain('CalendarPlus')
    expect(dashboardSource).not.toContain("@/components/ui/calendar")
    expect(dashboardSource).not.toContain('scheduleOpen')
    expect(dashboardSource).not.toContain('scheduleDate')
    expect(dashboardSource).not.toContain('scheduleTime')
    expect(dashboardSource).not.toContain('scheduleSending')
    expect(dashboardSource).not.toContain('scheduleStatus')
    expect(dashboardSource).not.toContain('scheduleDebug')
    expect(dashboardSource).not.toContain('handleScheduleToSocial')
    expect(dashboardSource).not.toContain('SOCIAL_PARENT_ORIGIN')
    expect(dashboardSource).not.toContain('SOCIAL_ALLOW_WILDCARD_FALLBACK')
    expect(dashboardSource).not.toContain('rebar.finalFilm.scheduleToSocial')
    expect(dashboardSource).not.toContain('Schedule to Social Media Manager')
    expect(dashboardSource).not.toContain('Send to Social Media Manager')
  })

  it('preserves Preview, Start over, and the independent occasion calendar', () => {
    expect(dashboardSource).toContain('<span className="relative hidden xl:inline">Preview</span>')
    expect(dashboardSource).toContain('aria-label="Start over"')
    expect(dashboardSource).toContain('<AlertDialogAction onClick={handleStartOver}>Start over</AlertDialogAction>')
    expect(dashboardSource).toContain("import CalendarInfoDialog from '@/modules/generator-ui/components/CalendarInfoDialog'")
    expect(dashboardSource).toContain('<CalendarInfoDialog')
    expect(dashboardSource).toContain("'Open calendar'")
  })
})
