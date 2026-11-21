import { test, expect } from '@playwright/test';
import { startBridge } from '../../packages/mcp/src/bridge';

test('an MCP client can read and edit the open board through the plug connection', async ({ page }) => {
  const bridge = await startBridge({ port: 0 });
  try {
    await page.addInitScript(port => localStorage.setItem('whirl.mcp.port', String(port)), bridge.port);
    await page.goto('/'); await page.getByRole('button', { name: 'New board', exact: true }).click();
    const plug = page.getByRole('button', { name: 'Connect AI assistant (MCP)' });
    await expect(plug).toHaveAttribute('aria-pressed', 'false');
    await plug.click();
    await expect(page.getByRole('status')).toContainText('AI assistant connected');
    await expect.poll(() => bridge.connected()).toBe(true);
    const created = await bridge.call('create_board', { title: 'Launch plan' }) as { id: string };
    await expect(page.getByRole('textbox', { name: 'Board title' })).toHaveValue('Launch plan');
    const { ids } = await bridge.call('add_shapes', { shapes: [{ kind: 'sticky', text: 'Write the announcement', color: 'green' }, { kind: 'rectangle', text: 'Ship it' }] }) as { ids: string[] };
    await bridge.call('connect_shapes', { connectors: [{ source: ids[0], target: ids[1], text: 'then' }] });
    const board = await bridge.call('get_board') as { id: string; shapes: { id: string; text: string; color: string }[]; connectors: { source: string; target: string; text: string }[] };
    expect(board.id).toBe(created.id);
    expect(board.shapes.map(s => s.text)).toEqual(['Write the announcement', 'Ship it']);
    expect(board.connectors).toEqual([expect.objectContaining({ source: ids[0], target: ids[1], text: 'then' })]);
    await expect(bridge.call('connect_shapes', { connectors: [{ source: ids[0], target: 'nope' }] })).rejects.toThrow('No shape with id "nope"');
    await page.keyboard.press('Control+z');
    await expect.poll(async () => ((await bridge.call('get_board')) as typeof board).connectors.length).toBe(0);
    await plug.click();
    await expect(plug).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => bridge.connected()).toBe(false);
    await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('textbox', { name: 'Board title' })).toHaveValue('Launch plan');
    await expect(plug).toHaveAttribute('aria-pressed', 'false');
  } finally { await bridge.close(); }
});
