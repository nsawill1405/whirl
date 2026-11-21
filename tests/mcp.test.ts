import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { COLORS, makeShape, type Board } from '../packages/scene/src';
import { applyCommand, color, describeBoard } from '../apps/web/src/mcp';
import { allowedOrigin, startBridge, type Bridge } from '../packages/mcp/src/bridge';
import { createServer } from '../packages/mcp/src/server';

const sample = (): Board => {
  const a = { ...makeShape('rectangle', 0, 0), id: 'a', text: 'Start' }, b = { ...makeShape('ellipse', 300, 0), id: 'b' };
  return { id: 'board', title: 'Plan', nodes: [a, b], edges: [{ id: 'e', source: 'a', target: 'b', text: '' }], updatedAt: 0 };
};

describe('board commands', () => {
  it('describes a board without heavy media data', () => {
    const board = sample(); board.nodes.push({ ...makeShape('document', 0, 200), id: 'd', file: { name: 'spec.pdf', type: 'application/pdf', size: 3, data: 'data:application/pdf;base64,AAAA' } });
    const described = describeBoard(board);
    expect(described.shapes[2]).toMatchObject({ id: 'd', file: 'spec.pdf' });
    expect(JSON.stringify(described)).not.toContain('base64');
    expect(applyCommand(board, 'get_board', {}).result).toEqual(described);
  });
  it('adds shapes below existing content when no position is given and keeps explicit positions', () => {
    const { scene, result } = applyCommand(sample(), 'add_shapes', { shapes: [{ kind: 'sticky', text: 'Idea', color: 'blue' }, { kind: 'diamond' }, { kind: 'text', x: 900, y: -50, width: 10 }] });
    const ids = (result as { ids: string[] }).ids, added = scene!.nodes.slice(2);
    expect(ids).toEqual(added.map(n => n.id));
    expect(added[0]).toMatchObject({ kind: 'sticky', text: 'Idea', color: COLORS[5], x: 0, y: 168 });
    expect(added[1]).toMatchObject({ kind: 'diamond', x: added[0].width + 40, y: 168 });
    expect(added[2]).toMatchObject({ x: 900, y: -50, width: 24, text: '' });
  });
  it('updates, connects, groups, and deletes items', () => {
    let board = sample();
    const apply = (method: string, params: Record<string, unknown>) => { const { scene, result } = applyCommand(board, method, params); board = { ...board, ...scene }; return result; };
    apply('update_shapes', { shapes: [{ id: 'b', text: 'Done', color: '#AABBCC', x: 400 }] });
    expect(board.nodes[1]).toMatchObject({ text: 'Done', color: '#aabbcc', x: 400, y: 0 });
    const { ids } = apply('connect_shapes', { connectors: [{ source: 'b', target: 'a', text: 'back' }] }) as { ids: string[] };
    apply('update_connectors', { connectors: [{ id: ids[0], text: 'loop' }] });
    expect(board.edges[1]).toMatchObject({ source: 'b', target: 'a', text: 'loop' });
    apply('group_shapes', { ids: ['a', 'b'] });
    expect(board.nodes[0].groupId).toBeTruthy();
    expect(board.nodes[0].groupId).toBe(board.nodes[1].groupId);
    expect(apply('delete_items', { ids: ['a'] })).toEqual({ deletedShapes: 1, deletedConnectors: 2 });
    expect(board.nodes.map(n => n.id)).toEqual(['b']);
  });
  it('rejects invalid input with helpful errors', () => {
    expect(() => applyCommand(sample(), 'add_shapes', { shapes: [{ kind: 'image' }] })).toThrow(/kind must be one of/);
    expect(() => applyCommand(sample(), 'add_shapes', { shapes: [{ kind: 'rectangle', x: Infinity }] })).toThrow(/finite/);
    expect(() => applyCommand(sample(), 'connect_shapes', { connectors: [{ source: 'a', target: 'missing' }] })).toThrow(/No shape with id "missing"/);
    expect(() => applyCommand(sample(), 'connect_shapes', { connectors: [{ source: 'a', target: 'a' }] })).toThrow(/two different/);
    expect(() => applyCommand(sample(), 'update_shapes', { shapes: [] })).toThrow(/non-empty/);
    expect(() => applyCommand(sample(), 'nope', {})).toThrow(/Unknown command/);
    expect(() => color('teal')).toThrow(/Unknown colour/);
    for (const name of ['constructor', 'toString', '__proto__']) expect(() => color(name)).toThrow(/Unknown colour/);
  });
  it('runs the text fitter on added and edited shapes', () => {
    const fit = (n: ReturnType<typeof makeShape>) => ({ ...n, height: 999 });
    expect(applyCommand(sample(), 'add_shapes', { shapes: [{ kind: 'text', text: 'long' }] }, fit).scene!.nodes[2].height).toBe(999);
    expect(applyCommand(sample(), 'update_shapes', { shapes: [{ id: 'a', text: 'long' }] }, fit).scene!.nodes[0].height).toBe(999);
  });
});

