import { app, BrowserWindow, clipboard, dialog, Menu, net, protocol, session, shell, type MenuItemConstructorOptions } from 'electron';
import { existsSync } from 'node:fs';
import { join, normalize, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

// Boards live in IndexedDB, which is keyed by origin, so the app is always served from this fixed origin.
const ORIGIN = 'app://whirl';
const resources = (name: string) => app.isPackaged ? join(process.resourcesPath, name) : join(__dirname, '..', '..', '..', name === 'web' ? 'apps/web/dist' : 'packages/mcp/dist');

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
if (!app.requestSingleInstanceLock()) app.quit();

function serveWeb() {
  const root = resources('web');
  protocol.handle('app', request => {
    const url = new URL(request.url);
    if (url.host !== 'whirl') return new Response('Not found', { status: 404 });
    const file = normalize(join(root, decodeURIComponent(url.pathname)));
    const inside = !relative(root, file).startsWith('..') && !relative(root, file).includes(`..${sep}`);
    return net.fetch(pathToFileURL(inside && existsSync(file) && !file.endsWith(sep) && file !== root ? file : join(root, 'index.html')).toString());
  });
}

const external = (url: string) => /^(https?|mailto):/i.test(url);

function createWindow() {
  const win = new BrowserWindow({
    width: 1440, height: 920, minWidth: 720, minHeight: 520, title: 'Whirl', backgroundColor: '#f7f6fb', show: false,
    icon: join(resources('web'), 'icon-512.png'),
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: true },
  });
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => { if (external(url)) void shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (event, url) => { if (!url.startsWith(`${ORIGIN}/`)) { event.preventDefault(); if (external(url)) void shell.openExternal(url); } });
  void win.loadURL(process.env.WHIRL_DESKTOP_URL ?? `${ORIGIN}/`);
  return win;
}

function mcpSetup() {
  const script = join(resources('mcp'), app.isPackaged ? 'index.mjs' : 'index.js');
  if (process.env.APPIMAGE) return { error: 'The AppImage moves every time it starts, so AI apps cannot launch its MCP server. Install the .deb, or run the server from a Whirl checkout (see the README).' };
  if (!existsSync(script)) return { error: 'The MCP server is not built. Run npm run build:mcp in your Whirl checkout.' };
  return { config: JSON.stringify({ mcpServers: { whirl: { command: process.execPath, args: [script], env: { ELECTRON_RUN_AS_NODE: '1' } } } }, null, 2) };
}

function menu() {
  const copyMcp = () => {
    const setup = mcpSetup();
    if ('error' in setup) { void dialog.showMessageBox({ type: 'info', message: 'AI assistant setup', detail: setup.error }); return; }
    clipboard.writeText(setup.config);
    void dialog.showMessageBox({ type: 'info', message: 'MCP setup copied', detail: 'Paste it into your AI app\'s MCP config (for example claude_desktop_config.json), restart the AI app, then click the plug icon in Whirl.' });
  };
  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
    { role: 'fileMenu' }, { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' },
    { role: 'help', submenu: [
      { label: 'Copy AI Assistant (MCP) Setup', click: copyMcp },
      { label: 'Whirl on GitHub', click: () => void shell.openExternal('https://github.com/nsawill1405/whirl') },
    ] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.on('second-instance', () => { const [win] = BrowserWindow.getAllWindows(); if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, done) => done(permission === 'clipboard-sanitized-write' || permission === 'clipboard-read'));
  serveWeb(); menu(); createWindow();
});
