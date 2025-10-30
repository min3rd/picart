import { Injectable, inject } from '@angular/core';
import { GradientType, ShapeFillMode } from '../tools/tool.types';
import { EditorCanvasStateService } from './editor-canvas-state.service';
import { EditorColorService } from './editor-color.service';
import { EditorHistoryService } from './editor-history.service';
import { EditorSelectionService } from './editor-selection.service';

interface ShapeDrawOptions {
  strokeThickness: number;
  strokeColor: string;
  fillMode: ShapeFillMode;
  fillColor: string;
  gradientStartColor: string;
  gradientEndColor: string;
  gradientType: GradientType;
  gradientAngle: number;
}

@Injectable({ providedIn: 'root' })
export class EditorDrawingService {
  private readonly canvasState = inject(EditorCanvasStateService);
  private readonly colorService = inject(EditorColorService);
  private readonly historyService = inject(EditorHistoryService);
  private readonly selectionService = inject(EditorSelectionService);

  applyBrushToLayer(
    layerId: string,
    x: number,
    y: number,
    brushSize: number,
    color: string | null,
    options?: { eraserStrength?: number },
  ): boolean {
    const buf = this.canvasState.getLayerBuffer(layerId);
    if (!buf || buf.length === 0) return false;
    const w = Math.max(1, this.canvasState.canvasWidth());
    const h = Math.max(1, this.canvasState.canvasHeight());
    const half = Math.floor((Math.max(1, brushSize) - 1) / 2);
    let changed = false;
    const sel = this.selectionService.selectionRect();
    const selShape = this.selectionService.selectionShape();
    const selPoly = this.selectionService.selectionPolygon();
    const erasing = color === null;
    const eraserStrength = erasing ? (options?.eraserStrength ?? 100) : 0;
    const brushColor = color ?? '';
    for (
      let yy = Math.max(0, y - half);
      yy <= Math.min(h - 1, y + half);
      yy++
    ) {
      for (
        let xx = Math.max(0, x - half);
        xx <= Math.min(w - 1, x + half);
        xx++
      ) {
        const idx = yy * w + xx;
        const oldVal = buf[idx] || '';
        const newVal = erasing
          ? this.colorService.computeEraserValue(oldVal, eraserStrength)
          : brushColor;
        if (
          sel &&
          !this.selectionService.isPixelWithinSelection(
            xx,
            yy,
            sel,
            selShape,
            selPoly,
          )
        ) {
          continue;
        }
        if (oldVal !== newVal) {
          this.historyService.recordPixelChange(layerId, idx, oldVal, newVal);
          buf[idx] = newVal;
          changed = true;
        }
      }
    }
    if (changed) {
      this.canvasState.incrementPixelsVersion();
      this.canvasState.setCanvasSaved(false);
    }
    return changed;
  }

