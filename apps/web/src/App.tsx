import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowDownToLine, ArrowRight, ArrowUpRight, Check, ChevronDown, Circle, Copy, Diamond, Download, FolderOpen, Hand, HelpCircle, ImagePlus, Layers, Maximize, Minus, Moon, MousePointer2, MoveUpRight, Plus, Redo2, RotateCcw, Shapes, Sparkles, Square, StickyNote, Sun, Trash2, Type, Undo2, X, Github, LayoutTemplate, PanelLeftClose, Group, Ungroup } from 'lucide-react';
import { bounds, cloneScene, COLORS, expandSelection, groupShapes, MAX_IMAGE_BYTES, edgeMiddle, hitEdge, hitNode, makeShape, parseBoard, resizeSelection, route, selectionScene, uid, type Board, type Connector, type Kind, type Point, type Scene, type Shape } from '@whirl/scene';
import { download, growText, paint, svg, textSize, type View } from './render';
import { template } from './templates';
import { loadActiveBoard, loadBoards, saveActiveBoard, saveBoards } from './storage';

type Tool = Kind | 'select' | 'hand' | 'connector';
type Edit = { id: string; text: string };
type Drag = { type: 'pan' | 'move' | 'resize' | 'marquee' | 'create'; start: Point; screen: Point; scene: Scene; ids: string[]; view: View; changed: boolean };
type TouchStart = { scene: Scene; selected: string[]; source: string | null; tool: Tool; undo: Scene[]; redo: Scene[] };
type Gesture = { center: Point; distance: number; view: View };
const touchGeometry = (points: Map<number, Point>) => {
  const [a, b] = [...points.values()];
  return { center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)) };
};
const toolList = [
  { id: 'select', icon: MousePointer2, label: 'Select', key: 'V' }, { id: 'hand', icon: Hand, label: 'Pan', key: 'H' },
  { id: 'rectangle', icon: Square, label: 'Rectangle', key: 'R' }, { id: 'ellipse', icon: Circle, label: 'Ellipse', key: 'O' },
  { id: 'diamond', icon: Diamond, label: 'Diamond', key: 'D' }, { id: 'connector', icon: MoveUpRight, label: 'Connector', key: 'C' },
  { id: 'sticky', icon: StickyNote, label: 'Sticky note', key: 'S' }, { id: 'text', icon: Type, label: 'Text', key: 'T' },
] as const;
const shortcuts: Record<string, Tool> = { v: 'select', h: 'hand', r: 'rectangle', o: 'ellipse', d: 'diamond', c: 'connector', s: 'sticky', t: 'text' };
const snapshot = (b: Scene): Scene => ({ nodes: b.nodes, edges: b.edges });

