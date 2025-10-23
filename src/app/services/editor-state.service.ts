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
    { id: 'select-layer', name: 'Select layer', icon: 'cursor' },
    { id: 'rect-select', name: 'Rect select', icon: 'rectSelect' },
    { id: 'ellipse-select', name: 'Ellipse select', icon: 'ellipseSelect' },
    { id: 'lasso-select', name: 'Lasso select', icon: 'lassoSelect' },
    { id: 'eyedropper', name: 'Eyedropper', icon: 'eyedropper' },
    { id: 'fill', name: 'Fill', icon: 'fill' },
    { id: 'eraser', name: 'Eraser', icon: 'eraser' },
    { id: 'line', name: 'Line', icon: 'line' },
    { id: 'circle', name: 'Circle', icon: 'circle' },
    { id: 'square', name: 'Square', icon: 'square' },
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
}
