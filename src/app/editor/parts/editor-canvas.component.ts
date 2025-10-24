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
  readonly rotation = signal(0);

  private panning = false;
  private rotating = false;
  private lastPointer = { x: 0, y: 0 };
  private stopRenderEffect: EffectRef | null = null;
  readonly tileSize = signal(1);
  private resizeListener: (() => void) | null = null;

  constructor() {
    this.stopRenderEffect = effect(() => {
      this.drawCanvas();
      return null as any;
    });
  }

  ngAfterViewInit(): void {
    // Auto-scale to fit the viewport and center the canvas.
    this.centerAndFitCanvas();

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
    const delta = ev.deltaY > 0 ? -0.1 : 0.1;
    const next = Math.max(0.01, this.scale() + delta);
    this.scale.set(Number(next.toFixed(2)));
  }

  onPointerDown(ev: PointerEvent) {
    if (ev.button === 1 || ev.shiftKey || ev.ctrlKey) {
      this.panning = true;
      this.lastPointer.x = ev.clientX;
      this.lastPointer.y = ev.clientY;
    }
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
  }
}
