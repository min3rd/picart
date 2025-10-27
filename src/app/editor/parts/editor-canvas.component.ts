import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewChild,
  inject,
  signal,
  effect,
  EffectRef,
} from '@angular/core';
import { EditorStateService } from '../../services/editor-state.service';
import { TranslocoPipe } from '@jsverse/transloco';
import { NgIcon } from '@ng-icons/core';

@Component({
  selector: 'pa-editor-canvas',
  templateUrl: './editor-canvas.component.html',
  styleUrl: './editor-canvas.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe, NgIcon],
  host: {
    class: 'block h-full w-full',
  },
})
export class EditorCanvas {
  @ViewChild('canvasEl', { static: true }) canvasEl!: ElementRef<HTMLCanvasElement>;
  @ViewChild('canvasContainer', { static: true }) canvasContainer!: ElementRef<HTMLDivElement>;
  readonly state = inject(EditorStateService);

  readonly mouseX = signal<number | null>(null);
  readonly mouseY = signal<number | null>(null);
  readonly hoverX = signal<number | null>(null);
  readonly hoverY = signal<number | null>(null);

  readonly panX = signal(0);
  readonly panY = signal(0);
  readonly scale = signal(1);
  // rotation feature disabled temporarily
  readonly rotation = signal(0);

  private panning = false;
  // painting state
  private painting = false;
  private lastPaintPos: { x: number; y: number } | null = null;
  // rectangle selection drag state
  private selectionStart: { x: number; y: number } | null = null;
  private selectionDragging = false;
  private lastPointer = { x: 0, y: 0 };
  private stopRenderEffect: EffectRef | null = null;
  readonly tileSize = signal(1);
  private resizeListener: (() => void) | null = null;
  // cursor assets (from public/cursors)
  private readonly defaultCursor = `url('/cursors/link.png') 12 12, grab`;
  private readonly brushCursor = `url('/cursors/handwriting.png') 12 12, crosshair`;
  private readonly eraserCursor = `url('/cursors/unavailable.png') 12 12, cell`;
  private readonly handGrabbingCursor = `url('/cursors/grab.png') 12 12, grabbing`;

  constructor() {
    // Use static cursor images placed in public/cursors directory.
    // Expected files (add to public/cursors): brush.png, eraser.png, hand-grabbing.png
    this.stopRenderEffect = effect(() => {
      this.drawCanvas();
      return null as any;
    });
  }

  // compute the CSS cursor for the canvas based on current tool and state
  cursor(): string {
    if (this.panning) return this.handGrabbingCursor;
    const tool = this.state.currentTool();
    if (tool === 'rect-select' || tool === 'ellipse-select') return `crosshair`;
    if (tool === 'brush') return this.brushCursor;
    if (tool === 'eraser') return this.eraserCursor;
    return this.defaultCursor;
  }

