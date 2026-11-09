// Fake Anthropic Messages API on 127.0.0.1. No model. Records every request body.
// Main-loop turns are scripted: SCRIPT env = JSON array of turns; each turn = array of content blocks.
import http from 'node:http'
import fs from 'node:fs'
const port = Number(process.env.FAKE_PORT ?? 4810)
const outDir = process.env.FAKE_OUT!
fs.mkdirSync(outDir, { recursive: true })
const script: any[][] = JSON.parse(fs.readFileSync(process.env.SCRIPT_FILE!, 'utf8'))
let turn = 0, n = 0
function sse(res: http.ServerResponse, blocks: any[], model: string) {
  res.writeHead(200, { 'content-type': 'text/event-stream' })
  const w = (ev: string, d: any) => res.write(`event: ${ev}\ndata: ${JSON.stringify(d)}\n\n`)
  const stop = blocks.some(b => b.type === 'tool_use') ? 'tool_use' : 'end_turn'
  w('message_start', { type: 'message_start', message: { id: `msg_${n}`, type: 'message', role: 'assistant', model, content: [], stop_reason: null, usage: { input_tokens: 1, output_tokens: 1 } } })
  blocks.forEach((b, i) => {
    if (b.type === 'text') {
      w('content_block_start', { type: 'content_block_start', index: i, content_block: { type: 'text', text: '' } })
      w('content_block_delta', { type: 'content_block_delta', index: i, delta: { type: 'text_delta', text: b.text } })
    } else {
      w('content_block_start', { type: 'content_block_start', index: i, content_block: { type: 'tool_use', id: b.id, name: b.name, input: {} } })
      w('content_block_delta', { type: 'content_block_delta', index: i, delta: { type: 'input_json_delta', partial_json: JSON.stringify(b.input) } })
    }
    w('content_block_stop', { type: 'content_block_stop', index: i })
  })
  w('message_delta', { type: 'message_delta', delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 1 } })
  w('message_stop', { type: 'message_stop' })
  res.end()
}
http.createServer((req, res) => {
  let body = ''
  req.on('data', c => (body += c))
  req.on('end', () => {
    n++
    fs.writeFileSync(`${outDir}/req-${String(n).padStart(3, '0')}.json`, JSON.stringify({ url: req.url, method: req.method, body: body ? JSON.parse(body) : null }, null, 1))
    if (!req.url?.startsWith('/v1/messages') || req.url.includes('count_tokens')) {
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ input_tokens: 1 })); return
    }
    const b = JSON.parse(body)
    const main = (b.tools ?? []).length > 0 || (b.system && JSON.stringify(b.system).includes('PROBE_SYSTEM'))
    if (!b.stream) { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ id: 'x', type: 'message', role: 'assistant', model: b.model, content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } })); return }
    if (main) { const blocks = script[turn] ?? [{ type: 'text', text: 'done' }]; turn++; fs.writeFileSync(`${outDir}/req-${String(n).padStart(3, '0')}.main`, String(turn)); sse(res, blocks, b.model) }
    else sse(res, [{ type: 'text', text: 'ok' }], b.model)
  })
}).listen(port, '127.0.0.1', () => console.log('fake api on', port))
