import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Bridge } from './bridge.js';

const kind = z.enum(['rectangle', 'ellipse', 'diamond', 'sticky', 'text']);
const color = z.string().describe('white, purple, green, yellow, orange, blue, or a #rrggbb hex colour');
const geometry = { x: z.number().optional(), y: z.number().optional(), width: z.number().min(24).max(20000).optional(), height: z.number().min(24).max(20000).optional() };

export function createServer(bridge: Bridge) {
  const server = new McpServer({ name: 'whirl', version: '0.1.0' });
  const relay = (method: string) => async (params: unknown) => {
    try { return { content: [{ type: 'text' as const, text: JSON.stringify(await bridge.call(method, params), null, 2) }] }; }
    catch (error) { return { isError: true, content: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }] }; }
  };
  const tool = (name: string, description: string, inputSchema: z.ZodRawShape, readOnly = false) =>
    server.registerTool(name, { description, inputSchema, annotations: { readOnlyHint: readOnly } }, relay(name));

  tool('list_boards', 'List every board saved in the connected Whirl tab and which one is open.', {}, true);
  tool('get_board', 'Read the open board: its shapes (id, kind, position, size, text, colour, group) and connectors. Coordinates are canvas units; y grows downward.', {}, true);
  tool('open_board', 'Switch the Whirl tab to another board.', { id: z.string() });
  tool('create_board', 'Create a new empty board and open it.', { title: z.string().max(200).optional() });
  tool('rename_board', 'Rename the open board.', { title: z.string().min(1).max(200) });
  tool('add_shapes', 'Add shapes to the open board. Shapes without x/y are laid out in a row below the existing content. Returns the new shape ids in order.', {
    shapes: z.array(z.object({ kind, text: z.string().max(10000).optional(), color: color.optional(), ...geometry })).min(1).max(200),
  });
  tool('update_shapes', 'Change the text, colour, position, or size of existing shapes.', {
    shapes: z.array(z.object({ id: z.string(), text: z.string().max(10000).optional(), color: color.optional(), ...geometry })).min(1).max(500),
  });
  tool('connect_shapes', 'Draw connectors (arrows) between shapes. Returns the new connector ids.', {
    connectors: z.array(z.object({ source: z.string(), target: z.string(), text: z.string().max(500).optional() })).min(1).max(500),
  });
  tool('update_connectors', 'Change the label of existing connectors.', { connectors: z.array(z.object({ id: z.string(), text: z.string().max(500) })).min(1).max(500) });
  tool('delete_items', 'Delete shapes and/or connectors by id. Connectors attached to deleted shapes are removed too.', { ids: z.array(z.string()).min(1).max(5000) });
  tool('group_shapes', 'Group shapes so they move and resize together, or ungroup them.', { ids: z.array(z.string()).min(1), ungroup: z.boolean().optional() });
  tool('fit_view', 'Zoom and pan the Whirl canvas so the whole board is visible.', {});
  server.registerTool('connection_status', { description: 'Report whether a Whirl browser tab is connected to this server.', annotations: { readOnlyHint: true } },
    async () => ({ content: [{ type: 'text' as const, text: JSON.stringify({ connected: bridge.connected(), port: bridge.port }) }] }));
  return server;
}
