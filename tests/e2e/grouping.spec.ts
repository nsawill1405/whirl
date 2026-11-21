import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { pasteShortcut } from './clipboard';
import { bounds, type Board } from '../../packages/scene/src';

const fixture = {
  title: 'Grouping checks',
  nodes: [
    { id: 'a', kind: 'rectangle', x: 101, y: 201, width: 180, height: 88, text: 'First idea', color: '#eee9ff' },
    { id: 'b', kind: 'ellipse', x: 450, y: 240, width: 184, height: 120, text: 'Second idea', color: '#e5f3ee' },
    { id: 'other', kind: 'rectangle', x: 800, y: 200, width: 184, height: 88, text: 'Outside group', color: '#ffffff' },
  ],
  edges: [{ id: 'inside', source: 'a', target: 'b', text: 'Together' }, { id: 'outside', source: 'b', target: 'other', text: 'External' }],
};
async function open(page: Page) {
  await page.goto('/');
  await expect(page.getByLabel('Board title')).toHaveValue('A little room for big ideas');
  await page.locator('input[type=file]').setInputFiles({ name: 'groups.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture)) });
  await expect(page.getByLabel('Board title')).toHaveValue(fixture.title);
  await page.getByRole('button', { name: 'Toggle layers' }).click();
  const layers = page.getByRole('complementary');
  await layers.getByRole('button', { name: 'First idea', exact: true }).click();
  await layers.getByRole('button', { name: 'Second idea', exact: true }).click({ modifiers: ['Shift'] });
  await page.getByRole('button', { name: 'Close layers' }).click();
}
async function file(page: Page, name: string) {
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('button', { name, exact: true }).click();
  return readFile((await (await downloaded).path())!);
}
async function board(page: Page): Promise<Board> { return JSON.parse((await file(page, 'Whirl board Editable backup · .json JSON')).toString()); }
async function coordinates(page: Page, scene: Pick<Board, 'nodes'>) {
  await page.getByRole('button', { name: 'Fit board', exact: true }).click();
  const canvas = (await page.locator('canvas').boundingBox())!, b = bounds(scene.nodes);
  const zoom = Math.min(1, Math.max(0.1, Math.min((canvas.width - 150) / (b.width + 70), (canvas.height - 150) / (b.height + 70))));
  return (x: number, y: number) => ({ x: canvas.x + (canvas.width - b.width * zoom) / 2 + (x - b.x) * zoom, y: canvas.y + (canvas.height - b.height * zoom) / 2 + (y - b.y) * zoom });
}
for (const modifier of ['Control', 'Meta']) {
  test(`${modifier}: groups move and resize as one, copy independently, persist, and ungroup with history`, async ({ page }) => {
    await open(page);
    await page.keyboard.press(`${modifier}+g`);
    await expect(page.getByText('Group · 2 shapes', { exact: true })).toBeVisible();
    const grouped = await board(page), id = grouped.nodes[0].groupId;
    expect(id).toBeTruthy(); expect(grouped.nodes[1].groupId).toBe(id); expect(grouped.nodes[2].groupId).toBeUndefined();
    const groupedPoint = (await coordinates(page, grouped))(191, 245);
    await page.mouse.dblclick(groupedPoint.x, groupedPoint.y);
    await expect(page.getByRole('textbox', { name: 'Shape text' })).toHaveCount(0);
    await expect(page.getByText('Group · 2 shapes', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    let point = await coordinates(page, grouped), start = point(191, 245);
    await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(start.x + 80, start.y + 48, { steps: 5 }); await page.mouse.up();
    await expect(page.getByRole('button', { name: 'Ungroup selection', exact: true })).toBeVisible();
    const moved = await board(page);
    for (const i of [0, 1]) expect(moved.nodes[i]).toMatchObject({ x: grouped.nodes[i].x + 80, y: grouped.nodes[i].y + 48 });
    expect(moved.nodes[2]).toEqual(grouped.nodes[2]);
    point = await coordinates(page, moved);
    const box = bounds(moved.nodes.slice(0, 2)); start = point(box.x + box.width + 4, box.y + box.height + 4);
    await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(start.x + 100, start.y + 80, { steps: 5 }); await page.mouse.up();
    const resized = await board(page);
    for (const i of [0, 1]) { expect(resized.nodes[i].width).toBeGreaterThan(moved.nodes[i].width); expect(resized.nodes[i].height).toBeGreaterThan(moved.nodes[i].height); }
    expect(resized.nodes[2]).toEqual(grouped.nodes[2]);
    await page.locator('canvas').focus(); await page.keyboard.press(`${modifier}+c`); await pasteShortcut(page, modifier);
    const copied = await board(page);
    expect(copied.nodes).toHaveLength(5); expect(copied.edges).toHaveLength(3);
    expect(copied.nodes[3].groupId).toBe(copied.nodes[4].groupId); expect(copied.nodes[3].groupId).not.toBe(id);
    expect(copied.edges[2]).toMatchObject({ source: copied.nodes[3].id, target: copied.nodes[4].id, text: 'Together' });
    await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible(); await page.reload();
    const restored = await board(page); expect(restored.nodes).toEqual(copied.nodes);
    await page.getByRole('button', { name: 'Toggle layers' }).click();
    await page.getByRole('complementary').getByRole('button', { name: /First idea/ }).first().click();
    await page.getByRole('button', { name: 'Close layers' }).click();
    await expect(page.getByText('Group · 2 shapes', { exact: true })).toBeVisible();
    await page.keyboard.press(`${modifier}+Shift+g`);
    expect((await board(page)).nodes.slice(0, 2).every(n => !n.groupId)).toBe(true);
    await page.locator('canvas').focus(); await page.keyboard.press(`${modifier}+z`);
    expect((await board(page)).nodes[0].groupId).toBe(id);
    await page.locator('canvas').focus(); await page.keyboard.press(`${modifier}+Shift+z`);
    expect((await board(page)).nodes[0].groupId).toBeUndefined();
  });
}
test('group buttons, atomic layer/marquee selection, deletion, and selection exports round-trip', async ({ page }) => {
  await open(page); await page.getByRole('button', { name: 'Group selection', exact: true }).click();
  const grouped = await board(page);
  const selection = JSON.parse((await file(page, 'Selection as JSON Editable group backup')).toString()) as Board;
  expect(selection.nodes).toHaveLength(2); expect(selection.edges).toHaveLength(1); expect(selection.nodes[0].groupId).toBe(grouped.nodes[0].groupId);
  const svg = (await file(page, 'Selection as SVG Only your selected shapes')).toString();
  expect(svg).toContain('First idea'); expect(svg).toContain('Second idea'); expect(svg).toContain('Together'); expect(svg).not.toContain('Outside group'); expect(svg).not.toContain('External');
  const png = await file(page, 'Selection as PNG Only your selected shapes');
  expect(png.subarray(1, 4).toString()).toBe('PNG'); expect(png.readUInt32BE(16)).toBe(Math.round((bounds(selection.nodes).width + 120) * 2));
  await page.keyboard.press('Escape'); const point = await coordinates(page, grouped), a = point(90, 190), b = point(290, 300);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 5 }); await page.mouse.up();
  await expect(page.getByText('Group · 2 shapes', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Toggle layers' }).click(); const layers = page.getByRole('complementary');
  await expect(layers.getByRole('button', { name: /First idea/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(layers.getByRole('button', { name: /Second idea/ })).toHaveAttribute('aria-pressed', 'true');
  await layers.getByRole('button', { name: /Second idea/ }).click({ modifiers: ['Shift'] });
  await expect(layers.getByRole('button', { name: /First idea/ })).toHaveAttribute('aria-pressed', 'false');
  await layers.getByRole('button', { name: /First idea/ }).click(); await page.getByRole('button', { name: 'Close layers' }).click();
  await page.getByRole('button', { name: 'Delete selection', exact: true }).click();
  const deleted = await board(page); expect(deleted.nodes.map(n => n.id)).toEqual(['other']); expect(deleted.edges).toHaveLength(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); expect((await board(page)).nodes).toEqual(grouped.nodes);
  await page.locator('input[type=file]').setInputFiles({ name: 'selection.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(selection)) });
  await expect(page.locator('canvas')).toHaveAttribute('aria-label', /2 shapes/);
  await page.locator('canvas').focus(); await page.keyboard.press('Control+a');
  await expect(page.getByRole('button', { name: 'Ungroup selection', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Ungroup selection', exact: true }).click();
  expect((await board(page)).nodes.every(n => !n.groupId)).toBe(true);
});
test('group shortcuts ignore editable fields and IME composition', async ({ page }) => {
  await open(page);
  await page.getByLabel('Board title').dispatchEvent('keydown', { key: 'g', metaKey: true });
  await page.locator('canvas').dispatchEvent('keydown', { key: 'g', ctrlKey: true, isComposing: true });
  expect((await board(page)).nodes.every(n => !n.groupId)).toBe(true);
});
