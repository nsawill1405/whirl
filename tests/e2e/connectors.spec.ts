import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { bounds, edgeMiddle, route, type Scene } from '../../packages/scene/src';

test('retry connectors have independent labels, editors, and matching SVG routes', async ({ page }) => {
  const scene: Scene = {
    nodes: [
      { id: 'checkout', kind: 'rectangle', x: 0, y: 0, width: 184, height: 88, text: 'Checkout', color: '#ffffff' },
      { id: 'payment', kind: 'diamond', x: 0, y: 300, width: 184, height: 128, text: 'Payment approved?', color: '#ffffff' },
    ],
    edges: [
      { id: 'next', source: 'checkout', target: 'payment', text: 'Pay' },
      { id: 'retry', source: 'payment', target: 'checkout', text: 'No' },
    ],
  };
  await page.goto('/');
  await expect(page.getByLabel('Board title')).toHaveValue('A little room for big ideas');
  await page.locator('input[type=file]').setInputFiles({ name: 'checkout.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...scene, title: 'Checkout retry' })) });
  await expect(page.getByLabel('Board title')).toHaveValue('Checkout retry');
  const canvas = page.locator('canvas'), box = (await canvas.boundingBox())!, b = bounds(scene.nodes);
  const zoom = Math.min(1, Math.max(0.1, Math.min((box.width - 150) / (b.width + 70), (box.height - 150) / (b.height + 70))));
  const paths = scene.edges.map(edge => route(edge, scene.nodes, scene.edges));
  for (const [index, edge] of scene.edges.entries()) {
    const p = edgeMiddle(paths[index]);
    const position = { x: (box.width - b.width * zoom) / 2 + (p.x - b.x) * zoom, y: (box.height - b.height * zoom) / 2 + (p.y - b.y) * zoom };
    await canvas.click({ position });
    await page.getByRole('button', { name: 'Edit text', exact: true }).click();
    const editor = page.getByRole('textbox', { name: 'Shape text' });
    await expect(editor).toHaveValue(edge.text);
    const editorBox = (await editor.boundingBox())!;
    expect(editorBox.x).toBeCloseTo(box.x + position.x, 0);
    expect(editorBox.y).toBeCloseTo(box.y + position.y, 0);
    await editor.press('Escape');
  }
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('button', { name: /SVG/ }).click();
  const exported = await downloaded, svg = await readFile((await exported.path())!, 'utf8');
  for (const path of paths) expect(svg).toContain(`points="${path.map(p => `${p.x},${p.y}`).join(' ')}"`);
});