export default function App() {
  const [boards, setBoards] = useState<Board[]>([]), [active, setActive] = useState(''), [loaded, setLoaded] = useState(false);
  const [tool, setTool] = useState<Tool>('select'), [selected, setSelected] = useState<string[]>([]), [view, setView] = useState<View>({ x: 80, y: 20, zoom: 1 });
  const [dark, setDark] = useState(false), [saveState, setSaveState] = useState('Opening your space…'), [toast, setToast] = useState('');
  const [modal, setModalState] = useState<'boards' | 'templates' | 'help' | null>(null), [exportOpen, setExportOpen] = useState(false), [layers, setLayers] = useState(false);
  const [editing, setEditing] = useState<Edit | null>(null), [source, setSource] = useState<string | null>(null), [pointer, setPointer] = useState<Point>({ x: 0, y: 0 });
  const [marquee, setMarquee] = useState<{ a: Point; b: Point } | null>(null), [, renderHistory] = useState(0);
  const canvas = useRef<HTMLCanvasElement>(null), area = useRef<HTMLDivElement>(null), textInput = useRef<HTMLTextAreaElement>(null), layerList = useRef<HTMLDivElement>(null);
  const modalFocus = useRef<HTMLElement | null>(null), returnToCanvas = useRef(false);
  const setModal = useCallback((next: typeof modal) => { if (next) modalFocus.current = document.activeElement as HTMLElement | null; setModalState(next); }, []);
  const [size, setSize] = useState({ width: 1200, height: 800 });
  const board = boards.find(b => b.id === active), latest = useRef(board); latest.current = board;
  const drag = useRef<Drag | null>(null), undoStack = useRef<Scene[]>([]), redoStack = useRef<Scene[]>([]), clipboard = useRef<Scene | null>(null);
  const pasteCount = useRef(0), nudging = useRef(false);
  const images = useRef(new Map<string, HTMLImageElement>()), saveQueue = useRef(Promise.resolve());
  const touches = useRef(new Map<number, Point>()), gesture = useRef<Gesture | null>(null), touchStart = useRef<TouchStart | null>(null);
  const [touchInput, setTouchInput] = useState(() => navigator.maxTouchPoints > 0);
  const savedBoards = useRef<Board[]>([]);
  const notify = useCallback((message: string) => setToast(message), []);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(''), 3800); return () => clearTimeout(t); } }, [toast]);
  useEffect(() => {
    if (!modal) return;
    const before = modalFocus.current;
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = Array.from(document.querySelectorAll<HTMLElement>('.modal button:not(:disabled), .modal a[href], .modal input'));
      const first = items[0], last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', trap);
    return () => { document.removeEventListener('keydown', trap); if (before?.isConnected) before.focus(); else canvas.current?.focus(); };
  }, [modal]);
  useEffect(() => {
    let alive = true;
    loadBoards().then(saved => { if (!alive) return; const list = saved?.length ? saved : [template('welcome')]; savedBoards.current = saved ?? []; const activeId = loadActiveBoard(); setBoards(list); setActive(list.find(b => b.id === activeId)?.id ?? list[0].id); setLoaded(true); }).catch(() => { if (!alive) return; const first = template('welcome'); setBoards([first]); setActive(first.id); setLoaded(true); setSaveState('Storage unavailable'); notify('Browser storage is unavailable. Export your work to keep it.'); });
    return () => { alive = false; };
  }, [notify]);
  useEffect(() => {
    if (!loaded) return;
    setSaveState('Saving…');
    let current = true;
    const timer = setTimeout(() => { saveQueue.current = saveQueue.current.catch(() => {}).then(async () => { const recovered = await saveBoards(boards, savedBoards.current); savedBoards.current = boards; if (recovered) notify('Another tab changed this board. Both versions were kept. Reload to see all boards.'); }).then(() => { if (current) setSaveState('Saved on this device'); }).catch(() => { if (current) { setSaveState('Not saved — export a copy'); notify('Could not save. Export a JSON copy to keep your work.'); } }); }, 350);
    return () => { current = false; clearTimeout(timer); };
  }, [boards, loaded, notify]);
  useEffect(() => { if (loaded && active) saveActiveBoard(active); }, [active, loaded]);
  useEffect(() => { const el = area.current; if (!el) return; const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height })); observer.observe(el); return () => observer.disconnect(); }, []);
  const fit = useCallback((readable = false) => {
    if (!latest.current) return;
    const b = bounds(latest.current.nodes), w = area.current?.clientWidth ?? 1100, h = area.current?.clientHeight ?? 700;
    if (!latest.current.nodes.length) { setView({ zoom: 1, x: w / 2, y: h / 2 }); return; }
    const padding = w <= 700 ? 48 : 150;
    const fitted = Math.min(1, Math.max(0.1, Math.min((w - padding) / (b.width + 70), (h - 150) / (b.height + 70))));
    // Opening a phone board should be readable; Fit still offers an overview.
    const zoom = readable && w <= 700 ? Math.max(0.7, fitted) : fitted;
    if (readable && w <= 700) { setView({ zoom, x: 24 - b.x * zoom, y: 100 - b.y * zoom }); return; }
    setView({ zoom, x: (w - b.width * zoom) / 2 - b.x * zoom, y: (h - b.height * zoom) / 2 - b.y * zoom });
  }, []);
  useEffect(() => { setSelected([]); setSource(null); setEditing(null); setTool('select'); drag.current = null; touches.current.clear(); gesture.current = null; touchStart.current = null; undoStack.current = []; redoStack.current = []; renderHistory(v => v + 1); const frame = requestAnimationFrame(() => fit(true)); return () => cancelAnimationFrame(frame); }, [active, fit]);
  const updateScene = useCallback((scene: Scene) => { const id = latest.current?.id; setBoards(list => list.map(b => b.id === id ? { ...b, ...scene, updatedAt: Date.now() } : b)); }, []);
  const remember = useCallback((scene?: Scene) => { if (!latest.current) return; undoStack.current = [...undoStack.current.slice(-99), scene ?? snapshot(latest.current)]; redoStack.current = []; renderHistory(v => v + 1); }, []);
  const change = useCallback((scene: Scene) => { remember(); updateScene(scene); }, [remember, updateScene]);
  const undo = useCallback(() => { if (!latest.current) return; const scene = undoStack.current.pop(); if (!scene) return; redoStack.current.push(snapshot(latest.current)); updateScene(scene); setSelected([]); setEditing(null); renderHistory(v => v + 1); }, [updateScene]);
  const redo = useCallback(() => { if (!latest.current) return; const scene = redoStack.current.pop(); if (!scene) return; undoStack.current.push(snapshot(latest.current)); updateScene(scene); setSelected([]); renderHistory(v => v + 1); }, [updateScene]);
  const remove = useCallback(() => { const b = latest.current; if (!b || !selected.length) return; change({ nodes: b.nodes.filter(n => !selected.includes(n.id)), edges: b.edges.filter(e => !selected.includes(e.id) && !selected.includes(e.source) && !selected.includes(e.target)) }); setSelected([]); }, [change, selected]);
  const copy = useCallback(() => { const b = latest.current; if (!b) return; const scene = selectionScene(b, selected); if (!scene.nodes.length) return; clipboard.current = scene; pasteCount.current = 0; notify('Copied. Paste anywhere on your board.'); }, [notify, selected]);
  const paste = useCallback((duplicate?: Scene) => { const scene = duplicate ?? clipboard.current, b = latest.current; if (!b || !scene?.nodes.length) return; const { nodes, edges } = cloneScene(scene, 32 * (duplicate ? 1 : ++pasteCount.current)); change({ nodes: [...b.nodes, ...nodes], edges: [...b.edges, ...edges] }); setSelected(nodes.map(n => n.id)); canvas.current?.focus(); }, [change]);
  const group = useCallback((ungroup = false) => { const b = latest.current; if (!b) return; const ids = expandSelection(b.nodes, selected), members = b.nodes.filter(n => ids.includes(n.id)); if (ungroup ? !members.some(n => n.groupId) : members.length < 2 || members.every(n => n.groupId && n.groupId === members[0].groupId)) return; change({ ...snapshot(b), nodes: groupShapes(b.nodes, ids, ungroup) }); setSelected(ids); canvas.current?.focus(); }, [change, selected]);
  const chooseTool = (next: Tool) => { setTool(next); setEditing(null); setSource(null); setSelected([]); canvas.current?.focus(); };
  useEffect(() => { if (layers) layerList.current?.querySelector('button')?.focus(); }, [layers]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.keyCode === 229) return;
      if ((e.target as HTMLElement).matches('input,textarea,[contenteditable=true]')) return;
      if (modal) { if (e.key === 'Escape') setModal(null); return; }
      const cmd = e.metaKey || e.ctrlKey, key = e.key.toLowerCase();
      if (e.altKey) return;
      if (cmd && ['z','y','c','v','d','a','s','g'].includes(key)) {
        e.preventDefault();
        if (key === 'z') e.shiftKey ? redo() : undo(); else if (key === 'y') redo(); else if (key === 'c') copy(); else if (key === 'v') paste(); else if (key === 'g') group(e.shiftKey); else if (key === 'a') setSelected(latest.current?.nodes.map(n => n.id) ?? []); else if (key === 'd') { const b = latest.current; if (b) paste(selectionScene(b, selected)); } else notify('Your boards save automatically on this device.');
      } else if (cmd) return;
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(); }
      else if (e.key === 'Escape') { setSelected([]); setTool('select'); setSource(null); setExportOpen(false); }
      else if (key === '1') fit();
      else if (key === '?') setModal('help');
      else if (key === 'l') { setLayers(value => !value); if (layers) canvas.current?.focus(); }
      else if (e.key === 'Enter' && !(e.target as HTMLElement).closest('button,a,select')) {
        const b = latest.current; if (!b) return;
        if (selected.length === 1) { const item = b.nodes.find(n => n.id === selected[0]) ?? b.edges.find(n => n.id === selected[0]); if (item && !('kind' in item && (item.kind === 'image' || item.groupId))) { e.preventDefault(); setEditing({ id: item.id, text: item.text }); } }
        else if (tool !== 'select' && tool !== 'hand' && tool !== 'connector' && tool !== 'image') { e.preventDefault(); const n = fitText(makeShape(tool, 0, 0)); n.x = (size.width / 2 - view.x) / view.zoom - n.width / 2; n.y = (size.height / 2 - view.y) / view.zoom - n.height / 2; change({ ...snapshot(b), nodes: [...b.nodes, n] }); setSelected([n.id]); setTool('select'); if (n.kind === 'sticky' || n.kind === 'text') setEditing({ id: n.id, text: n.text }); }
      }
      else if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key) && selected.length) { const b = latest.current; if (b?.nodes.some(n => selected.includes(n.id))) { e.preventDefault(); if (!e.repeat || !nudging.current) remember(); nudging.current = true; updateScene({ ...snapshot(b), nodes: b.nodes.map(n => selected.includes(n.id) ? { ...n, x: n.x + (e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0) * (e.shiftKey ? 10 : 1), y: n.y + (e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0) * (e.shiftKey ? 10 : 1) } : n) }); } }
      else if (!cmd && shortcuts[key]) chooseTool(shortcuts[key]);
    };
    const endNudge = () => { nudging.current = false; };
    window.addEventListener('keydown', handler); window.addEventListener('keyup', endNudge); window.addEventListener('blur', endNudge);
    return () => { window.removeEventListener('keydown', handler); window.removeEventListener('keyup', endNudge); window.removeEventListener('blur', endNudge); };
  }, [undo, redo, copy, paste, group, remove, fit, selected, modal, notify, change, remember, updateScene, tool, layers, size, view]);
  useEffect(() => { const el = canvas.current; if (!el) return; const handler = (e: WheelEvent) => { e.preventDefault(); const rect = el.getBoundingClientRect(), sx = e.clientX - rect.left, sy = e.clientY - rect.top; setView(v => { if (e.ctrlKey || e.metaKey) { const zoom = Math.min(3, Math.max(0.1, v.zoom * Math.exp(-e.deltaY * 0.008))); return { zoom, x: sx - (sx - v.x) * zoom / v.zoom, y: sy - (sy - v.y) * zoom / v.zoom }; } return { ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }; }); }; el.addEventListener('wheel', handler, { passive: false }); return () => el.removeEventListener('wheel', handler); }, []);
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d'); if (!ctx || !board) return;
    const draw = () => { const ratio = window.devicePixelRatio || 1; canvas.current!.width = size.width * ratio; canvas.current!.height = size.height * ratio; ctx.setTransform(ratio, 0, 0, ratio, 0, 0); paint(ctx, board, view, size.width, size.height, source ? [...selected, source] : selected, dark, true, images.current);
      if (marquee) { ctx.fillStyle = '#7967e91a'; ctx.strokeStyle = '#7967e9'; ctx.fillRect(marquee.a.x * view.zoom + view.x, marquee.a.y * view.zoom + view.y, (marquee.b.x - marquee.a.x) * view.zoom, (marquee.b.y - marquee.a.y) * view.zoom); ctx.strokeRect(marquee.a.x * view.zoom + view.x, marquee.a.y * view.zoom + view.y, (marquee.b.x - marquee.a.x) * view.zoom, (marquee.b.y - marquee.a.y) * view.zoom); }
      if (source) { const n = board.nodes.find(n => n.id === source); if (n) { ctx.setLineDash([5, 5]); ctx.strokeStyle = '#7967e9'; ctx.beginPath(); ctx.moveTo((n.x + n.width / 2) * view.zoom + view.x, (n.y + n.height / 2) * view.zoom + view.y); ctx.lineTo(pointer.x * view.zoom + view.x, pointer.y * view.zoom + view.y); ctx.stroke(); } }
    };
    for (const n of board.nodes) if (n.image) {
      let img = images.current.get(n.image);
      if (!img) { img = new Image(); images.current.set(n.image, img); img.src = n.image; }
      if (!img.complete) img.onload = draw;
    }
    draw();
    return () => { for (const img of images.current.values()) img.onload = null; };
  }, [board, view, size, selected, dark, source, pointer, marquee]);
  useLayoutEffect(() => { if (editing) { textInput.current?.focus(); textInput.current?.select(); } else if (returnToCanvas.current) { returnToCanvas.current = false; canvas.current?.focus(); } }, [editing?.id]);
  const screenPoint = (e: ReactPointerEvent) => { const r = canvas.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const world = (p: Point) => ({ x: (p.x - view.x) / view.zoom, y: (p.y - view.y) / view.zoom });
  const cancelTouchEdit = () => {
    const start = touchStart.current;
    if (start) { updateScene(start.scene); setSelected(start.selected); setSource(start.source); setTool(start.tool); undoStack.current = start.undo; redoStack.current = start.redo; renderHistory(v => v + 1); }
    drag.current = null; setMarquee(null);
  };
  const fitText = (n: Shape, previous?: Shape) => { const ctx = canvas.current?.getContext('2d'); return ctx ? growText(n, ctx, previous) : n; };
  const onDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    // Commit an open text draft before taking the reversible touch baseline.
    const committed = editing ? editDone() : undefined;
    if (e.pointerType === 'touch' && board) {
      e.preventDefault(); setTouchInput(true); e.currentTarget.setPointerCapture(e.pointerId);
      touches.current.set(e.pointerId, screenPoint(e));
      if (touches.current.size === 1) touchStart.current = { scene: committed ?? snapshot(board), selected, source, tool, undo: [...undoStack.current], redo: [...redoStack.current] };
      else {
        if (!gesture.current) cancelTouchEdit();
        gesture.current = { ...touchGeometry(touches.current), view };
        return;
      }
      // Do not resume editing with the remaining finger after a pinch.
      if (gesture.current) return;
    }
    if (editing) return;
    if (!board || e.button > 1) return;
    setExportOpen(false); e.currentTarget.focus(); e.currentTarget.setPointerCapture(e.pointerId);
    const screen = screenPoint(e), start = world(screen), n = hitNode(board.nodes, start);
    const base = { start, screen, scene: snapshot(board), ids: selected, view, changed: false };
    if (tool === 'hand' || e.button === 1 || e.altKey) { drag.current = { ...base, type: 'pan' }; return; }
    if (tool === 'connector') { if (!n) { setSource(null); return; } if (!source) setSource(n.id); else if (source !== n.id) { const edge: Connector = { id: uid(), source, target: n.id, text: '' }; change({ ...snapshot(board), edges: [...board.edges, edge] }); setSelected([edge.id]); setSource(null); setTool('select'); } return; }
    if (tool !== 'select' && tool !== 'image') { const next = fitText(makeShape(tool as Kind, start.x, start.y)); setSelected([next.id]); updateScene({ ...snapshot(board), nodes: [...board.nodes, next] }); drag.current = { ...base, ids: [next.id], type: 'create', changed: true }; return; }
    const members = board.nodes.filter(n => selected.includes(n.id)), box = members.length ? bounds(members) : null;
    if (box && Math.hypot(start.x - box.x - box.width - 4, start.y - box.y - box.height - 4) < 12 / view.zoom) { drag.current = { ...base, type: 'resize' }; return; }
    if (n) { const unit = expandSelection(board.nodes, [n.id]), ids = e.shiftKey ? selected.includes(n.id) ? selected.filter(id => !unit.includes(id)) : [...new Set([...selected, ...unit])] : selected.includes(n.id) ? selected : unit; setSelected(ids); drag.current = { ...base, ids, type: 'move' }; }
    else { const edge = hitEdge(board.edges, board.nodes, start, 8 / view.zoom); if (edge) setSelected([edge.id]); else { if (!e.shiftKey) setSelected([]); drag.current = { ...base, ids: e.shiftKey ? selected : [], type: 'marquee' }; } }
  };
  const onMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'touch') {
      if (!touches.current.has(e.pointerId)) return;
      touches.current.set(e.pointerId, screenPoint(e));
      const g = gesture.current;
      if (g) {
        if (touches.current.size >= 2) {
          const { center, distance } = touchGeometry(touches.current), zoom = Math.min(3, Math.max(0.1, g.view.zoom * distance / g.distance));
          setView({ zoom, x: center.x - (g.center.x - g.view.x) * zoom / g.view.zoom, y: center.y - (g.center.y - g.view.y) * zoom / g.view.zoom });
        }
        return;
      }
    }
    const screen = screenPoint(e), p = world(screen); if (source) setPointer(p);
    const d = drag.current; if (!d) return;
    const dx = (screen.x - d.screen.x) / d.view.zoom, dy = (screen.y - d.screen.y) / d.view.zoom;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.changed = true;
    if (!d.changed) return;
    if (d.type === 'pan') setView({ ...d.view, x: d.view.x + screen.x - d.screen.x, y: d.view.y + screen.y - d.screen.y });
    else if (d.type === 'move') updateScene({ ...d.scene, nodes: d.scene.nodes.map(n => d.ids.includes(n.id) ? { ...n, x: n.x + Math.round(dx / 8) * 8, y: n.y + Math.round(dy / 8) * 8 } : n) });
    else if (d.type === 'resize') updateScene({ ...d.scene, nodes: d.ids.length > 1 ? resizeSelection(d.scene.nodes, d.ids, dx, dy) : d.scene.nodes.map(n => d.ids.includes(n.id) ? fitText({ ...n, width: Math.max(48, Math.round((n.width + dx) / 8) * 8), height: Math.abs(dy) < 3 ? n.height : Math.max(40, Math.round((n.height + dy) / 8) * 8) }, Math.abs(dy) < 3 ? n : undefined) : n) });
    else if (d.type === 'create' && latest.current) { const n = latest.current.nodes.find(n => n.id === d.ids[0]); if (!n) return; if (Math.abs(dx) > 6 || Math.abs(dy) > 6) updateScene({ ...d.scene, nodes: [...d.scene.nodes, fitText({ ...n, x: Math.min(d.start.x, d.start.x + dx), y: Math.min(d.start.y, d.start.y + dy), width: Math.max(48, Math.abs(dx)), height: Math.max(40, Math.abs(dy)) })] }); }
    else if (d.type === 'marquee') setMarquee({ a: d.start, b: p });
  };
  const onUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'touch') {
      touches.current.delete(e.pointerId);
      if (gesture.current) {
        // Rebase if a third finger replaces one of the pinch fingers.
        if (touches.current.size >= 2) gesture.current = { ...touchGeometry(touches.current), view };
        if (!touches.current.size) { gesture.current = null; touchStart.current = null; }
        return;
      }
      touchStart.current = null;
    }
    const d = drag.current; if (!d) return;
    if (d.changed && ['move', 'resize', 'create'].includes(d.type)) remember(d.scene);
    if (d.type === 'create') { setTool('select'); const n = latest.current?.nodes.find(n => n.id === d.ids[0]); if (n && (n.kind === 'sticky' || n.kind === 'text')) setEditing({ id: n.id, text: n.text }); }
    if (d.type === 'marquee' && marquee && latest.current) { const x = Math.min(marquee.a.x, marquee.b.x), y = Math.min(marquee.a.y, marquee.b.y), right = Math.max(marquee.a.x, marquee.b.x), bottom = Math.max(marquee.a.y, marquee.b.y); setSelected(expandSelection(latest.current.nodes, [...new Set([...d.ids, ...latest.current.nodes.filter(n => n.x >= x && n.y >= y && n.x + n.width <= right && n.y + n.height <= bottom).map(n => n.id)])])); }
    drag.current = null; setMarquee(null);
  };
  const onCancel = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'touch') {
      if (!gesture.current) cancelTouchEdit();
      touches.current.delete(e.pointerId);
      if (!touches.current.size) { gesture.current = null; touchStart.current = null; }
    } else { const d = drag.current; if (d && ['move', 'resize', 'create'].includes(d.type)) updateScene(d.scene); drag.current = null; setMarquee(null); }
  };
  const editDone = () => {
    if (!editing || !latest.current) return;
    const b = latest.current, node = b.nodes.find(n => n.id === editing.id), existing = node ?? b.edges.find(e => e.id === editing.id);
    const next = node ? fitText({ ...node, text: editing.text }, node) : null;
    let committed: Scene | undefined;
    if (existing && (existing.text !== editing.text || (node && next?.height !== node.height))) { committed = { nodes: b.nodes.map(n => n.id === editing.id && next ? next : n), edges: b.edges.map(e => e.id === editing.id ? { ...e, text: editing.text } : e) }; change(committed); }
    setEditing(null);
    return committed;
  };
  const zoomBy = (factor: number) => setView(v => { const zoom = Math.min(3, Math.max(0.1, v.zoom * factor)); return { zoom, x: size.width / 2 - (size.width / 2 - v.x) * zoom / v.zoom, y: size.height / 2 - (size.height / 2 - v.y) * zoom / v.zoom }; });
  const reveal = (n: Shape, forEditing = false) => {
    const panel = area.current?.querySelector<HTMLElement>('.layers-panel');
    const panelRight = panel ? panel.offsetLeft + panel.offsetWidth + 24 : 80;
    const left = !forEditing && size.width - panelRight >= 240 ? panelRight : size.width <= 700 ? 24 : 80;
    const right = size.width - 24, top = 100, bottom = size.height - 100;
    setView(v => {
      if (!forEditing && n.x * v.zoom + v.x >= left && (n.x + n.width) * v.zoom + v.x <= right && n.y * v.zoom + v.y >= top && (n.y + n.height) * v.zoom + v.y <= bottom) return v;
      const zoom = Math.max(0.1, Math.min(forEditing ? 1 : v.zoom, (right - left) / n.width, (bottom - top) / n.height));
      return { zoom, x: (left + right) / 2 - (n.x + n.width / 2) * zoom, y: (top + bottom) / 2 - (n.y + n.height / 2) * zoom };
    });
  };
  const selectLayer = (n: Shape, edit = false, extend = false, keepOpen = false) => {
    const open = !n.groupId && (edit || (size.width <= 700 && !extend && !keepOpen)), unit = expandSelection(board?.nodes ?? [], [n.id]);
    setSelected(ids => extend ? ids.includes(n.id) ? ids.filter(id => !unit.includes(id)) : [...new Set([...ids, ...unit])] : unit); setTool('select'); setSource(null);
    if (open) { setLayers(false); if (n.kind !== 'image') setEditing({ id: n.id, text: n.text }); }
    reveal(n, open);
  };
  const newBoard = (kind: 'blank' | 'welcome' | 'flowchart' | 'retro') => { editDone(); const b = template(kind); setBoards(list => [b, ...list]); setActive(b.id); setModal(null); };
  const importFile = async (file?: File) => {
    if (!file || !board) return;
    try {
      if (file.type.startsWith('image/')) {
        if (file.size > MAX_IMAGE_BYTES) throw new Error('Choose an image smaller than 12 MB.');
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Use a PNG, JPEG, or WebP image.');
        const data = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result as string); r.onerror = reject; r.readAsDataURL(file); });
        const img = new Image(); img.src = data; await img.decode(); const scale = Math.min(1, 440 / Math.max(img.width, img.height)); const n = { ...makeShape('image', (size.width / 2 - view.x) / view.zoom, (size.height / 2 - view.y) / view.zoom), width: Math.max(48, img.width * scale), height: Math.max(40, img.height * scale), image: data }; const b = latest.current!; change({ ...snapshot(b), nodes: [...b.nodes, n] }); setSelected([n.id]);
      } else { const b = parseBoard(JSON.parse(await file.text())); setBoards(list => [b, ...list]); setActive(b.id); notify('Board imported. Make yourself at home.'); }
      setModal(null);
    } catch (err) { notify(err instanceof Error ? err.message : 'Could not open this file.'); }
  };
  const fileInput = useRef<HTMLInputElement>(null);
  const exportBoard = async (format: 'svg' | 'png' | 'json', onlySelection = false) => {
    if (!board) return;
    const scene = onlySelection ? selectionScene(board, selected) : snapshot(board);
    setExportOpen(false); const name = (board.title.replace(/[^a-z0-9_-]+/gi, '-').slice(0, 100) || 'whirl-board') + (onlySelection ? '-selection' : '');
    if (format === 'json') download(new Blob([JSON.stringify({ ...board, ...scene, format: 'whirl', version: 1 }, null, 2)], { type: 'application/json' }), `${name}.whirl.json`);
    else if (format === 'svg') download(new Blob([svg(scene)], { type: 'image/svg+xml' }), `${name}.svg`);
    else { const b = bounds(scene.nodes), scale = Math.min(2, 8000 / Math.max(b.width + 120, b.height + 120)), c = document.createElement('canvas'); c.width = (b.width + 120) * scale; c.height = (b.height + 120) * scale; paint(c.getContext('2d')!, scene, { zoom: scale, x: (-b.x + 60) * scale, y: (-b.y + 60) * scale }, c.width, c.height, [], false, false, images.current); c.toBlob(blob => { if (blob) download(blob, `${name}.png`); else notify('Could not export this image. Try SVG instead.'); }); }
  };
  const selectedNodes = board?.nodes.filter(n => selected.includes(n.id)) ?? [], singleGroup = selectedNodes.length > 1 && selectedNodes.every(n => n.groupId && n.groupId === selectedNodes[0].groupId);
  const chosenNode = board?.nodes.find(n => n.id === selected[0]), chosenEdge = board?.edges.find(e => e.id === selected[0]);
  const editNode = board?.nodes.find(n => n.id === editing?.id), editEdge = board?.edges.find(e => e.id === editing?.id), editPos = editNode ? fitText({ ...editNode, text: editing!.text }, editNode) : editEdge && board ? { ...edgeMiddle(route(editEdge, board.nodes, board.edges)), width: 160, height: 48 } : null;
  return <div className={`app ${dark ? 'dark' : ''}`}>
    <header className="topbar">
      <button className="brand" onClick={() => setModal('boards')} title="Your boards"><img src="/icon.svg" alt=""/><span>whirl<span className="brand-dot">.</span></span></button>
      <span className="header-divider"/>
      <div className="board-title"><input aria-label="Board title" maxLength={200} value={board?.title ?? ''} onChange={e => { const title = e.target.value; setBoards(list => list.map(b => b.id === active ? { ...b, title, updatedAt: Date.now() } : b)); }}/><span className="save-state"><span className={`status-dot ${saveState.includes('Not saved') ? 'error' : ''}`}/>{saveState}</span></div>
      <div className="header-actions"><button className="button quiet boards-button" aria-label="My boards" title="My boards" onClick={() => setModal('boards')}><FolderOpen size={16}/><span>My boards</span></button><a className="icon-button github-link" href="https://github.com/nsawill1405/whirl" target="_blank" rel="noreferrer" aria-label="Whirl on GitHub"><Github size={18}/></a><span className="header-divider"/><div className="export-wrap"><button className="button primary" aria-expanded={exportOpen} onClick={() => setExportOpen(v => !v)}><ArrowUpRight size={16}/><span>Export</span><ChevronDown size={13}/></button>{exportOpen && <div className="dropdown export-menu"><div className="menu-label">Take your ideas with you</div>{(['png','svg','json'] as const).map(f => <button key={f} onClick={() => exportBoard(f)}><Download size={16}/><span>{f === 'json' ? 'Whirl board' : `${f.toUpperCase()} image`}<small>{f === 'json' ? 'Editable backup · .json' : f === 'svg' ? 'Crisp at any size' : 'Ready to share'}</small></span><span className="file-kind">{f.toUpperCase()}</span></button>)}{selectedNodes.length > 0 && <><div className="menu-label">Selected shapes only</div>{(['png','svg','json'] as const).map(f => <button key={`selection-${f}`} onClick={() => exportBoard(f, true)}><Download size={16}/><span>Selection as {f.toUpperCase()}<small>{f === 'json' ? 'Editable group backup' : 'Only your selected shapes'}</small></span></button>)}</>}</div>}</div></div>
    </header>
    <main className="workspace" ref={area}>
      <canvas ref={canvas} className={`board-canvas tool-${tool}`} style={{ width: size.width, height: size.height }} tabIndex={0} aria-label={`Whiteboard: ${board?.title ?? 'Loading'}. ${board?.nodes.length ?? 0} shapes. Use the toolbar to add shapes. Open Layers for keyboard selection.`} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onCancel} onDoubleClick={e => { if (!board || tool !== 'select') return; const r = canvas.current!.getBoundingClientRect(), p = world({ x: e.clientX - r.left, y: e.clientY - r.top }), n = hitNode(board.nodes, p), item = n ?? hitEdge(board.edges, board.nodes, p); if (item && !('kind' in item && item.kind === 'image')) { setSelected([item.id]); setEditing({ id: item.id, text: item.text }); } }}/>
      <div className="workspace-heading"><span className="eyebrow">YOUR SPACE TO THINK</span><p>Make room for a little possibility.</p></div>
      <div className="canvas-actions"><button className="button floating" onClick={() => newBoard('blank')}><Plus size={16}/><span>New board</span></button><button className="button floating" onClick={() => setModal('templates')}><LayoutTemplate size={16}/><span>Templates</span></button><button className={`icon-button floating ${layers ? 'active' : ''}`} onClick={() => setLayers(v => !v)} aria-label="Toggle layers" aria-expanded={layers}><Layers size={17}/></button></div>
      <nav className="toolbar" aria-label="Drawing tools"><div className="tool-group">{toolList.map(({ id, icon: Icon, label, key }, i) => <div key={id} className={i === 2 || i === 6 ? 'tool-slot divider' : 'tool-slot'}><button className={`tool ${tool === id ? 'active' : ''}`} onClick={() => chooseTool(id)} title={`${label} (${key})`} aria-label={`${label} (${key})`} aria-pressed={tool === id}><Icon size={20} strokeWidth={1.7}/><span className="tool-key">{key}</span></button></div>)}<div className="tool-slot"><button className="tool" title="Import image or board" aria-label="Import image or board" onClick={() => fileInput.current?.click()}><ImagePlus size={20} strokeWidth={1.7}/></button></div></div></nav>
      <input type="file" hidden ref={fileInput} accept=".json,.png,.jpg,.jpeg,.webp" aria-label="Import file" onChange={e => { void importFile(e.target.files?.[0]); e.target.value = ''; }}/>
      {selected.length > 0 && (size.width > 700 || !layers) && <div className="selection-bar"><span>{singleGroup ? `Group · ${selectedNodes.length} shapes` : selected.length === 1 ? chosenNode?.kind.replace('rectangle', 'Shape') ?? 'Connector' : `${selected.length} selected`}</span>{chosenNode && chosenNode.kind !== 'image' && <><i/>{COLORS.map(color => <button key={color} className={`swatch ${chosenNode.color === color ? 'picked' : ''}`} style={{ background: color }} aria-label={`Fill ${color}`} onClick={() => { if (board) change({ ...snapshot(board), nodes: board.nodes.map(n => selected.includes(n.id) ? { ...n, color } : n) }); }}>{chosenNode.color === color && <Check size={12}/>}</button>)}</>}<i/>{selectedNodes.length > 1 && !singleGroup && <button className="icon-button" title="Group (Ctrl/⌘ G)" aria-label="Group selection" onClick={() => group()}><Group size={16}/></button>}{selectedNodes.some(n => n.groupId) && <button className="icon-button" title="Ungroup (Ctrl/⌘ Shift G)" aria-label="Ungroup selection" onClick={() => group(true)}><Ungroup size={16}/></button>}{selected.length === 1 && chosenNode?.kind !== 'image' && <button className="icon-button" title="Edit text (Enter)" aria-label="Edit text" onClick={() => setEditing({ id: selected[0], text: chosenNode?.text ?? chosenEdge?.text ?? '' })}><Type size={16}/></button>}<button className="icon-button" title="Duplicate" aria-label="Duplicate selection" disabled={!chosenNode} onClick={() => { if (board) paste(selectionScene(board, selected)); }}><Copy size={15}/></button><button className="icon-button danger" title="Delete" aria-label="Delete selection" onClick={remove}><Trash2 size={16}/></button></div>}
      {editing && editPos && <textarea ref={textInput} className="text-editor" aria-label="Shape text" maxLength={10000} value={editing.text} style={{ left: editPos.x * view.zoom + view.x, top: editPos.y * view.zoom + view.y, width: Math.max(100, editPos.width * view.zoom), height: Math.max(48, editPos.height * view.zoom), maxHeight: Math.max(48, size.height - (editPos.y * view.zoom + view.y) - 24), fontFamily: 'system-ui', fontSize: (editNode ? textSize(editNode) : 14) * view.zoom, lineHeight: 1.45, fontWeight: editNode?.kind === 'text' ? 600 : 500 }} onChange={e => setEditing({ ...editing, text: e.target.value })} onBlur={editDone} onKeyDown={e => { if (e.nativeEvent.isComposing || e.keyCode === 229) return; if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); returnToCanvas.current = true; setEditing(null); } else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); returnToCanvas.current = true; editDone(); } }}/ >}
      {layers && <aside className="layers-panel"><div className="panel-heading"><span>On this board <small>{board?.nodes.length ?? 0}</small></span><button className="icon-button" onClick={() => { setLayers(false); canvas.current?.focus(); }} aria-label="Close layers"><PanelLeftClose size={16}/></button></div><div className="layer-list" ref={layerList}>{!board?.nodes.length && <p className="empty-layers">Your ideas will show up here.</p>}{board?.nodes.map(n => <button key={n.id} className={selected.includes(n.id) ? 'selected' : ''} aria-pressed={selected.includes(n.id)} onClick={e => selectLayer(n, false, e.shiftKey)} onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); selectLayer(n, e.key === 'Enter' && !e.shiftKey, e.shiftKey, true); } }} onDoubleClick={() => selectLayer(n, true)}><span className="layer-dot" style={{ background: n.color }}/><span>{n.text || n.kind}{n.groupId && <small> · grouped</small>}</span></button>)}</div></aside>}
      <div className="bottom-left"><div className="history floating"><button className="icon-button" aria-label="Undo" title="Undo (Ctrl/⌘ Z)" disabled={!undoStack.current.length} onClick={undo}><Undo2 size={17}/></button><button className="icon-button" aria-label="Redo" title="Redo (Ctrl/⌘ Shift Z)" disabled={!redoStack.current.length} onClick={redo}><Redo2 size={17}/></button></div><span className="local-note"><span className="tiny-lock">○</span> Just you, your ideas, and a little space.</span></div>
      <div className="canvas-hint">{touchInput ? tool === 'connector' ? source ? 'Tap another shape to connect' : 'Tap a shape, then another to connect' : tool === 'hand' ? 'Drag to pan · Pinch to zoom' : tool === 'select' ? 'Tap a tool to draw · Two fingers to pan or pinch' : 'Tap to add · Drag to size · Two fingers to navigate' : tool === 'connector' ? source ? 'Now click the shape you want to connect to' : 'Click a shape to start a connector' : tool === 'hand' ? 'Drag to wander. There’s plenty of room.' : tool === 'select' ? 'Double-click to edit · Scroll to pan · Ctrl/⌘ + scroll to zoom' : 'Click to add · Drag to choose a size'}</div>
      <div className="bottom-right"><div className="zoom-controls floating"><button className="icon-button" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.2)}><Minus size={16}/></button><button className="zoom-value" aria-label="Reset zoom to 100 percent" onClick={() => zoomBy(1 / view.zoom)}>{Math.round(view.zoom * 100)}%</button><button className="icon-button" aria-label="Zoom in" onClick={() => zoomBy(1.2)}><Plus size={16}/></button><i/><button className="icon-button" aria-label="Fit board" title="Fit board (1)" onClick={() => fit()}><Maximize size={16}/></button></div><button className="icon-button floating theme-button" aria-label={dark ? 'Light theme' : 'Dark theme'} onClick={() => setDark(v => !v)}>{dark ? <Sun size={17}/> : <Moon size={17}/>}</button><button className="icon-button floating" aria-label="Help and keyboard shortcuts" onClick={() => setModal('help')}><HelpCircle size={18}/></button></div>
      {!board?.nodes.length && loaded && <div className="empty-board"><div className="empty-icon"><Sparkles size={30}/></div><h1>Every idea starts somewhere.</h1><p>A blank canvas. A fresh perspective.<br/>What will you make room for?</p><button className="button primary" onClick={() => setModal('templates')}>Start with a template <ArrowRight size={15}/></button><span>or choose a tool and make your first mark</span></div>}
      {!loaded && <div className="loading">Making room for your ideas…</div>}
    </main>
    {toast && <div className="toast" role="status"><Check size={16}/>{toast}<button aria-label="Dismiss notification" onClick={() => setToast('')}><X size={14}/></button></div>}
    {modal && <div className="modal-backdrop" onClick={() => setModal(null)}><section className={`modal ${modal === 'help' ? 'help-modal' : ''}`} role="dialog" aria-modal="true" aria-label={modal === 'boards' ? 'My boards' : modal === 'templates' ? 'Start with a template' : 'A little guidance'} onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setModal(null); } }}><button className="modal-close icon-button" aria-label="Close dialog" autoFocus onClick={() => setModal(null)}><X size={19}/></button>
      {modal === 'boards' ? <><span className="eyebrow">A HOME FOR YOUR IDEAS</span><h1>Your little corner.</h1><p>Pick up where you left off, or go somewhere new.</p><div className="boards-top"><span>{boards.length} {boards.length === 1 ? 'board' : 'boards'} · stored on this device</span><button className="button primary" onClick={() => newBoard('blank')}><Plus size={16}/>New board</button></div><div className="board-list">{boards.map(b => <div className="board-row" key={b.id}><button className="open-board" onClick={() => { editDone(); setActive(b.id); setModal(null); }}><span className="board-icon"><Shapes size={23}/></span><span><strong>{b.title || 'Untitled board'}</strong><small>{b.nodes.length} ideas · {new Date(b.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</small></span>{b.id === active && <span className="current-label">Open</span>}</button><button className="icon-button danger" aria-label={`Delete board ${b.title}`} onClick={() => { if (confirm(`Delete “${b.title}”? This cannot be undone. Export a copy first if you want to keep it.`)) { const remaining = boards.filter(item => item.id !== b.id); if (!remaining.length) { const blank = template('blank'); setBoards([blank]); setActive(blank.id); } else { setBoards(remaining); if (active === b.id) setActive(remaining[0].id); } } }}><Trash2 size={16}/></button></div>)}</div><button className="text-button" onClick={() => fileInput.current?.click()}><ArrowDownToLine size={16}/>Import a Whirl board</button></> : modal === 'templates' ? <><span className="eyebrow">SKIP THE BLANK PAGE</span><h1>A small head start.</h1><p>A little structure to get your ideas flowing.</p><div className="template-grid">{([{ id: 'blank', title: 'A clean slate', desc: 'Room for absolutely anything.', icon: Plus }, { id: 'flowchart', title: 'Find your flow', desc: 'Connect the dots. See what’s next.', icon: MoveUpRight }, { id: 'retro', title: 'Look back, move forward', desc: 'Good things, lessons, and next steps.', icon: StickyNote }, { id: 'welcome', title: 'A little inspiration', desc: 'Get to know your new thinking space.', icon: Sparkles }] as const).map(t => <button key={t.id} className={`template-card template-${t.id}`} onClick={() => newBoard(t.id)}><div className="template-art"><t.icon size={38} strokeWidth={1.2}/>{t.id === 'flowchart' && <><span className="mini-node one"/><span className="mini-node two"/></>}{t.id === 'retro' && <><span className="mini-note one"/><span className="mini-note two"/></>}</div><strong>{t.title}</strong><span>{t.desc}</span><ArrowUpRight className="template-arrow" size={18}/></button>)}</div><p className="template-footnote">Templates open as a new board. Your current ideas stay safe.</p></> : <><span className="eyebrow">A LITTLE GUIDANCE</span><h1>Less friction. More flow.</h1><p>Everything you need to find your way around.</p><div className="help-note touch-help"><strong>On a touchscreen</strong><p>Choose a tool, then tap to add or drag to size a shape. Use two fingers to pan and pinch to zoom, with any tool selected. Or choose the Hand tool to pan with one finger. Tap a shape, then the text button to edit its words. New board starts a blank canvas; Fit board shows the whole drawing.</p></div><div className="shortcut-grid">{[['Select', 'V'], ['Move around', 'H / Alt + drag'], ['Rectangle', 'R'], ['Ellipse', 'O'], ['Diamond', 'D'], ['Connect shapes', 'C, then click two shapes'], ['Sticky note', 'S'], ['Text', 'T'], ['Add chosen shape at center', 'Enter'], ['Edit text / finish', 'Enter'], ['New text line', 'Shift + Enter'], ['Undo / redo', 'Ctrl/⌘ Z / Shift Z'], ['Copy / paste', 'Ctrl/⌘ C / V'], ['Duplicate', 'Ctrl/⌘ D'], ['Group / ungroup', 'Ctrl/⌘ G / Shift G'], ['Select multiple', 'Shift + click / drag a box'], ['Layers / keyboard selection', 'L, then Tab + Space'], ['Add / remove layer selection', 'Shift + Space'], ['Select all', 'Ctrl/⌘ A'], ['Nudge / larger step', 'Arrows / Shift + arrows'], ['Keyboard shortcuts', '?'], ['Delete selection', 'Delete / Backspace'], ['Fit everything', '1'], ['Pan / zoom', 'Scroll / Ctrl/⌘ + scroll']].map(([label, key]) => <div key={label}><span>{label}</span><kbd>{key}</kbd></div>)}</div><div className="help-note"><strong>Your ideas belong to you.</strong><p>Whirl is free and MIT licensed. No account, no tracking. Boards save in this browser — export a JSON backup before clearing site data. Real-time collaboration is coming next.</p></div><div className="help-links"><a href="https://github.com/nsawill1405/whirl" target="_blank" rel="noreferrer"><Github size={16}/>Made in the open <ArrowUpRight size={14}/></a><a href="https://app.devin.ai/sessions/d4e8526546f64bde8831625768f2c62c" target="_blank" rel="noreferrer">Request a change <ArrowUpRight size={14}/></a></div></>}
    </section></div>}
  </div>;
}
