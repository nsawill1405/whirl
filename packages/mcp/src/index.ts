import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { startBridge } from './bridge.js';
import { createServer } from './server.js';

const port = Number(process.env.WHIRL_MCP_PORT ?? 7331);
const origins = (process.env.WHIRL_MCP_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean);
const bridge = await startBridge({ port, origins }).catch(error => {
  console.error(`whirl-mcp: could not listen on 127.0.0.1:${port} (${error instanceof Error ? error.message : error}). Set WHIRL_MCP_PORT to use another port.`);
  process.exit(1);
});
console.error(`whirl-mcp: waiting for a Whirl tab on ws://127.0.0.1:${bridge.port}`);
await createServer(bridge).connect(new StdioServerTransport());
const shutdown = () => { void bridge.close().finally(() => process.exit(0)); };
process.stdin.on('close', shutdown);
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
