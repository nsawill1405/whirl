import { useEffect, useRef, useState } from 'react';
import type { DocumentFile } from '@whirl/scene';
import { documentBytes, documentPdf, documentText } from './documents';
const documentFrame = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; font-src data: blob:"><style>body{margin:0} .docx-wrapper{padding:16px!important} .docx{max-width:100%;box-sizing:border-box}</style></head><body></body></html>`;
export default function DocumentViewer({ file }: { file: DocumentFile }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const host = useRef<HTMLDivElement>(null), [url, setUrl] = useState(''), [pages, setPages] = useState<string[]>([]), [error, setError] = useState(''), [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true, dispose = () => {}; const blob = new Blob([documentBytes(file)], { type: file.type }), href = URL.createObjectURL(blob); setUrl(href);
    (async () => { try {
      if (file.type === 'application/pdf') {
        const pdf = await documentPdf(file); dispose = () => { void pdf.destroy(); }; if (!alive) { dispose(); return; }
        for (let i = 1; i <= pdf.numPages && alive; i++) { const page = await pdf.getPage(i), viewport = page.getViewport({ scale: 1.5 }), c = document.createElement('canvas'), text = await page.getTextContent(); c.width = viewport.width; c.height = viewport.height; c.setAttribute('role', 'img'); c.setAttribute('aria-label', `Page ${i}: ${text.items.map(item => 'str' in item ? item.str : '').join(' ')}`); if (!alive) return; host.current?.append(c); await page.render({ canvas: c, canvasContext: c.getContext('2d')!, viewport }).promise; }
      } else if (file.name.toLowerCase().endsWith('.docx')) {
        const { renderAsync } = await import('docx-preview'), iframe = frame.current; if (!alive || !iframe) return;
        if (iframe.contentDocument?.URL !== 'about:srcdoc' || iframe.contentDocument.readyState !== 'complete') await new Promise<void>(resolve => iframe.addEventListener('load', () => resolve(), { once: true }));
        const doc = iframe.contentDocument; if (!alive || !doc) return; doc.addEventListener('click', e => { if ((e.target as Element).closest('a')) e.preventDefault(); }); await renderAsync(blob, doc.body, undefined, { renderAltChunks: false, useBase64URL: true });
      }
      else { const text = await documentText(file); if (alive) setPages(text); }
    } catch { if (alive) setError('Could not preview this document. Download it to open locally.'); } finally { if (alive) setReady(true); } })();
    return () => { alive = false; dispose(); URL.revokeObjectURL(href); };
  }, [file]);
  return <><h1>{file.name}</h1><a className="button primary" href={url} download={file.name}>Download</a><div className="document-preview"><div ref={host}/>{file.name.toLowerCase().endsWith('.docx') && <iframe ref={frame} title="Word document preview" sandbox="allow-same-origin" srcDoc={documentFrame} style={{ width: '100%', height: '60vh', border: 0 }}/ >}{pages.map((text, i) => <section className="document-page" key={i}>{pages.length > 1 && <h2>Slide {i + 1}</h2>}<pre>{text}</pre></section>)}{error ? <p role="alert">{error}</p> : ready && !pages.length && !file.name.toLowerCase().endsWith('.docx') && file.type !== 'application/pdf' ? <p>Preview not available. Download this file to open it locally.</p> : !ready && <p>Loading preview…</p>}</div></>;
}
