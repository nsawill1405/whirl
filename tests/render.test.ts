import { describe, expect, it } from 'vitest';
import { makeShape } from '../packages/scene/src';
import { growText, textSize, wrap } from '../apps/web/src/render';

const ctx = { font: '', measureText: (s: string) => ({ width: s.length * 8 }) } as CanvasRenderingContext2D;
describe('brainstorm text layout', () => {
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
  it('wraps long words and preserves explicit blank lines', () => {
    expect(wrap('abcdef\n\nhi', 24, s => s.length * 8)).toEqual(['abc', 'def', '', 'hi']);
  });
});
