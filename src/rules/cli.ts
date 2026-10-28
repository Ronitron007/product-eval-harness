import { join, resolve } from 'node:path'
import { LOCK_FILE, loadRuleLibrary, lockNewVersions } from './load'
import { writeLock } from './lock'

// npm run rules:check  checks each rule file and the lock, and exits 1 on a problem.
// npm run rules:lock   adds lock entries for new rule versions, then checks again.
const [command = 'check', rootArg = 'rules'] = process.argv.slice(2)
const root = resolve(rootArg)

if (command === 'lock') {
  const { lock, added, refused } = lockNewVersions(loadRuleLibrary(root))
  writeLock(join(root, LOCK_FILE), lock)
  for (const a of added) console.log(`locked ${a}`)
  for (const r of refused) console.log(`refused ${r}: its words changed under a locked version`)
}

const library = loadRuleLibrary(root)
for (const p of library.problems) console.error(`${p.file} ${p.field}: ${p.message}`)
console.log(`rules: ${library.rules.length} valid rule files, ${library.problems.length} problems`)
process.exit(library.problems.length === 0 ? 0 : 1)
