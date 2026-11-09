import http from 'node:http'
import { webFetchTool } from '@mastra/core/tools'
let hits: string[] = []
const srv = http.createServer((req, res) => { hits.push(req.url ?? ''); if (req.url === '/redir') { res.writeHead(302, { location: `http://127.0.0.1:${(srv.address() as any).port}/secret` }); res.end(); return } res.end('LOCAL-SERVER-BODY') })
await new Promise<void>(r => srv.listen(0, '127.0.0.1', r))
const port = (srv.address() as any).port
const targets = [`http://127.0.0.1:${port}/a`, `http://localhost:${port}/a`, `http://[::1]:${port}/a`, `http://[::ffff:127.0.0.1]:${port}/a`, `http://[::ffff:7f00:1]:${port}/a`, `http://0.0.0.0:${port}/a`, `http://2130706433:${port}/a`, `http://0x7f.1:${port}/a`, `http://127.1:${port}/a`, `http://127.0.0.1.nip.io:${port}/a`, `http://localtest.me:${port}/a`, `http://[0:0:0:0:0:ffff:127.0.0.1]:${port}/a`, `http://[::127.0.0.1]:${port}/a`]
for (const u of targets) {
  const before = hits.length
  const r: any = await (webFetchTool as any).execute({ url: u }, {})
  console.log(`${u.replace(String(port), 'P')} -> ${hits.length > before ? 'REACHED LOCAL SERVER' : 'blocked'} | ${String(r.content).slice(0, 70)}`)
}
process.exit(0)
