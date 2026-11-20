export type Point = { x: number; y: number };
export type Kind = 'rectangle' | 'ellipse' | 'diamond' | 'sticky' | 'text' | 'image' | 'link' | 'document';
export type DocumentFile = { name: string; type: string; size: number; data: string };
export type Shape = Point & { id: string; kind: Kind; width: number; height: number; text: string; color: string; image?: string; url?: string; file?: DocumentFile; groupId?: string };
export type Connector = { id: string; source: string; target: string; text: string };
export type Board = { id: string; title: string; nodes: Shape[]; edges: Connector[]; updatedAt: number };
export type Scene = Pick<Board, 'nodes' | 'edges'>;
export const uid = () => typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), v => v.toString(16).padStart(2, '0')).join('');
export const COLORS = ['#ffffff', '#eee9ff', '#e5f3ee', '#fff2cc', '#ffe6dc', '#e4efff'];
export const MAX_IMAGE_BYTES = 12_000_000;
export const MAX_DOCUMENT_BYTES = 25_000_000;
export const DOCUMENT_TYPES: Record<string, string> = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', doc: 'application/msword', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ppt: 'application/vnd.ms-powerpoint', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel', odt: 'application/vnd.oasis.opendocument.text', odp: 'application/vnd.oasis.opendocument.presentation', ods: 'application/vnd.oasis.opendocument.spreadsheet', rtf: 'application/rtf', txt: 'text/plain', csv: 'text/csv', md: 'text/markdown' };
export function validDocument(file: DocumentFile) {
  if (!file || typeof file.name !== 'string' || !file.name.length || file.name.length > 255 || typeof file.type !== 'string' || typeof file.data !== 'string' || !Number.isInteger(file.size) || file.size < 0 || file.size > MAX_DOCUMENT_BYTES) return false;
  const type = DOCUMENT_TYPES[file.name.split('.').pop()!.toLowerCase()];
  return !!type && type === file.type && file.data.startsWith(`data:${type};base64,`) && file.data.length <= Math.ceil(MAX_DOCUMENT_BYTES / 3) * 4 + 160 && /^[A-Za-z0-9+/]*={0,2}$/.test(file.data.slice(file.data.indexOf(',') + 1));
}
export const MAX_IMAGE_DATA_LENGTH = Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 64;
export function normalizeUrl(input: string): string | null {
  const value = input.trim();
  if (!value || /\s/.test(value)) return null;
  try {
    const hostPort = /^(?:localhost|(?:[a-z\d-]+\.)+[a-z\d-]+):\d+(?:[/?#]|$)/i.test(value);
    const url = new URL(!hostPort && /^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`);
    return ['http:', 'https:'].includes(url.protocol) && url.hostname && (/^https?:/i.test(value) || hostPort || url.hostname.includes('.')) ? url.href : null;
  } catch { return null; }
}
export function makeShape(kind: Kind, x: number, y: number): Shape {
  if (kind === 'link') return { id: uid(), kind, x, y, width: 260, height: 84, text: '', color: COLORS[0] };
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
export function expandSelection(nodes: Shape[], ids: string[]): string[] {
  const selected = new Set(ids), groups = new Set(nodes.filter(n => selected.has(n.id) && n.groupId).map(n => n.groupId));
  return [...new Set([...ids, ...nodes.filter(n => n.groupId && groups.has(n.groupId)).map(n => n.id)])];
}
export function selectionScene(scene: Scene, ids: string[]): Scene {
  const selected = new Set(expandSelection(scene.nodes, ids));
  return { nodes: scene.nodes.filter(n => selected.has(n.id)), edges: scene.edges.filter(e => selected.has(e.source) && selected.has(e.target)) };
}
export function groupShapes(nodes: Shape[], ids: string[], ungroup = false): Shape[] {
  const selected = new Set(expandSelection(nodes, ids));
  if (!ungroup && nodes.filter(n => selected.has(n.id)).length < 2) return nodes;
  const groupId = ungroup ? undefined : uid();
  return nodes.map(n => { if (!selected.has(n.id)) return n; const { groupId: _old, ...shape } = n; return groupId ? { ...shape, groupId } : shape; });
}
export function cloneScene(scene: Scene, offset: number): Scene {
  const ids = new Map(scene.nodes.map(n => [n.id, uid()])), groups = new Map(scene.nodes.filter(n => n.groupId).map(n => [n.groupId!, uid()]));
  return {
    nodes: scene.nodes.map(n => ({ ...n, id: ids.get(n.id)!, ...(n.groupId ? { groupId: groups.get(n.groupId)! } : {}), x: n.x + offset, y: n.y + offset })),
    edges: scene.edges.map(e => ({ ...e, id: uid(), source: ids.get(e.source)!, target: ids.get(e.target)! })),
  };
}
export function resizeSelection(nodes: Shape[], ids: string[], dx: number, dy: number): Shape[] {
  const selected = new Set(expandSelection(nodes, ids)), members = nodes.filter(n => selected.has(n.id));
  if (!members.length) return nodes;
  const b = bounds(members), sx = Math.max(...members.map(n => 24 / n.width), (b.width + dx) / b.width), sy = Math.max(...members.map(n => 24 / n.height), (b.height + dy) / b.height);
  return nodes.map(n => selected.has(n.id) ? { ...n, x: b.x + (n.x - b.x) * sx, y: b.y + (n.y - b.y) * sy, width: Math.max(24, n.width * sx), height: Math.max(24, n.height * sy) } : n);
}
type Side = 'left' | 'right' | 'top' | 'bottom';
function anchor(n: Shape, other: Shape, offset: number, side?: Side): { p: Point; out: Point } {
  const dx = other.x + other.width / 2 - n.x - n.width / 2, dy = other.y + other.height / 2 - n.y - n.height / 2;
  const extent = (ratio: number) => n.kind === 'diamond' ? 1 - Math.abs(ratio) : n.kind === 'ellipse' ? Math.sqrt(1 - ratio * ratio) : 1;
  if (side ? side === 'left' || side === 'right' : Math.abs(dx) / n.width >= Math.abs(dy) / n.height) {
    const shift = offset * Math.min(1, n.height * 0.3 / 24), sign = side ? side === 'right' ? 1 : -1 : dx >= 0 ? 1 : -1;
    const x = n.x + n.width / 2 + sign * n.width / 2 * extent(shift / (n.height / 2)), y = n.y + n.height / 2 + shift;
    return { p: { x, y }, out: { x: n.x + n.width / 2 + sign * (n.width / 2 + 20), y } };
  }
  const shift = offset * Math.min(1, n.width * 0.3 / 24), sign = side ? side === 'bottom' ? 1 : -1 : dy >= 0 ? 1 : -1;
  const x = n.x + n.width / 2 + shift, y = n.y + n.height / 2 + sign * n.height / 2 * extent(shift / (n.width / 2));
  return { p: { x, y }, out: { x, y: n.y + n.height / 2 + sign * (n.height / 2 + 20) } };
}
function blocked(a: Point, b: Point, obstacles: Shape[]): boolean {
  return obstacles.some(n => a.x === b.x
    ? a.x > n.x - 10 && a.x < n.x + n.width + 10 && Math.max(a.y, b.y) > n.y - 10 && Math.min(a.y, b.y) < n.y + n.height + 10
    : a.y > n.y - 10 && a.y < n.y + n.height + 10 && Math.max(a.x, b.x) > n.x - 10 && Math.min(a.x, b.x) < n.x + n.width + 10);
}
const noEdges: Connector[] = [];
const laneCache = new WeakMap<Connector[], Map<Connector, number>>();
const routeCache = new WeakMap<Shape[], WeakMap<Connector[], Map<Connector, Point[]>>>();
function laneOffset(edge: Connector, edges: Connector[]) {
  let lanes = laneCache.get(edges);
  if (!lanes) {
    lanes = new Map();
    const pairs = new Map<string, Connector[]>();
    for (const e of edges) { const key = JSON.stringify([e.source, e.target].sort()), group = pairs.get(key) ?? []; group.push(e); pairs.set(key, group); }
    for (const group of pairs.values()) group.forEach((e, i) => lanes!.set(e, group.length > 1 ? (i / (group.length - 1) - 0.5) * 48 : 0));
    laneCache.set(edges, lanes);
  }
  return lanes.get(edge) ?? 0;
}
export function route(edge: Connector, nodes: Shape[], edges: Connector[] = noEdges): Point[] {
  let scenes = routeCache.get(nodes);
  if (!scenes) { scenes = new WeakMap(); routeCache.set(nodes, scenes); }
  let cache = scenes.get(edges);
  if (!cache) { cache = new Map(); scenes.set(edges, cache); }
  const cached = cache.get(edge); if (cached) return cached;
  const path = computeRoute(edge, nodes, laneOffset(edge, edges)); cache.set(edge, path); return path;
}
function computeRoute(edge: Connector, nodes: Shape[], offset: number): Point[] {
  const source = nodes.find(n => n.id === edge.source), target = nodes.find(n => n.id === edge.target);
  if (!source || !target) return [];
  const exit = (n: Shape, other: Shape) => {
    const shifted = anchor(n, other, offset);
    const obstacles = nodes.filter(obstacle => obstacle !== n);
    if (!offset || !blocked(shifted.p, shifted.out, obstacles)) return shifted;
    const horizontal = shifted.p.y === shifted.out.y;
    const sides: Side[] = horizontal ? offset < 0 ? ['top', 'bottom', 'left', 'right'] : ['bottom', 'top', 'right', 'left'] : offset < 0 ? ['left', 'right', 'top', 'bottom'] : ['right', 'left', 'bottom', 'top'];
    for (const side of sides) { const candidate = anchor(n, other, offset, side); if (!blocked(candidate.p, candidate.out, obstacles)) return candidate; }
    return shifted;
  };
  const a = exit(source, target), b = exit(target, source);
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
  return [...edges].reverse().find(e => { const path = route(e, nodes, edges); return path.slice(1).some((b, i) => { const a = path[i], dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy) < tolerance; }); });
}
export function parseBoard(input: unknown): Board {
  const b = input as Board;
  if (!b || typeof b.title !== 'string' || b.title.length > 200 || !Array.isArray(b.nodes) || !Array.isArray(b.edges) || b.nodes.length > 3000 || b.edges.length > 6000) throw new Error('This is not a valid Whirl board.');
  const ids = new Set<string>();
  for (const n of b.nodes) {
    if (n && ((n.kind === 'document' && !n.file) || (n.file !== undefined && !validDocument(n.file)))) throw new Error('The board contains an invalid document.');
    if (!n || typeof n.id !== 'string' || ids.has(n.id) || !['rectangle','ellipse','diamond','sticky','text','image','link','document'].includes(n.kind) || ![n.x,n.y,n.width,n.height].every(v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1000000) || n.width < 24 || n.height < 24 || typeof n.text !== 'string' || n.text.length > 10000 || !/^#[\da-f]{6}$/i.test(n.color) || (n.image !== undefined && (typeof n.image !== 'string' || !/^data:image\/(png|jpeg|webp);base64,/.test(n.image) || n.image.length > MAX_IMAGE_DATA_LENGTH))) throw new Error('The board contains an invalid shape.');
    if (n.url !== undefined && (typeof n.url !== 'string' || !/^https?:\/\//i.test(n.url) || !normalizeUrl(n.url))) throw new Error('The board contains an invalid URL.');
    ids.add(n.id);
  }
  const edgeIds = new Set<string>();
  for (const n of b.nodes) if (n.groupId !== undefined && (typeof n.groupId !== 'string' || !n.groupId.length || n.groupId.length > 200)) throw new Error('The board contains an invalid group.');
  for (const e of b.edges) { if (!e || typeof e.id !== 'string' || edgeIds.has(e.id) || ids.has(e.id) || !ids.has(e.source) || !ids.has(e.target) || e.source === e.target || typeof e.text !== 'string' || e.text.length > 10000) throw new Error('The board contains an invalid connector.'); edgeIds.add(e.id); }
  return { id: uid(), title: b.title, nodes: b.nodes, edges: b.edges, updatedAt: Date.now() };
}
