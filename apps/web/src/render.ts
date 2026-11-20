import { bounds, edgeMiddle, route, type Scene, type Shape, type Point } from '@whirl/scene';
export type View = Point & { zoom: number };
export function wrap(text: string, width: number, measure: (s: string) => number): string[] {
  return text.split('\n').flatMap(paragraph => {
    const lines: string[] = []; let line = '';
    for (const word of paragraph.split(' ')) {
      if (line && measure(line + ' ' + word) > width) { lines.push(line); line = ''; }
      for (const char of (line ? ' ' : '') + word) { if (line && measure(line + char) > width) { lines.push(line); line = ''; } line += char; }
    }
    lines.push(line); return lines;
  });
}
export const textSize = (n: Shape) => n.kind === 'text' ? 24 : n.kind === 'sticky' ? 16 : 14;
export const textFont = (n: Shape) => `${n.kind === 'text' ? 600 : 500} ${textSize(n)}px system-ui`;
export function growText(n: Shape, ctx: CanvasRenderingContext2D, previous?: Shape): Shape {
  if (n.kind !== 'sticky' && n.kind !== 'text') return n;
  ctx.font = textFont(n);
  const required = (shape: Shape) => Math.ceil(wrap(shape.text, shape.width - 24, s => ctx.measureText(s).width).length * textSize(shape) * 1.45 + 16);
  const minimum = n.kind === 'text' && previous && previous.height === required(previous) ? 40 : n.height;
  return { ...n, height: Math.max(minimum, required(n)) };
}
function visibleLines(n: Shape, measure: (s: string) => number) {
  const width = n.width * (n.kind === 'diamond' ? 0.57 : 1) - 24;
  const lines = wrap(n.text, width, measure), count = Math.max(1, Math.floor((n.height - 16) / (textSize(n) * 1.45)));
  if (lines.length <= count) return lines;
  const visible = lines.slice(0, count);
  let last = visible[count - 1];
  while (last && measure(last + '…') > width) last = last.slice(0, -1);
  visible[count - 1] = last + '…';
  return visible;
}
export function paint(ctx: CanvasRenderingContext2D, scene: Scene, view: View, width: number, height: number, selected: string[] = [], dark = false, grid = true, images = new Map<string, HTMLImageElement>()) {
  const bg = dark ? '#20202a' : '#faf9f6', ink = dark ? '#c5c1dc' : '#9992b2', accent = '#7967e9';
  ctx.clearRect(0, 0, width, height); ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);
  if (grid && view.zoom > 0.24) {
    const step = 24 * view.zoom; ctx.fillStyle = dark ? '#3f3c50' : '#dcd9e3';
    for (let x = view.x % step; x < width; x += step) for (let y = view.y % step; y < height; y += step) { ctx.beginPath(); ctx.arc(x, y, 0.8, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.save(); ctx.translate(view.x, view.y); ctx.scale(view.zoom, view.zoom);
  for (const edge of scene.edges) {
    const path = route(edge, scene.nodes); if (path.length < 2) continue;
    ctx.strokeStyle = selected.includes(edge.id) ? accent : ink; ctx.lineWidth = selected.includes(edge.id) ? 2.5 : 1.7;
    ctx.beginPath(); path.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
    const end = path.at(-1)!, before = path.at(-2)!, angle = Math.atan2(end.y - before.y, end.x - before.x);
    ctx.beginPath(); ctx.moveTo(end.x - 9 * Math.cos(angle - 0.45), end.y - 9 * Math.sin(angle - 0.45)); ctx.lineTo(end.x, end.y); ctx.lineTo(end.x - 9 * Math.cos(angle + 0.45), end.y - 9 * Math.sin(angle + 0.45)); ctx.stroke();
    if (edge.text) { const p = edgeMiddle(path); ctx.font = '12px system-ui'; const w = ctx.measureText(edge.text).width + 16; ctx.fillStyle = bg; ctx.fillRect(p.x - w / 2, p.y - 11, w, 22); ctx.fillStyle = dark ? '#ddd9ee' : '#706982'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(edge.text, p.x, p.y); }
  }
  for (const n of scene.nodes) {
    if ((n.x + n.width) * view.zoom + view.x < -20 || n.x * view.zoom + view.x > width + 20 || (n.y + n.height) * view.zoom + view.y < -20 || n.y * view.zoom + view.y > height + 20) continue;
    ctx.save(); ctx.beginPath();
    if (n.kind === 'ellipse') ctx.ellipse(n.x + n.width / 2, n.y + n.height / 2, n.width / 2, n.height / 2, 0, 0, Math.PI * 2);
    else if (n.kind === 'diamond') { ctx.moveTo(n.x + n.width / 2, n.y); ctx.lineTo(n.x + n.width, n.y + n.height / 2); ctx.lineTo(n.x + n.width / 2, n.y + n.height); ctx.lineTo(n.x, n.y + n.height / 2); ctx.closePath(); }
    else ctx.roundRect(n.x, n.y, n.width, n.height, n.kind === 'sticky' ? 3 : 10);
    if (n.kind !== 'text') {
      if (n.kind === 'sticky') { ctx.shadowColor = '#30284b16'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 4; }
      ctx.fillStyle = n.color; ctx.fill(); ctx.shadowColor = 'transparent';
      ctx.strokeStyle = n.kind === 'sticky' ? '#0000000d' : '#62587942'; ctx.lineWidth = 1.4; ctx.stroke();
      if (n.kind === 'image' && n.image) { const img = images.get(n.image); if (img?.complete && img.naturalWidth) { ctx.save(); ctx.clip(); ctx.drawImage(img, n.x, n.y, n.width, n.height); ctx.restore(); } }
    }
    if (n.text) {
      ctx.fillStyle = n.kind === 'text' && dark ? '#eeeaf7' : '#3e3655';
      const size = textSize(n);
      ctx.font = textFont(n);
      const lines = visibleLines(n, s => ctx.measureText(s).width);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      lines.forEach((line, i) => ctx.fillText(line, n.x + n.width / 2, n.y + n.height / 2 + (i - (lines.length - 1) / 2) * size * 1.45));
    }
    if (selected.includes(n.id)) {
      ctx.strokeStyle = accent; ctx.lineWidth = 1.5 / view.zoom; ctx.strokeRect(n.x - 4, n.y - 4, n.width + 8, n.height + 8);
      for (const p of [{ x: n.x - 4, y: n.y - 4 }, { x: n.x + n.width + 4, y: n.y - 4 }, { x: n.x - 4, y: n.y + n.height + 4 }, { x: n.x + n.width + 4, y: n.y + n.height + 4 }]) { ctx.fillStyle = '#ffffff'; ctx.fillRect(p.x - 3 / view.zoom, p.y - 3 / view.zoom, 6 / view.zoom, 6 / view.zoom); ctx.strokeRect(p.x - 3 / view.zoom, p.y - 3 / view.zoom, 6 / view.zoom, 6 / view.zoom); }
    }
    ctx.restore();
  }
  ctx.restore();
}
const escape = (s: string) => s.replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]!));
function shapeSvg(n: Shape) {
  const attrs = `fill="${n.color}" stroke="#b9b2c8" stroke-width="1.4"`;
  const shape = n.kind === 'text' ? '' : n.kind === 'ellipse' ? `<ellipse cx="${n.x + n.width / 2}" cy="${n.y + n.height / 2}" rx="${n.width / 2}" ry="${n.height / 2}" ${attrs}/>` : n.kind === 'diamond' ? `<polygon points="${n.x + n.width / 2},${n.y} ${n.x + n.width},${n.y + n.height / 2} ${n.x + n.width / 2},${n.y + n.height} ${n.x},${n.y + n.height / 2}" ${attrs}/>` : `<rect x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" rx="${n.kind === 'sticky' ? 3 : 10}" ${attrs}/>`;
  const size = textSize(n);
  const ctx = document.createElement('canvas').getContext('2d')!; ctx.font = textFont(n);
  const lines = visibleLines(n, s => ctx.measureText(s).width);
  return shape + (n.image ? `<image href="${escape(n.image)}" x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" preserveAspectRatio="none"/>` : '') + lines.map((line, i) => `<text x="${n.x + n.width / 2}" y="${n.y + n.height / 2 + (i - (lines.length - 1) / 2) * size * 1.45}" text-anchor="middle" dominant-baseline="central" fill="#3e3655" font-family="system-ui,sans-serif" font-weight="${n.kind === 'text' ? 600 : 500}" font-size="${size}">${escape(line)}</text>`).join('');
}
export function svg(scene: Scene) {
  const b = bounds(scene.nodes), pad = 60;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.x - pad} ${b.y - pad} ${b.width + pad * 2} ${b.height + pad * 2}" width="${b.width + pad * 2}" height="${b.height + pad * 2}"><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M1 1L7 4L1 7" fill="none" stroke="#9992b2"/></marker></defs><rect x="${b.x - pad}" y="${b.y - pad}" width="100%" height="100%" fill="#faf9f6"/>${scene.edges.map(e => { const path = route(e, scene.nodes), p = edgeMiddle(path); return `<polyline points="${path.map(p => `${p.x},${p.y}`).join(' ')}" fill="none" stroke="#9992b2" stroke-width="1.7" marker-end="url(#arrow)"/>${e.text ? `<text x="${p.x}" y="${p.y - 8}" text-anchor="middle" font-family="system-ui" font-size="12" fill="#706982">${escape(e.text)}</text>` : ''}`; }).join('')}${scene.nodes.map(shapeSvg).join('')}</svg>`;
}
export function download(blob: Blob, name: string) { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
