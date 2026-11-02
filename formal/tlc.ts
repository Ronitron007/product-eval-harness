import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

export async function tla2tools(): Promise<string> {
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

export async function java(): Promise<string> {
  const bin = process.env.JAVA ?? 'java'
  try {
    await run(bin, ['-version'])
  } catch {
    throw new Error(`Cannot run ${bin} -version. Install Java 11 or later, or set JAVA to a java binary.`)
  }
  return bin
}

const SECTIONS = /^(CONSTANTS?|INIT|NEXT|SPECIFICATION|INVARIANTS?|PROPERT(Y|IES)|CONSTRAINTS?|ACTION_CONSTRAINTS?|CHECK_DEADLOCK|SYMMETRY|VIEW|ALIAS|POSTCONDITION)\b/
const RULE_SECTIONS = /^(INVARIANTS?|PROPERT(Y|IES))\b/

// The config with no INVARIANT and no PROPERTY section.
function noRuleConfig(config: string): string {
  let drop = false
  const out: string[] = []
  for (const line of config.split('\n')) {
    const head = line.trim()
    if (SECTIONS.test(head)) drop = RULE_SECTIONS.test(head)
    if (!drop) out.push(line)
  }
  return `${out.join('\n')}\n`
}

// The config with one rule: each INVARIANT and PROPERTY section of the config is replaced.
export function oneRuleConfig(config: string, rule: ModelRule): string {
  return `${noRuleConfig(config)}${rule.kind} ${rule.rule}\n`
}

// The names in the INVARIANT and PROPERTY sections of a config.
export function configRules(config: string): string[] {
  const names: string[] = []
  let take = false
  for (const line of config.split('\n')) {
    const head = line.replace(/\\\*.*$/, '').trim()
    if (SECTIONS.test(head)) {
      take = RULE_SECTIONS.test(head)
      names.push(...(take ? head.split(/\s+/).slice(1) : []))
    } else if (take && head) names.push(...head.split(/\s+/))
  }
  return names
}

// Each config in formal/models/ must have a row for each of its rules in formal/expectations.ts.
export function rulesWithNoExpectation(): string[] {
  const missing: string[] = []
  for (const file of readdirSync(MODELS).filter(f => f.endsWith('.cfg'))) {
    const config = file.replace(/\.cfg$/, '')
    for (const rule of configRules(readFileSync(join(MODELS, file), 'utf8'))) {
      if (!MODEL_RULES.some(r => r.config === config && r.rule === rule)) missing.push(`${config}.${rule}`)
    }
  }
  return missing
}

export async function check(rule: ModelRule, javaBin: string, jar: string): Promise<{ result: Result | 'error'; detail: string }> {
  const dir = mkdtempSync(join(tmpdir(), 'formal-tlc-'))
  try {
    copyFileSync(join(MODELS, `${rule.model}.tla`), join(dir, `${rule.model}.tla`))
    writeFileSync(join(dir, 'one.cfg'), oneRuleConfig(readFileSync(join(MODELS, `${rule.config}.cfg`), 'utf8'), rule))
    // Each JVM gets its own tmpdir: TLC unpacks its standard modules there, and runs in parallel race.
    const args = ['-XX:+UseParallelGC', `-Djava.io.tmpdir=${dir}`, '-cp', jar, 'tlc2.TLC', '-workers', '1', '-metadir', join(dir, 'states'), '-config', 'one.cfg', `${rule.model}.tla`]
    const { out, err } = await run(javaBin, args, { cwd: dir, maxBuffer: 64 * 1024 * 1024 }).then(
      r => ({ out: r.stdout, err: r.stderr }),
      (e: { stdout?: string; stderr?: string; message?: string }) => ({ out: e.stdout ?? '', err: e.stderr || e.message || '' }),
    )
    if (/Model checking completed\. No error has been found\./.test(out)) return { result: 'holds', detail: '' }
    if (new RegExp(`(Invariant|Action property|Temporal properties|Property) ${rule.rule} is violated|Temporal properties were violated`).test(out)) {
      // The path that TLC found, for a break that the expectations do not list.
      const from = out.indexOf('The behavior up to this point is:')
      return { result: 'breaks', detail: from < 0 ? '' : out.slice(from).split('\n').slice(0, 60).join('\n') }
    }
    const tail = (s: string) => s.split('\n').filter(l => l.trim()).slice(-6)
    return { result: 'error', detail: [...tail(out), ...tail(err)].join('\n') }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// Each distinct state of a model, from TLC -dump, as plain values: strings, booleans and records.
export async function dumpStates(model: string, config: string): Promise<Record<string, unknown>[]> {
  const [javaBin, jar] = await Promise.all([java(), tla2tools()])
  const dir = mkdtempSync(join(tmpdir(), 'formal-dump-'))
  try {
    copyFileSync(join(MODELS, `${model}.tla`), join(dir, `${model}.tla`))
    writeFileSync(join(dir, 'dump.cfg'), noRuleConfig(readFileSync(join(MODELS, `${config}.cfg`), 'utf8')))
    const args = [`-Djava.io.tmpdir=${dir}`, '-cp', jar, 'tlc2.TLC', '-workers', '1', '-dump', join(dir, 'states'), '-metadir', join(dir, 'meta'), '-config', 'dump.cfg', `${model}.tla`]
    await run(javaBin, args, { cwd: dir, maxBuffer: 64 * 1024 * 1024 })
    return parseDump(readFileSync(join(dir, 'states.dump'), 'utf8'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// Reads the dump format: "State n:" then "/\\ name = value" lines. A value is a string,
// TRUE, FALSE, a number, or a record [key |-> value, ...].
export function parseDump(text: string): Record<string, unknown>[] {
  return text
    .split(/^State \d+:$/m)
    .filter(b => b.trim())
    .map(block => {
      const state: Record<string, unknown> = {}
      for (const part of block.split(/^\/\\ /m).filter(p => p.trim())) {
        const at = part.indexOf(' = ')
        state[part.slice(0, at).trim()] = parseValue(part.slice(at + 3).replace(/\s+/g, ' ').trim())
      }
      return state
    })
}

function parseValue(text: string): unknown {
  let i = 0
  const skip = () => {
    while (text[i] === ' ') i++
  }
  const value = (): unknown => {
    skip()
    if (text[i] === '"') {
      const end = text.indexOf('"', i + 1)
      const s = text.slice(i + 1, end)
      i = end + 1
      return s
    }
    if (text[i] === '[') {
      i++
      const rec: Record<string, unknown> = {}
      for (;;) {
        skip()
        if (text[i] === ']') return i++, rec
        const arrow = text.indexOf('|->', i)
        const key = text.slice(i, arrow).trim()
        i = arrow + 3
        rec[key] = value()
        skip()
        if (text[i] === ',') i++
      }
    }
    const word = /^(TRUE|FALSE|-?\d+)/.exec(text.slice(i))
    if (!word) throw new Error(`Cannot read the TLC value at: ${text.slice(i, i + 40)}`)
    i += word[0].length
    return word[0] === 'TRUE' ? true : word[0] === 'FALSE' ? false : Number(word[0])
  }
  return value()
}

async function main() {
  const missing = rulesWithNoExpectation()
  if (missing.length) {
    console.log(`FAIL these rules of formal/models/*.cfg have no row in formal/expectations.ts: ${missing.join(', ')}`)
    process.exit(1)
  }
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
