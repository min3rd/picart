import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewChild,
  inject,
  signal,
  effect,
  EffectRef,
} from '@angular/core';
import { NgIf } from '@angular/common';
import { EditorStateService } from '../../services/editor-state.service';
import { TranslocoPipe } from '@jsverse/transloco';
import { NgIcon } from '@ng-icons/core';

@Component({
  selector: 'pa-editor-canvas',
  templateUrl: './editor-canvas.component.html',
  styleUrl: './editor-canvas.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe, NgIcon, NgIf],
  host: {
    class: 'block h-full w-full',
  },
})
export class EditorCanvas {
  @ViewChild('canvasEl', { static: true }) canvasEl!: ElementRef<HTMLCanvasElement>;
  readonly state = inject(EditorStateService);

  // Interaction state
  readonly mouseX = signal<number | null>(null);
  readonly mouseY = signal<number | null>(null);
  // Hovered pixel cell (in canvas logical pixels)
  readonly hoverX = signal<number | null>(null);
  readonly hoverY = signal<number | null>(null);

  // Transform state
  readonly panX = signal(0);
  readonly panY = signal(0);
  readonly scale = signal(1);
  readonly rotation = signal(0); // degrees

  private panning = false;
  private rotating = false;
  private lastPointer = { x: 0, y: 0 };
  private stopRenderEffect: EffectRef | null = null;
  // Tile size in logical pixels for checker/grid grouping (flexible)
  readonly tileSize = signal(8);

  constructor() {
    // Create the effect in the constructor so it runs within an injection context.
    // The effect body is safe to run before the view is initialized because drawCanvas
    // checks for the canvas element's presence.
    this.stopRenderEffect = effect(() => {
      // depend on canvas size, scale and hover to trigger redraw
      const w = this.state.canvasWidth();
      const h = this.state.canvasHeight();
      const s = this.scale();
      const hx = this.hoverX();
      const hy = this.hoverY();
      // schedule draw
      this.drawCanvas();
      // no cleanup value
      return null as any;
    });
  }

  // Dynamically compute the maximum scale allowed based on canvas size so
  // small canvases can be zoomed in far enough for pixel editing.
  get maxScale(): number {
    const maxDim = Math.max(1, Math.max(this.state.canvasWidth(), this.state.canvasHeight()));
    // target at least 512px display for the largest canvas side at max zoom
    const targetPx = 512;
    const computed = Math.ceil(targetPx / maxDim);
    // minimum 8, maximum clamp (avoid absurdly large values)
    return Math.min(Math.max(8, computed), 256);
  }

  // Update tileSize based on current zoom and optional brush size.
  // desiredScreenTilePx: visual size of a tile in screen px; brushSize: brush radius in logical pixels
  updateTileSize(brushSize = 1, desiredScreenTilePx = 24) {
    const s = Math.max(0.001, this.scale());
    // Compute tile so that tile * scale * brushSize ~ desiredScreenTilePx
    const tile = Math.max(1, Math.round(desiredScreenTilePx / (s * Math.max(1, brushSize))));
    this.tileSize.set(tile);
  }

