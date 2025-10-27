import { Injectable, Signal, computed, signal } from '@angular/core';
import { Observable, of } from 'rxjs';

export type ToolId =
  | 'select-layer'
  | 'rect-select'
  | 'ellipse-select'
  | 'lasso-select'
  | 'eyedropper'
  | 'fill'
  | 'brush'
  | 'eraser'
  | 'line'
  | 'circle'
  | 'square';

export interface ToolDef {
  id: ToolId;
  name: string;
  icon?: string; // ng-icons name
  labelKey?: string;
}

export interface LayerItem {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
}

export interface FrameItem {
  id: string;
  name: string;
  duration: number; // ms
}

// History types for undo/redo
interface LayerChange {
  layerId: string;
  indices: number[];
  previous: string[];
  next: string[];
}

interface MetaChange {
  key: string;
  previous: any;
  next: any;
}

interface HistoryEntry {
  pixelChanges?: LayerChange[];
  metaChanges?: MetaChange[];
  description?: string;
}

interface CurrentAction {
  map: Map<string, { indices: number[]; previous: string[]; next: string[] }>;
  meta: MetaChange[];
  description?: string;
}

@Injectable({ providedIn: 'root' })
export class EditorStateService {
  // Tools
  readonly tools = signal<ToolDef[]>([
    {
      id: 'select-layer',
      name: 'Select layer',
      icon: 'featherMousePointer',
      labelKey: 'tools.selectLayer',
    },
    { id: 'rect-select', name: 'Rect select', icon: 'featherSquare', labelKey: 'tools.rectSelect' },
    {
      id: 'ellipse-select',
      name: 'Ellipse select',
      icon: 'featherCircle',
      labelKey: 'tools.ellipseSelect',
    },
    {
      id: 'lasso-select',
      name: 'Lasso select',
      icon: 'featherOctagon',
      labelKey: 'tools.lassoSelect',
    },
    {
      id: 'eyedropper',
      name: 'Eyedropper',
      icon: 'bootstrapEyedropper',
      labelKey: 'tools.eyedropper',
    },
    { id: 'fill', name: 'Fill', icon: 'bootstrapDroplet', labelKey: 'tools.fill' },
    { id: 'brush', name: 'Brush', icon: 'bootstrapBrush', labelKey: 'tools.brush' },
    { id: 'eraser', name: 'Eraser', icon: 'bootstrapEraser', labelKey: 'tools.eraser' },
    { id: 'line', name: 'Line', icon: 'bootstrapVectorPen', labelKey: 'tools.line' },
    { id: 'circle', name: 'Circle', icon: 'bootstrapCircle', labelKey: 'tools.circle' },
    { id: 'square', name: 'Square', icon: 'bootstrapSquare', labelKey: 'tools.square' },
  ]);

  readonly currentTool = signal<ToolId>('select-layer');
  private readonly STORAGE_KEY = 'picart.editor.settings.v1';
  private readonly PROJECT_STORAGE_KEY = 'picart.project.local.v1';

  // Layers: default to a single layer named "Layer 1" (no separate background)
  readonly layers = signal<LayerItem[]>([
    { id: 'l1', name: 'Layer 1', visible: true, locked: false },
  ]);
  readonly selectedLayerId = signal<string>('l1');

  // Frames
  readonly frames = signal<FrameItem[]>([
    { id: 'f1', name: 'Frame 1', duration: 100 },
    { id: 'f2', name: 'Frame 2', duration: 100 },
    { id: 'f3', name: 'Frame 3', duration: 100 },
  ]);
  readonly currentFrameIndex = signal<number>(0);

  // Canvas metadata
  readonly canvasWidth = signal<number>(64);
  readonly canvasHeight = signal<number>(64);
  readonly canvasSaved = signal<boolean>(true);

  // Brush state
  readonly brushSize = signal<number>(1);
  readonly brushColor = signal<string>('#000000');
  // Eraser strength (0-100 percent). Currently stored for UI and future use.
  readonly eraserStrength = signal<number>(100);
  // Rectangular selection in logical pixel coords (x,y,width,height) or null
  readonly selectionRect = signal<{ x: number; y: number; width: number; height: number } | null>(
    null
  );
  // selection shape: 'rect' | 'ellipse' | 'lasso'
  readonly selectionShape = signal<'rect' | 'ellipse' | 'lasso'>('rect');
  // For lasso selections we store the polygon as an array of logical points
  readonly selectionPolygon = signal<{ x: number; y: number }[] | null>(null);

  // Per-layer pixel buffers (simple, in-memory). Each buffer is a flat array of
  // color strings ('' means transparent). We expose a version signal that
  // components can depend on to redraw when any layer buffer changes.
  readonly layerPixelsVersion = signal(0);
  private layerPixels = new Map<string, string[]>();

  // History (undo/redo) support. History entries are recorded as grouped
  // changes per user action (a "section" of user interaction), allowing
  // undo/redo to restore previous pixel values.
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private historyLimit = 200;
  // Version signals to allow UI to observe availability without exposing stacks
  readonly undoVersion = signal(0);
  readonly redoVersion = signal(0);
  // Current in-progress action (null when not recording)
  private currentAction: CurrentAction | null = null;

