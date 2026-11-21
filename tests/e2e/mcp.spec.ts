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

test('a newer tab takes over the MCP connection without the tabs fighting over it', async ({ page, context }) => {
  const bridge = await startBridge({ port: 0 });
  try {
    await context.addInitScript(port => localStorage.setItem('whirl.mcp.port', String(port)), bridge.port);
    await page.goto('/');
    const plug = (p: typeof page) => p.getByRole('button', { name: 'Connect AI assistant (MCP)' });
    await plug(page).click();
    await expect(plug(page)).toHaveClass(/connected/);
    const other = await context.newPage(); await other.goto('/');
    await expect(plug(other)).toHaveAttribute('aria-pressed', 'true');
    await expect(plug(other)).toHaveClass(/connected/);
    await expect(page.getByRole('status')).toContainText('Another Whirl tab took over');
    await expect(plug(page)).toHaveAttribute('aria-pressed', 'false');
    await page.waitForTimeout(2500);
    await expect(plug(page)).toHaveAttribute('aria-pressed', 'false');
    await expect(plug(other)).toHaveClass(/connected/);
    await other.reload();
    await expect(plug(other)).toHaveAttribute('aria-pressed', 'true');
  } finally { await bridge.close(); }
});

test('assistant edits keep the text the user is typing', async ({ page }) => {
  const bridge = await startBridge({ port: 0 });
  try {
    await page.addInitScript(port => localStorage.setItem('whirl.mcp.port', String(port)), bridge.port);
    await page.goto('/'); await page.getByRole('button', { name: 'New board', exact: true }).click();
    await page.getByRole('button', { name: 'Connect AI assistant (MCP)' }).click();
    await expect.poll(() => bridge.connected()).toBe(true);
    await page.locator('canvas').focus(); await page.keyboard.press('s'); await page.keyboard.press('Enter');
    await page.getByLabel('Shape text').fill('My draft');
    await bridge.call('add_shapes', { shapes: [{ kind: 'rectangle', text: 'From AI' }] });
    await expect(page.getByLabel('Shape text')).toHaveCount(0);
    const board = await bridge.call('get_board') as { shapes: { id: string; text: string }[] };
    expect(board.shapes.map(s => s.text)).toEqual(['My draft', 'From AI']);
    await page.locator('canvas').focus(); await page.keyboard.press('Control+a'); await page.keyboard.press('Escape');
    await bridge.call('update_shapes', { shapes: [{ id: board.shapes[0].id, text: 'Rewritten by AI' }] });
    await expect.poll(async () => ((await bridge.call('get_board')) as typeof board).shapes[0].text).toBe('Rewritten by AI');
  } finally { await bridge.close(); }
});
