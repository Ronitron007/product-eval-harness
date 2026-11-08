// Imports src/mastra/index.ts with no HARNESS_DATABASE_URL, as a test of the registry would.
delete process.env.HARNESS_DATABASE_URL
try { await import('../../../../src/mastra/index'); console.log('P14 import -> ok') } catch (e: any) { console.log('P14 import -> threw:', String(e.message).slice(0, 100)) }
