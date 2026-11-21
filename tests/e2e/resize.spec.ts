import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { Board } from '../../packages/scene/src';

async function board(page: Page): Promise<Board> {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('button', { name: /Whirl board Editable backup/ }).click();
  return JSON.parse(await readFile((await (await download).path())!, 'utf8'));
}
test('the nearest corner wins when handle hit areas overlap at minimum zoom', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'New board', exact: true }).click();
  const canvas = (await page.locator('canvas').boundingBox())!;
  await page.getByRole('button', { name: 'Rectangle (R)', exact: true }).click();
  await page.locator('canvas').click({ position: { x: 300, y: 220 } });
  await page.mouse.move(canvas.x + 488, canvas.y + 312); await page.mouse.down();
  await page.mouse.move(canvas.x + 288, canvas.y + 212, { steps: 5 }); await page.mouse.up();
  const small = (await board(page)).nodes[0];
  expect(small.width).toBe(24); expect(small.height).toBe(24);
  for (let i = 0; i < 13; i++) await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Reset zoom to 100 percent' })).toHaveText('10%');
  const x = canvas.x + canvas.width / 2 + (300 - canvas.width / 2 + 24) * 0.1 + 4;
  const y = canvas.y + canvas.height / 2 + (220 - canvas.height / 2 + 24) * 0.1 + 4;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + 60, y + 20, { steps: 5 }); await page.mouse.up();
  const resized = (await board(page)).nodes[0];
  expect(resized.x).toBe(small.x); expect(resized.y).toBe(small.y);
  expect(resized.width).toBeCloseTo(624); expect(resized.height).toBeCloseTo(224);
});
test('a new text editor does not intercept its southeast handle at 40 percent zoom', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'New board', exact: true }).click();
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  const zoom = (1 / 1.2) ** 5, canvas = (await page.locator('canvas').boundingBox())!;
  await page.getByRole('button', { name: 'Text (T)', exact: true }).click();
  await page.locator('canvas').click({ position: { x: 300, y: 220 } });
  const editor = (await page.getByRole('textbox', { name: 'Shape text' }).boundingBox())!;
  expect(editor.width).toBeCloseTo(220 * zoom, 0);
  const x = canvas.x + 300 + 220 * zoom + 4, y = canvas.y + 220 + 86 * zoom + 4;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + 60, y + 20, { steps: 5 }); await page.mouse.up();
  expect((await board(page)).nodes[0].width).toBeGreaterThan(300);
});
test('link cards resize without losing their URL and support undo', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'New board', exact: true }).click();
  await page.getByRole('button', { name: 'Add link', exact: true }).click();
  await page.getByLabel('Link URL').fill('https://example.com/notes'); await page.getByLabel('Link URL').press('Enter');
  const canvas = (await page.locator('canvas').boundingBox())!, before = (await board(page)).nodes[0];
  const x = canvas.x + canvas.width / 2 + before.width / 2 + 4, y = canvas.y + canvas.height / 2 + before.height / 2 + 4;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + 60, y + 20, { steps: 5 }); await page.mouse.up();
  const resized = (await board(page)).nodes[0];
  expect(resized.width).toBe(before.width + 60); expect(resized.height).toBe(before.height + 20);
  expect(resized.url).toBe(before.url);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect((await board(page)).nodes[0]).toEqual(before);
});
test('a growing narrow sticky editor stays inside the workspace near the bottom', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({ name: 'narrow.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ title: 'Narrow sticky', nodes: [{ id: 'narrow', kind: 'sticky', x: 0, y: 0, width: 24, height: 80, text: 'Note', color: '#fff2cc' }], edges: [] })) });
  await expect(page.getByLabel('Board title')).toHaveValue('Narrow sticky');
  const canvas = (await page.locator('canvas').boundingBox())!;
  const x = canvas.x + canvas.width / 2, y = canvas.y + canvas.height - 140;
  await page.mouse.move(x, canvas.y + canvas.height / 2); await page.mouse.down();
  await page.mouse.move(x, y, { steps: 5 }); await page.mouse.up();
  await page.mouse.dblclick(x, y);
  const editor = page.getByRole('textbox', { name: 'Shape text' });
  await editor.fill(Array.from({ length: 12 }, (_, i) => `Line ${i + 1}`).join('\n'));
  const rect = (await editor.boundingBox())!;
  expect(rect.x).toBeGreaterThanOrEqual(canvas.x); expect(rect.x + rect.width).toBeLessThanOrEqual(canvas.x + canvas.width);
  expect(rect.y).toBeGreaterThanOrEqual(canvas.y); expect(rect.y + rect.height).toBeLessThanOrEqual(canvas.y + canvas.height);
  expect(rect.width).toBeGreaterThanOrEqual(160); expect(rect.height).toBeGreaterThanOrEqual(64);
  expect(rect.y + rect.height).toBeLessThan(y - 40 - 8);
  await expect(editor).toBeFocused();
});
for (const dimensions of [{ width: 24, height: 100 }, { width: 184, height: 24 }]) {
  test(`tiny ${dimensions.width} by ${dimensions.height} shape has a readable editor without blocking handles`, async ({ page }) => {
    await page.goto('/');
    await page.locator('input[type=file]').setInputFiles({ name: 'tiny.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ title: 'Tiny editor', nodes: [{ id: 'tiny', kind: 'rectangle', x: 0, y: 0, ...dimensions, text: 'Before', color: '#ffffff' }], edges: [] })) });
    await expect(page.getByLabel('Board title')).toHaveValue('Tiny editor');
    await page.getByRole('button', { name: 'Toggle layers', exact: true }).click();
    await page.getByRole('complementary').getByRole('button', { name: 'Before', exact: true }).click();
    await page.getByRole('button', { name: 'Edit text', exact: true }).click();
    const editor = page.getByRole('textbox', { name: 'Shape text' });
    await editor.fill('Readable text');
    const space = await editor.evaluate(el => {
      const style = getComputedStyle(el), rect = el.getBoundingClientRect();
      return { width: el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight), height: el.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom), line: parseFloat(style.fontSize) * 1.45, top: rect.top, bottom: rect.bottom };
    });
    expect(space.width).toBeGreaterThanOrEqual(100); expect(space.height).toBeGreaterThanOrEqual(space.line);
    const canvas = (await page.locator('canvas').boundingBox())!;
    const top = canvas.y + (canvas.height - dimensions.height) / 2;
    expect(space.bottom <= top - 12 || space.top >= top + dimensions.height + 12).toBe(true);
    await editor.press('Enter');
    expect((await board(page)).nodes[0].text).toBe('Readable text');
  });
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
  test(`${kind} resizes from the painted handle after a draft grows taller`, async ({ page }) => {
    await page.goto('/'); await page.getByRole('button', { name: 'New board', exact: true }).click();
    const canvas = (await page.locator('canvas').boundingBox())!;
    await page.getByRole('button', { name: kind, exact: true }).click();
    await page.locator('canvas').click({ position: { x: 300, y: 180 } });
    const width = kind.startsWith('Sticky') ? 176 : 220, height = kind.startsWith('Sticky') ? 152 : 86;
    const text = Array.from({ length: 12 }, (_, i) => `Line ${i + 1}`).join('\n');
    await page.getByRole('textbox', { name: 'Shape text' }).fill(text);
    const editor = (await page.getByRole('textbox', { name: 'Shape text' }).boundingBox())!;
    expect(editor.height).toBeGreaterThan(height + 100);
    const x = canvas.x + 300 + width + 4, y = canvas.y + 180 + height + 4;
    await page.mouse.move(x, y); await page.mouse.down();
    await page.mouse.move(x + 60, y + 20, { steps: 5 }); await page.mouse.up();
    const resized = (await board(page)).nodes[0];
    expect(resized.width).toBe(width + 60); expect(resized.text).toBe(text);
    expect(resized.height).toBeGreaterThan(height + 100);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    const undone = (await board(page)).nodes[0];
    expect(undone.width).toBe(width); expect(undone.text).toBe(text);
  });
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
