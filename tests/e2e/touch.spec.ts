import { test, expect, type CDPSession, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

type Finger = { id: number; x: number; y: number };
async function touch(client: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', points: Finger[]) {
  await client.send('Input.dispatchTouchEvent', { type, touchPoints: points });
}
async function scene(page: Page) {
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('button', { name: /Whirl board/ }).click();
  const file = await downloaded;
  const { nodes, edges } = JSON.parse(await readFile((await file.path())!, 'utf8'));
  return { nodes, edges };
}
async function startBlank(page: Page) {
  await page.goto('/');
  await expect(page.getByLabel('Board title')).toHaveValue('A little room for big ideas');
  await page.getByRole('button', { name: 'New board', exact: true }).click();
  await expect(page.getByLabel('Board title')).toHaveValue('Untitled board');
  await expect(page.getByRole('button', { name: 'Reset zoom to 100 percent' })).toHaveText('100%');
}

test('a first-time desktop visitor can start blank without finding a menu', async ({ page }) => {
  await startBlank(page);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('canvas')).toHaveAttribute('aria-label', /0 shapes/);
});

test.describe('phone touch navigation', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('opens readably and explains touch even on a narrow phone', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByLabel('Board title')).toHaveValue('A little room for big ideas');
    await expect(page.getByRole('button', { name: 'Reset zoom to 100 percent' })).toHaveText('70%');
    await expect(page.getByRole('button', { name: 'New board', exact: true })).toBeInViewport();
    await expect(page.locator('.canvas-hint')).toContainText('Two fingers');
    await page.getByRole('button', { name: 'Help and keyboard shortcuts' }).tap();
    await expect(page.getByRole('dialog')).toContainText('pinch to zoom, with any tool selected');
    await page.getByRole('button', { name: 'Close dialog' }).tap();
    await page.setViewportSize({ width: 320, height: 568 });
    await expect(page.locator('.canvas-hint')).toBeInViewport();
    await expect(page.getByRole('button', { name: 'New board', exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
    await page.getByRole('button', { name: 'My boards', exact: true }).tap();
    await expect(page.getByRole('dialog', { name: 'My boards' })).toBeVisible();
  });

  test('pinching while drawing cancels the shape, preserves redo, and ignores a remaining finger', async ({ page, context }) => {
    await startBlank(page);
    await page.getByRole('button', { name: 'Ellipse (O)', exact: true }).tap();
    await page.locator('canvas').tap({ position: { x: 60, y: 190 } });
    await page.getByRole('button', { name: 'Undo', exact: true }).tap();
    await expect(page.getByRole('button', { name: 'Redo', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Rectangle (R)', exact: true }).tap();
    const client = await context.newCDPSession(page);
    const a = { id: 1, x: 130, y: 300 }, b = { id: 2, x: 250, y: 300 };
    await touch(client, 'touchStart', [a]);
    await touch(client, 'touchStart', [a, b]);
    await touch(client, 'touchMove', [{ ...a, x: 70 }, { ...b, x: 310 }]);
    await expect(page.getByRole('button', { name: 'Reset zoom to 100 percent' })).toHaveText('200%');
    await touch(client, 'touchEnd', [{ ...a, x: 70 }]);
    await touch(client, 'touchMove', [{ ...a, x: 110, y: 330 }]);
    await touch(client, 'touchEnd', []);
    await expect(page.locator('canvas')).toHaveAttribute('aria-label', /0 shapes/);
    await expect(page.getByRole('button', { name: 'Rectangle (R)', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Redo', exact: true })).toBeEnabled();
    // A new one-finger gesture must draw normally after all pinch fingers lift.
    await page.locator('canvas').tap({ position: { x: 80, y: 180 } });
    await expect(page.locator('canvas')).toHaveAttribute('aria-label', /1 shapes/);
    await page.getByRole('button', { name: 'Undo', exact: true }).tap();
    await expect(page.locator('canvas')).toHaveAttribute('aria-label', /0 shapes/);
  });

  test('two fingers pan rather than move content or marquee-select it', async ({ page, context }) => {
    await startBlank(page);
    await page.getByRole('button', { name: 'Rectangle (R)', exact: true }).tap();
    await page.locator('canvas').tap({ position: { x: 70, y: 200 } });
    await page.getByRole('button', { name: 'Select (V)', exact: true }).tap();
    const before = await scene(page), pixels = await page.locator('canvas').screenshot();
    const client = await context.newCDPSession(page);
    const a = { id: 1, x: 100, y: 290 }, b = { id: 2, x: 280, y: 380 };
    await touch(client, 'touchStart', [a]);
    // Starting as a move and then adding another finger must roll back the move.
    await touch(client, 'touchMove', [{ ...a, x: 120 }]);
    await touch(client, 'touchStart', [{ ...a, x: 120 }, b]);
    await touch(client, 'touchMove', [{ ...a, x: 160, y: 330 }, { ...b, x: 320, y: 420 }]);
    await touch(client, 'touchEnd', []);
    await expect(page.getByRole('button', { name: 'Reset zoom to 100 percent' })).toHaveText('100%');
    expect(await scene(page)).toEqual(before);
    expect((await page.locator('canvas').screenshot()).equals(pixels)).toBe(false);
    await page.getByRole('button', { name: 'Undo', exact: true }).tap();
    await expect(page.locator('canvas')).toHaveAttribute('aria-label', /0 shapes/);
  });

  test('pinching outside a text editor keeps the committed draft and its undo history', async ({ page, context }) => {
    await startBlank(page);
    await page.getByRole('button', { name: 'Rectangle (R)', exact: true }).tap();
    await page.locator('canvas').tap({ position: { x: 40, y: 190 } });
    await page.getByRole('button', { name: 'Edit text', exact: true }).tap();
    await page.getByRole('textbox', { name: 'Shape text' }).fill('Keep this draft');
    const client = await context.newCDPSession(page);
    const a = { id: 1, x: 100, y: 440 }, b = { id: 2, x: 260, y: 440 };
    await touch(client, 'touchStart', [a]);
    await touch(client, 'touchStart', [a, b]);
    await touch(client, 'touchMove', [{ ...a, x: 80 }, { ...b, x: 280 }]);
    await touch(client, 'touchEnd', []);
    await expect(page.getByRole('textbox', { name: 'Shape text' })).toHaveCount(0);
    expect((await scene(page)).nodes[0].text).toBe('Keep this draft');
    await page.getByRole('button', { name: 'Undo', exact: true }).tap();
    expect((await scene(page)).nodes[0].text).toBe('');
  });

  test('a pinch on a connector target preserves the pending connector tool and source', async ({ page, context }) => {
    await startBlank(page);
    await page.getByRole('button', { name: 'Rectangle (R)', exact: true }).tap();
    await page.locator('canvas').tap({ position: { x: 30, y: 180 } });
    await page.getByRole('button', { name: 'Rectangle (R)', exact: true }).tap();
    await page.locator('canvas').tap({ position: { x: 210, y: 300 } });
    await page.getByRole('button', { name: 'Connector (C)', exact: true }).tap();
    await page.touchscreen.tap(60, 270);
    const client = await context.newCDPSession(page);
    const a = { id: 1, x: 240, y: 390 }, b = { id: 2, x: 80, y: 480 };
    await touch(client, 'touchStart', [a]);
    await touch(client, 'touchStart', [a, b]);
    await touch(client, 'touchEnd', []);
    await expect(page.getByRole('button', { name: 'Connector (C)', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect((await scene(page)).edges).toHaveLength(0);
    await page.touchscreen.tap(240, 390);
    expect((await scene(page)).edges).toHaveLength(1);
  });

  test('canceling a touch discards an unfinished shape', async ({ page, context }) => {
    await startBlank(page);
    await page.getByRole('button', { name: 'Rectangle (R)', exact: true }).tap();
    const client = await context.newCDPSession(page);
    await touch(client, 'touchStart', [{ id: 1, x: 100, y: 300 }]);
    await touch(client, 'touchMove', [{ id: 1, x: 240, y: 380 }]);
    await touch(client, 'touchCancel', []);
    await expect(page.locator('canvas')).toHaveAttribute('aria-label', /0 shapes/);
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  });
});
