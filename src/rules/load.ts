import { readdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join, relative, sep } from 'node:path'
import { parse } from 'yaml'
import type { ZodError } from 'zod'
import { ruleHash } from './hash'
import { emptyLock, lockedHash, readLock, type RuleLock } from './lock'
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
const NOT_RULES = new Set([LOCK_FILE, 'README.md'])

// Lists the rule files. Each other entry is a problem, so that no rule file is skipped in silence.
function ruleFiles(root: string, problems: RuleProblem[]): string[] {
  const files: string[] = []
  for (const e of readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (e.isDirectory()) continue
    const file = relative(root, join(e.parentPath, e.name))
    if (NOT_RULES.has(file)) continue
    if (e.isFile() && /\.ya?ml$/.test(e.name)) files.push(file)
    else problems.push({ file, field: '(file)', message: 'Only regular .yaml or .yml rule files belong in rules/. Move or rename this entry.' })
  }
  return files.sort()
}

function zodProblems(file: string, error: ZodError): RuleProblem[] {
  return error.issues.map(i => ({ file, field: i.path.join('.') || '(file)', message: i.message }))
}

// A diff of the lock against a base lock, such as the lock of main: the lock only grows.
export function lockGrowthProblems(base: RuleLock, lock: RuleLock): RuleProblem[] {
  const problems: RuleProblem[] = []
  for (const [id, versions] of Object.entries(base.rules)) {
    for (const [version, hash] of Object.entries(versions)) {
      const now = lock.rules[id]?.[version]
      if (now === undefined) problems.push({ file: LOCK_FILE, field: `${id}@${version}`, message: 'The base lock holds this version, and this lock lost it. Restore the entry.' })
      else if (now !== hash) problems.push({ file: LOCK_FILE, field: `${id}@${version}`, message: 'The base lock holds another hash for this version. Restore it, and raise the version of the rule.' })
    }
  }
  return problems
}

// Reads each rule file under root, checks it, and compares it with the lock.
// It reports every problem in one round and never stops at the first one.
export function loadRuleLibrary(root: string, options: { baseLock?: RuleLock } = {}): RuleLibrary {
  const problems: RuleProblem[] = []
  let lock: RuleLock
  try {
    lock = readLock(join(root, LOCK_FILE))
  } catch (e) {
    problems.push({ file: LOCK_FILE, field: '(file)', message: `The lock is not valid: ${(e as Error).message.split('\n')[0]}` })
    lock = emptyLock()
  }
  const rules: LoadedRule[] = []

  for (const file of ruleFiles(root, problems)) {
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
    let hash: string
    try {
      hash = ruleHash(rule)
    } catch (e) {
      problems.push({ file, field: '(file)', message: `The rule has no canonical form: ${(e as Error).message}. Use only finite numbers, strings, lists and maps.` })
      continue
    }
    const folder = dirname(file).split(sep).join('/')
    if (folder !== rule.owner) {
      problems.push({ file, field: 'owner', message: `The file must sit in rules/${rule.owner}/, the folder of its owner node.` })
    }
    const name = basename(file).replace(/\.ya?ml$/, '')
    if (name !== rule.id) problems.push({ file, field: 'id', message: `Name the file ${rule.id}.yaml, after the rule id.` })
    rules.push({ rule, hash, file })
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

  // A rule never leaves the store: retire it with status retired, and keep its file.
  for (const id of Object.keys(lock.rules)) {
    if (!seen.has(id)) problems.push({ file: LOCK_FILE, field: id, message: `The lock holds ${id}, but no rule file has this id. Restore the file, and set status to retired to stop the rule.` })
  }

  if (options.baseLock) problems.push(...lockGrowthProblems(options.baseLock, lock))

  return { rules, problems, lock }
}

// Adds a lock entry for each new rule version that has no other problem.
// It never changes an existing entry.
export function lockNewVersions(library: RuleLibrary): { lock: RuleLock; added: string[]; refused: string[] } {
  const lock: RuleLock = { lock_version: 1, rules: structuredClone(library.lock.rules) }
  const added: string[] = []
  const refused: string[] = []
  const lockOnly = (p: RuleProblem) => p.field === 'version' && p.message.includes(`is not in ${LOCK_FILE}`)
  const blocked = new Set(library.problems.filter(p => !lockOnly(p)).map(p => p.file))
  for (const { rule, hash, file } of library.rules) {
    const locked = lockedHash(lock, rule.id, rule.version)
    if (locked !== undefined) {
      if (locked !== hash) refused.push(`${rule.id}@${rule.version}: its words changed under a locked version`)
      continue
    }
    if (blocked.has(file)) {
      refused.push(`${rule.id}@${rule.version}: fix the problems of ${file} first`)
      continue
    }
    lock.rules[rule.id] = { ...lock.rules[rule.id], [String(rule.version)]: hash }
    added.push(`${rule.id}@${rule.version}`)
  }
  return { lock, added, refused }
}
