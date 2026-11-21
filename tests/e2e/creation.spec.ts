import { test, expect } from '@playwright/test';

for (const tool of ['Rectangle (R)', 'Sticky note (S)']) {
  test(`${tool} starts its drag preview at the dragged size`, async ({ page }) => {
    await page.goto('/');
    await expect(page.getByLabel('Board title')).toHaveValue('A little room for big ideas');
    await page.getByRole('button', { name: 'New board', exact: true }).click();
    await expect(page.locator('canvas')).toHaveAttribute('aria-label', /0 shapes/);
    await page.evaluate(() => {
      const sizes: number[][] = [];
      Object.assign(window, { creationSizes: sizes });
      const original = CanvasRenderingContext2D.prototype.roundRect;
      CanvasRenderingContext2D.prototype.roundRect = function (...args) {
        if (this.canvas === document.querySelector('canvas')) sizes.push([Number(args[2]), Number(args[3])]);
        return original.apply(this, args);
      };
    });
    await page.getByRole('button', { name: tool, exact: true }).click();
    const box = (await page.locator('canvas').boundingBox())!;
    await page.mouse.move(box.x + 400, box.y + 300);
    await page.mouse.down();
    // Allow a browser frame at pointer-down before the first drag movement.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(page.locator('canvas')).toHaveAttribute('aria-label', /0 shapes/);
    await page.mouse.move(box.x + 460, box.y + 350);
    await page.locator('canvas').screenshot({ path: test.info().outputPath('drag-preview.png') });
    await page.mouse.up();
    const sizes = await page.evaluate(() => (window as unknown as { creationSizes: number[][] }).creationSizes);
    expect(sizes.length).toBeGreaterThan(0);
    expect(sizes.every(([width]) => width === 60)).toBe(true);
    await expect(page.locator('canvas')).toHaveAttribute('aria-label', /1 shapes/);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.locator('canvas')).toHaveAttribute('aria-label', /0 shapes/);
  });
}

test('a click with minor pointer jitter still creates a default-sized shape on release', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByLabel('Board title')).toHaveValue('A little room for big ideas');
  await page.getByRole('button', { name: 'New board', exact: true }).click();
  await page.getByRole('button', { name: 'Rectangle (R)', exact: true }).click();
  const box = (await page.locator('canvas').boundingBox())!;
  await page.mouse.move(box.x + 400, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 402, box.y + 302);
  await expect(page.locator('canvas')).toHaveAttribute('aria-label', /0 shapes/);
  await page.mouse.up();
  await expect(page.locator('canvas')).toHaveAttribute('aria-label', /1 shapes/);
  await page.locator('canvas').dblclick({ position: { x: 560, y: 370 } });
  await expect(page.getByRole('textbox', { name: 'Shape text' })).toBeVisible();
});
