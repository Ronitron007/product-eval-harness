#!/usr/bin/env node
// A fake claude CLI: answers the SDK control handshake, then replays an ndjson file. No model, no network.
import fs from 'node:fs'
import readline from 'node:readline'
const file = process.env.REPLAY_FILE
const patch = process.env.REPLAY_PATCH ? JSON.parse(process.env.REPLAY_PATCH) : null
fs.appendFileSync(process.env.REPLAY_ARGV_OUT ?? '/dev/null', JSON.stringify(process.argv.slice(2)) + '\n')
const rl = readline.createInterface({ input: process.stdin })
let sent = false
rl.on('line', l => {
  let m; try { m = JSON.parse(l) } catch { return }
  if (m.type === 'control_request') {
    process.stdout.write(JSON.stringify({ type: 'control_response', response: { subtype: 'success', request_id: m.request_id, response: { commands: [], agents: [], output_style: 'default', available_output_styles: [], models: [], account: {} } } }) + '\n')
  } else if (m.type === 'user' && !sent) {
    sent = true
    for (const x of fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
      let o = JSON.parse(x)
      if (patch && o.type === 'result') o = { ...o, ...patch }
      o.uuid ??= crypto.randomUUID(); o.session_id ??= 's1'
      process.stdout.write(JSON.stringify(o) + '\n')
    }
    setTimeout(() => process.exit(0), 200)
  }
})
