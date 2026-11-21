import { bounds, COLORS, groupShapes, makeShape, uid, type Board, type Connector, type Kind, type Scene, type Shape } from '@whirl/scene';

export const MCP_PORT_KEY = 'whirl.mcp.port';
const NAMED_COLORS: Record<string, string> = { white: COLORS[0], purple: COLORS[1], green: COLORS[2], yellow: COLORS[3], orange: COLORS[4], blue: COLORS[5] };
const KINDS: Kind[] = ['rectangle', 'ellipse', 'diamond', 'sticky', 'text'];
const MAX_NODES = 5000;
type Params = Record<string, unknown>;
type ShapeInput = { id?: unknown; kind?: unknown; text?: unknown; color?: unknown; x?: unknown; y?: unknown; width?: unknown; height?: unknown };

const fail = (message: string): never => { throw new Error(message); };
const finite = (v: unknown, name: string) => v === undefined ? undefined : typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1e7 ? v : fail(`${name} must be a finite number.`);
const dimension = (v: unknown, name: string) => { const n = finite(v, name); return n === undefined ? undefined : Math.min(20000, Math.max(24, n)); };
const text = (v: unknown, max = 10000) => v === undefined ? undefined : typeof v === 'string' ? v.slice(0, max) : fail('text must be a string.');
const list = <T>(v: unknown, name: string) => Array.isArray(v) && v.length ? v as T[] : fail(`${name} must be a non-empty array.`);
export function color(v: unknown) {
  if (v === undefined) return undefined;
  const c = typeof v === 'string' ? v.trim().toLowerCase() : '';
  return NAMED_COLORS[c] ?? (/^#[0-9a-f]{6}$/.test(c) ? c : fail(`Unknown colour "${String(v)}". Use ${Object.keys(NAMED_COLORS).join(', ')} or #rrggbb.`));
}

const round = (n: number) => Math.round(n * 10) / 10;
export function describeBoard(board: Board) {
  return {
    id: board.id, title: board.title,
    shapes: board.nodes.map(n => ({ id: n.id, kind: n.kind, x: round(n.x), y: round(n.y), width: round(n.width), height: round(n.height), text: n.text, color: n.color, ...(n.groupId ? { groupId: n.groupId } : {}), ...(n.url ? { url: n.url } : {}), ...(n.file ? { file: n.file.name } : {}) })),
    connectors: board.edges.map(e => ({ id: e.id, source: e.source, target: e.target, text: e.text })),
  };
}

// Applies an MCP tool call to a board. `fit` grows text shapes so their text is never clipped.
export function applyCommand(board: Board, method: string, params: Params, fit: (n: Shape, previous?: Shape) => Shape = n => n): { scene?: Scene; result: unknown } {
  const ids = new Set(board.nodes.map(n => n.id));
  const need = (id: unknown) => typeof id === 'string' && ids.has(id) ? id : fail(`No shape with id "${String(id)}" on this board.`);
  switch (method) {
    case 'get_board': return { result: describeBoard(board) };
    case 'add_shapes': {
      const inputs = list<ShapeInput>(params.shapes, 'shapes');
      if (board.nodes.length + inputs.length > MAX_NODES) fail(`A board can hold at most ${MAX_NODES} shapes.`);
      const area = board.nodes.length ? bounds(board.nodes) : { x: 0, y: -80, width: 0, height: 0 };
      let cursor = area.x;
      const added = inputs.map(input => {
        const kind = KINDS.includes(input.kind as Kind) ? input.kind as Kind : fail(`kind must be one of ${KINDS.join(', ')}.`);
        const base = makeShape(kind, 0, 0), x = finite(input.x, 'x'), y = finite(input.y, 'y');
        const shape: Shape = { ...base, text: text(input.text) ?? (kind === 'sticky' || kind === 'text' ? '' : base.text), color: color(input.color) ?? base.color, width: dimension(input.width, 'width') ?? base.width, height: dimension(input.height, 'height') ?? base.height };
        if (x === undefined) { shape.x = cursor; cursor += shape.width + 40; } else shape.x = x;
        shape.y = y ?? area.y + area.height + 80;
        return fit(shape);
      });
      return { scene: { nodes: [...board.nodes, ...added], edges: board.edges }, result: { ids: added.map(n => n.id) } };
    }
    case 'update_shapes': {
      const changes = new Map(list<ShapeInput>(params.shapes, 'shapes').map(c => [need(c.id), c]));
      const nodes = board.nodes.map(n => {
        const c = changes.get(n.id); if (!c) return n;
        const next = { ...n, text: text(c.text) ?? n.text, color: color(c.color) ?? n.color, x: finite(c.x, 'x') ?? n.x, y: finite(c.y, 'y') ?? n.y, width: dimension(c.width, 'width') ?? n.width, height: dimension(c.height, 'height') ?? n.height };
        return fit(next, c.height === undefined ? n : undefined);
      });
      return { scene: { nodes, edges: board.edges }, result: { updated: changes.size } };
    }
    case 'connect_shapes': {
      const edges: Connector[] = list<{ source?: unknown; target?: unknown; text?: unknown }>(params.connectors, 'connectors').map(c => {
        const source = need(c.source), target = need(c.target);
        if (source === target) fail('A connector needs two different shapes.');
        return { id: uid(), source, target, text: text(c.text, 500) ?? '' };
      });
      return { scene: { nodes: board.nodes, edges: [...board.edges, ...edges] }, result: { ids: edges.map(e => e.id) } };
    }
    case 'update_connectors': {
      const changes = new Map(list<{ id?: unknown; text?: unknown }>(params.connectors, 'connectors').map(c => {
        if (!board.edges.some(e => e.id === c.id)) fail(`No connector with id "${String(c.id)}" on this board.`);
        return [c.id as string, text(c.text, 500) ?? ''];
      }));
      return { scene: { nodes: board.nodes, edges: board.edges.map(e => changes.has(e.id) ? { ...e, text: changes.get(e.id)! } : e) }, result: { updated: changes.size } };
    }
    case 'delete_items': {
      const gone = new Set(list<unknown>(params.ids, 'ids').filter((id): id is string => typeof id === 'string'));
      const nodes = board.nodes.filter(n => !gone.has(n.id)), edges = board.edges.filter(e => !gone.has(e.id) && !gone.has(e.source) && !gone.has(e.target));
      return { scene: { nodes, edges }, result: { deletedShapes: board.nodes.length - nodes.length, deletedConnectors: board.edges.length - edges.length } };
    }
    case 'group_shapes': {
      const members = list<unknown>(params.ids, 'ids').map(need);
      if (!params.ungroup && members.length < 2) fail('Grouping needs at least two shapes.');
      return { scene: { nodes: groupShapes(board.nodes, members, params.ungroup === true), edges: board.edges }, result: { ok: true } };
    }
    default: return fail(`Unknown command "${method}".`);
  }
}

export type McpStatus = 'off' | 'connecting' | 'connected';
export type McpHandler = (method: string, params: Params) => unknown | Promise<unknown>;

export function mcpPort() {
  try { const port = Number(localStorage.getItem(MCP_PORT_KEY)); return Number.isInteger(port) && port > 0 && port < 65536 ? port : 7331; } catch { return 7331; }
}

// Keeps a WebSocket open to the local whirl-mcp server, reconnecting until stopped.
export function connectMcp(handler: () => McpHandler, onStatus: (status: McpStatus) => void, port = mcpPort()) {
  let socket: WebSocket | null = null, retry: ReturnType<typeof setTimeout> | undefined, stopped = false;
  const open = () => {
    onStatus('connecting');
    socket = new WebSocket(`ws://127.0.0.1:${port}`);
    socket.onopen = () => onStatus('connected');
    socket.onclose = () => { socket = null; if (!stopped) { onStatus('connecting'); retry = setTimeout(open, 2000); } };
    socket.onmessage = async event => {
      let id: unknown;
      try {
        const message = JSON.parse(String(event.data)); id = message.id;
        const result = await handler()(String(message.method), message.params && typeof message.params === 'object' ? message.params : {});
        socket?.send(JSON.stringify({ id, result: result ?? { ok: true } }));
      } catch (error) { socket?.send(JSON.stringify({ id, error: error instanceof Error ? error.message : String(error) })); }
    };
  };
  open();
  return () => { stopped = true; clearTimeout(retry); socket?.close(); onStatus('off'); };
}
