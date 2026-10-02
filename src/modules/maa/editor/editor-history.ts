import type { ScriptDocument } from '../../../shared/api/maa-script-editor'

export function appendHistory(
  history: readonly ScriptDocument[], cursor: number, document: ScriptDocument,
): { snapshots: ScriptDocument[]; cursor: number } {
  const snapshots = [...history.slice(0, cursor + 1), cloneDocument(document)].slice(-50)
  return { snapshots, cursor: snapshots.length - 1 }
}

export function restoreHistory(history: readonly ScriptDocument[], index: number): ScriptDocument | undefined {
  const snapshot = history[index]
  return snapshot === undefined ? undefined : cloneDocument(snapshot)
}

function cloneDocument(document: ScriptDocument): ScriptDocument {
  return JSON.parse(JSON.stringify(document)) as ScriptDocument
}
