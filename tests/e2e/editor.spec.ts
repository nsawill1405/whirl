import { test, expect, type Page } from '@playwright/test';
async function blank(page: Page) { await page.goto('/'); await expect(page.getByLabel('Board title')).toHaveValue('A little room for big ideas'); await page.getByRole('button', { name: 'My boards' }).click(); await page.getByRole('button', { name: 'New board', exact: true }).click(); await expect(page.getByLabel('Board title')).toHaveValue('Untitled board'); }
async function add(page: Page, tool: string, x: number, y: number) { await page.getByRole('button', { name: tool, exact: true }).click(); await page.locator('canvas').click({ position: { x, y } }); }
test('draw, connect, edit, move, resize, undo, duplicate, persist, and export', async ({ page }) => {
  await blank(page);
  await add(page, 'Rectangle (R)', 320, 230);
  await page.locator('canvas').dblclick({ position: { x: 375, y: 260 } }); await page.getByRole('textbox', { name: 'Shape text' }).fill('Start here'); await page.getByRole('textbox', { name: 'Shape text' }).press('Enter');
  await add(page, 'Ellipse (O)', 750, 230);
  await page.getByRole('button', { name: 'Connector (C)' }).click(); await page.locator('canvas').click({ position: { x: 375, y: 260 } }); await page.locator('canvas').click({ position: { x: 820, y: 265 } });
  await page.getByRole('button', { name: 'Edit text', exact: true }).click(); await page.getByRole('textbox', { name: 'Shape text' }).fill('next'); await page.getByRole('textbox', { name: 'Shape text' }).press('Enter');
  const canvas = await page.locator('canvas').boundingBox(); if (!canvas) throw new Error('Canvas missing');
  await page.mouse.move(canvas.x + 375, canvas.y + 260); await page.mouse.down(); await page.mouse.move(canvas.x + 430, canvas.y + 310, { steps: 5 }); await page.mouse.up();
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await page.getByRole('button', { name: 'Toggle layers' }).click(); await page.getByRole('complementary').getByRole('button', { name: 'Start here' }).click(); await page.getByRole('button', { name: 'Duplicate selection' }).click();
  await expect(page.getByRole('complementary').getByRole('button', { name: 'Start here', exact: true })).toHaveCount(2);
  await page.getByLabel('Board title').fill('My first flow'); await expect(page.getByText('Saved on this device')).toBeVisible();
  const downloaded = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export' }).click(); await page.getByRole('button', { name: /Whirl board/ }).click(); const file = await downloaded; expect(file.suggestedFilename()).toBe('My-first-flow.whirl.json');
  const fs = await import('node:fs/promises'); const data = JSON.parse(await fs.readFile((await file.path())!, 'utf8')); expect(data.nodes).toHaveLength(3); expect(data.edges).toHaveLength(1); expect(data.edges[0].text).toBe('next');
  await page.reload(); await page.getByRole('button', { name: 'My boards' }).click(); await page.getByRole('button', { name: /^My first flow/ }).click(); await page.getByRole('button', { name: 'Toggle layers' }).click(); await expect(page.getByRole('complementary').getByRole('button', { name: 'Start here', exact: true })).toHaveCount(2);
});
test('templates preserve existing boards and invalid imports do not replace data', async ({ page }) => {
  await blank(page); await page.getByLabel('Board title').fill('Keep me'); await page.getByRole('button', { name: 'Templates', exact: true }).click(); await page.getByRole('button', { name: /Find your flow/ }).click(); await expect(page.getByLabel('Board title')).toHaveValue('The next big thing');
  await page.locator('input[type=file]').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"title":"Bad","nodes":[{}],"edges":[]}') }); await expect(page.getByRole('status')).toContainText('invalid shape'); await expect(page.getByLabel('Board title')).toHaveValue('The next big thing');
  await page.getByRole('button', { name: 'My boards' }).click(); await expect(page.getByRole('button', { name: /^Keep me/ })).toBeVisible();
});
test('small screens keep drawing tools, zoom, and templates reachable', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 }); await page.goto('/'); await expect(page.getByRole('button', { name: 'Rectangle (R)' })).toBeInViewport(); await expect(page.getByRole('button', { name: 'Zoom in', exact: true })).toBeInViewport(); await page.getByRole('button', { name: 'Templates', exact: true }).click(); await expect(page.getByRole('dialog')).toBeVisible(); await expect(page.getByRole('button', { name: /A clean slate/ })).toBeInViewport();
});