  // Attempt to load a full project snapshot from localStorage (if present).
  // This complements the lightweight editor settings loaded by loadFromStorage().
  loadProjectFromLocalStorage(): Observable<boolean> {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return of(false);
      const raw = window.localStorage.getItem(this.PROJECT_STORAGE_KEY);

      if (!raw) return of(false);
      const parsed = JSON.parse(raw) as any;
      if (!parsed) return of(false);

      // Basic validation and restore
      const canvas = parsed.canvas || {};
      const w = Number(canvas.width) || this.canvasWidth();
      const h = Number(canvas.height) || this.canvasHeight();
      this.canvasWidth.set(Math.max(1, Math.floor(w)));
      this.canvasHeight.set(Math.max(1, Math.floor(h)));

      // Restore layers if provided
      if (parsed.layers && Array.isArray(parsed.layers) && parsed.layers.length > 0) {
        const layers = (parsed.layers as any[]).map((l) => ({
          id: l.id,
          name: l.name,
          visible: !!l.visible,
          locked: !!l.locked,
        }));
        this.layers.set(layers);
      }

      // Restore pixel buffers if provided (expecting object map)
      this.layerPixels = new Map<string, string[]>();
      if (parsed.layerBuffers && typeof parsed.layerBuffers === 'object') {
        for (const k of Object.keys(parsed.layerBuffers)) {
          const buf = parsed.layerBuffers[k];
          if (Array.isArray(buf)) {
            // ensure length matches w*h by resizing/padding/truncating
            const need = Math.max(1, this.canvasWidth()) * Math.max(1, this.canvasHeight());
            const next = new Array<string>(need).fill('');
            for (let i = 0; i < Math.min(buf.length, need); i++) next[i] = buf[i] || '';
            this.layerPixels.set(k, next);
          }
        }
      }

      // Ensure every layer has a buffer
      for (const l of this.layers()) {
        if (!this.layerPixels.has(l.id))
          this.ensureLayerBuffer(l.id, this.canvasWidth(), this.canvasHeight());
      }

      // restore selected layer if provided
      if (parsed.selectedLayerId && typeof parsed.selectedLayerId === 'string') {
        const exists = this.layers().some((x) => x.id === parsed.selectedLayerId);
        if (exists) this.selectedLayerId.set(parsed.selectedLayerId);
      }

      // restore tool + brush
      if (parsed.currentTool && typeof parsed.currentTool === 'string') {
        const exists = this.tools().some((t) => t.id === parsed.currentTool);
        if (exists) this.currentTool.set(parsed.currentTool as any);
      }
      if (parsed.brush && typeof parsed.brush === 'object') {
        if (typeof parsed.brush.size === 'number')
          this.brushSize.set(Math.max(1, Math.floor(parsed.brush.size)));
        if (typeof parsed.brush.color === 'string') this.brushColor.set(parsed.brush.color);
      }
      if (parsed.eraser && typeof parsed.eraser === 'object') {
        if (typeof parsed.eraser.strength === 'number')
          this.eraserStrength.set(Math.max(0, Math.min(100, Math.floor(parsed.eraser.strength))));
      }

      // restore selection if present
      if (parsed.selection) {
        const s = parsed.selection as any;
        if (s && typeof s === 'object') {
          const rect = s;
          if (rect && typeof rect.x === 'number') {
            this.selectionRect.set({
              x: Math.max(0, Math.floor(rect.x)),
              y: Math.max(0, Math.floor(rect.y)),
              width: Math.max(0, Math.floor(rect.width || 0)),
              height: Math.max(0, Math.floor(rect.height || 0)),
            });
          }
        }
      }
      if (parsed.selectionPolygon && Array.isArray(parsed.selectionPolygon)) {
        this.selectionPolygon.set(
          (parsed.selectionPolygon as any[]).map((p) => ({
            x: Math.floor(p.x),
            y: Math.floor(p.y),
          }))
        );
        // if polygon exists, set shape
        if (this.selectionPolygon()) this.selectionShape.set('lasso');
      }

      // frames
      if (parsed.frames && Array.isArray(parsed.frames))
        this.frames.set(
          (parsed.frames as any[]).map((f) => ({
            id: f.id,
            name: f.name,
            duration: Number(f.duration) || 100,
          }))
        );

      // bump version so UI redraws
      this.layerPixelsVersion.update((v) => v + 1);
      this.setCanvasSaved(true);
      return of(true);
    } catch (e) {
      // ignore parse errors but log
      try {
        console.warn('Failed to load project from localStorage', e);
      } catch {}
      return of(false);
    }
  }

  // Export the current editor state into a serializable project-like object
  exportProjectSnapshot() {
    const now = new Date().toISOString();
    const layers = this.layers().map((l) => ({ ...l }));
    const buffers: Record<string, string[]> = {};
    for (const [id, buf] of this.layerPixels.entries()) {
      buffers[id] = buf.slice();
    }
    return {
      id: `local_${Date.now()}`,
      name: `Local Project ${new Date().toISOString()}`,
      created: now,
      modified: now,
      canvas: {
        width: this.canvasWidth(),
        height: this.canvasHeight(),
      },
      layers,
      layerBuffers: buffers,
      selectedLayerId: this.selectedLayerId(),
      currentTool: this.currentTool(),
      brush: { size: this.brushSize(), color: this.brushColor() },
  eraser: { strength: this.eraserStrength() },
      selection: this.selectionRect(),
      selectionPolygon: this.selectionPolygon(),
      frames: this.frames(),
    } as const;
  }

  /**
   * Restore an arbitrary project-like snapshot into the editor state.
   * Accepts the same shape produced by exportProjectSnapshot() and used for localStorage.
   */
  restoreProjectSnapshot(parsed: any): boolean {
    if (!parsed || typeof parsed !== 'object') return false;
    try {
      const canvas = parsed.canvas || {};
      const w = Number(canvas.width) || this.canvasWidth();
      const h = Number(canvas.height) || this.canvasHeight();
      this.canvasWidth.set(Math.max(1, Math.floor(w)));
      this.canvasHeight.set(Math.max(1, Math.floor(h)));

      if (parsed.layers && Array.isArray(parsed.layers) && parsed.layers.length > 0) {
        const layers = (parsed.layers as any[]).map((l) => ({ id: l.id, name: l.name, visible: !!l.visible, locked: !!l.locked }));
        this.layers.set(layers);
      }

      // restore buffers if present
      this.layerPixels = new Map<string, string[]>();
      if (parsed.layerBuffers && typeof parsed.layerBuffers === 'object') {
        for (const k of Object.keys(parsed.layerBuffers)) {
          const buf = parsed.layerBuffers[k];
          if (Array.isArray(buf)) {
            const need = Math.max(1, this.canvasWidth()) * Math.max(1, this.canvasHeight());
            const next = new Array<string>(need).fill('');
            for (let i = 0; i < Math.min(buf.length, need); i++) next[i] = buf[i] || '';
            this.layerPixels.set(k, next);
          }
        }
      }
      for (const l of this.layers()) {
        if (!this.layerPixels.has(l.id)) this.ensureLayerBuffer(l.id, this.canvasWidth(), this.canvasHeight());
      }

      if (parsed.selectedLayerId && typeof parsed.selectedLayerId === 'string') {
        const exists = this.layers().some((x) => x.id === parsed.selectedLayerId);
        if (exists) this.selectedLayerId.set(parsed.selectedLayerId);
      }

      if (parsed.currentTool && typeof parsed.currentTool === 'string') {
        const exists = this.tools().some((t) => t.id === parsed.currentTool);
        if (exists) this.currentTool.set(parsed.currentTool as any);
      }
      if (parsed.brush && typeof parsed.brush === 'object') {
        if (typeof parsed.brush.size === 'number') this.brushSize.set(Math.max(1, Math.floor(parsed.brush.size)));
        if (typeof parsed.brush.color === 'string') this.brushColor.set(parsed.brush.color);
      }
      if (parsed.eraser && typeof parsed.eraser === 'object') {
        if (typeof parsed.eraser.strength === 'number')
          this.eraserStrength.set(Math.max(0, Math.min(100, Math.floor(parsed.eraser.strength))));
      }

      if (parsed.selection) {
        const s = parsed.selection as any;
        if (s && typeof s === 'object' && typeof s.x === 'number') {
          this.selectionRect.set({ x: Math.max(0, Math.floor(s.x)), y: Math.max(0, Math.floor(s.y)), width: Math.max(0, Math.floor(s.width || 0)), height: Math.max(0, Math.floor(s.height || 0)) });
        }
      }
      if (parsed.selectionPolygon && Array.isArray(parsed.selectionPolygon)) {
        this.selectionPolygon.set((parsed.selectionPolygon as any[]).map((p) => ({ x: Math.floor(p.x), y: Math.floor(p.y) })));
        if (this.selectionPolygon()) this.selectionShape.set('lasso');
      }

      if (parsed.frames && Array.isArray(parsed.frames)) this.frames.set((parsed.frames as any[]).map((f) => ({ id: f.id, name: f.name, duration: Number(f.duration) || 100 })));

      this.layerPixelsVersion.update((v) => v + 1);
      this.setCanvasSaved(true);
      return true;
    } catch (e) {
      console.warn('Failed to restore project snapshot', e);
      return false;
    }
  }

  resetToNewProject(width = 64, height = 64) {
    this.canvasWidth.set(Math.max(1, Math.floor(width)));
    this.canvasHeight.set(Math.max(1, Math.floor(height)));
    const id = `l_${Date.now().toString(36).slice(2, 8)}`;
    const item: LayerItem = { id, name: 'Layer 1', visible: true, locked: false };
    this.layers.set([item]);
    this.selectedLayerId.set(item.id);
    this.layerPixels = new Map<string, string[]>();
    this.ensureLayerBuffer(item.id, this.canvasWidth(), this.canvasHeight());
    this.selectionRect.set(null);
    this.selectionPolygon.set(null);
    this.selectionShape.set('rect');
    this.clearHistory();
    this.layerPixelsVersion.update((v) => v + 1);
    this.setCanvasSaved(true);
  }

  // Save a serialized snapshot of the current project into localStorage.
  saveProjectToLocalStorage(): boolean {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return false;
      const snapshot = this.exportProjectSnapshot();
      window.localStorage.setItem(this.PROJECT_STORAGE_KEY, JSON.stringify(snapshot));
      this.setCanvasSaved(true);
      return true;
    } catch (e) {
      console.error('Failed to save project to localStorage', e);
      return false;
    }
  }

  // Derived
  readonly selectedLayer: Signal<LayerItem | undefined> = computed(() =>
    this.layers().find((l) => l.id === this.selectedLayerId())
  );

  selectTool(id: ToolId) {
    const prev = this.currentTool();
    this.commitMetaChange({ key: 'currentTool', previous: prev, next: id });
    this.currentTool.set(id);
    this.saveToStorage();
  }

  selectLayer(id: string) {
    this.selectedLayerId.set(id);
  }

  setCurrentFrame(index: number) {
    const max = this.frames().length - 1;
    this.currentFrameIndex.set(Math.max(0, Math.min(index, max)));
  }

  setCanvasSize(width: number, height: number) {
    const prevSnapshot = this.snapshotLayersAndBuffers();
    const prevSize = {
      width: this.canvasWidth(),
      height: this.canvasHeight(),
      buffers: prevSnapshot.buffers,
    };
    this.canvasWidth.set(width);
    this.canvasHeight.set(height);
    // Ensure all existing layer buffers match the new canvas dimensions
    const layers = this.layers();
    for (const l of layers) {
      this.ensureLayerBuffer(l.id, width, height);
    }
    const nextSnapshot = this.snapshotLayersAndBuffers();
    const nextSize = { width, height, buffers: nextSnapshot.buffers };
    this.commitMetaChange({ key: 'canvasSnapshot', previous: prevSize, next: nextSize });
  }

  setBrushSize(size: number) {
    const s = Math.max(
      1,
      Math.min(size, Math.max(1, Math.max(this.canvasWidth(), this.canvasHeight())))
    );
    const prev = this.brushSize();
    const next = Math.floor(s);
    this.commitMetaChange({ key: 'brushSize', previous: prev, next });
    this.brushSize.set(next);
    this.saveToStorage();
  }

  setEraserStrength(strength: number) {
    const s = Math.max(0, Math.min(100, Math.floor(strength)));
    const prev = this.eraserStrength();
    const next = s;
    this.commitMetaChange({ key: 'eraserStrength', previous: prev, next });
    this.eraserStrength.set(next);
    this.saveToStorage();
  }

  setBrushColor(color: string) {
    // Basic validation: ensure it's a string and not empty
    if (typeof color === 'string' && color.length) {
      const prev = this.brushColor();
      this.commitMetaChange({ key: 'brushColor', previous: prev, next: color });
      this.brushColor.set(color);
      this.saveToStorage();
    }
  }

  // Ensure a pixel buffer exists for a layer with given dimensions. Preserves
  // top-left content when resizing smaller/larger.
  ensureLayerBuffer(layerId: string, width: number, height: number) {
    const need = Math.max(1, width) * Math.max(1, height);
    const existing = this.layerPixels.get(layerId) || [];
    if (existing.length === need) return;
    const next = new Array<string>(need).fill('');
    const oldW = existing.length > 0 && height > 0 ? Math.floor(existing.length / height) : 0;
    // Copy what we can (best-effort); assume top-left alignment
    if (oldW > 0) {
      const oldH = Math.floor(existing.length / oldW);
      const copyH = Math.min(oldH, height);
      const copyW = Math.min(oldW, width);
      for (let y = 0; y < copyH; y++) {
        for (let x = 0; x < copyW; x++) {
          const oi = y * oldW + x;
          const ni = y * width + x;
          next[ni] = existing[oi] || '';
        }
      }
    }
    this.layerPixels.set(layerId, next);
    this.layerPixelsVersion.update((v) => v + 1);
  }

  // Get the pixel buffer for a layer. Returns a live reference (caller should
  // not replace the array) or an empty array if none.
  getLayerBuffer(layerId: string): string[] {
    return this.layerPixels.get(layerId) || [];
  }

  // Apply a square brush/eraser to a given layer at logical pixel x,y.
  applyBrushToLayer(
    layerId: string,
    x: number,
    y: number,
    brushSize: number,
    color: string | null
  ) {
    const buf = this.layerPixels.get(layerId);
    if (!buf) return false;
    const w = Math.max(1, this.canvasWidth());
    const h = Math.max(1, this.canvasHeight());
    const half = Math.floor((Math.max(1, brushSize) - 1) / 2);
    let changed = false;
    const sel = this.selectionRect();
    const selShape = this.selectionShape();
    const selPoly = this.selectionPolygon();
    for (let yy = Math.max(0, y - half); yy <= Math.min(h - 1, y + half); yy++) {
      for (let xx = Math.max(0, x - half); xx <= Math.min(w - 1, x + half); xx++) {
        const idx = yy * w + xx;
        const newVal = color === null ? '' : color;
        const oldVal = buf[idx] || '';
        // If a selection exists, skip pixels outside the selection
        if (sel) {
          if (selShape === 'ellipse') {
            const cx = sel.x + sel.width / 2 - 0.5;
            const cy = sel.y + sel.height / 2 - 0.5;
            const rx = Math.max(0.5, sel.width / 2);
            const ry = Math.max(0.5, sel.height / 2);
            const dx = (xx - cx) / rx;
            const dy = (yy - cy) / ry;
            if (dx * dx + dy * dy > 1) continue;
          } else if (selShape === 'lasso' && selPoly && selPoly.length > 2) {
            // point-in-polygon test using pixel center
            const px = xx + 0.5;
            const py = yy + 0.5;
            if (!this._pointInPolygon(px, py, selPoly)) continue;
          } else {
            if (xx < sel.x || xx >= sel.x + sel.width || yy < sel.y || yy >= sel.y + sel.height)
              continue;
          }
        }

        if (oldVal !== newVal) {
          // If a current action is open, record the change (previous + new)
          if (this.currentAction) {
            let entry = this.currentAction.map.get(layerId);
            if (!entry) {
              entry = { indices: [], previous: [], next: [] };
              this.currentAction.map.set(layerId, entry);
            }
            entry.indices.push(idx);
            entry.previous.push(oldVal);
            entry.next.push(newVal);
          }
          buf[idx] = newVal;
          changed = true;
        }
      }
    }
    if (changed) {
      this.layerPixelsVersion.update((v) => v + 1);
      this.setCanvasSaved(false);
    }
    return changed;
  }

  // Flood-fill (4-way) on a single layer at logical pixel x,y with color (null = erase)
  applyFillToLayer(layerId: string, x: number, y: number, color: string | null) {
    const buf = this.layerPixels.get(layerId);
    if (!buf) return 0;
    const w = Math.max(1, this.canvasWidth());
    const h = Math.max(1, this.canvasHeight());
    if (x < 0 || x >= w || y < 0 || y >= h) return 0;
    const idx0 = y * w + x;
    const target = buf[idx0] || '';
    const newVal = color === null ? '' : color;
    if (target === newVal) return 0;

    let changed = 0;
    const sel = this.selectionRect();
    const shape = this.selectionShape();
    const selPoly = this.selectionPolygon();
    const stack: number[] = [idx0];
    while (stack.length > 0) {
      const idx = stack.pop() as number;
      if (buf[idx] !== target) continue;
      // record previous value if action open
      if (this.currentAction) {
        let entry = this.currentAction.map.get(layerId);
        if (!entry) {
          entry = { indices: [], previous: [], next: [] };
          this.currentAction.map.set(layerId, entry);
        }
        entry.indices.push(idx);
        entry.previous.push(target);
        entry.next.push(newVal);
      }
      buf[idx] = newVal;
      changed++;

      const y0 = Math.floor(idx / w);
      const x0 = idx - y0 * w;
      // neighbors: left, right, up, down
      if (sel) {
        if (shape === 'ellipse') {
          // push neighbor only if inside ellipse bounds
          const cx = sel.x + sel.width / 2 - 0.5;
          const cy = sel.y + sel.height / 2 - 0.5;
          const rx = Math.max(0.5, sel.width / 2);
          const ry = Math.max(0.5, sel.height / 2);
          const pushIfInside = (nx: number, ny: number, idxToPush: number) => {
            const dx = (nx - cx) / rx;
            const dy = (ny - cy) / ry;
            if (dx * dx + dy * dy <= 1 && buf[idxToPush] === target) stack.push(idxToPush);
          };
          if (x0 > sel.x) pushIfInside(x0 - 1, y0, idx - 1);
          if (x0 < sel.x + sel.width - 1) pushIfInside(x0 + 1, y0, idx + 1);
          if (y0 > sel.y) pushIfInside(x0, y0 - 1, idx - w);
          if (y0 < sel.y + sel.height - 1) pushIfInside(x0, y0 + 1, idx + w);
        } else if (shape === 'lasso' && selPoly && selPoly.length > 2) {
          // push neighbor only if inside polygon bounds
          const pushIfInside = (nx: number, ny: number, idxToPush: number) => {
            const px = nx + 0.5;
            const py = ny + 0.5;
            if (this._pointInPolygon(px, py, selPoly) && buf[idxToPush] === target)
              stack.push(idxToPush);
          };
          if (x0 > sel.x) pushIfInside(x0 - 1, y0, idx - 1);
          if (x0 < sel.x + sel.width - 1) pushIfInside(x0 + 1, y0, idx + 1);
          if (y0 > sel.y) pushIfInside(x0, y0 - 1, idx - w);
          if (y0 < sel.y + sel.height - 1) pushIfInside(x0, y0 + 1, idx + w);
        } else {
          // rect selection
          if (x0 > sel.x && buf[idx - 1] === target && x0 - 1 >= sel.x) stack.push(idx - 1);
          if (x0 < sel.x + sel.width - 1 && buf[idx + 1] === target && x0 + 1 < sel.x + sel.width)
            stack.push(idx + 1);
          if (y0 > sel.y && buf[idx - w] === target && y0 - 1 >= sel.y) stack.push(idx - w);
          if (y0 < sel.y + sel.height - 1 && buf[idx + w] === target && y0 + 1 < sel.y + sel.height)
            stack.push(idx + w);
        }
      } else {
        if (x0 > 0) stack.push(idx - 1);
        if (x0 < w - 1) stack.push(idx + 1);
        if (y0 > 0) stack.push(idx - w);
        if (y0 < h - 1) stack.push(idx + w);
      }
    }

    if (changed > 0) {
      this.layerPixelsVersion.update((v) => v + 1);
      this.setCanvasSaved(false);
    }
    return changed;
  }

  // History management APIs
  beginAction(description?: string) {
    // If there's already an action, end it first
    if (this.currentAction) {
      this.endAction();
    }
    this.currentAction = { map: new Map(), meta: [], description: description || '' };
  }

  endAction() {
    if (!this.currentAction) return;
    const map = this.currentAction.map;
    // collect pixel changes
    const pixelChanges: LayerChange[] = [];
    for (const [layerId, v] of map.entries()) {
      pixelChanges.push({
        layerId,
        indices: v.indices.slice(),
        previous: v.previous.slice(),
        next: v.next.slice(),
      });
    }
    const metaChanges =
      this.currentAction.meta && this.currentAction.meta.length
        ? this.currentAction.meta.slice()
        : undefined;
    // Only push an entry if there are pixel changes or meta changes
    if (pixelChanges.length > 0 || (metaChanges && metaChanges.length > 0)) {
      const entry: HistoryEntry = {
        pixelChanges: pixelChanges.length > 0 ? pixelChanges : undefined,
        metaChanges,
        description: this.currentAction.description,
      };
      this.pushUndo(entry);
    }
    this.currentAction = null;
  }

  // Helper: commit a meta change either into currentAction (if open) or as a single-step history entry
  private commitMetaChange(meta: MetaChange) {
    if (this.currentAction) {
      this.currentAction.meta.push(meta);
      return;
    }
    const entry: HistoryEntry = { metaChanges: [meta], description: meta.key };
    this.pushUndo(entry);
  }

  // Selection APIs
  beginSelection(x: number, y: number, shape: 'rect' | 'ellipse' | 'lasso' = 'rect') {
    // start a temporary selection; caller should call updateSelection/endSelection
    this.selectionShape.set(shape);
    if (shape === 'lasso') {
      this.selectionPolygon.set([{ x, y }]);
      this.selectionRect.set({ x, y, width: 1, height: 1 });
    } else {
      this.selectionPolygon.set(null);
      this.selectionRect.set({ x, y, width: 0, height: 0 });
    }
  }

  // Add a point to the current lasso polygon (called while dragging)
  addLassoPoint(x: number, y: number) {
    const poly = this.selectionPolygon();
    if (!poly) return;
    // avoid duplicating consecutive identical points
    const last = poly[poly.length - 1];
    if (last && last.x === x && last.y === y) return;
    const next = poly.concat([{ x, y }]);
    this.selectionPolygon.set(next);
    // update bounding rect for quick rejection tests
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const p of next) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    this.selectionRect.set({
      x: Math.max(0, Math.floor(minX)),
      y: Math.max(0, Math.floor(minY)),
      width: Math.max(1, Math.ceil(maxX - minX) + 1),
      height: Math.max(1, Math.ceil(maxY - minY) + 1),
    });
  }

  // Point-in-polygon test (ray-casting). px/py are in same coordinate space as polygon points.
  private _pointInPolygon(px: number, py: number, poly: { x: number; y: number }[]) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x,
        yi = poly[i].y;
      const xj = poly[j].x,
        yj = poly[j].y;
      const intersect =
        yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + Number.EPSILON) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  updateSelection(x: number, y: number) {
    const start = this.selectionRect();
    if (!start) return;
    // compute rect from start.x,start.y to x,y (rect/ellipse use this)
    const sx = start.x;
    const sy = start.y;
    const nx = Math.min(sx, x);
    const ny = Math.min(sy, y);
    const w = Math.abs(x - sx) + 1;
    const h = Math.abs(y - sy) + 1;
    this.selectionRect.set({ x: nx, y: ny, width: w, height: h });
    // if shape is lasso this method is a no-op; lasso uses addLassoPoint
  }

  endSelection() {
    const rect = this.selectionRect();
    if (!rect) return;
    // record selection into history as a meta change so undo/redo restores it
    const shape = this.selectionShape();
    if (shape === 'lasso') {
      const poly = this.selectionPolygon();
      this.commitMetaChange({
        key: 'selectionSnapshot',
        previous: null,
        next: { rect, shape, polygon: poly },
      });
    } else {
      this.commitMetaChange({ key: 'selectionSnapshot', previous: null, next: { rect, shape } });
    }
  }

  clearSelection() {
    const prev = this.selectionRect();
    if (!prev) return;
    const prevShape = this.selectionShape();
    const prevPoly = this.selectionPolygon();
    this.selectionRect.set(null);
    this.selectionShape.set('rect');
    this.selectionPolygon.set(null);
    this.commitMetaChange({
      key: 'selectionSnapshot',
      previous: { rect: prev, shape: prevShape, polygon: prevPoly },
      next: null,
    });
  }

  // Snapshot current buffers and layers for structural operations
  private snapshotLayersAndBuffers(): { layers: LayerItem[]; buffers: Record<string, string[]> } {
    const layersCopy = this.layers().map((l) => ({ ...l }));
    const buffers: Record<string, string[]> = {};
    for (const [id, buf] of this.layerPixels.entries()) {
      buffers[id] = buf.slice();
    }
    return { layers: layersCopy, buffers };
  }

  // Apply a meta change (previous/next) depending on useNext flag.
  private applyMetaChange(meta: MetaChange, useNext: boolean) {
    const val = useNext ? meta.next : meta.previous;
    switch (meta.key) {
      case 'currentTool':
        if (typeof val === 'string') this.currentTool.set(val as ToolId);
        break;
      case 'brushSize':
        if (typeof val === 'number') this.brushSize.set(Math.max(1, Math.floor(val)));
        break;
      case 'brushColor':
        if (typeof val === 'string') this.brushColor.set(val);
        break;
      case 'layersSnapshot':
        if (val && typeof val === 'object') {
          const layers = (val.layers as LayerItem[]) || [];
          const buffers = (val.buffers as Record<string, string[]>) || {};
          this.layers.set(layers.map((l) => ({ ...l })));
          // replace buffers map
          this.layerPixels = new Map<string, string[]>();
          for (const k of Object.keys(buffers)) {
            this.layerPixels.set(k, (buffers[k] || []).slice());
          }
          // ensure selectedLayerId valid
          const sel = this.selectedLayerId();
          if (!this.layers().some((x) => x.id === sel)) {
            this.selectedLayerId.set(this.layers()[0]?.id ?? '');
          }
          this.layerPixelsVersion.update((v) => v + 1);
        }
        break;
      case 'canvasSnapshot':
        if (val && typeof val === 'object') {
          const w = Number(val.width) || this.canvasWidth();
          const h = Number(val.height) || this.canvasHeight();
          this.canvasWidth.set(w);
          this.canvasHeight.set(h);
          // restore buffers if provided
          if (val.buffers && typeof val.buffers === 'object') {
            this.layerPixels = new Map<string, string[]>();
            for (const k of Object.keys(val.buffers)) {
              this.layerPixels.set(k, (val.buffers[k] || []).slice());
            }
            this.layerPixelsVersion.update((v) => v + 1);
          } else {
            // ensure buffers match new size
            for (const l of this.layers()) this.ensureLayerBuffer(l.id, w, h);
          }
        }
        break;
      case 'selectionSnapshot':
        // restore selection (rect + shape)
        if (val === null) {
          this.selectionRect.set(null);
          this.selectionShape.set('rect');
        } else if (val && typeof val === 'object') {
          // expected { rect: {x,y,width,height}, shape: 'rect'|'ellipse' }
          const rr = (val as any).rect;
          const shape = (val as any).shape || 'rect';
          if (!rr) {
            this.selectionRect.set(null);
            this.selectionShape.set('rect');
          } else {
            this.selectionRect.set({
              x: Math.max(0, Math.floor(rr.x)),
              y: Math.max(0, Math.floor(rr.y)),
              width: Math.max(0, Math.floor(rr.width)),
              height: Math.max(0, Math.floor(rr.height)),
            });
            this.selectionShape.set(shape === 'ellipse' ? 'ellipse' : 'rect');
          }
        }
        break;
      default:
        // unknown meta keys: attempt to set directly on known signals by key name
        try {
          // no-op if not recognized
        } catch {}
    }
  }

  private pushUndo(entry: HistoryEntry) {
    this.undoStack.push(entry);
    if (this.undoStack.length > this.historyLimit) this.undoStack.shift();
    // clear redo on new user action
    this.redoStack = [];
    this.undoVersion.update((v) => v + 1);
    this.redoVersion.update((v) => v + 1);
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo() {
    if (!this.canUndo()) return false;
    const entry = this.undoStack.pop() as HistoryEntry;
    // apply pixel inverse (previous values)
    if (entry.pixelChanges) {
      for (const ch of entry.pixelChanges) {
        const buf = this.layerPixels.get(ch.layerId);
        if (!buf) continue;
        for (let i = 0; i < ch.indices.length; i++) {
          buf[ch.indices[i]] = ch.previous[i];
        }
      }
    }
    // apply meta inverse
    if (entry.metaChanges) {
      for (const m of entry.metaChanges) {
        this.applyMetaChange(m, /*useNext*/ false);
      }
    }
    // push the original entry to redo stack so redo can re-apply entry.next values
    this.redoStack.push(entry);
    this.layerPixelsVersion.update((v) => v + 1);
    this.setCanvasSaved(false);
    this.undoVersion.update((v) => v + 1);
    this.redoVersion.update((v) => v + 1);
    return true;
  }

  redo() {
    if (!this.canRedo()) return false;
    const entry = this.redoStack.pop() as HistoryEntry;
    if (entry.pixelChanges) {
      for (const ch of entry.pixelChanges) {
        const buf = this.layerPixels.get(ch.layerId);
        if (!buf) continue;
        for (let i = 0; i < ch.indices.length; i++) {
          buf[ch.indices[i]] = ch.next[i];
        }
      }
    }
    if (entry.metaChanges) {
      for (const m of entry.metaChanges) {
        this.applyMetaChange(m, /*useNext*/ true);
      }
    }
    // push the same entry back to undo stack so undo can restore previous values again
    this.undoStack.push(entry);
    this.layerPixelsVersion.update((v) => v + 1);
    this.setCanvasSaved(false);
    this.undoVersion.update((v) => v + 1);
    this.redoVersion.update((v) => v + 1);
    return true;
  }

  clearHistory() {
    this.undoStack = [];
    this.redoStack = [];
    this.undoVersion.set(0);
    this.redoVersion.set(0);
  }

  private saveToStorage() {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      const data = {
        currentTool: this.currentTool(),
        brushSize: this.brushSize(),
        brushColor: this.brushColor(),
      } as const;
      window.localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      // ignore storage errors
    }
  }

  private loadFromStorage() {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      const raw = window.localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<{
        currentTool: ToolId;
        brushSize: number;
        brushColor: string;
      }> | null;
      if (!parsed) return;
      if (parsed.currentTool && typeof parsed.currentTool === 'string') {
        // validate tool id exists in tools list
        const exists = this.tools().some((t) => t.id === parsed.currentTool);
        if (exists) this.currentTool.set(parsed.currentTool as ToolId);
      }
      if (parsed.brushSize && typeof parsed.brushSize === 'number') {
        this.brushSize.set(Math.max(1, Math.floor(parsed.brushSize)));
      }
      if (parsed.brushColor && typeof parsed.brushColor === 'string') {
        this.brushColor.set(parsed.brushColor);
      }
    } catch (e) {
      // ignore parse errors
    }
  }

  setCanvasSaved(saved: boolean) {
    this.canvasSaved.set(saved);
  }

  toggleLayerVisibility(id: string) {
    const prev = this.snapshotLayersAndBuffers();
    this.layers.update((arr) => arr.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)));
    // trigger redraw
    this.layerPixelsVersion.update((v) => v + 1);
    const next = this.snapshotLayersAndBuffers();
    this.commitMetaChange({ key: 'layersSnapshot', previous: prev, next });
  }

  removeLayer(id: string): boolean {
    const arr = this.layers();
    if (arr.length <= 1) {
      return false; // prevent removing last layer
    }
    const idx = arr.findIndex((l) => l.id === id);
    if (idx === -1) return false;
    const prevSnapshot = this.snapshotLayersAndBuffers();
    const next = arr.filter((l) => l.id !== id);
    this.layers.set(next);
    // remove pixel buffer for this layer
    this.layerPixels.delete(id);
    this.layerPixelsVersion.update((v) => v + 1);
    if (this.selectedLayerId() === id) {
      const newIdx = Math.max(0, idx - 1);
      this.selectedLayerId.set(next[newIdx]?.id ?? next[0].id);
    }
    const nextSnapshot = this.snapshotLayersAndBuffers();
    this.commitMetaChange({ key: 'layersSnapshot', previous: prevSnapshot, next: nextSnapshot });
    return true;
  }

  addLayer(name?: string) {
    const prevSnapshot = this.snapshotLayersAndBuffers();
    const id = `layer_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const item: LayerItem = {
      id,
      name: name || `Layer ${this.layers().length + 1}`,
      visible: true,
      locked: false,
    };
    // Add to top (insert at index 0 so the new layer becomes the topmost in the UI)
    this.layers.update((arr) => [item, ...arr]);
    this.selectedLayerId.set(item.id);
    // create pixel buffer for new layer matching current canvas size
    this.ensureLayerBuffer(item.id, this.canvasWidth(), this.canvasHeight());
    const nextSnapshot = this.snapshotLayersAndBuffers();
    this.commitMetaChange({ key: 'layersSnapshot', previous: prevSnapshot, next: nextSnapshot });
    return item;
  }

  reorderLayers(fromIndex: number, toIndex: number) {
    const prev = this.snapshotLayersAndBuffers();
    const arr = [...this.layers()];
    if (fromIndex < 0 || fromIndex >= arr.length) return false;
    if (toIndex < 0) toIndex = 0;
    if (toIndex >= arr.length) toIndex = arr.length - 1;
    const [item] = arr.splice(fromIndex, 1);
    arr.splice(toIndex, 0, item);
    this.layers.set(arr);
    const next = this.snapshotLayersAndBuffers();
    this.commitMetaChange({ key: 'layersSnapshot', previous: prev, next });
    return true;
  }
}
