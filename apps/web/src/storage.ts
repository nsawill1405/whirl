import { get, update } from 'idb-keyval';
import { uid, type Board } from '@whirl/scene';
const key = 'whirl.boards.v1';
const activeKey = 'whirl.active-board.v1';
export async function loadBoards(): Promise<Board[] | undefined> { return get(key); }
const same = (a: Board | undefined, b: Board | undefined) => a === b || JSON.stringify(a) === JSON.stringify(b);

export function mergeBoards(stored: Board[], boards: Board[], previous: Board[]) {
  const before = new Map(previous.map(b => [b.id, b])), next = new Map(boards.map(b => [b.id, b]));
  const changed = boards.filter(b => !same(b, before.get(b.id)));
  const removed = previous.filter(b => !next.has(b.id));
  const touched = new Set([...changed, ...removed].map(b => b.id));
  const copies = stored.filter(b => touched.has(b.id) && !same(b, before.get(b.id)) && !same(b, next.get(b.id)))
    .map(b => ({ ...b, id: uid(), title: `${b.title.slice(0, 183)} (recovered copy)` }));
  const replacements = new Map(changed.map(b => [b.id, b]));
  const existing = new Set(stored.map(b => b.id));
  return {
    boards: [...changed.filter(b => !existing.has(b.id)), ...stored.filter(b => !touched.has(b.id) || next.has(b.id)).map(b => replacements.get(b.id) ?? b), ...copies],
    recovered: copies.length > 0 || changed.some(b => before.has(b.id) && !existing.has(b.id)),
  };
}

export async function saveBoards(boards: Board[], previous: Board[]): Promise<boolean> {
  let recovered = false;
  // Merge only this tab's changes inside one transaction, never a stale library snapshot.
  await update<Board[]>(key, stored => { const result = mergeBoards(stored ?? [], boards, previous); recovered = result.recovered; return result.boards; });
  return recovered;
}

export function loadActiveBoard(): string | null {
  try { const id = sessionStorage.getItem(activeKey); if (id) return id; } catch {}
  try { return localStorage.getItem(activeKey); } catch { return null; }
}
export function saveActiveBoard(id: string) {
  try { sessionStorage.setItem(activeKey, id); } catch {}
  try { localStorage.setItem(activeKey, id); } catch {}
}