  onPointerMove(ev: PointerEvent) {
    const rect = this.canvasEl.nativeElement.getBoundingClientRect();

    // Mouse coordinates (visual, post-transform). We'll compute logical canvas coords
    const visX = ev.clientX - rect.left;
    const visY = ev.clientY - rect.top;
    this.mouseX.set(Math.round(visX));
    this.mouseY.set(Math.round(visY));

    // Map visual coordinates back into canvas logical pixels by undoing scale.
    // Note: this assumes transforms are primarily scale/translate. Rotation is not handled precisely here.
    const s = Math.max(0.001, this.scale());
    const logicalX = Math.floor(visX / s);
    const logicalY = Math.floor(visY / s);
    if (
      logicalX >= 0 &&
      logicalX < this.state.canvasWidth() &&
      logicalY >= 0 &&
      logicalY < this.state.canvasHeight()
    ) {
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

    if (this.rotating) {
      const dx = ev.clientX - this.lastPointer.x;
      this.rotation.set(this.rotation() + dx * 0.2);
      this.lastPointer.x = ev.clientX;
    }
  }

  onPointerLeave() {
    this.hoverX.set(null);
    this.hoverY.set(null);
  }

  onWheel(ev: WheelEvent) {
    ev.preventDefault();
    // Use additive wheel delta for simplicity but don't clamp the upper bound
    const delta = ev.deltaY > 0 ? -0.1 : 0.1;
    const next = Math.max(0.01, this.scale() + delta);
    this.scale.set(Number(next.toFixed(2)));
  }

  onPointerDown(ev: PointerEvent) {
    // middle button or space -> pan
    if (ev.button === 1 || ev.shiftKey || ev.ctrlKey) {
      this.panning = true;
      this.lastPointer.x = ev.clientX;
      this.lastPointer.y = ev.clientY;
    }
    // right button -> rotate
    if (ev.button === 2) {
      this.rotating = true;
      this.lastPointer.x = ev.clientX;
      this.lastPointer.y = ev.clientY;
    }
  }

  onPointerUp(ev: PointerEvent) {
    this.panning = false;
    this.rotating = false;
  }

  // Toggleable info panel visibility - controlled by state in header via settings in previous work
  infoVisible = signal(true);

  setCanvasWidth(event: Event) {
    const target = event.target as HTMLInputElement;
    const width = parseInt(target.value, 10);
    if (width > 0) {
      this.state.setCanvasSize(width, this.state.canvasHeight());
    }
  }

  setCanvasHeight(event: Event) {
    const target = event.target as HTMLInputElement;
    const height = parseInt(target.value, 10);
    if (height > 0) {
      this.state.setCanvasSize(this.state.canvasWidth(), height);
    }
  }

  onScaleInput(event: Event) {
    const target = event.target as HTMLInputElement;
    let v = parseFloat(target.value);
    if (Number.isNaN(v)) return;
    // Don't clamp the upper bound — allow very large zoom values
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

  // ngAfterViewInit removed: effect is created in the constructor to satisfy
  // Angular's injection-context requirement. drawCanvas is defensive and will
  // skip drawing until the ViewChild canvas is available.

  ngOnDestroy(): void {
    if (this.stopRenderEffect) {
      try {
        // EffectRef exposes destroy() in some Angular versions
        if ((this.stopRenderEffect as any).destroy) {
          (this.stopRenderEffect as any).destroy();
        } else if (typeof (this.stopRenderEffect as any) === 'function') {
          (this.stopRenderEffect as any)();
        }
      } catch {}
      this.stopRenderEffect = null;
    }
  }

  private drawCanvas() {
    const canvas = this.canvasEl?.nativeElement;
    if (!canvas) return;
    const w = this.state.canvasWidth();
    const h = this.state.canvasHeight();
    // Handle devicePixelRatio so grid lines and single-pixel highlights are crisp
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    // Ensure canvas backing store size matches logical size * DPR
    if (canvas.width !== Math.floor(w * dpr)) canvas.width = Math.floor(w * dpr);
    if (canvas.height !== Math.floor(h * dpr)) canvas.height = Math.floor(h * dpr);
    // Keep CSS size equal to logical pixels so transforms/scale behave predictably
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Detect theme (dark class on root) to pick contrasting grid/checker colors
    const root = typeof document !== 'undefined' ? document.documentElement : null;
    const isDark = !!root && root.classList.contains('dark');
    // Reset transforms and scale to device pixels so drawing uses logical pixel units
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Clear in logical pixels
    ctx.clearRect(0, 0, w, h);

    // Draw a checkerboard background (typical transparency pattern).
  // Determine tile size dynamically (grouping block size). Use signal value.
  const tile = this.tileSize();
  // Make the checkerboard very subtle so it only cues editable cells.
  // Lower contrast values for both dark and light themes.
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

  // Optionally draw per-pixel grid when heavily zoomed in to support pixel editing
  const showPixelGrid = this.scale() >= 8;
    if (showPixelGrid) {
      ctx.save();
      const gridStroke = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)';
      ctx.strokeStyle = gridStroke;
      ctx.lineWidth = 1 / dpr;
      ctx.beginPath();
      for (let x = 0; x <= w; x++) {
        const px = x + 0.5;
        ctx.moveTo(px, 0);
        ctx.lineTo(px, h);
      }
      for (let y = 0; y <= h; y++) {
        const py = y + 0.5;
        ctx.moveTo(0, py);
        ctx.lineTo(w, py);
      }
      ctx.stroke();
      ctx.restore();
    } else {
      // Draw major grid lines at tile boundaries to match UI grouping
      ctx.save();
      ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
      ctx.lineWidth = 1.2 / dpr;
      ctx.beginPath();
      for (let x = 0; x <= w; x += tile) {
        const px = x + 0.5;
        ctx.moveTo(px, 0);
        ctx.lineTo(px, h);
      }
      for (let y = 0; y <= h; y += tile) {
        const py = y + 0.5;
        ctx.moveTo(0, py);
        ctx.lineTo(w, py);
      }
      ctx.stroke();
      ctx.restore();
    }

    // Draw hover highlight if any
    const hx = this.hoverX();
    const hy = this.hoverY();
    if (hx !== null && hy !== null) {
      ctx.save();
      // Slightly stronger hover fill so it's obvious over the checkerboard
      const hoverFill = isDark ? 'rgba(255,200,0,0.6)' : 'rgba(255,120,0,0.5)';
      ctx.fillStyle = hoverFill;
      ctx.fillRect(hx, hy, 1, 1);
      // outline the hovered cell for better visibility
      ctx.strokeStyle = 'rgba(255,200,0,0.95)';
      ctx.lineWidth = 1 / dpr;
      ctx.strokeRect(hx + 0.5, hy + 0.5, 1, 1);
      ctx.restore();
    }
  }
}
