import { WebSocketServer, type WebSocket } from 'ws';

export type Bridge = { port: number; connected: () => boolean; call: (method: string, params?: unknown) => Promise<unknown>; close: () => Promise<void> };
type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

export function allowedOrigin(origin: string | undefined, extra: string[] = []) {
  if (!origin) return false;
  return extra.includes('*') || extra.includes(origin) || LOCAL_ORIGIN.test(origin);
}

// The browser tab running Whirl connects here; MCP tool calls are relayed to it as JSON requests.
export function startBridge({ port = 7331, host = '127.0.0.1', origins = [] as string[], timeout = 15000 } = {}): Promise<Bridge> {
  return new Promise((resolve, reject) => {
    const wss = new WebSocketServer({ port, host, maxPayload: 50_000_000, verifyClient: ({ origin }: { origin?: string }) => allowedOrigin(origin, origins) });
    const pending = new Map<number, Pending>();
    let client: WebSocket | null = null, next = 1;
    const failAll = (message: string) => { for (const [id, p] of pending) { clearTimeout(p.timer); p.reject(new Error(message)); pending.delete(id); } };
    wss.on('connection', socket => {
      if (client) client.close(4000, 'Replaced by a newer Whirl tab');
      client = socket;
      socket.on('message', raw => {
        let message: { id?: number; result?: unknown; error?: string };
        try { message = JSON.parse(String(raw)); } catch { return; }
        if (!message || typeof message !== 'object') return;
        const p = typeof message.id === 'number' ? pending.get(message.id) : undefined;
        if (!p) return;
        clearTimeout(p.timer); pending.delete(message.id!);
        if (message.error) p.reject(new Error(message.error)); else p.resolve(message.result);
      });
      socket.on('close', () => { if (client === socket) { client = null; failAll('The Whirl tab disconnected.'); } });
    });
    wss.once('error', reject);
    wss.once('listening', () => {
      const address = wss.address();
      resolve({
        port: typeof address === 'object' && address ? address.port : port,
        connected: () => client !== null,
        call: (method, params) => new Promise((ok, fail) => {
          if (!client) return fail(new Error('No Whirl board is connected. Open Whirl in a browser and turn on "Connect AI assistant" (plug icon in the header).'));
          const id = next++;
          pending.set(id, { resolve: ok, reject: fail, timer: setTimeout(() => { pending.delete(id); fail(new Error(`Whirl did not answer "${method}" in time.`)); }, timeout) });
          client.send(JSON.stringify({ id, method, params: params ?? {} }));
        }),
        close: () => new Promise(done => { failAll('Bridge closed.'); for (const c of wss.clients) c.terminate(); wss.close(() => done()); }),
      });
    });
  });
}
