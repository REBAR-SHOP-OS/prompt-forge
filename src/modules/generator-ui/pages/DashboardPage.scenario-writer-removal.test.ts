import { describe, expect, it } from 'vitest'
import dashboardSource from './DashboardPage.tsx?raw'
import makeFilmSource from '../components/MakeFilmWizardDialog.tsx?raw'
import productAdSource from '../components/ProductAdDialog.tsx?raw'

describe('DashboardPage Scenario Writer removal', () => {
  it('does not expose the dedicated Scenario Writer control or modal wiring', () => {
    expect(dashboardSource).not.toContain('ScenarioWriterDialog')
    expect(dashboardSource).not.toContain('isScenarioDialogOpen')
    expect(dashboardSource).not.toContain('setIsScenarioDialogOpen')
    expect(dashboardSource).not.toContain('aria-label="Write a scenario from your idea"')
    expect(dashboardSource).not.toContain('title="Write a scenario from your idea"')
  })

  it('preserves shared scenario generation for Make Film and Product/Character flows', () => {
    expect(dashboardSource).toContain('<MakeFilmWizardDialog')
    expect(dashboardSource).toContain('writeScenario={writeFilmScenario}')
    expect(dashboardSource).toContain('<ProductAdDialog')
    expect(dashboardSource).toContain('initialCharacter=')
    expect(dashboardSource).toContain("supabase.functions.invoke('scenario-write'")
    expect(makeFilmSource).toContain('writeScenario')
    expect(productAdSource).toContain("supabase.functions.invoke('scenario-write'")
  })
})
