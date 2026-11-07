// The worked example of the explainer video "The product eval harness: what Mastra gives us, and
// how the design uses it". It runs the real loader, lock, compiler and code scorers of this repo
// on the fixture rules in ./rules. It makes no network call and no model call: fetch throws, and
// the judge uses createMockModel, so each judge verdict below is ILLUSTRATIVE.
//
// Run from the repo root:
//   node_modules/.bin/tsx docs/explainers/2026-11-07-harness-mastra/worked-example/run.ts
//
// It writes nothing in the repo. Each rules folder is a copy in a temporary folder, which it deletes.

import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createMockModel } from '@mastra/core/test-utils/llm-mock'
import { z } from 'zod'
import { auditLibrary, compileStage, type JudgeModel, type TreeNode } from '../../../../src/compiler'
import { LOCK_FILE, loadRuleLibrary, lockNewVersions } from '../../../../src/rules/load'
import { writeLock } from '../../../../src/rules/lock'

globalThis.fetch = (() => {
  throw new Error('The worked example makes no network call.')
}) as typeof fetch

const HERE = import.meta.dirname
const temps: string[] = []

// A copy of ./rules, plus extra files, locked as `npm run rules:lock` does.
function lockedCopy(extra: Record<string, string> = {}, edit?: (root: string) => void) {
  const root = mkdtempSync(join(tmpdir(), 'explainer-rules-'))
  temps.push(root)
  cpSync(join(HERE, 'rules'), root, { recursive: true })
  for (const [to, from] of Object.entries(extra)) cpSync(join(HERE, from), join(root, to))
  writeLock(join(root, LOCK_FILE), lockNewVersions(loadRuleLibrary(root)).lock)
  edit?.(root)
  return root
}

const TREE: TreeNode[] = [
  { id: 'skincare', parentId: null, level: 'domain' },
  { id: 'sunscreen', parentId: 'skincare', level: 'inner' },
  { id: 'moisturizer', parentId: 'skincare', level: 'inner' },
]

const LABEL = 'Zinc oxide 200 mg in each gram. Free gift sachet 500 mg with each order.'
const EVIDENCE = { sources: { label: LABEL } }

// Draft A: three faults. The unit mcg (the skincare rule allows it, the sunscreen rule does not),
// a quote that is not word for word on the label, and an extra key that no rule owns.
const DRAFT_A = { attributes: [{ key: 'zinc_oxide', amount: 200, unit: 'mcg', quote: 'zinc oxide 200mg', grade: 'A' }] }
// Draft B: good.
const DRAFT_B = { attributes: [{ key: 'zinc_oxide', amount: 200, unit: 'mg', quote: 'Zinc oxide 200 mg' }] }
// Draft C: passes every code check, but one attribute is a promotion, not the product.
const DRAFT_C = {
  attributes: [
    { key: 'zinc_oxide', amount: 200, unit: 'mg', quote: 'Zinc oxide 200 mg' },
    { key: 'gift_sachet', amount: 500, unit: 'mg', quote: 'Free gift sachet 500 mg' },
  ],
}

const answer = (target: string, a: 'yes' | 'no' | 'unknown', quote: string, reason: string) => ({ target, answer: a, quote, reason })
function mockJudge(items: unknown[]): JudgeModel {
  return { id: 'mock/judge', model: createMockModel({ version: 'v2', objectGenerationMode: 'json', mockText: { items } }) as never }
}

const show = (title: string) => console.log(`\n===== ${title} =====`)
const rowsOf = (rows: readonly { ruleId: string; ruleVersion: number; target: string; verdict: string; decider: unknown; reason: string; evidence?: unknown }[]) =>
  rows.map(r => ({ rule: `${r.ruleId}@${r.ruleVersion}`, target: r.target, verdict: r.verdict, decider: r.decider, reason: r.reason, evidence: r.evidence }))

