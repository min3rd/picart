import { Injectable, signal } from '@angular/core';
import { FrameItem } from './editor.types';

@Injectable({ providedIn: 'root' })
export class EditorFrameService {
  readonly frames = signal<FrameItem[]>([
    { id: 'f1', name: 'Frame 1', duration: 100 },
    { id: 'f2', name: 'Frame 2', duration: 100 },
    { id: 'f3', name: 'Frame 3', duration: 100 },
  ]);
  readonly currentFrameIndex = signal<number>(0);

  setCurrentFrame(index: number) {
    const max = this.frames().length - 1;
    this.currentFrameIndex.set(Math.max(0, Math.min(index, max)));
  }

  addFrame(name?: string): FrameItem {
    const id = `f${Date.now()}`;
    const frame: FrameItem = {
      id,
      name: name || `Frame ${this.frames().length + 1}`,
      duration: 100,
    };
    this.frames.update((arr) => [...arr, frame]);
    return frame;
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
}
