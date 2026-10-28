import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { LOCK_FILE, loadRuleLibrary, lockNewVersions } from './load'
import { readLock, writeLock } from './lock'

// npm run rules:check [-- --base <lock file>]  checks each rule file and the lock, and exits 1 on a problem.
//   With --base, the lock must also hold each entry of the base lock, such as the lock of main.
// npm run rules:lock  adds lock entries for new, valid rule versions, then checks again.
const args = process.argv.slice(2)
const command = args[0] ?? 'check'
const root = resolve(args[1] ?? 'rules')
const baseAt = args.indexOf('--base')
const basePath = baseAt >= 0 ? args[baseAt + 1] : undefined
if (baseAt >= 0 && (!basePath || !existsSync(basePath))) {
  console.error(`--base needs an existing lock file. Got ${basePath ?? 'nothing'}.`)
  process.exit(1)
}
const baseLock = basePath ? readLock(basePath) : undefined

if (command === 'lock') {
  const current = loadRuleLibrary(root)
  const lockProblem = current.problems.find(p => p.file === LOCK_FILE && p.field === '(file)')
  if (lockProblem) {
    console.error(`${LOCK_FILE}: ${lockProblem.message} Fix the lock by hand; rules:lock never rewrites a lock that it cannot read.`)
    process.exit(1)
  }
  const { lock, added, refused } = lockNewVersions(current)
  writeLock(join(root, LOCK_FILE), lock)
  for (const a of added) console.log(`locked ${a}`)
  for (const r of refused) console.log(`refused ${r}`)
}

const library = loadRuleLibrary(root, { baseLock })
for (const p of library.problems) console.error(`${p.file} ${p.field}: ${p.message}`)
console.log(`rules: ${library.rules.length} valid rule files, ${library.problems.length} problems${baseLock ? ', checked against the base lock' : ''}`)
process.exit(library.problems.length === 0 ? 0 : 1)
