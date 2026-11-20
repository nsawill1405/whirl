<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:0f2027,50:203a43,100:2c5364&height=170&section=header&text=Whirl&fontSize=52&fontColor=ffffff&fontAlignY=36&desc=A%20local-first%20whiteboard.%20No%20account%2C%20no%20tracking.&descAlignY=58&descSize=16" alt="Whirl" width="100%" />

<p>
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=white" alt="React" />
  <a href="https://github.com/nsawill1405/whirl/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/nsawill1405/whirl/ci.yml?branch=main&style=for-the-badge&label=CI&logo=githubactions&logoColor=white" alt="CI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-2c5364?style=for-the-badge" alt="License" /></a>
</p>

<p><a href="#what-works-today">What works today</a> · <a href="#run-locally">Run locally</a> · <a href="#your-data">Your data</a> · <a href="#controls">Controls</a> · <a href="#development">Development</a> · <a href="#license">License</a></p>

</div>

**A little space for your next big idea.** A free, MIT-licensed, local-first whiteboard for structured diagrams and sticky notes. No account, no tracking, no paid tier.

## What works today

- Infinite canvas with pan, zoom, fit-to-content, and light/dark themes.
- Rectangles, ellipses, diamonds, sticky notes, text, and PNG/JPEG/WebP images, animated GIFs, and looping MP4/WebM/Ogg video (double-click or select and press Space to play/pause).
- Select, shift-select, box-select, move, resize (bottom-right handle), recolor, duplicate, copy/paste, and undo/redo.
- Persistent groups: select shapes and group them to select, move, resize, copy, or export together.
- Attached orthogonal connectors that route around shapes, with editable labels.
- Multiple boards, IndexedDB autosave, and flowchart/retrospective templates.
- PNG, SVG, and editable `.whirl.json` exports; import boards and images.
- Responsive tools and keyboard-accessible layers for selecting objects.

**This is the first local-first release, not a multiplayer service.** Real-time collaboration, mind-map mode, PDF export, and accounts are not implemented. The next milestone is Yjs sync with a small Node/WebSocket server and durable server-side storage. The browser editor does not need a server API today.

## Run locally

Requires Node.js 22.12+ and npm.

```sh
npm install
npm run dev
```

Open the URL Vite prints (normally `http://localhost:5173`). For production:

```sh
npm run build
npm start
```

Or self-host with Docker:

```sh
docker compose up --build -d
```

Open `http://localhost:8080`. The production app is static, so you can also host `apps/web/dist` on any static web host. Fonts are bundled; there are no third-party network requests or analytics. There is no service worker in this release.

## Your data

Boards save to **this browser on this origin**, not to a cloud account. Give the “Saved on this device” indicator a moment before closing a tab. Different browsers, hostnames, and devices have separate boards. Export JSON backups before clearing browser data, changing hosts, or switching devices. Storage failures are shown in the header; private browsing can limit persistence. Do not edit the same storage from several tabs at once. Image imports are embedded in your board and limited to 12 MB per image (including GIFs); MP4/WebM/Ogg videos are embedded with a separate 25 MB per video limit.

To move a board, choose **Export → Whirl board**, then import the JSON through the image/import tool or My boards. JSON preserves shapes, connectors, text, and embedded images; SVG/PNG are presentation formats. There are import limits (3,000 shapes / 6,000 connectors) to prevent accidentally loading unreasonable files. Very large or dense diagrams can slow routing; use several boards for large projects.

## Controls

| Action | Shortcut |
| --- | --- |
| Select / pan | V / H (or Alt + drag) |
| Rectangle / ellipse / diamond | R / O / D |
| Sticky note / text | S / T |
| Connector | C, then click source and target |
| Edit text or arrow label | Double-click, or select and Enter |
| Finish editing / newline | Enter / Shift + Enter |
| Multiple selection | Shift + click, or drag a selection box |
| Group / ungroup selected shapes | Ctrl/⌘ G / Ctrl/⌘ Shift G |
| Undo / redo | Ctrl/⌘ Z / Ctrl/⌘ Shift Z |
| Copy / paste / duplicate | Ctrl/⌘ C / V / D (within Whirl) |
| Move selected objects | Arrow keys; Shift for larger steps |
| Delete | Delete / Backspace |
| Pan / zoom | Scroll / Ctrl/⌘ + scroll |
| Fit everything | 1 |

On touch screens, choose Pan to move the viewport; use the zoom buttons to zoom. Mobile editing is supported, but a mouse and keyboard are best for complex boards.

Use the selection bar's Group/Ungroup buttons or the shortcuts above. Clicking any member (including in Layers) selects its whole group; drag the shared bottom-right handle to resize it. Groups save with the board and JSON backups, and copies get independent groups. Grouping existing groups combines them into one flat group; ungroup before editing individual members. Choose **Export → Selection as PNG/SVG/JSON** to export just the selected group and its internal connectors without changing whole-board exports.

## Development

`apps/web` is a React/Vite editor. `packages/scene` owns the portable scene model, geometry, validation, and connector routing. Rendering uses a high-DPI HTML canvas with viewport culling and cached routes; text editing uses an HTML overlay. There is no backend or secret configuration to set up.

```sh
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

CI runs these checks on pull requests. Playwright covers drawing and connecting objects, text, movement, history, duplication, local persistence, exports, invalid imports, templates, and mobile controls. There are no pre-commit hooks. Contributions are welcome: open an issue to discuss larger features, keep changes focused, and add a regression test for bug fixes.

## License

[MIT](LICENSE). Your boards are yours.

---

<div align="center">

<sub>Made by <a href="https://github.com/nsawill1405">William North</a> · <a href="https://nsawill.co.uk">nsawill.co.uk</a></sub>

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:2c5364,50:203a43,100:0f2027&height=100&section=footer" alt="" width="100%" />

</div>
