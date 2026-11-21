import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startBridge } from '../../packages/mcp/src/bridge';

// Set WHIRL_DESKTOP_EXECUTABLE to test a packaged build instead of the source tree.
const packaged = process.env.WHIRL_DESKTOP_EXECUTABLE;
const launch = (userData: string) => electron.launch({ executablePath: packaged, args: [...(packaged ? [] : ['apps/desktop']), `--user-data-dir=${userData}`, ...(process.platform === 'linux' ? ['--no-sandbox'] : [])] });

test('the desktop app opens Whirl, keeps boards between launches, and connects to the MCP server', async () => {
  const userData = await mkdtemp(join(tmpdir(), 'whirl-desktop-')), bridge = await startBridge({ port: 7331 });
  try {
    let app = await launch(userData), win = await app.firstWindow();
    expect(win.url()).toBe('app://whirl/');
    await expect(win.getByLabel('Board title')).toHaveValue('A little room for big ideas');
    await win.getByLabel('Board title').fill('Desktop board');
    await win.getByRole('button', { name: 'Connect AI assistant (MCP)' }).click();
    await expect.poll(() => bridge.connected()).toBe(true);
    const { ids } = await bridge.call('add_shapes', { shapes: [{ kind: 'sticky', text: 'Made on the desktop' }] }) as { ids: string[] };
    expect(ids).toHaveLength(1);
    await expect(win.getByText('Saved on this device', { exact: true })).toBeVisible();
    await app.evaluate(({ shell }) => { shell.openExternal = async url => { (globalThis as { opened?: string }).opened = url; }; });
    await win.evaluate(() => window.open('https://example.com/', '_blank'));
    await expect.poll(() => app.evaluate(() => (globalThis as { opened?: string }).opened)).toBe('https://example.com/');
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
    await app.close();

    app = await launch(userData); win = await app.firstWindow();
    await expect(win.getByLabel('Board title')).toHaveValue('Desktop board');
    await expect(win.getByRole('button', { name: 'Connect AI assistant (MCP)' })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => bridge.connected()).toBe(true);
    expect(((await bridge.call('get_board')) as { shapes: { text: string }[] }).shapes.map(s => s.text)).toContain('Made on the desktop');
    const missing = await win.evaluate(() => fetch('/no/such/file').then(r => r.text()));
    expect(missing).toContain('<div id="root">');
    await app.close();
  } finally { await bridge.close(); await rm(userData, { recursive: true, force: true }); }
});
