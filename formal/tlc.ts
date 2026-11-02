import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { MODEL_RULES, type ModelRule, type Result } from './expectations'

// npm run formal:tla  checks each rule of formal/models/ with TLC, one rule for each run, and
// compares the result with formal/expectations.ts. It exits 1 when a result differs.
//   JAVA       a Java 11 or later binary. Default: java on PATH.
//   TLA2TOOLS  the path of tla2tools.jar. Default: the pinned release in node_modules/.cache,
//              which the first run downloads and checks against its sha256.

const run = promisify(execFile)
const MODELS = join(import.meta.dirname, 'models')
const TLA2TOOLS_VERSION = '1.7.4'
const TLA2TOOLS_URL = `https://github.com/tlaplus/tlaplus/releases/download/v${TLA2TOOLS_VERSION}/tla2tools.jar`
const TLA2TOOLS_SHA256 = '936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88'
const CACHE = join(import.meta.dirname, '..', 'node_modules', '.cache', 'tla2tools', TLA2TOOLS_VERSION, 'tla2tools.jar')

async function tla2tools(): Promise<string> {
  if (process.env.TLA2TOOLS) return process.env.TLA2TOOLS
  if (!existsSync(CACHE)) {
    const res = await fetch(TLA2TOOLS_URL)
    if (!res.ok) throw new Error(`Cannot download ${TLA2TOOLS_URL}: HTTP ${res.status}. Set TLA2TOOLS to a local tla2tools.jar.`)
    const jar = Buffer.from(await res.arrayBuffer())
    const got = createHash('sha256').update(jar).digest('hex')
    if (got !== TLA2TOOLS_SHA256) throw new Error(`${TLA2TOOLS_URL} has sha256 ${got}, not ${TLA2TOOLS_SHA256}.`)
    mkdirSync(dirname(CACHE), { recursive: true })
    writeFileSync(CACHE, jar)
  }
  return CACHE
}

async function java(): Promise<string> {
  const bin = process.env.JAVA ?? 'java'
  try {
    await run(bin, ['-version'])
  } catch {
    throw new Error(`Cannot run ${bin} -version. Install Java 11 or later, or set JAVA to a java binary.`)
  }
  return bin
}

// The config with one rule: each INVARIANT and PROPERTY section of the config is replaced.
export function oneRuleConfig(config: string, rule: ModelRule): string {
  const sections = /^(CONSTANTS?|INIT|NEXT|SPECIFICATION|INVARIANTS?|PROPERT(Y|IES)|CONSTRAINTS?|ACTION_CONSTRAINTS?|CHECK_DEADLOCK|SYMMETRY|VIEW)\b/
  const dropped = /^(INVARIANTS?|PROPERT(Y|IES))\b/
  let drop = false
  const out: string[] = []
  for (const line of config.split('\n')) {
    const head = line.trim()
    if (sections.test(head)) drop = dropped.test(head)
    if (!drop) out.push(line)
  }
  out.push(`${rule.kind} ${rule.rule}`)
  return `${out.join('\n')}\n`
}

export async function check(rule: ModelRule, javaBin: string, jar: string): Promise<{ result: Result | 'error'; detail: string }> {
  const dir = mkdtempSync(join(tmpdir(), 'formal-tlc-'))
  try {
    copyFileSync(join(MODELS, `${rule.model}.tla`), join(dir, `${rule.model}.tla`))
    writeFileSync(join(dir, 'one.cfg'), oneRuleConfig(readFileSync(join(MODELS, `${rule.config}.cfg`), 'utf8'), rule))
    const args = ['-XX:+UseParallelGC', '-cp', jar, 'tlc2.TLC', '-workers', '1', '-metadir', join(dir, 'states'), '-config', 'one.cfg', `${rule.model}.tla`]
    const out = await run(javaBin, args, { cwd: dir, maxBuffer: 64 * 1024 * 1024 }).then(
      r => r.stdout,
      (e: { stdout?: string }) => e.stdout ?? '',
    )
    if (/Model checking completed\. No error has been found\./.test(out)) return { result: 'holds', detail: '' }
    if (new RegExp(`(Invariant|Action property|Temporal properties|Property) ${rule.rule} is violated|Temporal properties were violated`).test(out)) {
      return { result: 'breaks', detail: '' }
    }
    return { result: 'error', detail: out.split('\n').filter(l => /error|Error|violated|Deadlock/.test(l)).slice(0, 6).join('\n') }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

async function main() {
  const [javaBin, jar] = await Promise.all([java(), tla2tools()])
  const results: { rule: ModelRule; result: Result | 'error'; detail: string }[] = []
  const queue = [...MODEL_RULES]
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (let r = queue.shift(); r; r = queue.shift()) results.push({ rule: r, ...(await check(r, javaBin, jar)) })
    }),
  )
  results.sort((a, b) => MODEL_RULES.indexOf(a.rule) - MODEL_RULES.indexOf(b.rule))
  let wrong = 0
  for (const { rule, result, detail } of results) {
    const ok = result === rule.expect
    if (!ok) wrong++
    const finding = rule.finding ? `  (${rule.finding})` : ''
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${rule.config}.${rule.rule}: ${result}, expected ${rule.expect}${finding}`)
    if (!ok && result === 'breaks') console.log('     A rule that held now breaks: a new bug or a wrong model. Read the path with /statechart.')
    if (!ok && result === 'holds') console.log('     A finding no longer breaks: if a fix landed, set it to holds in formal/expectations.ts.')
    if (detail) console.log(detail.replace(/^/gm, '     '))
  }
  console.log(`formal:tla: ${results.length} rules, ${wrong} not as expected`)
  process.exit(wrong === 0 ? 0 : 1)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
