import type { DocumentFile } from '@whirl/scene';
import { wrap } from './render';
export async function documentPdf(file: DocumentFile) { const pdfjs = await import('pdfjs-dist'); pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href; return pdfjs.getDocument({ data: documentBytes(file), isEvalSupported: false }).promise; }
export const documentBadge = (name: string) => { const ext = name.split('.').pop()!.toUpperCase(); return { label: ext, color: ext === 'PDF' ? '#d34444' : /DOC/.test(ext) ? '#3478c5' : /PPT/.test(ext) ? '#d66e28' : /XLS/.test(ext) ? '#27845d' : '#777582' }; };
export const documentBytes = (file: DocumentFile) => Uint8Array.from(atob(file.data.slice(file.data.indexOf(',') + 1)), c => c.charCodeAt(0));
export async function documentText(file: DocumentFile): Promise<string[]> {
  const ext = file.name.split('.').pop()!.toLowerCase();
  if (['txt', 'csv', 'md'].includes(ext)) return [new TextDecoder().decode(documentBytes(file))];
  if (!['docx', 'pptx'].includes(ext)) return [];
  const { default: JSZip } = await import('jszip'), zip = await JSZip.loadAsync(documentBytes(file));
  const names = ext === 'docx' ? ['word/document.xml'] : Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => Number(a.match(/slide(\d+)/)![1]) - Number(b.match(/slide(\d+)/)![1]));
  return Promise.all(names.map(async name => { const xml = await zip.file(name)?.async('string'); if (!xml) throw new Error('This document has no readable content.'); const dom = new DOMParser().parseFromString(xml, 'application/xml'); return Array.from(dom.getElementsByTagNameNS('*', 't')).map(n => n.textContent).join('\n'); }));
}
export async function documentThumbnail(file: DocumentFile): Promise<HTMLImageElement> {
  const c = document.createElement('canvas'); c.width = 480; c.height = /\.(pptx|odp)$/i.test(file.name) ? 270 : 580; const ctx = c.getContext('2d')!;
  if (file.type === 'application/pdf') {
    const pdf = await documentPdf(file);
    try { const page = await pdf.getPage(1), viewport = page.getViewport({ scale: 1 }); const v = page.getViewport({ scale: 480 / viewport.width }); c.width = v.width; c.height = v.height; await page.render({ canvas: c, canvasContext: ctx, viewport: v }).promise; } finally { await pdf.destroy(); }
  } else {
    const text = (await documentText(file))[0]; if (!text) throw new Error('No thumbnail'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.fillStyle = '#3e3655'; ctx.font = '18px system-ui';
    wrap(text, 416, s => ctx.measureText(s).width).slice(0, 20).forEach((line, i) => ctx.fillText(line, 32, 48 + i * 25));
  }
  const img = new Image(); img.src = c.toDataURL(); await img.decode(); return img;
}
