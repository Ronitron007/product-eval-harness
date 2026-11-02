import { RuleRecord } from '../sketch'
const base = {
  id: 'units.label_unit', version: 1, statement: 'Write the amount in an allowed unit.', reason: 'The label states it.',
  scope: { nodes: 'subtree', stages: ['create_node'], fields: ['criteria[].attributes[].unit'] },
  binding: 'strict', examples: [{ output: 'mg', expected: 'pass' }], provenance: { decision_row: 'x' }, owner: 'skincare', status: 'active',
}
const show = (label: string, v: unknown) => { const r = RuleRecord.safeParse(v); console.log(label, r.success ? 'ok' : JSON.stringify(r.error.issues.map(i => [i.path.join('.'), i.message]))) }
show('shape ok:', { ...base, kind: 'shape', shape: { type: 'text', values: ['mg', 'mcg'] } })
show('shape+check:', { ...base, kind: 'shape', shape: { type: 'text' }, check: { name: 'unique_by', params: { by: 'key' } } })
show('code ok:', { ...base, kind: 'code_check', check: { name: 'unique_by', params: { by: 'key' } } })
show('code bad name:', { ...base, kind: 'code_check', check: { name: 'min_itemz', params: {} } })
show('code bad params:', { ...base, kind: 'code_check', check: { name: 'unique_by', params: { by: 'Not ok!' } } })
show('old scope:', { ...base, kind: 'shape', shape: { type: 'flag' }, scope: { ...base.scope, nodes: { node: 'skincare', descendants: true } } })
show('bad evidence:', { ...base, kind: 'shape', shape: { type: 'flag' }, examples: [{ input: { label: 'x' }, output: true, expected: 'pass' }] })
