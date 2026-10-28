import { readdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join, relative, sep } from 'node:path'
import { parse } from 'yaml'
import type { ZodError } from 'zod'
import { ruleHash } from './hash'
import { lockedHash, readLock, type RuleLock } from './lock'
import { RuleRecord } from './schema'

export interface LoadedRule {
  rule: RuleRecord
  hash: string
  file: string // relative to the rules root
}

export interface RuleProblem {
  file: string
  field: string
  message: string // says what is wrong and how to fix it
}

// The rule library: every rule file that the loader read and checked (rule_record.loader).
export interface RuleLibrary {
  rules: LoadedRule[]
  problems: RuleProblem[]
  lock: RuleLock
}

export const LOCK_FILE = 'rules.lock.json'

function ruleFiles(root: string): string[] {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter(e => e.isFile() && (e.name.endsWith('.yaml') || e.name.endsWith('.yml')))
    .map(e => relative(root, join(e.parentPath, e.name)))
    .sort()
}

function zodProblems(file: string, error: ZodError): RuleProblem[] {
  return error.issues.map(i => ({ file, field: i.path.join('.') || '(file)', message: i.message }))
}

// Reads each rule file under root, checks it, and compares it with the lock.
// It reports every problem in one round and never stops at the first one.
export function loadRuleLibrary(root: string): RuleLibrary {
  const problems: RuleProblem[] = []
  const lock = readLock(join(root, LOCK_FILE))
  const rules: LoadedRule[] = []

  for (const file of ruleFiles(root)) {
    let data: unknown
    try {
      data = parse(readFileSync(join(root, file), 'utf8'))
    } catch (e) {
      problems.push({ file, field: '(file)', message: `The file is not valid YAML: ${(e as Error).message}` })
      continue
    }
    const parsed = RuleRecord.safeParse(data)
    if (!parsed.success) {
      problems.push(...zodProblems(file, parsed.error))
      continue
    }
    const rule = parsed.data
    const folder = dirname(file).split(sep).join('/')
    if (folder !== rule.owner) {
      problems.push({ file, field: 'owner', message: `The file must sit in rules/${rule.owner}/, the folder of its owner node.` })
    }
    const name = basename(file).replace(/\.ya?ml$/, '')
    if (name !== rule.id) problems.push({ file, field: 'id', message: `Name the file ${rule.id}.yaml, after the rule id.` })
    rules.push({ rule, hash: ruleHash(rule), file })
  }

  const seen = new Map<string, string>()
  for (const { rule, file } of rules) {
    const first = seen.get(rule.id)
    if (first) problems.push({ file, field: 'id', message: `The id ${rule.id} is also in ${first}. One id names one rule.` })
    else seen.set(rule.id, file)
  }

  for (const { rule, hash, file } of rules) {
    const locked = lockedHash(lock, rule.id, rule.version)
    if (locked === undefined) {
      problems.push({ file, field: 'version', message: `Version ${rule.version} of ${rule.id} is not in ${LOCK_FILE}. Run npm run rules:lock.` })
    } else if (locked !== hash) {
      problems.push({ file, field: 'version', message: `The words changed under version ${rule.version}. Raise the version, set supersedes to ${rule.version}, and run npm run rules:lock.` })
    }
    if (rule.supersedes !== undefined && lockedHash(lock, rule.id, rule.supersedes) === undefined) {
      problems.push({ file, field: 'supersedes', message: `Version ${rule.supersedes} of ${rule.id} is not in ${LOCK_FILE}, so it cannot be superseded.` })
    }
  }

  return { rules, problems, lock }
}

// Adds a lock entry for each new rule version. It never changes an existing entry.
export function lockNewVersions(library: RuleLibrary): { lock: RuleLock; added: string[]; refused: string[] } {
  const lock: RuleLock = { lock_version: 1, rules: structuredClone(library.lock.rules) }
  const added: string[] = []
  const refused: string[] = []
  for (const { rule, hash } of library.rules) {
    const locked = lockedHash(lock, rule.id, rule.version)
    if (locked === undefined) {
      lock.rules[rule.id] = { ...lock.rules[rule.id], [String(rule.version)]: hash }
      added.push(`${rule.id}@${rule.version}`)
    } else if (locked !== hash) {
      refused.push(`${rule.id}@${rule.version}`)
    }
  }
  return { lock, added, refused }
}
