import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { z } from 'zod'

// rules/rules.lock.json: one hash for each rule id and version. It only grows,
// so one version number always means the same words (rule_record.lock).
export const RuleLock = z
  .object({
    lock_version: z.literal(1),
    rules: z.record(z.string(), z.record(z.string(), z.string().regex(/^[0-9a-f]{64}$/))),
  })
  .strict()

export type RuleLock = z.infer<typeof RuleLock>

export const emptyLock = (): RuleLock => ({ lock_version: 1, rules: {} })

export function readLock(path: string): RuleLock {
  if (!existsSync(path)) return emptyLock()
  return RuleLock.parse(JSON.parse(readFileSync(path, 'utf8')))
}

export function writeLock(path: string, lock: RuleLock): void {
  const sorted: RuleLock = { lock_version: 1, rules: {} }
  for (const id of Object.keys(lock.rules).sort()) {
    const versions = lock.rules[id]!
    sorted.rules[id] = Object.fromEntries(Object.keys(versions).sort((a, b) => Number(a) - Number(b)).map(v => [v, versions[v]!]))
  }
  writeFileSync(path, `${JSON.stringify(sorted, null, 2)}\n`)
}

export function lockedHash(lock: RuleLock, id: string, version: number): string | undefined {
  return lock.rules[id]?.[String(version)]
}
