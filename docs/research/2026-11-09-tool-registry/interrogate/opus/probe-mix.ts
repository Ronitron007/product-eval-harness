// tools.toggles + tools.injection rules, coded as the spec states them. Entries copy tools.registry.
type Effect = 'read' | 'paid' | 'db_write'
const REG: Record<string, { toolset: string; effects: Effect[]; openWorld: boolean; inner?: string[] }> = {
  get_node_context: { toolset: 'graph', effects: ['read'], openWorld: false },
  web_fetch: { toolset: 'research', effects: ['read', 'paid'], openWorld: true },
  // stage wrappers: "toolset stages, paid and db_write"; the stage runs the research port (web_fetch) then the drafter
  run_create_node: { toolset: 'stages', effects: ['paid', 'db_write'], openWorld: false, inner: ['web_fetch'] },
  run_create_pack: { toolset: 'stages', effects: ['paid', 'db_write'], openWorld: false, inner: ['web_fetch'] },
}
function readSnapshot(t: { tools?: Record<string, boolean>; toolsets?: Record<string, boolean>; allowEffects?: Effect[] }, consumer: string) {
  const allow = t.allowEffects ?? ['read']
  const on = Object.keys(REG).filter(id => (t.tools?.[id] ?? t.toolsets?.[REG[id].toolset] ?? true) && REG[id].effects.every(e => allow.includes(e)))
  if (consumer !== 'step' && on.some(id => REG[id].openWorld) && on.some(id => REG[id].effects.includes('db_write'))) throw new Error('refused: openWorld + db_write')
  return on
}
const fd = { toolsets: { research: false }, allowEffects: ['read', 'paid', 'db_write'] as Effect[] }
const on = readSnapshot(fd, 'agent')
console.log('front-door snapshot accepted, on =', on.join(','))
console.log('web text reaches the model through', on.filter(id => REG[id].inner?.some(i => REG[i].openWorld)).join(','), '; db_write tools on:', on.filter(id => REG[id].effects.includes('db_write')).join(','))
try { console.log('inner step toolFor(web_fetch) with the same snapshot:', on.includes('web_fetch') ? 'on' : 'OFF -> wrapper cannot research') } catch {}
try { readSnapshot({ allowEffects: ['read', 'paid', 'db_write'] }, 'mcp'); } catch (e) { console.log('snapshot that turns web_fetch on for the inner step:', (e as Error).message) }
