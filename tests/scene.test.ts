import { describe, expect, it, vi } from 'vitest';
import { bounds, contains, edgeMiddle, hitEdge, hitNode, makeShape, parseBoard, route, uid, type Board } from '../packages/scene/src';
const shape = (id: string, x: number, y: number) => ({ ...makeShape('rectangle', x, y), id, width: 100, height: 80 });
describe('scene graph', () => {
  it('creates unique identifiers on HTTP origins without randomUUID', () => {
    const getRandomValues = crypto.getRandomValues.bind(crypto);
    vi.stubGlobal('crypto', { getRandomValues });
    try { const a = uid(), b = uid(); expect(a).toMatch(/^[a-f0-9]{32}$/); expect(a).not.toBe(b); } finally { vi.unstubAllGlobals(); }
  });
  it('hit tests the actual outline and chooses the topmost shape', () => {
    const rect = shape('rect', 0, 0), ellipse = { ...rect, id: 'ellipse', kind: 'ellipse' as const }, diamond = { ...rect, kind: 'diamond' as const };
    expect(contains(rect, { x: 1, y: 1 })).toBe(true);
    expect(contains(ellipse, { x: 1, y: 1 })).toBe(false);
    expect(contains(diamond, { x: 1, y: 1 })).toBe(false);
    expect(hitNode([rect, ellipse], { x: 50, y: 40 })?.id).toBe('ellipse');
  });
  it('finds negative-coordinate bounds', () => { expect(bounds([shape('a', -50, -80), shape('b', 100, 100)])).toEqual({ x: -50, y: -80, width: 250, height: 260 }); });
  it('routes orthogonally around a blocker and remains attached after a move', () => {
    const nodes = [shape('a', 0, 100), shape('b', 500, 100), shape('obstacle', 220, 80)], edge = { id: 'e', source: 'a', target: 'b', text: '' };
    const path = route(edge, nodes); expect(path[0]).toEqual({ x: 100, y: 140 }); expect(path.at(-1)).toEqual({ x: 500, y: 140 });
    for (let i = 1; i < path.length; i++) { const a = path[i - 1], b = path[i]; expect(a.x === b.x || a.y === b.y).toBe(true); const horizontalCrosses = a.y === b.y && a.y > 80 && a.y < 160 && Math.min(a.x, b.x) < 320 && Math.max(a.x, b.x) > 220; const verticalCrosses = a.x === b.x && a.x > 220 && a.x < 320 && Math.min(a.y, b.y) < 160 && Math.max(a.y, b.y) > 80; expect(horizontalCrosses || verticalCrosses).toBe(false); }
    const moved = route(edge, nodes.map(n => n.id === 'b' ? { ...n, x: 600 } : n)); expect(moved.at(-1)).toEqual({ x: 600, y: 140 });
    expect(hitEdge([edge], nodes, edgeMiddle(path))?.id).toBe('e');
  });
  it('handles vertical arrows, missing targets, and empty labels', () => {
    const nodes = [shape('a', 0, 0), shape('b', 0, 300)], edge = { id: 'e', source: 'a', target: 'b', text: '' };
    expect(route(edge, nodes)[0]).toEqual({ x: 50, y: 80 }); expect(route({ ...edge, target: 'missing' }, nodes)).toEqual([]); expect(edgeMiddle([])).toEqual({ x: 0, y: 0 });
  });
});
describe('portable boards', () => {
  const board = (): Board => ({ id: 'old', title: 'Test <board>', nodes: [shape('a', 0, 0), shape('b', 400, 0)], edges: [{ id: 'e', source: 'a', target: 'b', text: 'hello' }], updatedAt: 0 });
  it('imports into a new board without changing the scene', () => { const b = board(), imported = parseBoard(b); expect(imported.id).not.toBe(b.id); expect(imported.nodes).toEqual(b.nodes); });
  it.each([null, {}, { nodes: [], edges: [], title: 4 }])('rejects malformed documents', input => { expect(() => parseBoard(input)).toThrow(); });
  it('rejects bad coordinates, external images, duplicate ids and dangling arrows', () => {
    const cases = [() => { const b = board(); b.nodes[0].x = Infinity; return b; }, () => { const b = board(); b.nodes[0].image = 'https://tracking.example/img.png'; return b; }, () => { const b = board(); b.nodes[1].id = 'a'; return b; }, () => { const b = board(); b.edges[0].target = 'none'; return b; }];
    cases.forEach(make => expect(() => parseBoard(make())).toThrow());
  });
});