describe('MCP bridge', () => {
  let bridge: Bridge | undefined, tab: WebSocket | undefined;
  afterEach(async () => { tab?.close(); await bridge?.close(); bridge = tab = undefined; });
  const connectTab = (origin = 'http://localhost:5173') => new Promise<WebSocket>((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${bridge!.port}`, { headers: { Origin: origin } });
    ws.once('open', () => resolve(ws)); ws.once('error', reject);
  });

  it('only accepts local origins unless more are allowed', () => {
    expect(allowedOrigin('http://localhost:5173')).toBe(true);
    expect(allowedOrigin('http://127.0.0.1')).toBe(true);
    expect(allowedOrigin('app://whirl')).toBe(true);
    expect(allowedOrigin('https://evil.example')).toBe(false);
    expect(allowedOrigin(undefined)).toBe(false);
    expect(allowedOrigin('https://whirl.example', ['https://whirl.example'])).toBe(true);
  });
  it('refuses connections from other websites', async () => {
    bridge = await startBridge({ port: 0 });
    await expect(connectTab('https://evil.example')).rejects.toThrow(/401/);
    expect(bridge.connected()).toBe(false);
  });
  it('relays MCP tool calls to the connected tab and returns its answers and errors', async () => {
    bridge = await startBridge({ port: 0 });
    const client = new Client({ name: 'test', version: '1.0.0' }), [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([createServer(bridge).connect(a), client.connect(b)]);
    const tools = (await client.listTools()).tools.map(t => t.name);
    expect(tools).toEqual(expect.arrayContaining(['get_board', 'add_shapes', 'update_shapes', 'connect_shapes', 'delete_items', 'list_boards', 'create_board', 'connection_status']));
    const offline = await client.callTool({ name: 'get_board', arguments: {} });
    expect(offline.isError).toBe(true);
    expect(JSON.stringify(offline.content)).toContain('No Whirl board is connected');
    tab = await connectTab();
    const seen: unknown[] = [];
    tab.on('message', raw => {
      const { id, method, params } = JSON.parse(String(raw)); seen.push({ method, params });
      tab!.send(JSON.stringify(method === 'delete_items' ? { id, error: 'nope' } : { id, result: { ids: ['x'] } }));
    });
    const added = await client.callTool({ name: 'add_shapes', arguments: { shapes: [{ kind: 'sticky', text: 'Hi' }] } });
    expect(JSON.parse((added.content as { text: string }[])[0].text)).toEqual({ ids: ['x'] });
    expect(seen).toEqual([{ method: 'add_shapes', params: { shapes: [{ kind: 'sticky', text: 'Hi' }] } }]);
    const failed = await client.callTool({ name: 'delete_items', arguments: { ids: ['x'] } });
    expect(failed).toMatchObject({ isError: true, content: [{ text: 'nope' }] });
    const invalid = await client.callTool({ name: 'add_shapes', arguments: { shapes: [{ kind: 'image' }] } });
    expect(invalid.isError).toBe(true);
    expect(seen).toHaveLength(2);
    const status = await client.callTool({ name: 'connection_status', arguments: {} });
    expect(JSON.parse((status.content as { text: string }[])[0].text)).toEqual({ connected: true, port: bridge.port });
    await client.close();
  });
});

describe('MCP bridge robustness', () => {
  it('ignores malformed replies from the tab', async () => {
    const bridge = await startBridge({ port: 0 });
    const tab = await new Promise<WebSocket>((resolve, reject) => { const ws = new WebSocket(`ws://127.0.0.1:${bridge.port}`, { headers: { Origin: 'http://localhost:5173' } }); ws.once('open', () => resolve(ws)); ws.once('error', reject); });
    tab.on('message', raw => { const { id } = JSON.parse(String(raw)); for (const junk of ['null', '42', '"x"', '[]', '{']) tab.send(junk); tab.send(JSON.stringify({ id, result: 'ok' })); });
    await expect(bridge.call('get_board')).resolves.toBe('ok');
    tab.close(); await bridge.close();
  });
});
