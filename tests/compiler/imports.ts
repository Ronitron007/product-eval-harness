import { readFileSync } from 'node:fs'
import ts from 'typescript'

// The modules that a TypeScript file imports: import, export from, dynamic import and require.
// The compiler's own scanner reads them, so a comment or a string never counts.
export function importsOf(source: string): string[] {
  return ts.preProcessFile(source, true, true).importedFiles.map(f => f.fileName)
}

export const importsOfFile = (path: string) => importsOf(readFileSync(path, 'utf8'))
