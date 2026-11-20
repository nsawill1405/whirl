import { normalizeUrl, bounds, COLORS, edgeMiddle, route, type Scene, type Shape, type Point } from '@whirl/scene';
import { documentBadge } from './documents';
export type View = Point & { zoom: number };
export function gridSize(zoom: number) {
  const step = 24 * zoom;
  return { step: step * 2 ** Math.max(0, Math.ceil(Math.log2(12 / step))), radius: Math.max(0.8, 1.2 * zoom) };
}
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
function ellipsis(text: string, width: number, measure: (s: string) => number) {
  if (measure(text) <= width) return text;
  while (text && measure(text + '…') > width) text = text.slice(0, -1);
  return width > measure('…') ? text + '…' : '';
}
const linkGlyph = 'M8 12a5 5 0 0 0 7 .4l3-3a5 5 0 0 0-7-7l-2 2 M12 8a5 5 0 0 0-7-.4l-3 3a5 5 0 0 0 7 7l2-2';
const linkLabel = (n: Shape) => { const url = n.url && normalizeUrl(n.url); return url ? new URL(url).hostname.replace(/^www\./, '') : 'Link'; };
export function paint(ctx: CanvasRenderingContext2D, scene: Scene, view: View, width: number, height: number, selected: string[] = [], dark = false, grid = true, images = new Map<string, HTMLImageElement>()) {
  const bg = dark ? '#20202a' : '#faf9f6', ink = dark ? '#c5c1dc' : '#9992b2', accent = '#7967e9';
  ctx.clearRect(0, 0, width, height); ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);
  if (grid) {
    const { step, radius } = gridSize(view.zoom); ctx.fillStyle = dark ? '#3f3c50' : '#dcd9e3';
    for (let x = view.x % step; x < width; x += step) for (let y = view.y % step; y < height; y += step) { ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.save(); ctx.translate(view.x, view.y); ctx.scale(view.zoom, view.zoom);
  for (const edge of scene.edges) {
    const path = route(edge, scene.nodes, scene.edges); if (path.length < 2) continue;
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
      ctx.fillStyle = n.kind === 'link' && dark && n.color === COLORS[0] ? '#302e3e' : n.color; ctx.fill(); ctx.shadowColor = 'transparent';
      ctx.strokeStyle = n.kind === 'sticky' ? '#0000000d' : '#62587942'; ctx.lineWidth = 1.4; ctx.stroke();
      if (n.kind === 'image' && n.image) { const img = images.get(n.image); if (img?.complete && img.naturalWidth) { ctx.save(); ctx.clip(); ctx.drawImage(img, n.x, n.y, n.width, n.height); ctx.restore(); } }
    }
    if (n.kind === 'document' && n.file) {
      const badge = documentBadge(n.file.name), img = images.get(n.file.data), footer = Math.min(48, n.height / 3);
      ctx.save(); ctx.clip(); ctx.fillStyle = '#f3f2f6'; ctx.fillRect(n.x, n.y, n.width, n.height - footer);
      if (img?.complete && img.naturalWidth) { const scale = Math.min((n.width - 16) / img.naturalWidth, (n.height - footer - 16) / img.naturalHeight), w = img.naturalWidth * scale, h = img.naturalHeight * scale; ctx.drawImage(img, n.x + (n.width - w) / 2, n.y + (n.height - footer - h) / 2, w, h); }
      else { ctx.fillStyle = badge.color; ctx.font = 'bold 32px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(badge.label, n.x + n.width / 2, n.y + (n.height - footer) / 2, n.width - 16); }
      ctx.fillStyle = '#fff'; ctx.fillRect(n.x, n.y + n.height - footer, n.width, footer); ctx.fillStyle = badge.color; ctx.fillRect(n.x + 10, n.y + n.height - footer + 12, 42, 24); ctx.font = 'bold 10px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.fillText(badge.label, n.x + 31, n.y + n.height - footer + 24, 38);
      ctx.font = '12px system-ui'; ctx.textAlign = 'left'; ctx.fillStyle = '#3e3655'; let name = n.file.name; while (name.length && ctx.measureText(name).width > n.width - 76) name = name.slice(0, -1); ctx.fillText(name === n.file.name ? name : name + '…', n.x + 62, n.y + n.height - footer + 24); ctx.restore();
    }
    if (n.kind === 'link') {
      const darkCard = dark && n.color === COLORS[0];
      ctx.save(); ctx.clip(); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.save(); ctx.translate(n.x + 16, n.y + n.height / 2 - 10); ctx.strokeStyle = darkCard ? '#b9aaff' : '#7967e9'; ctx.lineWidth = 1.7; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(new Path2D(linkGlyph)); ctx.restore();
      ctx.font = '600 14px system-ui'; ctx.fillStyle = darkCard ? '#eeeaf7' : '#3e3655'; ctx.fillText(ellipsis(n.text, n.width - 64, s => ctx.measureText(s).width), n.x + 48, n.y + n.height / 2 - 10);
      ctx.font = '12px system-ui'; ctx.fillStyle = darkCard ? '#b4aec8' : '#82798f'; ctx.fillText(ellipsis(linkLabel(n), n.width - 64, s => ctx.measureText(s).width), n.x + 48, n.y + n.height / 2 + 13);
      ctx.restore();
    } else if (n.text && n.kind !== 'document') {
      ctx.fillStyle = n.kind === 'text' && dark ? '#eeeaf7' : '#3e3655';
      const size = textSize(n);
      ctx.font = textFont(n);
      const lines = visibleLines(n, s => ctx.measureText(s).width);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      lines.forEach((line, i) => ctx.fillText(line, n.x + n.width / 2, n.y + n.height / 2 + (i - (lines.length - 1) / 2) * size * 1.45));
    }
    ctx.restore();
  }
  const members = scene.nodes.filter(n => selected.includes(n.id));
  if (members.length) {
      const n = bounds(members);
      ctx.strokeStyle = accent; ctx.lineWidth = 1.5 / view.zoom; ctx.strokeRect(n.x - 4, n.y - 4, n.width + 8, n.height + 8);
      for (const p of [{ x: n.x - 4, y: n.y - 4 }, { x: n.x + n.width + 4, y: n.y - 4 }, { x: n.x - 4, y: n.y + n.height + 4 }, { x: n.x + n.width + 4, y: n.y + n.height + 4 }]) { ctx.fillStyle = '#ffffff'; ctx.fillRect(p.x - 3 / view.zoom, p.y - 3 / view.zoom, 6 / view.zoom, 6 / view.zoom); ctx.strokeRect(p.x - 3 / view.zoom, p.y - 3 / view.zoom, 6 / view.zoom, 6 / view.zoom); }
  }
  ctx.restore();
}
const escape = (s: string) => s.replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]!));
function shapeSvg(n: Shape) {
  if (n.kind === 'document' && n.file) { const badge = documentBadge(n.file.name); return `<rect x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" rx="10" fill="#f3f2f6" stroke="#b9b2c8"/><text x="${n.x + 16}" y="${n.y + n.height / 2}" fill="${badge.color}" font-family="system-ui" font-size="28">${badge.label}</text><rect x="${n.x + 10}" y="${n.y + n.height - 36}" width="42" height="24" fill="${badge.color}"/><text x="${n.x + 31}" y="${n.y + n.height - 20}" text-anchor="middle" fill="#ffffff" font-family="system-ui" font-size="10">${badge.label}</text><text x="${n.x + 62}" y="${n.y + n.height - 20}" fill="#3e3655" font-family="system-ui" font-size="12">${escape(n.file.name.slice(0, Math.max(1, Math.floor((n.width - 76) / 8))))}</text>`; }
  const attrs = `fill="${n.color}" stroke="#b9b2c8" stroke-width="1.4"`;
  const shape = n.kind === 'text' ? '' : n.kind === 'ellipse' ? `<ellipse cx="${n.x + n.width / 2}" cy="${n.y + n.height / 2}" rx="${n.width / 2}" ry="${n.height / 2}" ${attrs}/>` : n.kind === 'diamond' ? `<polygon points="${n.x + n.width / 2},${n.y} ${n.x + n.width},${n.y + n.height / 2} ${n.x + n.width / 2},${n.y + n.height} ${n.x},${n.y + n.height / 2}" ${attrs}/>` : `<rect x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" rx="${n.kind === 'sticky' ? 3 : 10}" ${attrs}/>`;
  const size = textSize(n);
  const ctx = document.createElement('canvas').getContext('2d')!; ctx.font = textFont(n);
  if (n.kind === 'link') {
    ctx.font = '600 14px system-ui'; const title = ellipsis(n.text, n.width - 64, s => ctx.measureText(s).width);
    ctx.font = '12px system-ui'; const label = ellipsis(linkLabel(n), n.width - 64, s => ctx.measureText(s).width), url = n.url && normalizeUrl(n.url);
    const card = shape + `<path d="${linkGlyph}" transform="translate(${n.x + 16} ${n.y + n.height / 2 - 10})" fill="none" stroke="#7967e9" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><text x="${n.x + 48}" y="${n.y + n.height / 2 - 6}" fill="#3e3655" font-family="system-ui" font-size="14" font-weight="600">${escape(title)}</text><text x="${n.x + 48}" y="${n.y + n.height / 2 + 17}" fill="#82798f" font-family="system-ui" font-size="12">${escape(label)}</text>`;
    return url ? `<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${card}</a>` : card;
  }
  const lines = visibleLines(n, s => ctx.measureText(s).width);
  return shape + (n.image ? `<image href="${escape(n.image)}" x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" preserveAspectRatio="none"/>` : '') + lines.map((line, i) => `<text x="${n.x + n.width / 2}" y="${n.y + n.height / 2 + (i - (lines.length - 1) / 2) * size * 1.45}" text-anchor="middle" dominant-baseline="central" fill="#3e3655" font-family="system-ui,sans-serif" font-weight="${n.kind === 'text' ? 600 : 500}" font-size="${size}">${escape(line)}</text>`).join('');
}
export function svg(scene: Scene) {
  const b = bounds(scene.nodes), pad = 60;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.x - pad} ${b.y - pad} ${b.width + pad * 2} ${b.height + pad * 2}" width="${b.width + pad * 2}" height="${b.height + pad * 2}"><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M1 1L7 4L1 7" fill="none" stroke="#9992b2"/></marker></defs><rect x="${b.x - pad}" y="${b.y - pad}" width="100%" height="100%" fill="#faf9f6"/>${scene.edges.map(e => { const path = route(e, scene.nodes, scene.edges), p = edgeMiddle(path); return `<polyline points="${path.map(p => `${p.x},${p.y}`).join(' ')}" fill="none" stroke="#9992b2" stroke-width="1.7" marker-end="url(#arrow)"/>${e.text ? `<text x="${p.x}" y="${p.y - 8}" text-anchor="middle" font-family="system-ui" font-size="12" fill="#706982">${escape(e.text)}</text>` : ''}`; }).join('')}${scene.nodes.map(shapeSvg).join('')}</svg>`;
}
export function download(blob: Blob, name: string) { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
