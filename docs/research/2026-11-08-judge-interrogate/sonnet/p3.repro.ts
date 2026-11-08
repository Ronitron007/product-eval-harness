import { it } from 'vitest'
import { writeSync } from 'node:fs'
import { planOf } from '../compiler/library'
import { GOOD_OUTPUT } from '../compiler/rules'
it('hash of plan + decode of extra key', () => {
  const plan = planOf()
  const d = plan.decode({ ...GOOD_OUTPUT, extra: 1 })
  writeSync(1, `\nRESULT hash=${plan.ruleSetHash.slice(0, 16)} decode(extra key).ok=${d.ok}\n`)
})