  applyFillToLayer(
    layerId: string,
    x: number,
    y: number,
    color: string | null,
  ): number {
    const buf = this.canvasState.getLayerBuffer(layerId);
    if (!buf || buf.length === 0) return 0;
    const w = Math.max(1, this.canvasState.canvasWidth());
    const h = Math.max(1, this.canvasState.canvasHeight());
    if (x < 0 || x >= w || y < 0 || y >= h) return 0;
    const idx0 = y * w + x;
    const target = buf[idx0] || '';
    const newVal = color === null ? '' : color;
    if (target === newVal) return 0;
    const sel = this.selectionService.selectionRect();
    const shape = this.selectionService.selectionShape();
    const selPoly = this.selectionService.selectionPolygon();
    if (
      sel &&
      !this.selectionService.isPixelWithinSelection(
        x,
        y,
        sel,
        shape,
        selPoly,
      )
    ) {
      return 0;
    }
    let changed = 0;
    const stack: number[] = [idx0];
    while (stack.length > 0) {
      const idx = stack.pop() as number;
      if (buf[idx] !== target) continue;
      this.historyService.recordPixelChange(layerId, idx, target, newVal);
      buf[idx] = newVal;
      changed++;
      const y0 = Math.floor(idx / w);
      const x0 = idx - y0 * w;
      const pushIfValid = (nx: number, ny: number) => {
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) return;
        const nidx = ny * w + nx;
        if (buf[nidx] !== target) return;
        if (
          sel &&
          !this.selectionService.isPixelWithinSelection(
            nx,
            ny,
            sel,
            shape,
            selPoly,
          )
        )
          return;
        stack.push(nidx);
      };
      pushIfValid(x0 - 1, y0);
      pushIfValid(x0 + 1, y0);
      pushIfValid(x0, y0 - 1);
      pushIfValid(x0, y0 + 1);
    }
    if (changed > 0) {
      this.canvasState.incrementPixelsVersion();
      this.canvasState.setCanvasSaved(false);
    }
    return changed;
  }

  applyLineToLayer(
    layerId: string,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    color: string,
    thickness: number,
  ): number {
    const buf = this.canvasState.getLayerBuffer(layerId);
    if (!buf || buf.length === 0) return 0;
    const w = Math.max(1, this.canvasState.canvasWidth());
    const h = Math.max(1, this.canvasState.canvasHeight());
    const selRect = this.selectionService.selectionRect();
    const selShape = this.selectionService.selectionShape();
    const selPoly = this.selectionService.selectionPolygon();
    const clampX = (value: number) =>
      Math.max(0, Math.min(Math.floor(value), w - 1));
    const clampY = (value: number) =>
      Math.max(0, Math.min(Math.floor(value), h - 1));
    let sx = clampX(x0);
    let sy = clampY(y0);
    let ex = clampX(x1);
    let ey = clampY(y1);
    const size = Math.max(1, Math.floor(thickness));
    const half = Math.floor((size - 1) / 2);
    let changed = 0;
    const applyAt = (cx: number, cy: number) => {
      for (let yy = cy - half; yy <= cy + half; yy++) {
        if (yy < 0 || yy >= h) continue;
        for (let xx = cx - half; xx <= cx + half; xx++) {
          if (xx < 0 || xx >= w) continue;
          if (
            !this.selectionService.isPixelWithinSelection(
              xx,
              yy,
              selRect,
              selShape,
              selPoly,
            )
          )
            continue;
          const idx = yy * w + xx;
          if (this.writePixelValue(layerId, buf, idx, color)) changed++;
        }
      }
    };
    const dx = Math.abs(ex - sx);
    const sxSign = sx < ex ? 1 : -1;
    const dy = -Math.abs(ey - sy);
    const sySign = sy < ey ? 1 : -1;
    let err = dx + dy;
    while (true) {
      applyAt(sx, sy);
      if (sx === ex && sy === ey) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        sx += sxSign;
      }
      if (e2 <= dx) {
        err += dx;
        sy += sySign;
      }
      sx = clampX(sx);
      sy = clampY(sy);
    }
    if (changed > 0) {
      this.canvasState.incrementPixelsVersion();
      this.canvasState.setCanvasSaved(false);
    }
    return changed;
  }

  applySquareToLayer(
    layerId: string,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    options: ShapeDrawOptions,
    constrainToSquare = true,
  ): number {
    const buf = this.canvasState.getLayerBuffer(layerId);
    if (!buf || buf.length === 0) return 0;
    const w = Math.max(1, this.canvasState.canvasWidth());
    const h = Math.max(1, this.canvasState.canvasHeight());
    const selRect = this.selectionService.selectionRect();
    const selShape = this.selectionService.selectionShape();
    const selPoly = this.selectionService.selectionPolygon();
    const clampX = (value: number) =>
      Math.max(0, Math.min(Math.floor(value), w - 1));
    const clampY = (value: number) =>
      Math.max(0, Math.min(Math.floor(value), h - 1));
    const startX = clampX(x0);
    const startY = clampY(y0);
    const targetX = clampX(x1);
    const targetY = clampY(y1);
    let endX = targetX;
    let endY = targetY;
    if (constrainToSquare) {
      const stepX = endX >= startX ? 1 : -1;
      const stepY = endY >= startY ? 1 : -1;
      const span = Math.max(Math.abs(endX - startX), Math.abs(endY - startY));
      endX = clampX(startX + stepX * span);
      endY = clampY(startY + stepY * span);
    }
    const minX = Math.max(0, Math.min(startX, endX));
    const maxX = Math.min(w - 1, Math.max(startX, endX));
    const minY = Math.max(0, Math.min(startY, endY));
    const maxY = Math.min(h - 1, Math.max(startY, endY));
    const stroke = Math.max(0, Math.floor(options.strokeThickness ?? 0));
    const strokeColor = (options.strokeColor || '').trim();
    const fillMode: ShapeFillMode =
      options.fillMode === 'gradient' ? 'gradient' : 'solid';
    const fillColor = (options.fillColor || '').trim();
    const gradientStartColor = (options.gradientStartColor || fillColor).trim();
    const gradientEndColor = (
      options.gradientEndColor || gradientStartColor
    ).trim();
    const gradientStartParsed =
      this.colorService.parseHexColor(gradientStartColor);
    const gradientEndParsed =
      this.colorService.parseHexColor(gradientEndColor);
    const fallbackStart = gradientStartColor || gradientEndColor || fillColor;
    const fallbackEnd = gradientEndColor || gradientStartColor || fillColor;
    const gradientAvailable = !!(fallbackStart || fallbackEnd);
    const gradientType: GradientType =
      options.gradientType === 'radial' ? 'radial' : 'linear';
    const gradientAngle =
      typeof options.gradientAngle === 'number' ? options.gradientAngle : 0;
    const angleRad = (gradientAngle * Math.PI) / 180;
    const dirX = Math.cos(angleRad);
    const dirY = Math.sin(angleRad);
    const widthRect = Math.max(1, maxX - minX + 1);
    const heightRect = Math.max(1, maxY - minY + 1);
    const centerX = minX + widthRect / 2;
    const centerY = minY + heightRect / 2;
    let minProj = 0;
    let maxProj = 1;
    if (gradientType === 'linear') {
      let minVal = Number.POSITIVE_INFINITY;
      let maxVal = Number.NEGATIVE_INFINITY;
      const corners = [
        { x: minX, y: minY },
        { x: maxX, y: minY },
        { x: minX, y: maxY },
        { x: maxX, y: maxY },
      ];
      for (const corner of corners) {
        const proj = (corner.x + 0.5) * dirX + (corner.y + 0.5) * dirY;
        if (proj < minVal) minVal = proj;
        if (proj > maxVal) maxVal = proj;
      }
      if (Number.isFinite(minVal) && Number.isFinite(maxVal)) {
        if (minVal === maxVal) {
          maxVal = minVal + 1;
        }
        minProj = minVal;
        maxProj = maxVal;
      }
    }
    const radius = Math.max(widthRect, heightRect) / 2;
    let changed = 0;
    for (let yy = minY; yy <= maxY; yy++) {
      for (let xx = minX; xx <= maxX; xx++) {
        if (
          !this.selectionService.isPixelWithinSelection(
            xx,
            yy,
            selRect,
            selShape,
            selPoly,
          )
        )
          continue;
        const idx = yy * w + xx;
        let pixelColor: string | null = null;
        const distanceToEdge = Math.min(
          xx - minX,
          maxX - xx,
          yy - minY,
          maxY - yy,
        );
        const strokePixel = stroke > 0 && distanceToEdge < stroke;
        if (strokePixel && strokeColor) {
          pixelColor = strokeColor;
        } else if (fillMode === 'solid') {
          if (fillColor) pixelColor = fillColor;
        } else if (gradientAvailable) {
          let ratio = 0;
          if (gradientType === 'radial') {
            const dx = xx + 0.5 - centerX;
            const dy = yy + 0.5 - centerY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            ratio = radius > 0 ? dist / radius : 0;
          } else {
            const proj = (xx + 0.5) * dirX + (yy + 0.5) * dirY;
            const span = maxProj - minProj;
            ratio = span !== 0 ? (proj - minProj) / span : 0;
          }
          const ditherRatio = this.colorService.computeDitheredRatio(
            ratio,
            xx,
            yy,
          );
          const startFallback = fallbackStart || fallbackEnd;
          const endFallback = fallbackEnd || fallbackStart;
          if (startFallback && endFallback) {
            pixelColor = this.colorService.mixParsedColors(
              gradientStartParsed,
              gradientEndParsed,
              ditherRatio,
              startFallback,
              endFallback,
            );
          }
        }
        if (
          pixelColor !== null &&
          this.writePixelValue(layerId, buf, idx, pixelColor)
        )
          changed++;
      }
    }
    if (changed > 0) {
      this.canvasState.incrementPixelsVersion();
      this.canvasState.setCanvasSaved(false);
    }
    return changed;
  }

  applyCircleToLayer(
    layerId: string,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    options: ShapeDrawOptions,
    constrainToCircle = true,
  ): number {
    const buf = this.canvasState.getLayerBuffer(layerId);
    if (!buf || buf.length === 0) return 0;
    const w = Math.max(1, this.canvasState.canvasWidth());
    const h = Math.max(1, this.canvasState.canvasHeight());
    const selRect = this.selectionService.selectionRect();
    const selShape = this.selectionService.selectionShape();
    const selPoly = this.selectionService.selectionPolygon();
    const clampX = (value: number) =>
      Math.max(0, Math.min(Math.floor(value), w - 1));
    const clampY = (value: number) =>
      Math.max(0, Math.min(Math.floor(value), h - 1));
    const startX = clampX(x0);
    const startY = clampY(y0);
    const targetX = clampX(x1);
    const targetY = clampY(y1);
    let endX = targetX;
    let endY = targetY;
    if (constrainToCircle) {
      const stepX = endX >= startX ? 1 : -1;
      const stepY = endY >= startY ? 1 : -1;
      const span = Math.max(Math.abs(endX - startX), Math.abs(endY - startY));
      endX = clampX(startX + stepX * span);
      endY = clampY(startY + stepY * span);
    }
    const minX = Math.max(0, Math.min(startX, endX));
    const maxX = Math.min(w - 1, Math.max(startX, endX));
    const minY = Math.max(0, Math.min(startY, endY));
    const maxY = Math.min(h - 1, Math.max(startY, endY));
    const width = Math.max(1, maxX - minX + 1);
    const height = Math.max(1, maxY - minY + 1);
    const cx = minX + width / 2;
    const cy = minY + height / 2;
    const rx = width / 2;
    const ry = height / 2;
    const stroke = Math.max(0, Math.floor(options.strokeThickness ?? 0));
    const strokeColor = (options.strokeColor || '').trim();
    const fillMode: ShapeFillMode =
      options.fillMode === 'gradient' ? 'gradient' : 'solid';
    const fillColor = (options.fillColor || '').trim();
    const gradientStartColor = (options.gradientStartColor || fillColor).trim();
    const gradientEndColor = (
      options.gradientEndColor || gradientStartColor
    ).trim();
    const fallbackStart = gradientStartColor || gradientEndColor || fillColor;
    const fallbackEnd = gradientEndColor || gradientStartColor || fillColor;
    const gradientAvailable = !!(fallbackStart || fallbackEnd);
    const gradientStartParsed =
      this.colorService.parseHexColor(gradientStartColor);
    const gradientEndParsed =
      this.colorService.parseHexColor(gradientEndColor);
    const gradientType: GradientType =
      options.gradientType === 'linear' ? 'linear' : 'radial';
    const gradientAngle =
      typeof options.gradientAngle === 'number' ? options.gradientAngle : 0;
    const angleRad = (gradientAngle * Math.PI) / 180;
    const dirX = Math.cos(angleRad);
    const dirY = Math.sin(angleRad);
    let minProj = 0;
    let maxProj = 1;
    if (gradientType === 'linear') {
      let minVal = Number.POSITIVE_INFINITY;
      let maxVal = Number.NEGATIVE_INFINITY;
      const corners = [
        { x: minX, y: minY },
        { x: maxX, y: minY },
        { x: minX, y: maxY },
        { x: maxX, y: maxY },
      ];
      for (const corner of corners) {
        const proj = (corner.x + 0.5) * dirX + (corner.y + 0.5) * dirY;
        if (proj < minVal) minVal = proj;
        if (proj > maxVal) maxVal = proj;
      }
      if (Number.isFinite(minVal) && Number.isFinite(maxVal)) {
        if (minVal === maxVal) {
          maxVal = minVal + 1;
        }
        minProj = minVal;
        maxProj = maxVal;
      }
    }
    const invRx = rx > 0 ? 1 / rx : 0;
    const invRy = ry > 0 ? 1 / ry : 0;
    let changed = 0;
    for (let yy = minY; yy <= maxY; yy++) {
      for (let xx = minX; xx <= maxX; xx++) {
        const px = xx + 0.5;
        const py = yy + 0.5;
        const dx = px - cx;
        const dy = py - cy;
        const norm =
          invRx > 0 && invRy > 0
            ? dx * dx * invRx * invRx + dy * dy * invRy * invRy
            : 0;
        if (norm > 1) continue;
        if (
          !this.selectionService.isPixelWithinSelection(
            xx,
            yy,
            selRect,
            selShape,
            selPoly,
          )
        )
          continue;
        const idx = yy * w + xx;
        let pixelColor: string | null = null;
        const distanceNorm = Math.sqrt(Math.max(0, norm));
        const strokePixel =
          stroke > 0 &&
          Math.min(rx, ry) > 0 &&
          (1 - distanceNorm) * Math.min(rx, ry) < stroke;
        if (strokePixel && strokeColor) {
          pixelColor = strokeColor;
        } else if (fillMode === 'solid') {
          if (fillColor) pixelColor = fillColor;
        } else if (gradientAvailable && rx > 0 && ry > 0) {
          let ratio = 0;
          if (gradientType === 'radial') {
            ratio = distanceNorm;
          } else {
            const proj = (xx + 0.5) * dirX + (yy + 0.5) * dirY;
            const span = maxProj - minProj;
            ratio = span !== 0 ? (proj - minProj) / span : 0;
          }
          const ditherRatio = this.colorService.computeDitheredRatio(
            ratio,
            xx,
            yy,
          );
          const startFallback = fallbackStart || fallbackEnd;
          const endFallback = fallbackEnd || fallbackStart;
          if (startFallback && endFallback) {
            pixelColor = this.colorService.mixParsedColors(
              gradientStartParsed,
              gradientEndParsed,
              ditherRatio,
              startFallback,
              endFallback,
            );
          }
        }
        if (
          pixelColor !== null &&
          this.writePixelValue(layerId, buf, idx, pixelColor)
        )
          changed++;
      }
    }
    if (changed > 0) {
      this.canvasState.incrementPixelsVersion();
      this.canvasState.setCanvasSaved(false);
    }
    return changed;
  }

  private writePixelValue(
    layerId: string,
    buf: string[],
    idx: number,
    value: string,
  ): boolean {
    const previous = buf[idx] || '';
    if (previous === value) return false;
    this.historyService.recordPixelChange(layerId, idx, previous, value);
    buf[idx] = value;
    return true;
  }
}
