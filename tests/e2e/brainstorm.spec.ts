import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function blank(page: Page) {
  await page.goto('/');
  await expect(page.getByLabel('Board title')).toHaveValue('A little room for big ideas');
  await page.getByRole('button', { name: 'My boards' }).click();
  await page.getByRole('button', { name: 'New board', exact: true }).click();
  await expect(page.getByLabel('Board title')).toHaveValue('Untitled board');
}
async function exported(page: Page, format: 'Whirl board' | 'SVG image') {
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('button', { name: new RegExp(format) }).click();
  return readFile((await (await downloaded).path())!, 'utf8');
}
test('new stickies and text open for typing and preserve long multiline ideas', async ({ page }) => {
  await blank(page);
  for (const [tool, x] of [['Sticky note (S)', 360], ['Text (T)', 740]] as const) {
    await page.getByRole('button', { name: tool, exact: true }).click();
    await page.locator('canvas').click({ position: { x, y: 220 } });
    const editor = page.getByRole('textbox', { name: 'Shape text' });
    await expect(editor).toBeFocused();
    const initial = await editor.boundingBox();
    await editor.fill('Listen to neighbors\nInvite local makers\nShare repair skills\nWelcome first timers\nOffer spare parts\nRepair together\nCelebrate every fix');
    await expect.poll(async () => (await editor.boundingBox())!.height).toBeGreaterThan(initial!.height);
    await editor.press('Enter');
    await expect(editor).toHaveCount(0);
  }
  const board = JSON.parse(await exported(page, 'Whirl board'));
  expect(board.nodes).toHaveLength(2);
  for (const n of board.nodes) {
    expect(n.text).toContain('Celebrate every fix');
    expect(n.height).toBeGreaterThan(n.kind === 'sticky' ? 152 : 64);
  }
  const image = await exported(page, 'SVG image');
  expect(image.replace(/<[^>]*>/g, ' ').match(/Celebrate\s+every\s+fix/g)).toHaveLength(2);
  await expect(page.getByText('Saved on this device')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Toggle layers' }).click();
  await expect(page.getByRole('complementary').getByRole('button', { name: /Celebrate every fix/ })).toHaveCount(2);
});
test('Layers reveals offscreen ideas before editing', async ({ page }) => {
  await blank(page);
  await page.getByRole('button', { name: 'Sticky note (S)', exact: true }).click();
  await page.locator('canvas').click({ position: { x: 500, y: 280 } });
  const editor = page.getByRole('textbox', { name: 'Shape text' });
  await editor.fill('Find this idea'); await editor.press('Enter');
  await page.keyboard.down('Alt');
  await page.mouse.move(700, 500); await page.mouse.down();
  await page.mouse.move(-1000, 500, { steps: 10 }); await page.mouse.up();
  await page.keyboard.up('Alt');
  await page.getByRole('button', { name: 'Toggle layers' }).click();
  await page.getByRole('complementary').getByRole('button', { name: 'Find this idea' }).dblclick();
  await expect(editor).toBeInViewport({ ratio: 1 });
  await expect(editor).toBeFocused();
  await editor.fill('Found and updated'); await editor.press('Enter');
  expect(JSON.parse(await exported(page, 'Whirl board')).nodes[0].text).toBe('Found and updated');
});
test('a short label does not retain the default placeholder height', async ({ page }) => {
  await blank(page);
  await page.getByRole('button', { name: 'Text (T)', exact: true }).click();
  const canvas = (await page.locator('canvas').boundingBox())!;
  await page.mouse.move(canvas.x + 500, canvas.y + 250); await page.mouse.down();
  await page.mouse.move(canvas.x + 548, canvas.y + 290, { steps: 5 }); await page.mouse.up();
  const editor = page.getByRole('textbox', { name: 'Shape text' });
  await editor.fill('Hi'); await editor.press('Enter');
  const label = JSON.parse(await exported(page, 'Whirl board')).nodes[0];
  expect(label.height).toBeLessThan(100);
  expect(label.text).toBe('Hi');
});
test('zoom reset preserves the world point at the viewport center', async ({ page }) => {
  await blank(page);
  await page.getByRole('button', { name: 'Sticky note (S)', exact: true }).click();
  await page.locator('canvas').click({ position: { x: 540, y: 330 } });
  const editor = page.getByRole('textbox', { name: 'Shape text' });
  await editor.press('Enter');
  await page.getByRole('button', { name: 'Reset zoom to 100 percent' }).click();
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click({ clickCount: 2 });
  await page.getByRole('button', { name: 'Edit text', exact: true }).click();
  const before = (await editor.boundingBox())!, canvas = (await page.locator('canvas').boundingBox())!;
  const zoom = before.width / 176;
  await editor.press('Escape');
  await page.getByRole('button', { name: 'Reset zoom to 100 percent' }).click();
  await page.getByRole('button', { name: 'Edit text', exact: true }).click();
  const after = (await editor.boundingBox())!;
  expect(after.x).toBeCloseTo(canvas.x + canvas.width / 2 + (before.x - canvas.x - canvas.width / 2) / zoom, 0);
  expect(after.y).toBeCloseTo(canvas.y + canvas.height / 2 + (before.y - canvas.y - canvas.height / 2) / zoom, 0);
});
