import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { Board } from '../../packages/scene/src';

async function board(page: Page): Promise<Board> {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('button', { name: /Whirl board Editable backup/ }).click();
  return JSON.parse(await readFile((await (await download).path())!, 'utf8'));
}
for (const kind of ['Rectangle (R)', 'Sticky note (S)', 'Text (T)', 'image']) {
  for (const zoomed of [false, true]) {
    test(`${kind} resizes immediately and after selection at ${zoomed ? '83' : '100'} percent`, async ({ page }) => {
      await page.goto('/');
      await page.getByRole('button', { name: 'New board', exact: true }).click();
      if (zoomed) await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
      const zoom = zoomed ? 1 / 1.2 : 1, canvas = (await page.locator('canvas').boundingBox())!;
      const x = kind === 'image' ? canvas.width / 2 : 300, y = kind === 'image' ? canvas.height / 2 : 220;
      if (kind === 'image') {
        await page.locator('input[type=file]').setInputFiles({ name: 'pixel.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG8sAAAAASUVORK5CYII=', 'base64') });
      } else {
        await page.getByRole('button', { name: kind, exact: true }).click();
        await page.locator('canvas').click({ position: { x, y } });
      }
      // Keep the automatic sticky/text editor open for the very first resize.
      const width = kind === 'image' ? 48 : kind.startsWith('Sticky') ? 176 : kind.startsWith('Text') ? 220 : 184;
      const height = kind === 'image' ? 40 : kind.startsWith('Sticky') ? 152 : kind.startsWith('Text') ? 86 : 88;
      const start = { x: canvas.x + x + width * zoom + 4, y: canvas.y + y + height * zoom + 4 };
      await page.mouse.move(start.x, start.y); await page.mouse.down();
      await page.mouse.move(start.x + 50, start.y + 40, { steps: 5 }); await page.mouse.up();
      const resized = (await board(page)).nodes[0];
      expect.soft(resized.width).toBeGreaterThan(width + 20);
      if (resized.width > width) await page.getByRole('button', { name: 'Undo', exact: true }).click();
      expect((await board(page)).nodes[0].width).toBe(width);
      await page.locator('canvas').click({ position: { x: 100, y: 150 } });
      await page.locator('canvas').click({ position: { x: x + 10, y: y + 10 } });
      await page.mouse.move(start.x, start.y); await page.mouse.down();
      await page.mouse.move(start.x + 50, start.y + 40, { steps: 5 }); await page.mouse.up();
      expect((await board(page)).nodes[0].width).toBeGreaterThan(width + 20);
    });
  }
}
for (const kind of ['Sticky note (S)', 'Text (T)']) {
  test(`${kind} commits the draft and grows height when narrowing from a corner`, async ({ page }) => {
    await page.goto('/'); await page.getByRole('button', { name: 'New board', exact: true }).click();
    const canvas = (await page.locator('canvas').boundingBox())!;
    await page.getByRole('button', { name: kind, exact: true }).click();
    await page.mouse.move(canvas.x + 300, canvas.y + 220); await page.mouse.down();
    await page.mouse.move(canvas.x + 660, canvas.y + 372, { steps: 5 }); await page.mouse.up();
    const text = 'Keep every word visible when the note becomes much narrower.';
    await page.getByRole('textbox', { name: 'Shape text' }).fill(text);
    await page.mouse.move(canvas.x + 664, canvas.y + 376); await page.mouse.down();
    await page.mouse.move(canvas.x + 424, canvas.y + 376, { steps: 5 }); await page.mouse.up();
    const node = (await board(page)).nodes[0];
    expect(node.text).toBe(text); expect(node.width).toBe(120); expect(node.height).toBeGreaterThan(152);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    const undone = (await board(page)).nodes[0];
    expect(undone.width).toBe(360); expect(undone.text).toBe(text);
  });
}
