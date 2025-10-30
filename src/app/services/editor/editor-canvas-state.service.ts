import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class EditorCanvasStateService {
  readonly canvasWidth = signal<number>(64);
  readonly canvasHeight = signal<number>(64);
  readonly canvasSaved = signal<boolean>(true);
  readonly layerPixelsVersion = signal(0);
  private layerPixels = new Map<string, string[]>();

  getLayerBuffer(layerId: string): string[] {
    return this.layerPixels.get(layerId) || [];
  }

  setLayerBuffer(layerId: string, buffer: string[]) {
    this.layerPixels.set(layerId, buffer);
  }

  deleteLayerBuffer(layerId: string) {
    this.layerPixels.delete(layerId);
  }

  getAllBuffers(): Map<string, string[]> {
    return this.layerPixels;
  }

  replaceAllBuffers(buffers: Map<string, string[]>) {
    this.layerPixels = buffers;
  }

  ensureLayerBuffer(layerId: string, width: number, height: number) {
    const need = Math.max(1, width) * Math.max(1, height);
    const existing = this.layerPixels.get(layerId) || [];
    if (existing.length === need) return;
    const next = new Array<string>(need).fill('');
    const oldW =
      existing.length > 0 && height > 0
        ? Math.floor(existing.length / height)
        : 0;
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

  setCanvasSize(width: number, height: number) {
    this.canvasWidth.set(width);
    this.canvasHeight.set(height);
  }

  setCanvasSaved(saved: boolean) {
    this.canvasSaved.set(saved);
  }

  incrementPixelsVersion() {
    this.layerPixelsVersion.update((v) => v + 1);
  }
}
