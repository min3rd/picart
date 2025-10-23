import { Injectable, Signal, computed, signal } from '@angular/core';

export type ToolId =
  | 'select-layer'
  | 'rect-select'
  | 'ellipse-select'
  | 'lasso-select'
  | 'eyedropper'
  | 'fill'
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
    { id: 'eraser', name: 'Eraser', icon: 'eraser', labelKey: 'tools.eraser' },
    { id: 'line', name: 'Line', icon: 'line', labelKey: 'tools.line' },
    { id: 'circle', name: 'Circle', icon: 'circle', labelKey: 'tools.circle' },
    { id: 'square', name: 'Square', icon: 'square', labelKey: 'tools.square' },
  ]);

  readonly currentTool = signal<ToolId>('select-layer');

  // Layers (top is last)
  readonly layers = signal<LayerItem[]>([
    { id: 'bg', name: 'Background', visible: true, locked: false },
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
  readonly canvasWidth = signal<number>(640);
  readonly canvasHeight = signal<number>(360);
  readonly canvasSaved = signal<boolean>(true);

  // Derived
  readonly selectedLayer: Signal<LayerItem | undefined> = computed(() =>
    this.layers().find((l) => l.id === this.selectedLayerId())
  );

  selectTool(id: ToolId) {
    this.currentTool.set(id);
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
  }

  setCanvasSaved(saved: boolean) {
    this.canvasSaved.set(saved);
  }

  toggleLayerVisibility(id: string) {
    this.layers.update((arr) =>
      arr.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l))
    );
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
    if (this.selectedLayerId() === id) {
      const newIdx = Math.max(0, idx - 1);
      this.selectedLayerId.set(next[newIdx]?.id ?? next[0].id);
    }
    return true;
  }

  addLayer(name?: string) {
    const id = `layer_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const item: LayerItem = { id, name: name || `Layer ${this.layers().length + 1}`, visible: true, locked: false };
    // Add to top
    this.layers.update((arr) => [...arr, item]);
    this.selectedLayerId.set(item.id);
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
