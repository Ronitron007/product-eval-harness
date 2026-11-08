import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { currentCode, lockProblems, packagePins, readCodeLock, REPO, RUNTIME_FILES, templateFile } from '../../scripts/compiler-lock'
import { RUNTIME_VERSION } from '../../src/compiler'
import { CHECKS } from '../../src/rules/checks'

// Hazard `stale_pin`: a change to the decode gate or the binding table keeps the old hash (judge.runtime_pinned).

const roots: string[] = []
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true })
})

// A copy of the files that the code lock reads, with one line changed in one file.
function copyWith(file: string, from: string, to: string): string {
  const root = mkdtempSync(join(tmpdir(), 'judge-stale-pin-'))
  roots.push(root)
  for (const f of [...RUNTIME_FILES, ...CHECKS.map(t => templateFile(t.name))]) {
    cpSync(join(REPO, f), join(root, f), { recursive: true })
  }
  const text = readFileSync(join(root, file), 'utf8')
  expect(text.split(from)).toHaveLength(2) // the line exists once
  writeFileSync(join(root, file), text.replace(from, to))
  return root
}

describe('stale_pin', () => {
  // Repro opus/probe2.repro.ts: a changed decode gate kept the same rule-set hash and fingerprint.
  it('stale_pin.runtime_files_cover_gate (repro opus/probe2.repro.ts): RUNTIME_FILES holds src/compiler/index.ts and src/judge/step.ts', () => {
    expect(RUNTIME_FILES).toContain('src/compiler/index.ts')
    expect(RUNTIME_FILES).toContain('src/judge/step.ts')
    expect(dirname(join(REPO, 'src/judge/step.ts'))).toBe(join(REPO, 'src', 'judge'))
  })

  it('stale_pin.step_change_moves_fingerprint: a one-line change of decideOutcome or of the decode gate moves the runtime fingerprint, and lockProblems reports it under the unchanged RUNTIME_VERSION', () => {
    const lock = readCodeLock()
    const now = currentCode().runtime.fingerprint
    const changes = [
      copyWith('src/judge/step.ts', 'if (open.length > 0) return', 'if (open.length > 1) return'),
      copyWith('src/compiler/index.ts', "if (i.code === 'unrecognized_keys')", "if (i.code === 'unrecognized_keys' && at === '')"),
    ]
    for (const root of changes) {
      const code = currentCode(root)
      expect(code.runtime).toMatchObject({ version: RUNTIME_VERSION })
      expect(code.runtime.fingerprint).not.toBe(now)
      expect(lockProblems(lock, code, packagePins())).toEqual([expect.stringMatching(new RegExp(`^The runtime code \\(.*src/judge/step.ts\\) changed under RUNTIME_VERSION ${RUNTIME_VERSION}\\. Raise RUNTIME_VERSION`))])
    }
    // A comment does not move the fingerprint.
    const comment = copyWith('src/judge/step.ts', '// Rule order (id, then version), then target order.', '// Rule order, then target order.')
    expect(lockProblems(lock, currentCode(comment), packagePins())).toEqual([])
  })
})
