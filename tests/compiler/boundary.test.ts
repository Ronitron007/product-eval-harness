import { readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { REPO } from './files'
import { importsOf, importsOfFile } from './imports'

// boundary.internals_unreachable: code outside src/compiler/ imports src/compiler/index.ts only.
// It reads the product code in src/ and scripts/. Tests may reach an internal step, as admit.brand does.

const COMPILER = join(REPO, 'src', 'compiler')
const ALLOWED = new Set([COMPILER, join(COMPILER, 'index'), join(COMPILER, 'index.ts')])

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(e => e.isFile() && /\.(ts|mts|js|mjs)$/.test(e.name))
    .map(e => join(e.parentPath, e.name))

// The internal compiler files that one file imports, by relative path.
function internalImports(file: string, imports: readonly string[]): string[] {
  return imports
    .filter(m => m.startsWith('.'))
    .map(m => resolve(dirname(file), m).replace(/\.js$/, ''))
    .filter(p => (p === COMPILER || p.startsWith(`${COMPILER}/`)) && !ALLOWED.has(p))
    .map(p => relative(REPO, p))
}

describe('boundary', () => {
  const outside = [...sourceFiles(join(REPO, 'src')), ...sourceFiles(join(REPO, 'scripts'))].filter(f => !f.startsWith(`${COMPILER}/`))

  it('boundary.internals_unreachable: no file outside src/compiler/ imports a file of src/compiler/ other than index.ts', () => {
    expect(outside.length).toBeGreaterThan(5)
    expect(outside.flatMap(f => internalImports(f, importsOfFile(f)).map(i => `${relative(REPO, f)} -> ${i}`))).toEqual([])
    const users = outside.filter(f => importsOfFile(f).some(m => m.startsWith('.') && resolve(dirname(f), m) === COMPILER))
    expect(users.map(f => relative(REPO, f)).sort()).toEqual(['scripts/compiler-lock.ts', 'src/judge/step.ts', 'src/rules/cli.ts'])
  })

  it('boundary.internals_unreachable: an import of an internal file fails the test', () => {
    const file = join(REPO, 'src', 'rules', 'cli.ts')
    const source = "import { compileStage } from '../compiler'\nimport { admit } from '../compiler/scope'\nconst s = await import('../compiler/shape.js')\n"
    expect(internalImports(file, importsOf(source))).toEqual(['src/compiler/scope', 'src/compiler/shape'])
  })
})
