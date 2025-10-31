import { Injectable, signal } from '@angular/core';
import { FrameItem, LayerTreeItem } from './editor.types';

@Injectable({ providedIn: 'root' })
export class EditorFrameService {
  readonly frames = signal<FrameItem[]>([
    { id: 'f1', name: 'Frame 1', duration: 100 },
  ]);
  readonly currentFrameIndex = signal<number>(0);

  setCurrentFrame(index: number) {
    const max = this.frames().length - 1;
    this.currentFrameIndex.set(Math.max(0, Math.min(index, max)));
  }

  addFrame(name?: string, layers?: LayerTreeItem[], buffers?: Record<string, string[]>): FrameItem {
    const id = `f${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const frame: FrameItem = {
      id,
      name: name || `Frame ${this.frames().length + 1}`,
      duration: 100,
      layers: layers ? this.deepCopyLayers(layers) : undefined,
      buffers: buffers ? this.deepCopyBuffers(buffers) : undefined,
    };
    this.frames.update((arr) => [...arr, frame]);
    return frame;
  }

  duplicateFrame(id: string): FrameItem | null {
    const index = this.frames().findIndex((f) => f.id === id);
    if (index === -1) return null;
    
    const source = this.frames()[index];
    const newId = `f${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const newFrame: FrameItem = {
      id: newId,
      name: `${source.name} copy`,
      duration: source.duration,
      layers: source.layers ? this.deepCopyLayers(source.layers) : undefined,
      buffers: source.buffers ? this.deepCopyBuffers(source.buffers) : undefined,
    };
    
    this.frames.update((arr) => [
      ...arr.slice(0, index + 1),
      newFrame,
      ...arr.slice(index + 1),
    ]);
    
    this.currentFrameIndex.set(index + 1);
    return newFrame;
  }

  removeFrame(id: string): boolean {
    if (this.frames().length <= 1) return false;
    const index = this.frames().findIndex((f) => f.id === id);
    if (index === -1) return false;
    this.frames.update((arr) => arr.filter((f) => f.id !== id));
    if (this.currentFrameIndex() >= this.frames().length) {
      this.currentFrameIndex.set(Math.max(0, this.frames().length - 1));
    }
    return true;
  }

  updateFrameDuration(id: string, duration: number): boolean {
    const frame = this.frames().find((f) => f.id === id);
    if (!frame) return false;
    
    this.frames.update((arr) =>
      arr.map((f) => (f.id === id ? { ...f, duration: Math.max(1, duration) } : f))
    );
    return true;
  }

  saveFrameState(id: string, layers: LayerTreeItem[], buffers: Record<string, string[]>): boolean {
    const frame = this.frames().find((f) => f.id === id);
    if (!frame) return false;

    this.frames.update((arr) =>
      arr.map((f) =>
        f.id === id
          ? {
              ...f,
              layers: this.deepCopyLayers(layers),
              buffers: this.deepCopyBuffers(buffers),
            }
          : f
      )
    );
    return true;
  }

  private deepCopyLayers(layers: LayerTreeItem[]): LayerTreeItem[] {
    return structuredClone(layers);
  }

  private deepCopyBuffers(buffers: Record<string, string[]>): Record<string, string[]> {
    const copy: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(buffers)) {
      copy[key] = [...value];
    }
    return copy;
  }
}
