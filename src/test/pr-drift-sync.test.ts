import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync(path.resolve('.github/workflows/pr-drift-sync.yml'), 'utf8')
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash'

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
  it.each(['Sync with main if behind', 'Sync each PR branch with main'])('parses %s', (step) => {
    const result = spawnSync(bash, ['-n'], { input: scriptFor(step), encoding: 'utf8' })
    expect(result.error).toBeUndefined()
    expect(result.status, result.stderr).toBe(0)
  })

  it.each([
    { prs: '', behind: 0, pushes: 0 },
    { prs: '233 agent/test\n', behind: 0, pushes: 0 },
    { prs: '233 agent/test\n234 agent/second\n', behind: 2, pushes: 2 },
  ])('processes scheduled branches without network: $pushes pushes', ({ prs, behind, pushes }) => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pr-drift-sync-'))
    try {
      writeFileSync(path.join(dir, 'prs.txt'), prs)
      const mock = `git() {\n  if [ "$1" = rev-list ]; then printf '${behind}\\t1\\n'; return; fi\n  printf '%s\\n' "$*" >> calls.txt\n}\n`
      const result = spawnSync(bash, ['-s'], {
        input: mock + scriptFor('Sync each PR branch with main'), cwd: dir, encoding: 'utf8',
      })
      expect(result.error).toBeUndefined()
      expect(result.status, result.stderr).toBe(0)
      const calls = prs ? readFileSync(path.join(dir, 'calls.txt'), 'utf8') : ''
      expect(calls.split('\n').filter((line) => line.startsWith('push '))).toHaveLength(pushes)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
