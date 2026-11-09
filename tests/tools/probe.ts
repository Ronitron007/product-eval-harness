import type { PaidDoor, ReadStore } from '../../src/tools'

// Handles that throw on each use, to build a tool and read its schemas.
const no = () => {
  throw new Error('A probe handle was used.')
}
export const PROBE: { store: ReadStore; paid: PaidDoor; write: () => never } = { store: { pathToRoot: no, siblings: no, subtree: no }, paid: { call: no }, write: no }
