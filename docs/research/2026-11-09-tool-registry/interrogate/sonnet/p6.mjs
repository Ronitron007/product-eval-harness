import { createRequire } from 'node:module'
import crypto from 'node:crypto'
const m = createRequire('<repo>/package.json')('canonicalize'); const canonicalize = m.default ?? m.canonicalize ?? m
const man = [{ id: 'web_fetch', toolset: 'research', effects: ['read'], openWorld: true }, { id: 'run_create_node', toolset: 'stages', effects: ['paid','db_write'], openWorld: false }]
const toggles = { toolsets: { graph: true, research: true, stages: true }, tools: {}, allowEffects: ['read','paid','db_write'] }
const on = ['run_create_node', 'web_fetch']
const h = (extra, manifest) => crypto.createHash('sha256').update(canonicalize({ toggles, on, manifest, ...extra })).digest('hex').slice(0, 12)
// spec: hash = sha256(RFC8785 { toggles, on, manifest }); consumer and runId are NOT in it
console.log('consumer=step  hash', h({}, man))
console.log('consumer=agent hash', h({}, man), '(same: consumer not covered)')
// a new registry entry that is OFF changes the manifest, so the stored hash no longer matches the recomputed one
console.log('after registry gains an off tool:', h({}, [...man, { id: 'search_records', toolset: 'research', effects: ['read'], openWorld: false }]))
// spec case: mix refused for consumer mcp|agent only
const mix = man.some(m => m.openWorld) && man.some(m => m.effects.includes('db_write'))
console.log('openWorld+db_write both on:', mix, '-> refused only if consumer in {mcp,agent}; "step" is allowed')
