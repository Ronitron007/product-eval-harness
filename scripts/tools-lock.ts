import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
import { REGISTRY } from '../src/tools'

// npm run tools:lock: adds the fingerprint of each new entry version of the tool registry to
// src/tools/code.lock.json (tools.registry in docs/design/tool-registry.md), as compile.hash does
// for the compiler. It never rewrites an entry: a fingerprint that moved under an unchanged version
// is refused, and the author raises the version.
//
// The fingerprint of an entry is the sha256 of its call in src/tools/registry.ts, transpiled with
// no types and no comments. A wrapper adds src/tools/workflow-tool.ts, which holds its execute and
// its result schema.

export const REPO = join(import.meta.dirname, '..')
export const TOOLS_LOCK_PATH = join(REPO, 'src', 'tools', 'code.lock.json')
export const REGISTRY_FILE = 'src/tools/registry.ts'
export const WRAPPER_FILE = 'src/tools/workflow-tool.ts'

export interface ToolsLock {
  lock_version: 1
  tools: Record<string, Record<string, string>> // id -> version -> fingerprint
}
export interface EntryCode {
  id: string
  version: number
  fingerprint: string
}

const plain = (text: string, file: string) =>
  ts.transpileModule(text, { fileName: file, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, removeComments: true } }).outputText

// The source of each entry call (defineEntry or workflowTool) in the registry file, by its id.
export function entryCalls(source: string): Map<string, { callee: string; text: string }> {
  const file = ts.createSourceFile(REGISTRY_FILE, source, ts.ScriptTarget.ES2022, true)
  const out = new Map<string, { callee: string; text: string }>()
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ['defineEntry', 'workflowTool'].includes(node.expression.text)) {
      const arg = node.arguments[0]
      const id = arg && ts.isObjectLiteralExpression(arg) ? arg.properties.find(p => ts.isPropertyAssignment(p) && p.name.getText(file) === 'id') : undefined
      if (id && ts.isPropertyAssignment(id) && ts.isStringLiteral(id.initializer)) out.set(id.initializer.text, { callee: node.expression.text, text: node.getText(file) })
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return out
}

export function currentTools(root = REPO): EntryCode[] {
  const calls = entryCalls(readFileSync(join(root, REGISTRY_FILE), 'utf8'))
  const wrapper = plain(readFileSync(join(root, WRAPPER_FILE), 'utf8'), WRAPPER_FILE)
  return REGISTRY.entries.map(e => {
    const call = calls.get(e.id)
    if (call === undefined) throw new Error(`The entry ${e.id} has no defineEntry or workflowTool call in ${REGISTRY_FILE}.`)
    const hash = createHash('sha256').update(`${REGISTRY_FILE}\n${plain(`export default ${call.text}`, REGISTRY_FILE)}\n`)
    if (call.callee === 'workflowTool') hash.update(`${WRAPPER_FILE}\n${wrapper}\n`)
    return { id: e.id, version: e.version, fingerprint: hash.digest('hex') }
  })
}

export const readToolsLock = (path = TOOLS_LOCK_PATH): ToolsLock => (existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as ToolsLock) : { lock_version: 1, tools: {} })

export function toolsLockProblems(lock: ToolsLock, code: readonly EntryCode[]): string[] {
  const problems: string[] = []
  for (const c of code) {
    const at = lock.tools[c.id]?.[String(c.version)]
    if (at === undefined) problems.push(`Version ${c.version} of the tool ${c.id} is not in src/tools/code.lock.json. Run npm run tools:lock.`)
    else if (at !== c.fingerprint) problems.push(`The tool ${c.id} changed under version ${c.version}. Raise its version in ${REGISTRY_FILE}, and run npm run tools:lock.`)
  }
  return problems
}

export function updateToolsLock(lock: ToolsLock, code: readonly EntryCode[]): { lock: ToolsLock; added: string[]; refused: string[] } {
  const next: ToolsLock = { lock_version: 1, tools: structuredClone(lock.tools) }
  const added: string[] = []
  const refused: string[] = []
  for (const c of code) {
    const table = (next.tools[c.id] ??= {})
    const at = table[String(c.version)]
    if (at === undefined) {
      table[String(c.version)] = c.fingerprint
      added.push(`${c.id}@${c.version}`)
    } else if (at !== c.fingerprint) refused.push(`${c.id}@${c.version}: its code changed under a locked version. Raise the version.`)
  }
  return { lock: next, added, refused }
}

function sorted(lock: ToolsLock): ToolsLock {
  const byVersion = (t: Record<string, string>) => Object.fromEntries(Object.entries(t).sort(([a], [b]) => Number(a) - Number(b)))
  return { lock_version: 1, tools: Object.fromEntries(Object.keys(lock.tools).sort().map(id => [id, byVersion(lock.tools[id]!)])) }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { lock, added, refused } = updateToolsLock(readToolsLock(), currentTools())
  for (const r of refused) console.error(`refused ${r}`)
  if (refused.length > 0) process.exit(1)
  writeFileSync(TOOLS_LOCK_PATH, `${JSON.stringify(sorted(lock), null, 2)}\n`)
  for (const a of added) console.log(`locked ${a}`)
  const problems = toolsLockProblems(lock, currentTools())
  for (const p of problems) console.error(p)
  process.exit(problems.length === 0 ? 0 : 1)
}
