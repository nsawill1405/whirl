import { describe, expect, it } from 'vitest';
import { makeShape, type Board } from '@whirl/scene';
import { mergeBoards } from '../apps/web/src/storage';

const board = (id: string): Board => ({ id, title: id, nodes: [], edges: [], updatedAt: 1 });
describe('board library persistence', () => {
  it('keeps boards created in another tab when saving a stale library', () => {
    const a = board('a'), b = board('b'), renamed = { ...a, title: 'renamed' };
    expect(mergeBoards([b, a], [renamed], [a])).toEqual({ boards: [b, renamed], recovered: false });
  });
  it('merges changes to different boards without reverting either', () => {
    const a = board('a'), b = board('b'), changedA = { ...a, title: 'changed a' }, changedB = { ...b, title: 'changed b' };
    expect(mergeBoards([changedA, b], [a, changedB], [a, b]).boards).toEqual([changedA, changedB]);
  });
  it('does not resurrect an unchanged board deleted in another tab', () => {
    const a = board('a'), b = board('b');
    expect(mergeBoards([b], [a, b], [a, b]).boards).toEqual([b]);
  });
  it('keeps both versions of a concurrently edited board without trusting timestamps', () => {
    const base = board('a'), remote = { ...base, title: 'remote', nodes: [makeShape('rectangle', 12, 24)] }, local = { ...base, title: 'local' };
    const result = mergeBoards([remote], [local], [base]);
    expect(result.recovered).toBe(true);
    expect(result.boards[0]).toEqual(local);
    expect(result.boards[1]).toMatchObject({ ...remote, id: expect.any(String), title: 'remote (recovered copy)' });
    expect(result.boards[1].id).not.toBe(base.id);
  });
  it('preserves a newer remote edit as a recoverable copy when deleting from a stale tab', () => {
    const base = board('a'), remote = { ...base, title: 'new work' };
    const result = mergeBoards([remote], [], [base]);
    expect(result.recovered).toBe(true);
    expect(result.boards).toHaveLength(1);
    expect(result.boards[0].title).toBe('new work (recovered copy)');
    expect(result.boards[0].id).not.toBe(base.id);
  });
  it('recovers locally edited work after another tab deleted its board', () => {
    const base = board('a'), local = { ...base, title: 'unsaved edit' };
    expect(mergeBoards([], [local], [base])).toEqual({ boards: [local], recovered: true });
  });
  it('does not create copies for identical concurrent saves or unchanged startup snapshots', () => {
    const base = board('a'), changed = { ...base, title: 'same change' };
    expect(mergeBoards([changed], [changed], [base])).toEqual({ boards: [changed], recovered: false });
    expect(mergeBoards([changed], [base], [base])).toEqual({ boards: [changed], recovered: false });
  });
});
