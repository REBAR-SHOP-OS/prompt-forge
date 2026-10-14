import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// CI concurrency contract: a newer push to a PR cancels the superseded PR run,
// but push runs (main / agent branches) are never cancelled. A shared group per
// pushed ref breaks that even with cancel-in-progress: false, because GitHub
// keeps one pending run per group and cancels the older pending run when a
// newer one queues. Push runs therefore need a group unique to the run.

const workflow = readFileSync(path.resolve('.github/workflows/ci.yml'), 'utf8')

function concurrencyValue(key: string): string {
  const match = workflow.match(new RegExp(`^concurrency:\\n(?:  .*\\n)*?  ${key}: (.+)$`, 'm'))
  if (!match) throw new Error(`ci.yml has no top-level concurrency.${key}`)
  return match[1].trim()
}

type Context = {
  event_name: string
  ref: string
  run_id: number
  event: { pull_request?: { number: number } }
}

// Minimal evaluator for the GitHub expression subset used here: context
// property access (null-safe), ==, &&, ||, string literals and format().
function evaluate(value: string, github: Context): string {
  return value.replace(/\$\{\{(.+?)\}\}/g, (_, expression: string) => {
    const js = expression
      .replace(/\bgithub((?:\.[A-Za-z_]\w*)+)/g, (_m, props: string) => `github${props.replace(/\./g, '?.')}`)
      .replace(/==/g, '===')
    const format = (template: string, ...args: unknown[]) =>
      template.replace(/\{(\d+)\}/g, (_t, index: string) => String(args[Number(index)]))
    const result = new Function('github', 'format', `return (${js});`)(github, format) as unknown
    return String(result ?? '')
  })
}

const push = (run_id: number, ref = 'refs/heads/main'): Context =>
  ({ event_name: 'push', ref, run_id, event: {} })
const pr = (number: number, run_id: number): Context =>
  ({ event_name: 'pull_request', ref: `refs/pull/${number}/merge`, run_id, event: { pull_request: { number } } })

describe('CI concurrency', () => {
  const group = concurrencyValue('group')
  const cancel = concurrencyValue('cancel-in-progress')

  it('gives every push run its own group, so a newer push never cancels a pending push run', () => {
    expect(evaluate(group, push(101))).not.toBe(evaluate(group, push(102)))
    expect(evaluate(group, push(103, 'refs/heads/agent/x'))).not.toBe(evaluate(group, push(104, 'refs/heads/agent/x')))
    expect(evaluate(cancel, push(101))).toBe('false')
  })

  it('keeps one group per PR with cancel-in-progress, so a newer PR push cancels the superseded run', () => {
    expect(evaluate(group, pr(7, 201))).toBe(evaluate(group, pr(7, 202)))
    expect(evaluate(group, pr(7, 201))).not.toBe(evaluate(group, pr(8, 201)))
    expect(evaluate(cancel, pr(7, 201))).toBe('true')
  })

  it('never puts a push run in a PR group', () => {
    expect(evaluate(group, push(7))).not.toBe(evaluate(group, pr(7, 7)))
  })
})
