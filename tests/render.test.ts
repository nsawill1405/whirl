import { describe, expect, it, vi } from 'vitest';
import { makeShape } from '../packages/scene/src';
import { gridSize, growText, paint, textSize, wrap } from '../apps/web/src/render';

describe('canvas grid', () => {
  it('keeps dots visible and spacing readable across the full zoom range', () => {
    for (let i = 10; i <= 300; i++) {
      const zoom = i / 100, { step, radius } = gridSize(zoom);
      expect(radius).toBeGreaterThanOrEqual(0.8);
      expect(step).toBeGreaterThanOrEqual(12);
      expect(Math.log2(step / (24 * zoom))).toBeCloseTo(Math.round(Math.log2(step / (24 * zoom))));
    }
    expect(gridSize(0.1).radius).toBeLessThan(gridSize(1).radius);
    expect(gridSize(1)).toEqual({ step: 24, radius: 1.2 });
    expect(gridSize(3).step).toBe(72);
    expect(gridSize(3).radius).toBeCloseTo(3.6);
  });
  it.each([0.1, 1, 3])('draws dots on an empty board at zoom %s and omits them for exports', zoom => {
    const radii: number[] = [];
    const context = { clearRect() {}, fillRect() {}, save() {}, restore() {}, translate() {}, scale() {}, beginPath() {}, fill() {}, arc(_x: number, _y: number, radius: number) { radii.push(radius); } } as unknown as CanvasRenderingContext2D;
    paint(context, { nodes: [], edges: [] }, { x: -7, y: -11, zoom }, 100, 100);
    expect(radii.length).toBeGreaterThan(0);
    expect(radii.every(radius => radius === gridSize(zoom).radius)).toBe(true);
    radii.length = 0;
    paint(context, { nodes: [], edges: [] }, { x: 0, y: 0, zoom }, 100, 100, [], false, false);
    expect(radii).toEqual([]);
  });
});

const ctx = { font: '', measureText: (s: string) => ({ width: s.length * 8 }) } as CanvasRenderingContext2D;
describe('brainstorm text layout', () => {
  it.each([[true, '#ffffff', '#302e3e'], [true, '#eee9ff', '#eee9ff'], [false, '#ffffff', '#ffffff']] as const)('paints link fills in dark=%s with color %s', (dark, color, expected) => {
    const fills: string[] = [], context = new Proxy({ fillStyle: '', measureText: (text: string) => ({ width: text.length * 8 }), fill() { fills.push(this.fillStyle); } }, { get(target, key) { return key in target ? Reflect.get(target, key) : () => {}; } });
    vi.stubGlobal('Path2D', class {});
    try {
      paint(context as unknown as CanvasRenderingContext2D, { nodes: [{ ...makeShape('link', 0, 0), color, text: 'Example', url: 'https://example.com' }], edges: [] }, { x: 0, y: 0, zoom: 1 }, 800, 600, [], dark, false);
      expect(fills).toEqual([expected]);
    } finally { vi.unstubAllGlobals(); }
  });
  it.each(['sticky', 'text'] as const)('grows %s to preserve every line without shrinking the font', kind => {
    const n = { ...makeShape(kind, 0, 0), text: 'One\nTwo\nThree\nFour\nFive\nSix\nSeven' };
    const grown = growText(n, ctx);
    expect(grown.height).toBeGreaterThan(n.height);
    expect(grown.height).toBeGreaterThanOrEqual(7 * textSize(n) * 1.45 + 16);
    expect(grown.width).toBe(n.width);
    expect(n.height).toBeLessThan(grown.height);
  });
  it('keeps the default text label fully readable', () => {
    const n = makeShape('text', 0, 0), grown = growText(n, ctx);
    expect(grown.height).toBeGreaterThanOrEqual(wrap(n.text, n.width - 24, s => ctx.measureText(s).width).length * 24 * 1.45 + 16);
  });
  it('respects intentional space and leaves diagram dimensions alone', () => {
    const n = { ...makeShape('sticky', 0, 0), height: 400 };
    expect(growText(n, ctx).height).toBe(400);
    const rect = { ...makeShape('rectangle', 0, 0), text: 'a\n'.repeat(50) };
    expect(growText(rect, ctx)).toBe(rect);
  });
  it('shrinks a shortened text label to its content instead of leaving an invisible hitbox', () => {
    const previous = growText({ ...makeShape('text', 0, 0), width: 48 }, ctx);
    expect(growText({ ...previous, text: 'Hi' }, ctx, previous).height).toBe(51);
  });
  it('preserves deliberately resized text heights during resizing and editing', () => {
    const label = { ...makeShape('text', 0, 0), height: 400, text: 'Hi' };
    expect(growText(label, ctx).height).toBe(400);
    expect(growText({ ...label, text: 'Hello' }, ctx, label).height).toBe(400);
  });
  it('reflows automatic label height when widening without a vertical resize', () => {
    const label = growText({ ...makeShape('text', 0, 0), width: 48 }, ctx);
    const wider = growText({ ...label, width: 400 }, ctx, label);
    expect(wider.height).toBeLessThan(label.height);
    expect(wider.height).toBe(51);
    expect(growText({ ...label, height: 600 }, ctx).height).toBe(600);
  });
  it('keeps a saved fixed-height label when widening resolves its overflow', () => {
    const label = { ...makeShape('text', 0, 0), width: 48, height: 400, text: 'A long legacy label with wrapped overflow' };
    const wider = growText({ ...label, width: 600 }, ctx, label);
    expect(wider.height).toBe(400);
  });
  it('wraps long words and preserves explicit blank lines', () => {
    expect(wrap('abcdef\n\nhi', 24, s => s.length * 8)).toEqual(['abc', 'def', '', 'hi']);
  });
});
