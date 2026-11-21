import { describe, expect, it, vi } from 'vitest';
import { makeShape } from '../packages/scene/src';
import { getVideo, growText, textSize, toggleVideo, videos, wrap } from '../apps/web/src/render';

const ctx = { font: '', measureText: (s: string) => ({ width: s.length * 8 }) } as CanvasRenderingContext2D;
describe('video playback', () => {
  it('plays with sound, retries muted on rejection, and pauses', async () => {
    const video = { src: 'data:video/webm;base64,AAAA', paused: true, muted: false, play: vi.fn().mockResolvedValue(undefined), pause: vi.fn() };
    const data = 'data:video/webm;base64,AAAA';
    videos.set(data, video as unknown as HTMLVideoElement);
    try {
      await toggleVideo(data, data); expect(video.play).toHaveBeenCalledTimes(1); expect(video.muted).toBe(false);
      video.play.mockRejectedValueOnce(new Error('Autoplay blocked'));
      await toggleVideo(data, data); expect(video.play).toHaveBeenCalledTimes(3); expect(video.muted).toBe(true);
      video.paused = false; await toggleVideo(data, data); expect(video.pause).toHaveBeenCalledOnce();
    } finally { videos.delete(data); }
  });
  it('handles media that cannot play even when muted', async () => {
    const video = { src: 'data:video/webm;base64,broken', paused: true, muted: false, play: vi.fn().mockRejectedValue(new Error('Unsupported codec')) };
    const data = 'data:video/webm;base64,broken';
    videos.set(data, video as unknown as HTMLVideoElement);
    try { await expect(toggleVideo(data, data)).resolves.toBeUndefined(); expect(video.play).toHaveBeenCalledTimes(2); }
    finally { videos.delete(data); }
  });
  it('replaces a player when its shape id is reused for different media', () => {
    const previous = { src: 'data:video/webm;base64,AAAA', pause: vi.fn(), removeAttribute: vi.fn(), load: vi.fn() }, replacement = { src: '' };
    videos.set('reused-id', previous as unknown as HTMLVideoElement);
    vi.stubGlobal('document', { createElement: vi.fn(() => replacement) });
    try {
      expect(getVideo('reused-id', previous.src)).toBe(previous);
      expect(getVideo('reused-id', 'data:video/webm;base64,BBBB')).toBe(replacement);
      expect(previous.pause).toHaveBeenCalledOnce(); expect(previous.removeAttribute).toHaveBeenCalledWith('src'); expect(previous.load).toHaveBeenCalledOnce();
      expect(replacement.src).toBe('data:video/webm;base64,BBBB');
      expect(getVideo('reused-id', replacement.src)).toBe(replacement);
    } finally { videos.delete('reused-id'); vi.unstubAllGlobals(); }
  });
});
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
