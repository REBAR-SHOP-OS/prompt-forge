import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const root = process.cwd()
const audit = spawnSync('npm', ['audit', '--json'], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024,
})

assert(audit.status === 0, `npm audit failed or found advisories (status ${audit.status})`)
assert(audit.stdout, 'npm audit returned no JSON output')

const report = JSON.parse(audit.stdout)
const counts = report.metadata?.vulnerabilities
assert(counts, 'npm audit report did not contain vulnerability counts')
for (const severity of ['info', 'low', 'moderate', 'high', 'critical', 'total']) {
  assert(counts[severity] === 0, `Unexpected ${severity} advisories: ${counts[severity]}`)
}
assert(
  Object.keys(report.vulnerabilities ?? {}).length === 0,
  `Unexpected vulnerable packages: ${Object.keys(report.vulnerabilities).join(', ')}`,
)

const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
const lockfile = JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8'))
const patchedEsbuild = packageJson.overrides?.['@lovable.dev/mcp-js']?.esbuild
assert(patchedEsbuild === '0.28.2', `Unexpected scoped MCP esbuild override: ${patchedEsbuild}`)
assert(
  lockfile.packages?.['node_modules/esbuild']?.version === '0.28.2',
  'The lockfile did not resolve the scoped MCP esbuild override to the patched 0.28.2 package',
)
assert(
  !lockfile.packages?.['node_modules/@lovable.dev/mcp-js/node_modules/esbuild'],
  'A vulnerable nested MCP esbuild copy remains in the lockfile',
)

// @lovable.dev/mcp-js@0.20.1 still declares esbuild ^0.27.0, while the low
// GHSA-g7r4-m6w7-qqqr patch begins at 0.28.1. Keep the override scoped to the
// build plugin; the full test suite and production build prove this exact lock.
console.log('AUDIT_POLICY_VERIFIED total=0 direct=0 low=0 moderate=0 high=0 critical=0 mcpEsbuild=0.28.2')
