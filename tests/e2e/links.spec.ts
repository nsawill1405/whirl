import { test, expect } from '@playwright/test';

test('the latest external copy replaces the internal shape clipboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/'); await expect(page.getByLabel('Board title')).toHaveValue('A little room for big ideas');
  await page.getByRole('button', { name: 'New board', exact: true }).click();
  await page.getByRole('button', { name: 'Rectangle (R)', exact: true }).click();
  await page.locator('canvas').focus(); await page.keyboard.press('Enter');
  await page.keyboard.press('Control+c'); await page.keyboard.press('Control+v');
  await expect(page.locator('canvas')).toHaveAttribute('aria-label', /2 shapes/);
  const external = await context.newPage(); await external.goto('/');
  await external.evaluate(() => navigator.clipboard.writeText('https://example.com/newest'));
  await page.bringToFront(); await page.locator('canvas').focus(); await page.keyboard.press('Control+v');
  await expect(page.locator('canvas')).toHaveAttribute('aria-label', /3 shapes/);
  await expect(page.getByRole('button', { name: 'Open link', exact: true })).toBeVisible();
  await external.bringToFront(); await external.evaluate(() => navigator.clipboard.writeText('not a URL'));
  await page.bringToFront(); await page.locator('canvas').focus(); await page.keyboard.press('Control+v');
  await expect(page.locator('canvas')).toHaveAttribute('aria-label', /3 shapes/);
});

test('link cards add, paste, open, edit, undo, drop, and persist', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByLabel('Board title')).toHaveValue('A little room for big ideas');
  await page.getByRole('button', { name: 'New board', exact: true }).click();
  await page.getByRole('button', { name: 'Add link', exact: true }).click();
  await page.getByLabel('Link URL').fill('javascript:alert(1)');
  await page.getByLabel('Link URL').press('Enter');
  await expect(page.getByRole('status')).toContainText('Enter a valid');
  await page.getByLabel('Link URL').fill('www.example.com/notes');
  await page.getByLabel('Link URL').press('Enter');
  await expect(page.locator('canvas')).toHaveAttribute('aria-label', /1 shapes/);
  await page.route('https://www.example.com/**', route => route.fulfill({ body: 'Example' }));
  const opened = context.waitForEvent('page');
  await page.getByRole('button', { name: 'Open link', exact: true }).click();
  const tab = await opened; await tab.waitForURL('https://www.example.com/notes');
  expect(await tab.evaluate(() => window.opener)).toBeNull(); await tab.close();
  await page.locator('canvas').focus(); await page.keyboard.press('Enter');
  await page.getByLabel('Shape text').fill('Project references'); await page.getByLabel('Shape text').press('Enter');
  await page.locator('canvas').evaluate(el => { const clipboardData = new DataTransfer(); clipboardData.setData('text/plain', 'https://developer.mozilla.org/en-US/'); el.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true })); });
  await expect(page.locator('canvas')).toHaveAttribute('aria-label', /2 shapes/);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('canvas')).toHaveAttribute('aria-label', /1 shapes/);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.locator('canvas')).toHaveAttribute('aria-label', /2 shapes/);
  await page.locator('canvas').evaluate(el => { const dataTransfer = new DataTransfer(); dataTransfer.setData('text/uri-list', 'https://vite.dev/'); const r = el.getBoundingClientRect(); el.dispatchEvent(new DragEvent('drop', { dataTransfer, clientX: r.x + 400, clientY: r.y + 420, bubbles: true, cancelable: true })); });
  await expect(page.locator('canvas')).toHaveAttribute('aria-label', /3 shapes/);
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  await page.reload(); await expect(page.locator('canvas')).toHaveAttribute('aria-label', /3 shapes/);
  await page.getByRole('button', { name: 'Toggle layers' }).click();
  await expect(page.getByRole('complementary').getByRole('button', { name: 'Project references' })).toBeVisible();
  await expect(page.getByRole('complementary').getByRole('button', { name: 'developer.mozilla.org' })).toBeVisible();
});

test('link input cancels and non-URL paste leaves the board unchanged', async ({ page }) => {
  await page.goto('/'); await expect(page.getByLabel('Board title')).toHaveValue('A little room for big ideas');
  await page.getByRole('button', { name: 'New board', exact: true }).click();
  await page.getByRole('button', { name: 'Add link', exact: true }).click();
  await page.getByLabel('Link URL').press('Escape'); await expect(page.getByLabel('Link URL')).toHaveCount(0);
  await page.locator('canvas').evaluate(el => { const clipboardData = new DataTransfer(); clipboardData.setData('text/plain', 'just some words'); el.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true })); });
  await expect(page.locator('canvas')).toHaveAttribute('aria-label', /0 shapes/);
});
