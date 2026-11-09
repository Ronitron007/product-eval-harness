import { buildToolServer, snapshotFromServerEnv } from '../../src/tools'
import { FIXTURE, fixtureHandles } from './fixture'

// The stdio tool server of the fixture registry, for the tests that need a slow paid tool over MCP.
const snapshot = snapshotFromServerEnv(process.env, FIXTURE)
await buildToolServer(snapshot, fixtureHandles(), FIXTURE).startStdio()
