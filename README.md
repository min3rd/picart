# Pixart

A minimal 2D pixel editor and animation timeline (work in progress). This is an open-source Angular app with Tailwind CSS.

## Features (Initial)

- Editor layout with:
  - Header menu (File, Edit, Tool, Help)
  - Left tool palette (select layer, rectangle/ellipse/lasso select, eyedropper, fill, eraser, line, circle, square)
  - Right layers panel
  - Bottom timeline with frames
  - Center canvas area

## Run locally

```bash
npm install
npm start
```

Then open http://localhost:4200.

## Tech

- Angular 20 (standalone, signals)
- Tailwind CSS v4

## Next steps

- Implement actual drawing tools on the canvas
- Layer visibility/locking controls
- Frame manipulation (add/remove/reorder, duration editing)
- Project open/save using File System Access API
- Export to sprite sheet / GIF / PNG sequence
