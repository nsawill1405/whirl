import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { Board } from '../../packages/scene/src';

const fixture = {
  title: 'Keyboard checks',
  nodes: [
    { id: 'idea', kind: 'ellipse', x: 100, y: 200, width: 180, height: 80, text: 'Original idea', color: '#eee9ff' },
    { id: 'note', kind: 'sticky', x: 450, y: 200, width: 176, height: 152, text: 'Other note', color: '#fff2cc' },
    { id: 'third', kind: 'rectangle', x: 800, y: 200, width: 184, height: 88, text: 'Leave me alone', color: '#ffffff' },
  ],
  edges: [{ id: 'edge', source: 'idea', target: 'note', text: 'next' }],
};

async function openFixture(page: Page) {
  await page.goto('/');
  await expect(page.getByLabel('Board title')).toHaveValue('A little room for big ideas');
  await page.locator('input[type=file]').setInputFiles({ name: 'keyboard.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture)) });
  await expect(page.getByLabel('Board title')).toHaveValue(fixture.title);
  await page.locator('canvas').focus();
}

async function exported(page: Page): Promise<Board> {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('button', { name: /Whirl board/ }).click();
  return JSON.parse(await readFile((await (await download).path())!, 'utf8'));
}

test('Enter creates and edits shapes without a mouse, preserves multiline edits, and cancels safely', async ({ page }) => {
  await openFixture(page);
  await page.keyboard.press('r');
  await page.keyboard.press('Enter');
  await expect(page.locator('canvas')).toHaveAttribute('aria-label', /4 shapes/);
  await page.keyboard.press('Enter');
  const text = page.getByRole('textbox', { name: 'Shape text' });
  await expect(text).toBeFocused();
  await text.fill('Keyboard first');
  await text.press('Shift+Enter');
  await text.pressSequentially('Second line');
  await text.press('Enter');
  await expect(text).toHaveCount(0);
  await expect(page.locator('canvas')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(text).toHaveValue('Keyboard first\nSecond line');
  await text.fill('Discard this');
  await text.press('Escape');
  await expect(page.getByRole('button', { name: 'Edit text', exact: true })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(text).toHaveValue('Keyboard first\nSecond line');
  await text.press('Escape');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await expect(page.locator('canvas')).toHaveAttribute('aria-label', /3 shapes/);
  await page.keyboard.press('Control+Shift+z');
  await page.keyboard.press('Control+y');
  await expect(page.locator('canvas')).toHaveAttribute('aria-label', /4 shapes/);
  const board = await exported(page);
  expect(board.nodes.at(-1)?.text).toBe('Keyboard first\nSecond line');
});

test('duplicate does not replace a copied snapshot or reset successive paste offsets', async ({ page }) => {
  await openFixture(page);
  await page.keyboard.press('l');
  await expect(page.getByRole('button', { name: 'Original idea', exact: true })).toBeFocused();
  await page.keyboard.press('Space');
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Space');
  await page.keyboard.press('Control+d');
  await page.keyboard.press('Control+v');
  await page.keyboard.press('Control+v');
  const board = await exported(page);
  expect(board.nodes).toHaveLength(6);
  expect(board.nodes[3]).toMatchObject({ kind: 'sticky', text: 'Other note', x: 482, y: 232 });
  expect(board.nodes[4]).toMatchObject({ kind: 'ellipse', text: 'Original idea', x: 132, y: 232 });
  expect(board.nodes[5]).toMatchObject({ kind: 'ellipse', text: 'Original idea', x: 164, y: 264 });
});

test('Layers supports keyboard subset selection, help retains it, and pasted connectors stay internal', async ({ page }) => {
  await openFixture(page);
  await page.keyboard.press('l');
  await page.keyboard.press('Space');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Space');
  const idea = page.getByRole('button', { name: 'Original idea', exact: true });
  const note = page.getByRole('button', { name: 'Other note', exact: true });
  await expect(idea).toHaveAttribute('aria-pressed', 'true');
  await expect(note).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('?');
  const close = page.getByRole('button', { name: 'Close dialog' });
  await expect(close).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('link', { name: /Request a change/ })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(note).toBeFocused();
  await expect(idea).toHaveAttribute('aria-pressed', 'true');
  await expect(note).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Shift+Space');
  await expect(note).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Shift+Enter');
  await expect(note).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('textbox', { name: 'Shape text' })).toHaveCount(0);
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  const board = await exported(page);
  expect(board.nodes).toHaveLength(5);
  expect(board.edges).toHaveLength(2);
  expect(board.edges[1]).toMatchObject({ source: board.nodes[3].id, target: board.nodes[4].id, text: 'next' });
  expect(board.edges[1].id).not.toBe('edge');
});

test('nudges move by one or ten units and held arrows undo as one edit', async ({ page }) => {
  await openFixture(page);
  await page.keyboard.press('l');
  await page.keyboard.press('Space');
  await page.keyboard.press('l');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.down('ArrowRight');
  await page.keyboard.down('ArrowRight');
  await page.keyboard.down('ArrowRight');
  await page.keyboard.up('ArrowRight');
  const moved = await exported(page);
  expect(moved.nodes[0]).toMatchObject({ x: 104, y: 210 });
  await page.locator('canvas').focus();
  await page.keyboard.press('Control+z');
  const undone = await exported(page);
  expect(undone.nodes[0]).toMatchObject({ x: 101, y: 210 });
  await page.locator('canvas').focus();
  await page.keyboard.press('Control+Shift+z');
  const redone = await exported(page);
  expect(redone.nodes[0]).toMatchObject({ x: 104, y: 210 });
});

test('native button Enter and text inputs do not trigger board-editing shortcuts', async ({ page }) => {
  await openFixture(page);
  await page.keyboard.press('l');
  await page.keyboard.press('Enter');
  const text = page.getByRole('textbox', { name: 'Shape text' });
  await expect(text).toHaveValue('Original idea');
  await text.press('Escape');
  await page.getByRole('button', { name: 'Help and keyboard shortcuts' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(text).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByLabel('Board title').fill('r s ? l');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Select (V)', exact: true })).toHaveAttribute('aria-pressed', 'true');
});
