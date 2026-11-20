import { get, set } from 'idb-keyval';
import type { Board } from '@whirl/scene';
const key = 'whirl.boards.v1';
export async function loadBoards(): Promise<Board[] | undefined> { return get(key); }
export async function saveBoards(boards: Board[]): Promise<void> { await set(key, boards); }
