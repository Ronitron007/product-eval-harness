import { z } from 'zod'
const Toolset = z.enum(['graph', 'research', 'stages'])
const ToolIdSchema = z.enum(['get_node_context', 'run_create_node', 'web_fetch'])
const EFFECTS = ['read', 'paid', 'db_write'] as const
const Toggles = z.object({
  toolsets: z.record(Toolset, z.boolean()).optional(),
  tools: z.record(ToolIdSchema, z.boolean()).optional(),
  allowEffects: z.array(z.enum(EFFECTS)).optional(),
}).strict()
for (const j of ['{"tools":{"run_create_node":true},"allowEffects":["read","paid","db_write"]}', '{"toolsets":{"research":false}}', '{"tools":{"nope":true}}']) {
  const r = Toggles.safeParse(JSON.parse(j))
  console.log(j, '->', r.success ? 'OK' : 'REFUSED: ' + r.error.issues.map(i => i.message + ' @' + i.path.join('.')).join('; '))
}
