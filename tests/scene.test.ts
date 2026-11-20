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
  it.each(['rectangle', 'diamond', 'ellipse'] as const)('separates retry arrows on %s outlines in both orientations', kind => {
    for (const vertical of [false, true]) {
      const nodes = [shape('a', 0, 0), { ...shape('b', vertical ? 0 : 400, vertical ? 300 : 0), kind }];
      const edges = [{ id: 'next', source: 'a', target: 'b', text: 'Yes' }, { id: 'retry', source: 'b', target: 'a', text: 'No' }];
      const paths = edges.map(e => route(e, nodes, edges));
      expect(paths[0]).not.toEqual([...paths[1]].reverse());
      paths.forEach((path, index) => {
        expect(hitEdge(edges, nodes, edgeMiddle(path))?.id).toBe(edges[index].id);
        for (let i = 1; i < path.length; i++) expect(path[i].x === path[i - 1].x || path[i].y === path[i - 1].y).toBe(true);
        const point = index ? path[0] : path.at(-1)!, target = nodes[1];
        const dx = Math.abs(point.x - target.x - target.width / 2) / (target.width / 2), dy = Math.abs(point.y - target.y - target.height / 2) / (target.height / 2);
        expect(kind === 'diamond' ? dx + dy : kind === 'ellipse' ? dx * dx + dy * dy : Math.max(dx, dy)).toBeCloseTo(1);
      });
      const moved = nodes.map(n => n.id === 'b' ? { ...n, x: n.x + 80, y: n.y + 40 } : n);
      edges.forEach(e => expect(hitEdge(edges, moved, edgeMiddle(route(e, moved, edges)))?.id).toBe(e.id));
    }
  });
  it('updates cached routes when retry arrows are added, removed, or restored by undo', () => {
    const nodes = [shape('a', 0, 0), shape('b', 400, 0)], edge = { id: 'next', source: 'a', target: 'b', text: '' };
    const single = [edge], pair = [edge, { ...edge, id: 'retry', source: 'b', target: 'a' }];
    const original = route(edge, nodes, single), separated = route(edge, nodes, pair);
    expect(separated).not.toEqual(original);
    expect(route(edge, nodes, [edge])).toEqual(original);
    expect(route(edge, nodes, pair)).toEqual(separated);
  });
  it('keeps multiple parallel arrows distinct even on small shapes', () => {
    const nodes = [shape('a', 0, 0), shape('b', 400, 0)].map(n => ({ ...n, height: 40 }));
    const edges = Array.from({ length: 5 }, (_, i) => ({ id: String(i), source: 'a', target: 'b', text: '' }));
    const positions = edges.map(e => edgeMiddle(route(e, nodes, edges)).y);
    expect(new Set(positions).size).toBe(edges.length);
  });
  it('keeps shifted exits and retry labels clear of a nearby shape', () => {
    const obstacle = { ...shape('obstacle', 110, 0), width: 300, height: 120 };
    const nodes = [shape('a', 0, 100), shape('b', 500, 100), obstacle];
    const edges = [{ id: 'next', source: 'a', target: 'b', text: 'Next' }, { id: 'retry', source: 'b', target: 'a', text: 'Retry' }];
    for (const edge of edges) {
      const path = route(edge, nodes, edges);
      expect(contains(obstacle, edgeMiddle(path))).toBe(false);
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1], b = path[i];
        const horizontalCrosses = a.y === b.y && a.y > obstacle.y && a.y < obstacle.y + obstacle.height && Math.min(a.x, b.x) < obstacle.x + obstacle.width && Math.max(a.x, b.x) > obstacle.x;
        const verticalCrosses = a.x === b.x && a.x > obstacle.x && a.x < obstacle.x + obstacle.width && Math.min(a.y, b.y) < obstacle.y + obstacle.height && Math.max(a.y, b.y) > obstacle.y;
        expect(horizontalCrosses || verticalCrosses).toBe(false);
      }
    }
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
