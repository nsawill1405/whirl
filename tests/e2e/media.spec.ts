import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function exported(page: Page, format = 'Whirl board') {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('button', { name: new RegExp(`^${format}`) }).click();
  return readFile((await (await download).path())!, 'utf8');
}
async function changingPixels(page: Page) {
  const initial = await page.locator('canvas').evaluate(canvas => (canvas as HTMLCanvasElement).toDataURL());
  await expect.poll(() => page.locator('canvas').evaluate(canvas => (canvas as HTMLCanvasElement).toDataURL())).not.toBe(initial);
}

test('animated GIF and video import, playback, persistence, and export', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'My boards' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'New board', exact: true }).click();
  await page.getByLabel('Import file').setInputFiles('tests/fixtures/animated.gif');
  await expect(page.locator('canvas')).toHaveAttribute('aria-label', /1 shapes/);
  await changingPixels(page);
  await page.locator('canvas').focus();
  for (let i = 0; i < 24; i++) await page.keyboard.press('Shift+ArrowLeft');
  await page.getByLabel('Import file').setInputFiles('tests/fixtures/animated.webm');
  await expect(page.locator('canvas')).toHaveAttribute('aria-label', /2 shapes/);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  const videoPixels = () => page.locator('canvas').evaluate(element => {
    const canvas = element as HTMLCanvasElement, ratio = devicePixelRatio;
    return Array.from(canvas.getContext('2d')!.getImageData(canvas.width / 2, canvas.height / 2, 160 * ratio, 100 * ratio).data).join(',');
  });
  const frame = await videoPixels();
  await expect.poll(videoPixels).not.toBe(frame);
  await page.locator('canvas').focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  const canvas = await page.locator('canvas').boundingBox();
  await page.locator('canvas').dblclick({ position: { x: canvas!.width / 2 + 80, y: canvas!.height / 2 + 50 } });
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  const board = JSON.parse(await exported(page));
  expect(board.nodes.map((n: { kind: string }) => n.kind)).toEqual(['image', 'video']);
  expect(board.nodes[0].image).toMatch(/^data:image\/gif;base64,/);
  expect(board.nodes[1].video).toMatch(/^data:video\/webm;base64,/);
  expect(board.nodes[1].width / board.nodes[1].height).toBeCloseTo(1.6);
  const svg = await exported(page, 'SVG image');
  expect(svg).toContain('data:image/png;base64,');
  expect(svg).not.toContain('data:video/');
  await expect(page.getByText('Saved on this device')).toBeVisible();
  await page.reload();
  await expect(page.locator('canvas')).toHaveAttribute('aria-label', /2 shapes/);
  expect(JSON.parse(await exported(page)).nodes).toEqual(board.nodes);
  await changingPixels(page);
  await page.screenshot({ path: '/home/ubuntu/whirl-media.png' });
  await page.getByLabel('Import file').setInputFiles({ name: 'roundtrip.whirl.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(board)) });
  await expect(page.getByText('Board imported. Make yourself at home.')).toBeVisible();
  expect(JSON.parse(await exported(page)).nodes).toEqual(board.nodes);
});

test('media can be dropped and pasted', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'My boards' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'New board', exact: true }).click();
  for (const [event, extension, mime] of [['drop', 'gif', 'image/gif'], ['paste', 'webm', 'video/webm']]) {
    const bytes = [...await readFile(`tests/fixtures/animated.${extension}`)];
    await page.evaluate(({ bytes, event, extension, mime }) => {
      const data = new DataTransfer(); data.items.add(new File([new Uint8Array(bytes)], `animated.${extension}`, { type: mime }));
      const target = document.querySelector('canvas')!;
      target.dispatchEvent(event === 'drop' ? new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }) : new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }));
    }, { bytes, event, extension, mime });
    await expect(page.locator('canvas')).toHaveAttribute('aria-label', new RegExp(`${event === 'drop' ? 1 : 2} shapes`));
  }
});

test('keyboard paste prioritizes native media and otherwise pastes shapes exactly once', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.getByRole('button', { name: 'My boards' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'New board', exact: true }).click();
  await page.locator('canvas').focus();
  await page.keyboard.press('r'); await page.keyboard.press('Enter');
  await page.keyboard.press('Control+c');
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
    canvas.getContext('2d')!.fillRect(0, 0, 32, 32);
    const png = await new Promise<Blob>(resolve => canvas.toBlob(blob => resolve(blob!)));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
  });
  await page.keyboard.press('Control+v');
  await expect(page.locator('canvas')).toHaveAttribute('aria-label', /2 shapes/);
  expect(JSON.parse(await exported(page)).nodes.map((n: { kind: string }) => n.kind)).toEqual(['rectangle', 'image']);
  await page.evaluate(() => navigator.clipboard.writeText('No media in this clipboard'));
  await page.locator('canvas').focus();
  await page.keyboard.press('Control+v');
  await expect(page.locator('canvas')).toHaveAttribute('aria-label', /3 shapes/);
  expect(JSON.parse(await exported(page)).nodes.map((n: { kind: string }) => n.kind)).toEqual(['rectangle', 'image', 'rectangle']);
});

test('invalid video imports report an error without creating a shape', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('canvas')).toHaveAttribute('aria-label', /shapes/);
  const before = await page.locator('canvas').getAttribute('aria-label');
  await page.getByLabel('Import file').setInputFiles({ name: 'broken.webm', mimeType: 'video/webm', buffer: Buffer.from('not a video') });
  await expect(page.getByText('Could not decode this video.')).toBeVisible();
  await expect(page.locator('canvas')).toHaveAttribute('aria-label', before!);
});
