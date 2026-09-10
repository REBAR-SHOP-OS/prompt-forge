import { describe, expect, it } from 'vitest'
import dashboardSource from './DashboardPage.tsx?raw'
import transcriptSource from '../components/TranscriptPanel.tsx?raw'
import voiceoverSource from '../components/VoiceoverDialog.tsx?raw'
import optimizerSource from '../components/PromptOptimizerPopover.tsx?raw'

describe('Dashboard transcript and narration cleanup', () => {
  it('keeps only the preview Transcript entry point and translation panel', () => {
    expect(dashboardSource.match(/<TranscriptPanel/g)).toHaveLength(1)
    expect(dashboardSource).toContain('aria-label="Show transcript"')
    expect(dashboardSource).toContain('transcriptOpen')
    expect(dashboardSource).not.toContain('aria-label="Transcribe film audio"')
    expect(dashboardSource).not.toContain('libraryTranscript')
    expect(transcriptSource).toContain("label: 'Original'")
    expect(transcriptSource).toContain('targetLanguage')
  })

  it('removes the per-card Narration review UI without removing narration metadata', () => {
    expect(dashboardSource).not.toContain('NarrationDialog')
    expect(dashboardSource).not.toContain('narrationViewer')
    expect(dashboardSource).not.toContain('aria-label="Narration for this card"')
    expect(dashboardSource).toContain('narration_text')
    expect(dashboardSource).toContain('plannedNarration')
  })

  it('preserves prompt narrator choices and the Voiceover workflow', () => {
    // The narrator choice lives in the prompt optimizer popover (With / Without
    // narration) and the popover is mounted by the dashboard composer.
    expect(optimizerSource).toContain('With narration')
    expect(optimizerSource).toContain('Without narration')
    expect(optimizerSource).toContain('narratorScript')
    expect(dashboardSource).toContain('<PromptOptimizerPopover')
    expect(dashboardSource).toContain('<VoiceoverDialog')
    expect(voiceoverSource).toContain('Generate voiceover')
    expect(voiceoverSource).toContain('Translate narration')
  })
})
