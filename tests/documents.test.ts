import { expect, it } from 'vitest';
import { DOCUMENT_TYPES, MAX_DOCUMENT_BYTES, makeShape, parseBoard } from '../packages/scene/src';
import { svg } from '../apps/web/src/render';
const file = { name: 'notes.pdf', type: 'application/pdf', size: 3, data: 'data:application/pdf;base64,YWJj' };
const board = (attachment: unknown = file) => ({ title: 'Documents', nodes: [{ ...makeShape('document', 0, 0), file: attachment }], edges: [] });
it('exports a document card with a safe name and colored badge', () => { const output = svg({ nodes: [{ ...makeShape('document', 0, 0), width: 400, height: 330, file: { ...file, name: '<notes>.pdf' } }], edges: [] }); expect(output).toContain('&lt;notes&gt;.pdf'); expect(output).toContain('fill="#d34444"'); expect(output).toContain('>PDF</text>'); expect(output).not.toContain('<notes>'); });
it('accepts every supported document and preserves the attachment', () => { for (const [ext, type] of Object.entries(DOCUMENT_TYPES)) { const attachment = { ...file, name: `notes.${ext}`, type, data: `data:${type};base64,YWJj` }; expect(parseBoard(board(attachment)).nodes[0].file).toEqual(attachment); } });
it('accepts an empty document and an empty board', () => { expect(parseBoard(board({ ...file, size: 0, data: 'data:application/pdf;base64,' })).nodes).toHaveLength(1); expect(parseBoard({ title: '', nodes: [], edges: [] }).nodes).toEqual([]); });
it('rejects missing, malformed, dangerous and oversized attachments', () => {
  for (const value of [null, {}, { ...file, name: '' }, { ...file, name: 'a'.repeat(256) }, { ...file, name: 'evil.html' }, { ...file, name: 'evil.svg', type: 'image/svg+xml' }, { ...file, name: 'evil.js' }, { ...file, size: -1 }, { ...file, size: MAX_DOCUMENT_BYTES + 1 }, { ...file, size: '3' }, { ...file, type: 'text/html' }, { ...file, data: 'data:text/html;base64,YWJj' }, { ...file, data: 'data:application/pdf;base64,!!!' }, { ...file, data: 'data:application/pdf;base64,' + 'A'.repeat(34_000_000) }]) expect(() => parseBoard(board(value))).toThrow();
  const missing = board(); delete (missing.nodes[0] as { file?: unknown }).file; expect(() => parseBoard(missing)).toThrow();
});
