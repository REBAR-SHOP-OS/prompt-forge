import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('DashboardPage calendar integration', () => {
  it('passes the dynamic durationSeconds to CalendarInfoDialog and does not reset duration to 10s', () => {
    const dashboardPath = path.join(__dirname, 'DashboardPage.tsx')
    const dashboardSource = fs.readFileSync(dashboardPath, 'utf-8')

    // Expect the component to be imported
    expect(dashboardSource).toContain("import CalendarInfoDialog from '@/modules/generator-ui/components/CalendarInfoDialog'")

    // Expect the dialog to be rendered with the durationSeconds prop
    expect(dashboardSource).toMatch(/<CalendarInfoDialog[^>]*durationSeconds=\{durationSeconds\}[^>]*>/s)

    // Ensure it no longer contains the hard-coded reset
    expect(dashboardSource).not.toContain('setDurationSeconds(10)')
  })
})
