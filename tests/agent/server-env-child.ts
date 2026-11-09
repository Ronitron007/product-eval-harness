import { prepareServerProcess } from '../../src/tools'

// secret_argv.server_keeps_named_keys_only: the start of the tool server process, then the names
// of the keys that it keeps. It prints names only, never a value.
const snapshot = prepareServerProcess(process.env)
process.stdout.write(JSON.stringify({ runId: snapshot.runId, keys: Object.keys(process.env).sort() }))