async function main() {
  // The library and its lock.
  const root = lockedCopy()
  const library = loadRuleLibrary(root)
  show('library: rule files and loader problems')
  console.log(library.rules.map(r => `${r.file}  ${r.rule.kind}  ${r.rule.binding}  hash ${r.hash}`).join('\n'))
  console.log(`loader problems: ${library.problems.length}`)
  show('rules.lock.json (as npm run rules:lock writes it)')
  console.log(readFileSync(join(root, LOCK_FILE), 'utf8').trim())

  // The compile at sunscreen.
  const compiled = compileStage({ stage: 'create_node', node: 'sunscreen', library, derived: [], tree: TREE })
  if (!compiled.ok) throw new Error(`refused: ${JSON.stringify(compiled.problems, null, 2)}`)
  const plan = compiled.plan
  show('compileStage at sunscreen, create_node: ruleSetHash')
  console.log(plan.ruleSetHash)
  show('instructions')
  console.log(plan.instructions)
  show('schema (z.toJSONSchema of plan.schema)')
  console.log(JSON.stringify(z.toJSONSchema(plan.schema), null, 2))
  show('ledger')
  console.log(plan.ledger.map(e => `${e.rule}@${e.version}  ${e.origin}  ${JSON.stringify(e.disposition)}`).join('\n'))
  show('scorers')
  console.log(`code: ${plan.scorers.code.map(s => s.id).join(', ')}`)
  console.log(`judge: ${plan.manifest.scorers.filter(s => s.decider === 'judge').map(s => `${s.id} promptHash ${s.judgePromptHash}`).join(', ')}`)
  show('manifest.rules (what the hash covers, with schema, instructions, scorers, code versions)')
  console.log(JSON.stringify(plan.manifest.rules, null, 2))
  console.log(JSON.stringify(plan.manifest.code))

  // The same inputs give the same hash. Another node gives another hash.
  const again = compileStage({ stage: 'create_node', node: 'sunscreen', library: loadRuleLibrary(root), derived: [], tree: [...TREE].reverse() })
  show('compile again, tree in another order')
  console.log(again.ok ? `${again.plan.ruleSetHash}  same: ${again.plan.ruleSetHash === plan.ruleSetHash}` : 'refused')
  const moist = compileStage({ stage: 'create_node', node: 'moisturizer', library, derived: [], tree: TREE })
  show('compile at moisturizer, create_node')
  if (moist.ok) {
    console.log(`${moist.plan.ruleSetHash}  same as sunscreen: ${moist.plan.ruleSetHash === plan.ruleSetHash}`)
    console.log(moist.plan.ledger.filter(e => e.rule === 'units.mass_only').map(e => `${e.rule}@${e.version}  ${JSON.stringify(e.disposition)}`).join('\n'))
    console.log(moist.plan.instructions.split('\n').filter(l => l.includes('Shape: text, one of')).join('\n'))
  }

  // Draft A: the decode gate, the code scorers, and the skipped judges.
  show('draft A: the raw reply')
  console.log(JSON.stringify(DRAFT_A))
  const decodedA = plan.decode(JSON.stringify(DRAFT_A))
  show('draft A: plan.decode')
  console.log(JSON.stringify(decodedA.ok ? { ok: true } : { ok: false, issues: decodedA.issues }, null, 2))
  const rawA = decodedA.ok ? decodedA.output : decodedA.raw
  const codeA = (await Promise.all(plan.scorers.code.map(s => s.verify(rawA, EVIDENCE)))).flat()
  show('draft A: code scorer rows (real, no model)')
  console.log(JSON.stringify(rowsOf(codeA), null, 2))
  const strictCodeOkA = codeA.every(r => r.binding !== 'strict' || r.verdict === 'pass')
  show('draft A: do the judges run?')
  console.log(`decode ok: ${decodedA.ok}, each strict code verdict pass: ${strictCodeOkA}`)
  console.log(JSON.stringify(rowsOf(plan.scorers.skippedJudges('The output broke the schema or a strict code check, so no judge ran.')), null, 2))

  // Draft C: the code scorers pass, and the judge (a mock) answers.
  const decodedC = plan.decode(JSON.stringify(DRAFT_C))
  const codeC = (await Promise.all(plan.scorers.code.map(s => s.verify(decodedC.ok ? decodedC.output : decodedC.raw, EVIDENCE)))).flat()
  show('draft C: plan.decode, and the code scorer verdicts (real)')
  console.log(`decode ok: ${decodedC.ok}`)
  console.log(codeC.map(r => `${r.ruleId}@${r.ruleVersion}  ${r.target}  ${r.verdict}`).join('\n'))
  const judgeC = mockJudge([
    answer('attributes[0]', 'yes', 'Zinc oxide 200 mg in each gram.', 'Zinc oxide is an active ingredient of the product.'),
    answer('attributes[1]', 'no', 'Free gift sachet 500 mg with each order.', 'A gift with an order is a promotion, not a property of the product.'),
  ])
  const judgeRowsC = await plan.scorers.judges(judgeC)[0]!.verify(DRAFT_C, EVIDENCE)
  show('draft C: judge rows (ILLUSTRATIVE: a mock model gives the answers)')
  console.log(JSON.stringify(rowsOf(judgeRowsC), null, 2))

  // Draft B: everything passes.
  const decodedB = plan.decode(JSON.stringify(DRAFT_B))
  const codeB = (await Promise.all(plan.scorers.code.map(s => s.verify(decodedB.ok ? decodedB.output : decodedB.raw, EVIDENCE)))).flat()
  show('draft B: plan.decode, and the code scorer rows (real)')
  console.log(`decode ok: ${decodedB.ok}`)
  console.log(JSON.stringify(rowsOf(codeB), null, 2))
  const judgeB = mockJudge([answer('attributes[0]', 'yes', 'Zinc oxide 200 mg in each gram.', 'Zinc oxide is an active ingredient of the product.')])
  show('draft B: judge rows (ILLUSTRATIVE: a mock model gives the answer)')
  console.log(JSON.stringify(rowsOf(await plan.scorers.judges(judgeB)[0]!.verify(DRAFT_B, EVIDENCE)), null, 2))

  // Draft B with no label text: cannot verify, from code.
  show('draft B with no label text in the evidence: the quote check (real)')
  const quoteScorer = plan.scorers.code.find(s => s.id === 'quotes.from_label@1')!
  console.log(JSON.stringify(rowsOf(await quoteScorer.verify(DRAFT_B, {})), null, 2))

  // The widening child is refused. The sunscreen folder holds only the widening rule.
  const widenOnly = mkdtempSync(join(tmpdir(), 'explainer-widen-'))
  temps.push(widenOnly)
  cpSync(join(HERE, 'rules', 'skincare'), join(widenOnly, 'skincare'), { recursive: true })
  cpSync(join(HERE, 'variants'), join(widenOnly, 'sunscreen'), { recursive: true })
  writeLock(join(widenOnly, LOCK_FILE), lockNewVersions(loadRuleLibrary(widenOnly)).lock)
  const widen = compileStage({ stage: 'create_node', node: 'sunscreen', library: loadRuleLibrary(widenOnly), derived: [], tree: TREE })
  show('a sunscreen child rule that widens to [mg, IU]: compileStage at sunscreen')
  console.log(JSON.stringify(widen.ok ? { ok: true, hash: widen.plan.ruleSetHash } : { ok: false, problems: widen.problems }, null, 2))

  // The CI audit (npm run rules:check) has no tree: it runs the golden examples, and no weaken test.
  show('auditLibrary with tree unknown (the CI view): the fixture library, then the widening library')
  console.log(JSON.stringify(await auditLibrary({ library, derived: [], tree: 'unknown' })))
  console.log(JSON.stringify(await auditLibrary({ library: loadRuleLibrary(widenOnly), derived: [], tree: 'unknown' })))
  show('auditLibrary with the tree: the widening library')
  console.log(JSON.stringify((await auditLibrary({ library: loadRuleLibrary(widenOnly), derived: [], tree: TREE })).map(p => `${p.code} ${p.rules.join(' ')}`)))

  // A rule change: changed words under a locked version are refused; a new version is added.
  const editRoot = lockedCopy({}, r => {
    const f = join(r, 'skincare', 'units.label_unit.yaml')
    writeFileSync(f, readFileSync(f, 'utf8').replace('Write the amount in the unit that the label prints.', 'Write the amount in the exact unit that the label prints.'))
  })
  show('rule change: new words under version 1 (no version raise)')
  console.log(loadRuleLibrary(editRoot).problems.map(p => `${p.file} ${p.field}: ${p.message}`).join('\n'))
  const bumpRoot = lockedCopy({}, r => {
    const f = join(r, 'skincare', 'units.label_unit.yaml')
    writeFileSync(
      f,
      readFileSync(f, 'utf8')
        .replace('Write the amount in the unit that the label prints.', 'Write the amount in the exact unit that the label prints.')
        .replace('version: 1', 'version: 2\nsupersedes: 1'),
    )
  })
  const bumped = lockNewVersions(loadRuleLibrary(bumpRoot))
  writeLock(join(bumpRoot, LOCK_FILE), bumped.lock)
  const bumpLib = loadRuleLibrary(bumpRoot)
  show('rule change: version 2 with supersedes 1, then rules:lock')
  console.log(`added: ${bumped.added.join(', ')}`)
  console.log(`loader problems: ${bumpLib.problems.length}`)
  console.log(JSON.stringify(bumped.lock.rules['units.label_unit'], null, 2))
  const recompiled = compileStage({ stage: 'create_node', node: 'sunscreen', library: bumpLib, derived: [], tree: TREE })
  console.log(recompiled.ok ? `new ruleSetHash ${recompiled.plan.ruleSetHash}  same as before: ${recompiled.plan.ruleSetHash === plan.ruleSetHash}` : 'refused')
}

try {
  await main()
} finally {
  for (const t of temps) rmSync(t, { recursive: true, force: true })
}
