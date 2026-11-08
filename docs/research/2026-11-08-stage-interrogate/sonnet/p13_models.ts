import { checkModels } from './proto_workflow'
for (const [d, j] of [['anthropic/claude-opus', 'anthropic/claude-sonnet'], ['anthropic/claude-opus', 'openrouter/anthropic/claude-sonnet']] as const) { try { checkModels(d, j); console.log(d, '+', j, '-> accepted') } catch (e: any) { console.log(d, '+', j, '-> refused:', e.message) } }
