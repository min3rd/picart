import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class EditorSelectionService {
  readonly selectionRect = signal<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  readonly selectionShape = signal<'rect' | 'ellipse' | 'lasso'>('rect');
  readonly selectionPolygon = signal<{ x: number; y: number }[] | null>(null);
  readonly selectionMask = signal<Set<string> | null>(null);

  beginSelection(
    x: number,
    y: number,
    shape: 'rect' | 'ellipse' | 'lasso' = 'rect',
  ) {
    this.selectionShape.set(shape);
    this.selectionMask.set(null);
    if (shape === 'lasso') {
      this.selectionPolygon.set([{ x, y }]);
      this.selectionRect.set({ x, y, width: 1, height: 1 });
    } else {
      this.selectionPolygon.set(null);
      this.selectionRect.set({ x, y, width: 0, height: 0 });
    }
  }

  addLassoPoint(x: number, y: number) {
    const poly = this.selectionPolygon();
    if (!poly) return;
    const last = poly[poly.length - 1];
    if (last && last.x === x && last.y === y) return;
    const next = poly.concat([{ x, y }]);
    this.selectionPolygon.set(next);
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

  updateSelection(x: number, y: number) {
    const start = this.selectionRect();
    if (!start) return;
    const sx = start.x;
    const sy = start.y;
    const nx = Math.min(sx, x);
    const ny = Math.min(sy, y);
    const w = Math.abs(x - sx) + 1;
    const h = Math.abs(y - sy) + 1;
    this.selectionRect.set({ x: nx, y: ny, width: w, height: h });
  }

  clearSelection() {
    this.selectionRect.set(null);
    this.selectionShape.set('rect');
    this.selectionPolygon.set(null);
    this.selectionMask.set(null);
  }

  moveSelection(dx: number, dy: number, canvasWidth: number, canvasHeight: number) {
    const rect = this.selectionRect();
    if (!rect) return;
    const newX = Math.max(0, Math.min(canvasWidth - rect.width, rect.x + dx));
    const newY = Math.max(0, Math.min(canvasHeight - rect.height, rect.y + dy));
    const shape = this.selectionShape();
    if (shape === 'lasso') {
      const poly = this.selectionPolygon();
      if (poly && poly.length > 0) {
        const movedPoly = poly.map((p) => ({
          x: Math.max(0, Math.min(canvasWidth - 1, p.x + dx)),
          y: Math.max(0, Math.min(canvasHeight - 1, p.y + dy)),
        }));
        this.selectionPolygon.set(movedPoly);
      }
    }
    const mask = this.selectionMask();
    if (mask) {
      const movedMask = new Set<string>();
      for (const key of mask) {
        const [xStr, yStr] = key.split(',');
        const x = parseInt(xStr, 10);
        const y = parseInt(yStr, 10);
        const newMaskX = Math.max(0, Math.min(canvasWidth - 1, x + dx));
        const newMaskY = Math.max(0, Math.min(canvasHeight - 1, y + dy));
        movedMask.add(`${newMaskX},${newMaskY}`);
      }
      this.selectionMask.set(movedMask);
    }
    this.selectionRect.set({
      x: newX,
      y: newY,
      width: rect.width,
      height: rect.height,
    });
  }

  setSelectionShape(shape: string) {
    if (shape === 'ellipse') {
      this.selectionShape.set('ellipse');
    } else if (shape === 'lasso') {
      this.selectionShape.set('lasso');
    } else {
      this.selectionShape.set('rect');
    }
  }

  invertSelection(canvasWidth: number, canvasHeight: number) {
    const rect = this.selectionRect();
    if (!rect) return;
    const shape = this.selectionShape();
    const poly = this.selectionPolygon();
    const oldMask = this.selectionMask();
    let currentlySelectedMask: Set<string>;
    if (oldMask) {
      currentlySelectedMask = new Set(oldMask);
    } else {
      currentlySelectedMask = new Set<string>();
      for (let y = 0; y < canvasHeight; y++) {
        for (let x = 0; x < canvasWidth; x++) {
          if (this.isPixelWithinSelection(x, y, rect, shape, poly)) {
            currentlySelectedMask.add(`${x},${y}`);
          }
        }
      }
    }
    const invertedMask = new Set<string>();
    for (let y = 0; y < canvasHeight; y++) {
      for (let x = 0; x < canvasWidth; x++) {
        const key = `${x},${y}`;
        if (!currentlySelectedMask.has(key)) {
          invertedMask.add(key);
        }
      }
    }
    this.selectionMask.set(invertedMask);
    this.setSelectionShape('lasso');
    this.selectionPolygon.set(null);
    this.selectionRect.set({ x: 0, y: 0, width: canvasWidth, height: canvasHeight });
  }

  growSelection(pixels: number, canvasWidth: number, canvasHeight: number) {
    const rect = this.selectionRect();
    if (!rect || pixels <= 0) return;
    const shape = this.selectionShape();
    const poly = this.selectionPolygon();
    const expansion = Math.max(1, Math.floor(pixels));
    const newRect = {
      x: Math.max(0, rect.x - expansion),
      y: Math.max(0, rect.y - expansion),
      width: Math.min(
        canvasWidth - Math.max(0, rect.x - expansion),
        rect.width + expansion * 2,
      ),
      height: Math.min(
        canvasHeight - Math.max(0, rect.y - expansion),
        rect.height + expansion * 2,
      ),
    };
    if (shape === 'lasso' && poly && poly.length >= 3) {
      const visited = new Set<string>();
      const queue: { x: number; y: number }[] = [];
      for (const p of poly) {
        for (let dy = -expansion; dy <= expansion; dy++) {
          for (let dx = -expansion; dx <= expansion; dx++) {
            const nx = p.x + dx;
            const ny = p.y + dy;
            if (nx >= 0 && nx < canvasWidth && ny >= 0 && ny < canvasHeight) {
              const key = `${nx},${ny}`;
              if (!visited.has(key)) {
                visited.add(key);
                queue.push({ x: nx, y: ny });
              }
            }
          }
        }
      }
      this.selectionPolygon.set(queue);
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const p of queue) {
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
    } else {
      this.selectionRect.set(newRect);
    }
  }

  isPixelWithinSelection(
    x: number,
    y: number,
    rect: { x: number; y: number; width: number; height: number } | null,
    shape: 'rect' | 'ellipse' | 'lasso',
    poly: { x: number; y: number }[] | null,
  ): boolean {
    if (!rect) return true;
    const mask = this.selectionMask();
    if (mask) {
      return mask.has(`${x},${y}`);
    }
    if (shape === 'ellipse') {
      const cx = rect.x + rect.width / 2 - 0.5;
      const cy = rect.y + rect.height / 2 - 0.5;
      const rx = Math.max(0.5, rect.width / 2);
      const ry = Math.max(0.5, rect.height / 2);
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      return dx * dx + dy * dy <= 1;
    }
    if (shape === 'lasso' && poly && poly.length > 2) {
      const px = x + 0.5;
      const py = y + 0.5;
      return this.pointInPolygon(px, py, poly);
    }
    return (
      x >= rect.x &&
      x < rect.x + rect.width &&
      y >= rect.y &&
      y < rect.y + rect.height
    );
  }

  private pointInPolygon(
    px: number,
    py: number,
    poly: { x: number; y: number }[],
  ): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x,
        yi = poly[i].y;
      const xj = poly[j].x,
        yj = poly[j].y;
      const intersect =
        yi > py !== yj > py &&
        px < ((xj - xi) * (py - yi)) / (yj - yi + Number.EPSILON) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  restoreSelection(snapshot: any) {
    if (snapshot === null) {
      this.clearSelection();
    } else if (snapshot && typeof snapshot === 'object') {
      const rr = snapshot.rect;
      const shape = snapshot.shape || 'rect';
      const polygon = snapshot.polygon || null;
      const mask = snapshot.mask || null;
      if (!rr) {
        this.clearSelection();
      } else {
        this.selectionRect.set({
          x: Math.max(0, Math.floor(rr.x)),
          y: Math.max(0, Math.floor(rr.y)),
          width: Math.max(0, Math.floor(rr.width)),
          height: Math.max(0, Math.floor(rr.height)),
        });
        this.setSelectionShape(shape);
        if (polygon && Array.isArray(polygon)) {
          this.selectionPolygon.set(
            polygon.map((p: any) => ({
              x: Math.floor(p.x),
              y: Math.floor(p.y),
            })),
          );
        } else {
          this.selectionPolygon.set(null);
        }
        if (mask && mask instanceof Set) {
          this.selectionMask.set(mask);
        } else if (mask && Array.isArray(mask)) {
          this.selectionMask.set(new Set(mask));
        } else {
          this.selectionMask.set(null);
        }
      }
    }
  }

  getSelectionSnapshot() {
    return {
      rect: this.selectionRect(),
      shape: this.selectionShape(),
      polygon: this.selectionPolygon(),
      mask: this.selectionMask(),
    };
  }
}
