import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync(path.resolve('.github/workflows/pr-drift-sync.yml'), 'utf8')
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash'
const step = 'Measure drift and report'

// Preserve the shell indentation that GitHub receives after YAML block dedenting.
function scriptFor(name: string): string {
  const lines = workflow.split(/\r?\n/)
  const start = lines.findIndex((line) => line === `      - name: ${name}`)
  if (start < 0) throw new Error(`Missing step: ${name}`)
  const run = lines.findIndex((line, index) => index > start && line === '        run: |')
  const body: string[] = []
  for (const line of lines.slice(run + 1)) {
    if (line.trim() && !line.startsWith('          ')) break
    body.push(line.slice(10))
  }
  return body.join('\n')
}

describe('PR drift sync shell', () => {
  it(`parses ${step}`, () => {
    const result = spawnSync(bash, ['-n'], { input: scriptFor(step), encoding: 'utf8' })
    expect(result.error).toBeUndefined()
    expect(result.status, result.stderr).toBe(0)
  })

  it('reports drift without network and never pushes', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pr-drift-sync-'))
    try {
      const summary = path.join(dir, 'summary.md')
      const mock = `git() {\n  printf '%s\\n' "$*" >> calls.txt\n  if [ "$1" = rev-list ]; then printf '2\\t1\\n'; fi\n}\n`
      const result = spawnSync(bash, ['-s'], {
        input: mock + scriptFor(step), cwd: dir, encoding: 'utf8',
        env: {
          ...process.env,
          PR_NUMBER: '233',
          HEAD_SHA: 'test-sha',
          HEAD_REF: 'agent/test',
          GITHUB_STEP_SUMMARY: summary.replace(/\\/g, '/'),
        },
      })
      expect(result.error).toBeUndefined()
      expect(result.status, result.stderr).toBe(0)
      const report = readFileSync(summary, 'utf8')
      expect(report).toContain('**2** commit(s) behind')
      expect(report).toContain('**1** ahead')
      const calls = readFileSync(path.join(dir, 'calls.txt'), 'utf8').split('\n').filter(Boolean)
      expect(calls.some((line) => line.startsWith('rev-list '))).toBe(true)
      expect(calls.filter((line) => line.startsWith('push'))).toHaveLength(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('workflow cannot push', () => {
    expect(workflow).not.toContain('push origin')
    expect(workflow).not.toContain('contents: write')
  })
})