  ngAfterViewInit(): void {
    // Auto-scale to fit the viewport and center the canvas.
    this.centerAndFitCanvas();

    // ensure pixel buffers exist for all layers
    for (const l of this.state.layers()) {
      this.state.ensureLayerBuffer(l.id, this.state.canvasWidth(), this.state.canvasHeight());
    }

    // Recenter on window resize
    this.resizeListener = () => this.centerAndFitCanvas();
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', this.resizeListener as EventListener);
    }
  }

  get maxScale(): number {
    const maxDim = Math.max(1, Math.max(this.state.canvasWidth(), this.state.canvasHeight()));
    const targetPx = 512;
    const computed = Math.ceil(targetPx / maxDim);
    return Math.min(Math.max(8, computed), 256);
  }

  updateTileSize(brushSize = 1, desiredScreenTilePx = 24) {
    const s = Math.max(0.001, this.scale());
    const tile = Math.max(1, Math.round(desiredScreenTilePx / (s * Math.max(1, brushSize))));
    this.tileSize.set(tile);
  }

  onPointerMove(ev: PointerEvent) {
    const rect = this.canvasEl.nativeElement.getBoundingClientRect();

    const visX = ev.clientX - rect.left;
    const visY = ev.clientY - rect.top;
    this.mouseX.set(Math.round(visX));
    this.mouseY.set(Math.round(visY));

    const w = this.state.canvasWidth();
    const h = this.state.canvasHeight();
    const ratioX = w / Math.max(1, rect.width);
    const ratioY = h / Math.max(1, rect.height);
    const logicalX = Math.floor(visX * ratioX);
    const logicalY = Math.floor(visY * ratioY);

    if (logicalX >= 0 && logicalX < w && logicalY >= 0 && logicalY < h) {
      this.hoverX.set(logicalX);
      this.hoverY.set(logicalY);
    } else {
      this.hoverX.set(null);
      this.hoverY.set(null);
    }

    if (this.panning) {
      const dx = ev.clientX - this.lastPointer.x;
      const dy = ev.clientY - this.lastPointer.y;
      this.panX.set(this.panX() + dx);
      this.panY.set(this.panY() + dy);
      this.lastPointer.x = ev.clientX;
      this.lastPointer.y = ev.clientY;
    }

    // If dragging a rectangle/ellipse selection, update selection.
    // If Shift is held, constrain to a square so ellipse-select becomes a circle.
    if (this.selectionDragging) {
      if (logicalX >= 0 && logicalX < w && logicalY >= 0 && logicalY < h) {
        let endX = logicalX;
        let endY = logicalY;
        if (ev.shiftKey && this.selectionStart) {
          // Constrain to a square anchored at the selection start.
          const dx = logicalX - this.selectionStart.x;
          const dy = logicalY - this.selectionStart.y;
          const absDx = Math.abs(dx);
          const absDy = Math.abs(dy);
          const max = Math.max(absDx, absDy);
          const sx = dx >= 0 ? 1 : -1;
          const sy = dy >= 0 ? 1 : -1;
          endX = this.selectionStart.x + sx * max;
          endY = this.selectionStart.y + sy * max;
          // clamp to canvas bounds
          endX = Math.max(0, Math.min(endX, w - 1));
          endY = Math.max(0, Math.min(endY, h - 1));
        }
        this.state.updateSelection(endX, endY);
      }
      return;
    }

    // rotation disabled: no-op

    // Painting: if left button pressed and current tool is brush/eraser, apply
    if (this.painting) {
      if (logicalX >= 0 && logicalX < w && logicalY >= 0 && logicalY < h) {
        const layerId = this.state.selectedLayerId();
        const tool = this.state.currentTool();
        const color = tool === 'eraser' ? null : this.state.brushColor();
        if (this.lastPaintPos) {
          this.drawLinePaint(
            layerId,
            this.lastPaintPos.x,
            this.lastPaintPos.y,
            logicalX,
            logicalY,
            this.state.brushSize(),
            color
          );
        } else {
          this.state.applyBrushToLayer(layerId, logicalX, logicalY, this.state.brushSize(), color);
        }
        this.lastPaintPos = { x: logicalX, y: logicalY };
      }
    }
  }

  onPointerLeave() {
    this.hoverX.set(null);
    this.hoverY.set(null);
    if (this.painting) {
      // finalize current paint action if pointer leaves
      this.painting = false;
      this.lastPaintPos = null;
      this.state.endAction();
    }
  }

  onWheel(ev: WheelEvent) {
    ev.preventDefault();
    const delta = ev.deltaY > 0 ? -0.1 : 0.1;
    const next = Math.max(0.01, this.scale() + delta);
    this.scale.set(Number(next.toFixed(2)));
  }

  onPointerDown(ev: PointerEvent) {
    // Middle-click (button 1) or Ctrl for panning. Shift no longer starts panning
    // so Shift can be used for other modifiers like constraining selection to a circle.
    if (ev.button === 1) {
      this.panning = true;
      this.lastPointer.x = ev.clientX;
      this.lastPointer.y = ev.clientY;
    }
    // right-click rotation disabled

    // Left-button painting start (draw into selected layer)
    if (ev.button === 0) {
      const rect = this.canvasEl.nativeElement.getBoundingClientRect();
      const visX = ev.clientX - rect.left;
      const visY = ev.clientY - rect.top;
      const w = this.state.canvasWidth();
      const h = this.state.canvasHeight();
      const ratioX = w / Math.max(1, rect.width);
      const ratioY = h / Math.max(1, rect.height);
      const logicalX = Math.floor(visX * ratioX);
      const logicalY = Math.floor(visY * ratioY);
      const tool = this.state.currentTool();
      // Rectangle / Ellipse selection handling
      if (
        (tool === 'rect-select' || tool === 'ellipse-select') &&
        logicalX >= 0 &&
        logicalX < w &&
        logicalY >= 0 &&
        logicalY < h
      ) {
        this.selectionStart = { x: logicalX, y: logicalY };
        this.selectionDragging = true;
        const shape = tool === 'ellipse-select' ? 'ellipse' : 'rect';
        this.state.beginSelection(logicalX, logicalY, shape as any);
        return;
      }
      if (
        tool === 'fill' &&
        logicalX >= 0 &&
        logicalX < this.state.canvasWidth() &&
        logicalY >= 0 &&
        logicalY < this.state.canvasHeight()
      ) {
        // One-shot fill action
        this.state.beginAction('fill');
        const layerId = this.state.selectedLayerId();
        const color = this.state.brushColor();
        this.state.applyFillToLayer(layerId, logicalX, logicalY, color);
        this.state.endAction();
      } else if (
        (tool === 'brush' || tool === 'eraser') &&
        logicalX >= 0 &&
        logicalX < this.state.canvasWidth() &&
        logicalY >= 0 &&
        logicalY < this.state.canvasHeight()
      ) {
        // Begin a grouped user action so the whole stroke is a single undoable
        // section. The action will be collected until pointer up/leave.
        this.state.beginAction('paint');
        this.painting = true;
        this.lastPaintPos = { x: logicalX, y: logicalY };
        const layerId = this.state.selectedLayerId();
        const color = tool === 'eraser' ? null : this.state.brushColor();
        this.state.applyBrushToLayer(layerId, logicalX, logicalY, this.state.brushSize(), color);
      }
    }
  }

  onPointerUp(ev: PointerEvent) {
    this.panning = false;
    // rotation disabled
    // stop painting on any pointer up
    if (this.painting) {
      this.painting = false;
      this.lastPaintPos = null;
      this.state.endAction();
    }

    if (this.selectionDragging) {
      this.selectionDragging = false;
      this.selectionStart = null;
      this.state.endSelection();
    }
  }

  infoVisible = signal(true);

  setCanvasWidth(event: Event) {
    const target = event.target as HTMLInputElement;
    const width = parseInt(target.value, 10);
    if (width > 0) {
      this.state.setCanvasSize(width, this.state.canvasHeight());
      // ensure buffers for all layers
      for (const l of this.state.layers()) {
        this.state.ensureLayerBuffer(l.id, width, this.state.canvasHeight());
      }
    }
  }

  setCanvasHeight(event: Event) {
    const target = event.target as HTMLInputElement;
    const height = parseInt(target.value, 10);
    if (height > 0) {
      this.state.setCanvasSize(this.state.canvasWidth(), height);
      // ensure buffers for all layers
      for (const l of this.state.layers()) {
        this.state.ensureLayerBuffer(l.id, this.state.canvasWidth(), height);
      }
    }
  }

  // Note: per-layer pixel buffers are stored in EditorStateService; ensureLayerBuffer
  // calls that service method when needed.

  // applyBrush removed: logic delegated to EditorStateService.applyBrushToLayer

  // Draw a straight line between two logical pixel coordinates and apply the
  // brush/eraser at each step so fast pointer movement produces continuous
  // strokes. Uses Bresenham's line algorithm for integer rasterization.
  private drawLinePaint(
    layerId: string,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    brushSize: number,
    color: string | null
  ) {
    const dx = Math.abs(x1 - x0);
    const sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0);
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let x = x0;
    let y = y0;
    while (true) {
      this.state.applyBrushToLayer(layerId, x, y, brushSize, color);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
  }

  onScaleInput(event: Event) {
    const target = event.target as HTMLInputElement;
    let v = parseFloat(target.value);
    if (Number.isNaN(v)) return;
    v = Math.max(0.01, v);
    this.scale.set(Number(v.toFixed(2)));
  }

  resetRotation() {
    this.rotation.set(0);
  }

  increaseZoom(step = 0.1) {
    const next = this.scale() + step;
    this.scale.set(Number(next.toFixed(2)));
  }

  decreaseZoom(step = 0.1) {
    const next = Math.max(0.01, this.scale() - step);
    this.scale.set(Number(next.toFixed(2)));
  }

  ngOnDestroy(): void {
    if (this.stopRenderEffect) {
      try {
        if ((this.stopRenderEffect as any).destroy) {
          (this.stopRenderEffect as any).destroy();
        } else if (typeof (this.stopRenderEffect as any) === 'function') {
          (this.stopRenderEffect as any)();
        }
      } catch {}
      this.stopRenderEffect = null;
    }

    if (this.resizeListener && typeof window !== 'undefined') {
      try {
        window.removeEventListener('resize', this.resizeListener as EventListener);
      } catch {}
      this.resizeListener = null;
    }
  }

  private centerAndFitCanvas() {
    try {
      const canvas = this.canvasEl?.nativeElement;
      if (!canvas) return;
      const w = Math.max(1, this.state.canvasWidth());
      const h = Math.max(1, this.state.canvasHeight());

      const padding = 32; // leave some space around UI chrome
      const availW =
        (typeof this.canvasContainer.nativeElement !== 'undefined'
          ? this.canvasContainer.nativeElement.clientWidth
          : w) - padding;
      const availH =
        (typeof this.canvasContainer.nativeElement !== 'undefined'
          ? this.canvasContainer.nativeElement.clientHeight
          : h) - padding;

      const fitScale = Math.max(0.01, Math.min(availW / w, availH / h));
      // avoid extremely tiny scales; clamp a reasonable minimum
      const initialScale = Number(Math.max(0.01, fitScale).toFixed(2));
      this.scale.set(initialScale);

      // Center in viewport (coordinates for translate before scale)
      const panX = 0;
      const panY = Math.round((h * initialScale) / 2) - padding;
      this.panX.set(panX);
      this.panY.set(panY);
    } catch (e) {
      // best-effort: ignore errors
    }
  }

  private drawCanvas() {
    const canvas = this.canvasEl?.nativeElement;
    if (!canvas) return;
    const w = this.state.canvasWidth();
    const h = this.state.canvasHeight();
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    if (canvas.width !== Math.floor(w * dpr)) canvas.width = Math.floor(w * dpr);
    if (canvas.height !== Math.floor(h * dpr)) canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const root = typeof document !== 'undefined' ? document.documentElement : null;
    const isDark = !!root && root.classList.contains('dark');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const tile = this.tileSize();
    const darkTile = isDark ? 'rgba(0,0,0,0.06)' : 'rgba(0,0,0,0.04)';
    const lightTile = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.02)';
    ctx.save();
    for (let y = 0; y < h; y += tile) {
      for (let x = 0; x < w; x += tile) {
        const even = ((x / tile + y / tile) & 1) === 0;
        ctx.fillStyle = even ? lightTile : darkTile;
        ctx.fillRect(x, y, Math.min(tile, w - x), Math.min(tile, h - y));
      }
    }
    ctx.restore();

    // depend on layer pixel version so effect reruns when any layer buffer changes
    this.state.layerPixelsVersion();

    // draw layers in reverse order so the first layer in the UI (layers()[0])
    // is treated as the topmost and drawn last. Iterate from last -> first to
    // draw bottom layers first and top layers last (so top overlays lower ones).
    const layers = this.state.layers();
    for (let li = layers.length - 1; li >= 0; li--) {
      const layer = layers[li];
      if (!layer.visible) continue;
      const buf = this.state.getLayerBuffer(layer.id);
      if (!buf || buf.length !== w * h) continue;
      ctx.save();
      for (let yy = 0; yy < h; yy++) {
        for (let xx = 0; xx < w; xx++) {
          const col = buf[yy * w + xx];
          if (col && col.length) {
            ctx.fillStyle = col;
            ctx.fillRect(xx, yy, 1, 1);
          }
        }
      }
      ctx.restore();
    }

    const hx = this.hoverX();
    const hy = this.hoverY();
    if (hx !== null && hy !== null) {
      ctx.save();
      const tool = this.state.currentTool();
      const bSize = Math.max(1, this.state.brushSize());

      // center the brush highlight on the hovered pixel
      const half = Math.floor((bSize - 1) / 2);
      const x0 = Math.max(0, hx - half);
      const y0 = Math.max(0, hy - half);
      const wRect = Math.min(bSize, w - x0);
      const hRect = Math.min(bSize, h - y0);

      ctx.lineWidth = Math.max(1 / dpr, 1 / dpr);
      if (tool === 'eraser') {
        // Eraser: light overlay + visible border depending on theme
        ctx.fillStyle = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.10)';
        ctx.fillRect(x0, y0, wRect, hRect);
        ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)';
        ctx.strokeRect(x0 + 0.5, y0 + 0.5, Math.max(0, wRect - 1), Math.max(0, hRect - 1));
      } else {
        // Brush: use current brush color with translucency and border
        ctx.fillStyle = this.state.brushColor();
        ctx.globalAlpha = 0.35;
        ctx.fillRect(x0, y0, wRect, hRect);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)';
        ctx.strokeRect(x0 + 0.5, y0 + 0.5, Math.max(0, wRect - 1), Math.max(0, hRect - 1));
      }
      ctx.restore();
    }

    // Draw active selection if present
    const sel = this.state.selectionRect();
    const selShape = this.state.selectionShape();
    if (sel && sel.width > 0 && sel.height > 0) {
      ctx.save();
      // translucent fill
      ctx.fillStyle = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';
      if (selShape === 'ellipse') {
        const cx = sel.x + sel.width / 2 - 0.5;
        const cy = sel.y + sel.height / 2 - 0.5;
        const rx = Math.max(0.5, sel.width / 2);
        const ry = Math.max(0.5, sel.height / 2);
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
        // dashed stroke
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.8)';
        ctx.lineWidth = 1 / dpr;
        ctx.stroke();
      } else {
        ctx.fillRect(sel.x, sel.y, sel.width, sel.height);
        // dashed stroke
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.8)';
        ctx.lineWidth = 1 / dpr;
        ctx.strokeRect(
          sel.x + 0.5,
          sel.y + 0.5,
          Math.max(0, sel.width - 1),
          Math.max(0, sel.height - 1)
        );
      }
      ctx.restore();
    }
  }
}
