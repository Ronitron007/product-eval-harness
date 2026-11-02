import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
import { CODE_DEPS, RUNTIME_VERSION } from '../src/compiler'
import { CHECKS } from '../src/rules/checks'

// npm run compiler:lock: adds the fingerprint of each new declared code version to
// src/compiler/code.lock.json (compile.hash). It never rewrites an existing entry: a fingerprint
// that moved under an unchanged version is refused, and the author raises the version.
//
// The rule-set hash reads the declared versions, never source text. This lock proves that one
// version always means one code. The fingerprint is the sha256 of the transpiled source, with
// no types and no comments, so a comment edit does not move it.

export const REPO = join(import.meta.dirname, '..')
export const LOCK_PATH = join(REPO, 'src', 'compiler', 'code.lock.json')
// The files of RUNTIME_VERSION: the walk, the per-rule shape check, the outcome policy, and the run part of the judge prompt.
export const RUNTIME_FILES = ['src/compiler/paths.ts', 'src/compiler/shape.ts', 'src/compiler/scorers.ts', 'src/rules/checks/define.ts'] as const
export const templateFile = (name: string) => `src/rules/checks/${name}.ts`

type Pins = { zod: string; '@mastra/core': string }
export interface CodeLock {
  lock_version: 1
  deps: Pins
  runtime: Record<string, string> // version -> fingerprint
  checks: Record<string, Record<string, string>> // template name -> version -> fingerprint
}
export interface CodeVersions {
  runtime: { version: number; fingerprint: string }
  checks: { name: string; version: number; fingerprint: string }[]
}

export function fingerprint(files: readonly string[], root = REPO): string {
  const hash = createHash('sha256')
  for (const file of files) {
    const js = ts.transpileModule(readFileSync(join(root, file), 'utf8'), {
      fileName: file,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, removeComments: true },
    }).outputText
    hash.update(`${file}\n${js}\n`)
  }
  return hash.digest('hex')
}

export function currentCode(root = REPO): CodeVersions {
  return {
    runtime: { version: RUNTIME_VERSION, fingerprint: fingerprint(RUNTIME_FILES, root) },
    checks: CHECKS.map(t => ({ name: t.name, version: t.version, fingerprint: fingerprint([templateFile(t.name)], root) })),
  }
}

// The exact pins of package.json.
export function packagePins(root = REPO): Pins {
  const deps = (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { dependencies: Record<string, string> }).dependencies
  return { zod: deps.zod!, '@mastra/core': deps['@mastra/core']! }
}

export const emptyLock = (): CodeLock => ({ lock_version: 1, deps: { zod: '', '@mastra/core': '' }, runtime: {}, checks: {} })
export const readCodeLock = (path = LOCK_PATH): CodeLock => (existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as CodeLock) : emptyLock())

// Each problem of the lock against the code, with the fix.
export function lockProblems(lock: CodeLock, code: CodeVersions, pins: Pins): string[] {
  const problems: string[] = []
  const locked = lock.runtime[String(code.runtime.version)]
  if (locked === undefined) problems.push(`RUNTIME_VERSION ${code.runtime.version} is not in code.lock.json. Run npm run compiler:lock.`)
  else if (locked !== code.runtime.fingerprint) {
    problems.push(`The runtime code (${RUNTIME_FILES.join(', ')}) changed under RUNTIME_VERSION ${code.runtime.version}. Raise RUNTIME_VERSION in src/compiler/scorers.ts, and run npm run compiler:lock.`)
  }
  for (const c of code.checks) {
    const at = lock.checks[c.name]?.[String(c.version)]
    if (at === undefined) problems.push(`Version ${c.version} of the check ${c.name} is not in code.lock.json. Run npm run compiler:lock.`)
    else if (at !== c.fingerprint) problems.push(`The check ${c.name} changed under version ${c.version}. Raise its version in ${templateFile(c.name)}, and run npm run compiler:lock.`)
  }
  for (const name of ['zod', '@mastra/core'] as const) {
    if (lock.deps[name] !== pins[name]) problems.push(`code.lock.json pins ${name} ${lock.deps[name]}, and package.json pins ${pins[name]}. Run npm run compiler:lock.`)
    if (CODE_DEPS[name] !== pins[name]) problems.push(`CODE_DEPS in src/compiler/index.ts pins ${name} ${CODE_DEPS[name]}, and package.json pins ${pins[name]}. Set CODE_DEPS to the package.json pin.`)
  }
  return problems
}

// Adds each new version. A moved fingerprint under a locked version is refused, never rewritten.
export function updateLock(lock: CodeLock, code: CodeVersions, pins: Pins): { lock: CodeLock; added: string[]; refused: string[] } {
  const next: CodeLock = { lock_version: 1, deps: { ...pins }, runtime: { ...lock.runtime }, checks: structuredClone(lock.checks) }
  const added: string[] = []
  const refused: string[] = []
  const put = (label: string, table: Record<string, string>, version: number, print: string) => {
    const at = table[String(version)]
    if (at === undefined) {
      table[String(version)] = print
      added.push(`${label}@${version}`)
    } else if (at !== print) refused.push(`${label}@${version}: its code changed under a locked version. Raise the version.`)
  }
  put('runtime', next.runtime, code.runtime.version, code.runtime.fingerprint)
  for (const c of code.checks) put(c.name, (next.checks[c.name] ??= {}), c.version, c.fingerprint)
  return { lock: next, added, refused }
}

function sortedLock(lock: CodeLock): CodeLock {
  const byVersion = (t: Record<string, string>) => Object.fromEntries(Object.entries(t).sort(([a], [b]) => Number(a) - Number(b)))
  return {
    lock_version: 1,
    deps: lock.deps,
    runtime: byVersion(lock.runtime),
    checks: Object.fromEntries(Object.keys(lock.checks).sort().map(name => [name, byVersion(lock.checks[name]!)])),
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pins = packagePins()
  const { lock, added, refused } = updateLock(readCodeLock(), currentCode(), pins)
  for (const r of refused) console.error(`refused ${r}`)
  if (refused.length > 0) process.exit(1)
  writeFileSync(LOCK_PATH, `${JSON.stringify(sortedLock(lock), null, 2)}\n`)
  for (const a of added) console.log(`locked ${a}`)
  const problems = lockProblems(lock, currentCode(), pins)
  for (const p of problems) console.error(p)
  process.exit(problems.length === 0 ? 0 : 1)
}
