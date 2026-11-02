import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach } from 'vitest'
import { stringify } from 'yaml'
import { LOCK_FILE, loadRuleLibrary, lockNewVersions } from '../../src/rules/load'
import { writeLock } from '../../src/rules/lock'

// Rule files on disk, for the tests that go through the loader and `npm run rules:check`.

export const REPO = join(import.meta.dirname, '..', '..')

const roots: string[] = []
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true })
})

// Writes each rule under rules/<owner>/<id>.yaml in a new temporary folder.
export function rulesRoot(rules: readonly Record<string, unknown>[]): string {
  const root = mkdtempSync(join(tmpdir(), 'compiler-rules-'))
  roots.push(root)
  for (const r of rules) writeRule(root, r)
  return root
}

export function writeRule(root: string, rule: Record<string, unknown>): void {
  mkdirSync(join(root, String(rule.owner)), { recursive: true })
  writeFileSync(join(root, String(rule.owner), `${String(rule.id)}.yaml`), stringify(JSON.parse(JSON.stringify(rule))))
}

// The state after `npm run rules:lock`.
export function lock(root: string): void {
  writeLock(join(root, LOCK_FILE), lockNewVersions(loadRuleLibrary(root)).lock)
}

export const problemsOf = (root: string) => loadRuleLibrary(root).problems.map(p => `${p.field}: ${p.message}`)

// A test that runs the CLI starts tsx and loads the compiler, so it takes some seconds on a CI runner.
export const CLI = { timeout: 60_000 } as const

// Runs `npm run rules:check` on a rules folder: the CLI, as CI runs it.
export function rulesCheck(root: string): { status: number | null; out: string } {
  const r = spawnSync(join(REPO, 'node_modules', '.bin', 'tsx'), ['src/rules/cli.ts', 'check', root], { cwd: REPO, encoding: 'utf8' })
  return { status: r.status, out: `${r.stdout}${r.stderr}` }
}
