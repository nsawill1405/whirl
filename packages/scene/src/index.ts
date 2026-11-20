export type Point = { x: number; y: number };
export type Kind = 'rectangle' | 'ellipse' | 'diamond' | 'sticky' | 'text' | 'image';
export type Shape = Point & { id: string; kind: Kind; width: number; height: number; text: string; color: string; image?: string };
export type Connector = { id: string; source: string; target: string; text: string };
export type Board = { id: string; title: string; nodes: Shape[]; edges: Connector[]; updatedAt: number };
export type Scene = Pick<Board, 'nodes' | 'edges'>;
export const uid = () => crypto.randomUUID();
export const COLORS = ['#ffffff', '#eee9ff', '#e5f3ee', '#fff2cc', '#ffe6dc', '#e4efff'];
export function makeShape(kind: Kind, x: number, y: number): Shape {
  return { id: uid(), kind, x, y, width: kind === 'sticky' ? 176 : kind === 'text' ? 220 : 184, height: kind === 'sticky' ? 152 : kind === 'text' ? 64 : kind === 'diamond' ? 128 : 88, text: kind === 'sticky' ? 'A bright idea' : kind === 'text' ? 'Add your thoughts' : '', color: kind === 'sticky' ? COLORS[3] : COLORS[0] };
}
export function contains(n: Shape, p: Point): boolean {
  const dx = Math.abs(p.x - n.x - n.width / 2) / (n.width / 2), dy = Math.abs(p.y - n.y - n.height / 2) / (n.height / 2);
  return n.kind === 'ellipse' ? dx * dx + dy * dy <= 1 : n.kind === 'diamond' ? dx + dy <= 1 : dx <= 1 && dy <= 1;
}
export function hitNode(nodes: Shape[], p: Point) { return [...nodes].reverse().find(n => contains(n, p)); }
export function bounds(nodes: Shape[]) {
  if (!nodes.length) return { x: 0, y: 0, width: 800, height: 600 };
  const x = Math.min(...nodes.map(n => n.x)), y = Math.min(...nodes.map(n => n.y));
  return { x, y, width: Math.max(...nodes.map(n => n.x + n.width)) - x, height: Math.max(...nodes.map(n => n.y + n.height)) - y };
}
function anchor(n: Shape, other: Shape): { p: Point; out: Point } {
  const dx = other.x + other.width / 2 - n.x - n.width / 2, dy = other.y + other.height / 2 - n.y - n.height / 2;
  if (Math.abs(dx) / n.width >= Math.abs(dy) / n.height) {
    const x = dx >= 0 ? n.x + n.width : n.x, y = n.y + n.height / 2;
    return { p: { x, y }, out: { x: x + (dx >= 0 ? 20 : -20), y } };
  }
  const x = n.x + n.width / 2, y = dy >= 0 ? n.y + n.height : n.y;
  return { p: { x, y }, out: { x, y: y + (dy >= 0 ? 20 : -20) } };
}
function blocked(a: Point, b: Point, obstacles: Shape[]): boolean {
  return obstacles.some(n => a.x === b.x
    ? a.x > n.x - 10 && a.x < n.x + n.width + 10 && Math.max(a.y, b.y) > n.y - 10 && Math.min(a.y, b.y) < n.y + n.height + 10
    : a.y > n.y - 10 && a.y < n.y + n.height + 10 && Math.max(a.x, b.x) > n.x - 10 && Math.min(a.x, b.x) < n.x + n.width + 10);
}
const routeCache = new WeakMap<Shape[], Map<Connector, Point[]>>();
export function route(edge: Connector, nodes: Shape[]): Point[] {
  let cache = routeCache.get(nodes);
  if (!cache) { cache = new Map(); routeCache.set(nodes, cache); }
  const cached = cache.get(edge); if (cached) return cached;
  const path = computeRoute(edge, nodes); cache.set(edge, path); return path;
}
function computeRoute(edge: Connector, nodes: Shape[]): Point[] {
  const source = nodes.find(n => n.id === edge.source), target = nodes.find(n => n.id === edge.target);
  if (!source || !target) return [];
  const a = anchor(source, target), b = anchor(target, source);
  // A rectilinear visibility grid keeps arrows clear of intervening shapes.
  const near = nodes.filter(n => n.x + n.width > Math.min(a.out.x, b.out.x) - 200 && n.x < Math.max(a.out.x, b.out.x) + 200 && n.y + n.height > Math.min(a.out.y, b.out.y) - 200 && n.y < Math.max(a.out.y, b.out.y) + 200);
  const xs = [...new Set([a.out.x, b.out.x, ...near.flatMap(n => [n.x - 20, n.x + n.width + 20])])].sort((a, b) => a - b);
  const ys = [...new Set([a.out.y, b.out.y, ...near.flatMap(n => [n.y - 20, n.y + n.height + 20])])].sort((a, b) => a - b);
  const start = `${xs.indexOf(a.out.x)},${ys.indexOf(a.out.y)}`, goal = `${xs.indexOf(b.out.x)},${ys.indexOf(b.out.y)}`;
  const open = new Set([start]), cost = new Map([[start, 0]]), previous = new Map<string, string>();
  const point = (key: string) => { const [i, j] = key.split(',').map(Number); return { x: xs[i], y: ys[j] }; };
  let steps = 0;
  while (open.size && steps++ < 15000) {
    let current = '', best = Infinity;
    for (const key of open) { const p = point(key), score = cost.get(key)! + Math.abs(p.x - b.out.x) + Math.abs(p.y - b.out.y); if (score < best) { best = score; current = key; } }
    if (current === goal) {
      const path = [b.p, b.out]; let k = goal;
      while (previous.has(k)) { k = previous.get(k)!; path.push(point(k)); }
      path.push(a.p); path.reverse();
      return path.filter((p, i) => !i || i === path.length - 1 || !(path[i - 1].x === p.x && p.x === path[i + 1].x || path[i - 1].y === p.y && p.y === path[i + 1].y));
    }
    open.delete(current);
    const [i, j] = current.split(',').map(Number), p = point(current);
    for (const [u, v] of [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]]) {
      if (u < 0 || v < 0 || u >= xs.length || v >= ys.length) continue;
      const key = `${u},${v}`, q = point(key);
      if (blocked(p, q, near)) continue;
      const next = cost.get(current)! + Math.abs(p.x - q.x) + Math.abs(p.y - q.y) + 0.01;
      if (next < (cost.get(key) ?? Infinity)) { cost.set(key, next); previous.set(key, current); open.add(key); }
    }
  }
  return [a.p, a.out, { x: a.out.x, y: b.out.y }, b.out, b.p];
}
export function edgeMiddle(path: Point[]) {
  const lengths = path.slice(1).map((p, i) => Math.hypot(p.x - path[i].x, p.y - path[i].y));
  let remaining = lengths.reduce((a, b) => a + b, 0) / 2;
  for (let i = 0; i < lengths.length; i++) { if (remaining <= lengths[i]) { const t = lengths[i] ? remaining / lengths[i] : 0; return { x: path[i].x + (path[i + 1].x - path[i].x) * t, y: path[i].y + (path[i + 1].y - path[i].y) * t }; } remaining -= lengths[i]; }
  return path[0] ?? { x: 0, y: 0 };
}
export function hitEdge(edges: Connector[], nodes: Shape[], p: Point, tolerance = 8) {
  return [...edges].reverse().find(e => { const path = route(e, nodes); return path.slice(1).some((b, i) => { const a = path[i], dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy) < tolerance; }); });
}
export function parseBoard(input: unknown): Board {
  const b = input as Board;
  if (!b || typeof b.title !== 'string' || b.title.length > 200 || !Array.isArray(b.nodes) || !Array.isArray(b.edges) || b.nodes.length > 3000 || b.edges.length > 6000) throw new Error('This is not a valid Whirl board.');
  const ids = new Set<string>();
  for (const n of b.nodes) {
    if (!n || typeof n.id !== 'string' || ids.has(n.id) || !['rectangle','ellipse','diamond','sticky','text','image'].includes(n.kind) || ![n.x,n.y,n.width,n.height].every(v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1000000) || n.width < 24 || n.height < 24 || typeof n.text !== 'string' || n.text.length > 10000 || !/^#[\da-f]{6}$/i.test(n.color) || (n.image !== undefined && (typeof n.image !== 'string' || !/^data:image\/(png|jpeg|webp);base64,/.test(n.image) || n.image.length > 14000000))) throw new Error('The board contains an invalid shape.');
    ids.add(n.id);
  }
  const edgeIds = new Set<string>();
  for (const e of b.edges) { if (!e || typeof e.id !== 'string' || edgeIds.has(e.id) || ids.has(e.id) || !ids.has(e.source) || !ids.has(e.target) || e.source === e.target || typeof e.text !== 'string' || e.text.length > 10000) throw new Error('The board contains an invalid connector.'); edgeIds.add(e.id); }
  return { id: uid(), title: b.title, nodes: b.nodes, edges: b.edges, updatedAt: Date.now() };
}
