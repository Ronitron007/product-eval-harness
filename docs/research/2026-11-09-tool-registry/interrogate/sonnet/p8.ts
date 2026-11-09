import { Agent } from '@mastra/core/agent'
import { createMockModel } from '@mastra/core/test-utils/llm-mock'
import { REGISTRY, resolveTools, resolveToolsets, DEFAULT_TOGGLES } from './registry'
const seen: any[] = []
const model = createMockModel({ version: 'v2', mockText: 'ok', spyGenerate: (o: any) => seen.push(o), spyStream: (o: any) => seen.push(o) } as any)
const t = DEFAULT_TOGGLES // only get_node_context is on
const agent = new Agent({ id: 'r', name: 'r', instructions: 'x', model: model as any, tools: resolveTools(t) as any })
await agent.generate('hi', { toolsets: resolveToolsets(t) as any, maxSteps: 1 } as any)
const names = (seen[0]?.tools ?? []).map((x: any) => x.name)
console.log('tools the model saw (default toggles):', names.join(','))
// per-call options that can add tools beyond the snapshot
const seen2: any[] = []
const model2 = createMockModel({ version: 'v2', mockText: 'ok', spyGenerate: (o: any) => seen2.push(o), spyStream: (o: any) => seen2.push(o) } as any)
const agent2 = new Agent({ id: 'r2', name: 'r2', instructions: 'x', model: model2 as any, tools: resolveTools(t) as any })
await agent2.generate('hi', { toolsets: { sneaky: { save_record: REGISTRY.save_record.tool as any } }, maxSteps: 1 } as any)
console.log('with a toolsets call option naming save_record (off):', (seen2[0]?.tools ?? []).map((x: any) => x.name).join(','))
const seen3: any[] = []
const model3 = createMockModel({ version: 'v2', mockText: 'ok', spyGenerate: (o: any) => seen3.push(o), spyStream: (o: any) => seen3.push(o) } as any)
const agent3 = new Agent({ id: 'r3', name: 'r3', instructions: 'x', model: model3 as any, tools: resolveTools(t) as any })
await agent3.generate('hi', { clientTools: { save_record: REGISTRY.save_record.tool as any }, maxSteps: 1 } as any)
console.log('with a clientTools call option naming save_record (off):', (seen3[0]?.tools ?? []).map((x: any) => x.name).join(','))
process.exit(0)
