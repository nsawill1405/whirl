import { test, expect, type Page } from '@playwright/test';

const title = (page: Page) => page.getByLabel('Board title');
const saved = (page: Page) => expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
async function create(page: Page, name: string) {
  await page.getByRole('button', { name: 'My boards', exact: true }).click();
  await page.getByRole('button', { name: 'New board', exact: true }).click();
  await title(page).fill(name); await saved(page);
}
test('reload restores the last-open board per tab, not the newest board', async ({ page, context }) => {
  await page.goto('/'); await expect(title(page)).toHaveValue('A little room for big ideas');
  await create(page, 'Second board');
  await page.getByRole('button', { name: 'My boards', exact: true }).click();
  await page.getByRole('button', { name: /^A little room for big ideas/ }).click();
  const other = await context.newPage(); await other.goto('/');
  await expect(title(other)).toHaveValue('A little room for big ideas');
  await create(other, 'Other tab board');
  await page.reload(); await expect(title(page)).toHaveValue('A little room for big ideas');
});
test('a stale tab cannot delete a newly saved board or resurrect a deleted board', async ({ page, context }) => {
  await page.goto('/'); await expect(title(page)).toHaveValue('A little room for big ideas'); await saved(page);
  const other = await context.newPage(); await other.goto('/'); await expect(title(other)).toHaveValue('A little room for big ideas'); await saved(other);
  await create(page, 'Must survive');
  await title(other).fill('Renamed in stale tab'); await saved(other);
  await page.reload(); await expect(title(page)).toHaveValue('Must survive');
  await page.getByRole('button', { name: 'My boards', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Renamed in stale tab/ })).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Delete board Renamed in stale tab', exact: true }).click();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click(); await saved(page);
  // Reloading the stale tab must not re-save its old whole-library snapshot.
  await other.reload(); await expect(title(other)).toHaveValue('Must survive'); await saved(other);
  await page.reload(); await page.getByRole('button', { name: 'My boards', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Renamed in stale tab/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Must survive/ })).toBeVisible();
});
test('conflicting edits retain both versions and show a recovery notice', async ({ page, context }) => {
  await page.goto('/'); await expect(title(page)).toHaveValue('A little room for big ideas');
  await create(page, 'Shared board');
  const other = await context.newPage(); await other.goto('/'); await expect(title(other)).toHaveValue('Shared board'); await saved(other);
  await title(page).fill('First version');
  await page.getByRole('button', { name: 'Rectangle (R)', exact: true }).click();
  await page.locator('canvas').click({ position: { x: 320, y: 230 } }); await saved(page);
  await title(other).fill('Second version'); await saved(other);
  await expect(other.getByRole('status')).toContainText('Both versions were kept');
  await page.reload(); await expect(title(page)).toHaveValue('Second version');
  await expect(page.locator('canvas')).toHaveAttribute('aria-label', /0 shapes/);
  await page.getByRole('button', { name: 'My boards', exact: true }).click();
  await page.getByRole('button', { name: /^First version \(recovered copy\)/ }).click();
  await expect(page.locator('canvas')).toHaveAttribute('aria-label', /1 shapes/);
  await page.reload(); await expect(title(page)).toHaveValue('First version (recovered copy)');
  await expect(page.locator('canvas')).toHaveAttribute('aria-label', /1 shapes/);
});
