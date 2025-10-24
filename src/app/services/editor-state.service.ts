import { Injectable, Signal, computed, signal } from '@angular/core';

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

@Injectable({ providedIn: 'root' })
export class EditorStateService {
  // Tools
  readonly tools = signal<ToolDef[]>([
    { id: 'select-layer', name: 'Select layer', icon: 'cursor', labelKey: 'tools.selectLayer' },
    { id: 'rect-select', name: 'Rect select', icon: 'rectSelect', labelKey: 'tools.rectSelect' },
    { id: 'ellipse-select', name: 'Ellipse select', icon: 'ellipseSelect', labelKey: 'tools.ellipseSelect' },
    { id: 'lasso-select', name: 'Lasso select', icon: 'lassoSelect', labelKey: 'tools.lassoSelect' },
    { id: 'eyedropper', name: 'Eyedropper', icon: 'eyedropper', labelKey: 'tools.eyedropper' },
    { id: 'fill', name: 'Fill', icon: 'fill', labelKey: 'tools.fill' },
  { id: 'brush', name: 'Brush', icon: 'fill', labelKey: 'tools.brush' },
    { id: 'eraser', name: 'Eraser', icon: 'eraser', labelKey: 'tools.eraser' },
    { id: 'line', name: 'Line', icon: 'line', labelKey: 'tools.line' },
    { id: 'circle', name: 'Circle', icon: 'circle', labelKey: 'tools.circle' },
    { id: 'square', name: 'Square', icon: 'square', labelKey: 'tools.square' },
  ]);

  readonly currentTool = signal<ToolId>('select-layer');
  private readonly STORAGE_KEY = 'picart.editor.settings.v1';

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

  // Per-layer pixel buffers (simple, in-memory). Each buffer is a flat array of
  // color strings ('' means transparent). We expose a version signal that
  // components can depend on to redraw when any layer buffer changes.
  readonly layerPixelsVersion = signal(0);
  private layerPixels = new Map<string, string[]>();

  constructor() {
    this.loadFromStorage();
  }

  // Derived
  readonly selectedLayer: Signal<LayerItem | undefined> = computed(() =>
    this.layers().find((l) => l.id === this.selectedLayerId())
  );

  selectTool(id: ToolId) {
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
    this.canvasWidth.set(width);
    this.canvasHeight.set(height);
    // Ensure all existing layer buffers match the new canvas dimensions
    const layers = this.layers();
    for (const l of layers) {
      this.ensureLayerBuffer(l.id, width, height);
    }
  }

  setBrushSize(size: number) {
    const s = Math.max(1, Math.min(size, Math.max(1, Math.max(this.canvasWidth(), this.canvasHeight()))));
    this.brushSize.set(Math.floor(s));
    this.saveToStorage();
  }

  setBrushColor(color: string) {
    // Basic validation: ensure it's a string and not empty
    if (typeof color === 'string' && color.length) {
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
  applyBrushToLayer(layerId: string, x: number, y: number, brushSize: number, color: string | null) {
    const buf = this.layerPixels.get(layerId);
    if (!buf) return false;
    const w = Math.max(1, this.canvasWidth());
    const h = Math.max(1, this.canvasHeight());
    const half = Math.floor((Math.max(1, brushSize) - 1) / 2);
    let changed = false;
    for (let yy = Math.max(0, y - half); yy <= Math.min(h - 1, y + half); yy++) {
      for (let xx = Math.max(0, x - half); xx <= Math.min(w - 1, x + half); xx++) {
        const idx = yy * w + xx;
        const newVal = color === null ? '' : color;
        if (buf[idx] !== newVal) {
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
      const parsed = JSON.parse(raw) as Partial<{ currentTool: ToolId; brushSize: number; brushColor: string }> | null;
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
    this.layers.update((arr) =>
      arr.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l))
    );
    // trigger redraw
    this.layerPixelsVersion.update((v) => v + 1);
  }

  removeLayer(id: string): boolean {
    const arr = this.layers();
    if (arr.length <= 1) {
      return false; // prevent removing last layer
    }
    const idx = arr.findIndex((l) => l.id === id);
    if (idx === -1) return false;
    const next = arr.filter((l) => l.id !== id);
    this.layers.set(next);
    // remove pixel buffer for this layer
    this.layerPixels.delete(id);
    this.layerPixelsVersion.update((v) => v + 1);
    if (this.selectedLayerId() === id) {
      const newIdx = Math.max(0, idx - 1);
      this.selectedLayerId.set(next[newIdx]?.id ?? next[0].id);
    }
    return true;
  }

  addLayer(name?: string) {
    const id = `layer_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const item: LayerItem = { id, name: name || `Layer ${this.layers().length + 1}`, visible: true, locked: false };
  // Add to top (insert at index 0 so the new layer becomes the topmost in the UI)
  this.layers.update((arr) => [item, ...arr]);
    this.selectedLayerId.set(item.id);
    // create pixel buffer for new layer matching current canvas size
    this.ensureLayerBuffer(item.id, this.canvasWidth(), this.canvasHeight());
    return item;
  }

  reorderLayers(fromIndex: number, toIndex: number) {
    const arr = [...this.layers()];
    if (fromIndex < 0 || fromIndex >= arr.length) return false;
    if (toIndex < 0) toIndex = 0;
    if (toIndex >= arr.length) toIndex = arr.length - 1;
    const [item] = arr.splice(fromIndex, 1);
    arr.splice(toIndex, 0, item);
    this.layers.set(arr);
    return true;
  }
}
