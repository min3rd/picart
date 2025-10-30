import {
  Component,
  ElementRef,
  ViewChild,
  inject,
  signal,
  effect,
  EffectRef,
  EnvironmentInjector,
} from '@angular/core';
import { EditorDocumentService } from '../../../services/editor-document.service';
import { EditorToolsService } from '../../../services/editor-tools.service';
import {
  GradientType,
  ShapeFillMode,
} from '../../../services/tools/tool.types';
import { TranslocoPipe } from '@jsverse/transloco';
import { NgIcon } from '@ng-icons/core';
import { CommonModule } from '@angular/common';

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

type ContextMenuActionId =
  | 'deselect'
  | 'invertSelection'
  | 'growSelection'
  | 'growBy1px'
  | 'growBy2px'
  | 'growBy5px'
  | 'growCustom'
  | 'makeCopyLayer'
  | 'mergeVisibleToNewLayer';

interface ContextMenuAction {
  id: ContextMenuActionId;
  labelKey: string;
  icon: string;
  disabled?: boolean;
  submenu?: ContextMenuAction[];
}

@Component({
  selector: 'pa-editor-canvas',
  templateUrl: './editor-canvas.component.html',
  styleUrls: ['./editor-canvas.component.css'],
  imports: [CommonModule, TranslocoPipe, NgIcon],
  host: {
    class: 'block h-full w-full',
    '(wheel)': 'onWheel($event)',
  },
})
export class EditorCanvas {
  @ViewChild('canvasEl', { static: true })
  canvasEl!: ElementRef<HTMLCanvasElement>;
  @ViewChild('canvasContainer', { static: true })
  canvasContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('canvasWrapper', { static: true })
  canvasWrapper!: ElementRef<HTMLDivElement>;
  readonly document = inject(EditorDocumentService);
  readonly documentSvc: EditorDocumentService = this.document;
  readonly tools = inject(EditorToolsService);

  readonly mouseX = signal<number | null>(null);
  readonly mouseY = signal<number | null>(null);
  readonly hoverX = signal<number | null>(null);
  readonly hoverY = signal<number | null>(null);

  readonly panX = signal(0);
  readonly panY = signal(0);
  readonly scale = signal(1);
  // rotation feature disabled temporarily
  readonly rotation = signal(0);
  readonly minScale = 0.05;
  private readonly injector = inject(EnvironmentInjector);
  private readonly viewReady = signal(false);
  private readonly shapeStart = signal<{ x: number; y: number } | null>(null);
  private readonly shapeCurrent = signal<{ x: number; y: number } | null>(null);
  private readonly activeShapeTool = signal<
    'line' | 'circle' | 'square' | null
  >(null);
  private readonly shapeConstrainUniform = signal(false);

  private panning = false;
  // painting state
  private painting = false;
  private lastPaintPos: { x: number; y: number } | null = null;
  private selectionStart: { x: number; y: number } | null = null;
  private selectionDragging = false;
  private lastPointer = { x: 0, y: 0 };
  private shaping = false;
  private stopRenderEffect: EffectRef | null = null;
  readonly tileSize = signal(1);
  readonly contextMenuVisible = signal(false);
  readonly contextMenuPosition = signal<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  readonly contextMenuActions = signal<ContextMenuAction[]>([]);
  readonly submenuVisible = signal(false);
  readonly submenuPosition = signal<{ x: number; y: number }>({ x: 0, y: 0 });
  readonly submenuActions = signal<ContextMenuAction[]>([]);
  readonly inputDialogVisible = signal(false);
  readonly inputDialogPosition = signal<{ x: number; y: number }>({ x: 0, y: 0 });
  readonly inputDialogValue = signal('10');
  readonly inputDialogTitle = signal('');
  readonly inputDialogCallback = signal<((value: string) => void) | null>(null);
  private resizeListener: (() => void) | null = null;
  private keyListener: ((e: KeyboardEvent) => void) | null = null;
  private readonly defaultCursor = `url('/cursors/link.png') 12 12, link`;
  private readonly brushCursor = `url('/cursors/handwriting.png') 12 12, crosshair`;
  private readonly eraserCursor = `url('/cursors/unavailable.png') 12 12, cell`;
  private readonly handGrabbingCursor = `url('/cursors/grab.png') 12 12, grab`;
  private readonly bayer4 = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ];
  private readonly gradientSteps = 8;

  constructor() {
    this.stopRenderEffect = effect(() => {
      this.drawCanvas();
      return null as any;
    });
  }

  private readonly layoutEffect = effect(
    () => {
      if (!this.viewReady()) return;
      this.document.canvasWidth();
      this.document.canvasHeight();
      const scheduler =
        typeof queueMicrotask === 'function'
          ? queueMicrotask
          : (cb: () => void) => Promise.resolve().then(cb);
      scheduler(() => this.centerAndFitCanvas());
    },
    { injector: this.injector },
  );

  // compute the CSS cursor for the canvas based on current tool and state
  cursor(): string {
    if (this.panning) return this.handGrabbingCursor;
    const tool = this.tools.currentTool();
    if (
      tool === 'rect-select' ||
      tool === 'ellipse-select' ||
      tool === 'lasso-select'
    )
      return `crosshair`;
    if (tool === 'brush') return this.brushCursor;
    if (tool === 'eraser') return this.eraserCursor;
    if (tool === 'line' || tool === 'circle' || tool === 'square')
      return `crosshair`;
    return this.defaultCursor;
  }

  ngAfterViewInit(): void {
    // Auto-scale to fit the viewport and center the canvas.
    this.centerAndFitCanvas();
    if (
      typeof window !== 'undefined' &&
      typeof window.requestAnimationFrame === 'function'
    ) {
      window.requestAnimationFrame(() => this.centerAndFitCanvas());
    }
    this.updateTileSize(this.tools.brushSize());

    // ensure pixel buffers exist for all layers
    for (const l of this.document.layers()) {
      this.document.ensureLayerBuffer(
        l.id,
        this.document.canvasWidth(),
        this.document.canvasHeight(),
      );
    }

    // Recenter on window resize
    this.resizeListener = () => this.centerAndFitCanvas();
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', this.resizeListener as EventListener);
      // listen for Escape to cancel in-progress lasso selections
      this.keyListener = (ev: KeyboardEvent) => {
        if (ev.key === 'Escape') {
          if (this.contextMenuVisible()) {
            this.closeContextMenu();
            return;
          }
          const tool = this.tools.currentTool();
          if (tool === 'lasso-select') {
            // cancel any in-progress lasso without recording history
            this.document.selectionPolygon.set(null as any);
            this.document.selectionRect.set(null as any);
            this.document.selectionShape.set('rect');
            this.selectionDragging = false;
            this.selectionStart = null;
          }
          return;
        }
        const key = ev.key?.toLowerCase?.() ?? ev.key;
        if (ev.ctrlKey && ev.shiftKey && key === 'd') {
          ev.preventDefault();
          this.document.clearSelection();
        }
      };
      window.addEventListener('keydown', this.keyListener as EventListener);
    }

    this.viewReady.set(true);
  }

  get maxScale(): number {
    const maxDim = Math.max(
      1,
      Math.max(this.document.canvasWidth(), this.document.canvasHeight()),
    );
    const targetPx = 512;
    const computed = Math.ceil(targetPx / maxDim);
    return Math.min(Math.max(8, computed), 256);
  }

  updateTileSize(brushSize = 1, desiredScreenTilePx = 24) {
    const s = Math.max(0.001, this.scale());
    const tile = Math.max(
      1,
      Math.round(desiredScreenTilePx / (s * Math.max(1, brushSize))),
    );
    this.tileSize.set(tile);
  }

  onPointerMove(ev: PointerEvent) {
    const rect = this.canvasEl.nativeElement.getBoundingClientRect();

    const visX = ev.clientX - rect.left;
    const visY = ev.clientY - rect.top;
    this.mouseX.set(Math.round(visX));
    this.mouseY.set(Math.round(visY));

    const w = this.document.canvasWidth();
    const h = this.document.canvasHeight();
    const ratioX = w / Math.max(1, rect.width);
    const ratioY = h / Math.max(1, rect.height);
    const logicalX = Math.floor(visX * ratioX);
    const logicalY = Math.floor(visY * ratioY);

    const clampedX = Math.max(0, Math.min(w - 1, logicalX));
    const clampedY = Math.max(0, Math.min(h - 1, logicalY));

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

    if (this.selectionDragging) {
      const tool = this.tools.currentTool();
      if (tool === 'lasso-select') {
        this.document.addLassoPoint(clampedX, clampedY);
      } else {
        let endX = clampedX;
        let endY = clampedY;
        if (ev.shiftKey && this.selectionStart) {
          const dx = clampedX - this.selectionStart.x;
          const dy = clampedY - this.selectionStart.y;
          const absDx = Math.abs(dx);
          const absDy = Math.abs(dy);
          const max = Math.max(absDx, absDy);
          const sx = dx >= 0 ? 1 : -1;
          const sy = dy >= 0 ? 1 : -1;
          endX = this.selectionStart.x + sx * max;
          endY = this.selectionStart.y + sy * max;
          endX = Math.max(0, Math.min(endX, w - 1));
          endY = Math.max(0, Math.min(endY, h - 1));
        }
        this.document.updateSelection(endX, endY);
      }
      return;
    }

    if (this.shaping) {
      const active = this.activeShapeTool();
      if (active === 'square' || active === 'circle') {
        this.shapeConstrainUniform.set(ev.shiftKey);
      } else {
        this.shapeConstrainUniform.set(false);
      }
      this.shapeCurrent.set({ x: clampedX, y: clampedY });
    }

    if (this.painting) {
      const layerId = this.document.selectedLayerId();
      const tool = this.tools.currentTool();
      const color = tool === 'eraser' ? null : this.tools.brushColor();
      const size =
        tool === 'eraser' ? this.tools.eraserSize() : this.tools.brushSize();
      if (this.lastPaintPos) {
        this.drawLinePaint(
          layerId,
          this.lastPaintPos.x,
          this.lastPaintPos.y,
          clampedX,
          clampedY,
          size,
          color,
        );
      } else {
        this.document.applyBrushToLayer(
          layerId,
          clampedX,
          clampedY,
          size,
          color,
          tool === 'eraser'
            ? { eraserStrength: this.tools.eraserStrength() }
            : undefined,
        );
      }
      this.lastPaintPos = { x: clampedX, y: clampedY };
    }
  }

  onPointerLeave() {
    this.hoverX.set(null);
    this.hoverY.set(null);
  }

  onWheel(ev: WheelEvent) {
    const container = this.canvasContainer?.nativeElement;
    if (!container) return;

    const target = ev.target as HTMLElement | null;
    if (target) {
      const tag = target.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || target.isContentEditable)
        return;
    }

    const rect = container.getBoundingClientRect();
    if (
      ev.clientX < rect.left ||
      ev.clientX > rect.right ||
      ev.clientY < rect.top ||
      ev.clientY > rect.bottom
    ) {
      return;
    }

    ev.preventDefault();
    ev.stopPropagation();

    let delta = ev.deltaY;
    if (ev.deltaMode === WheelEvent.DOM_DELTA_LINE) {
      delta *= 16;
    } else if (ev.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
      delta *= rect.height;
    }

    const zoomIntensity = 0.002;
    const factor = Math.exp(-delta * zoomIntensity);
    const next = this.scale() * factor;
    this.applyZoom(next, { clientX: ev.clientX, clientY: ev.clientY });
  }

  onPointerDown(ev: PointerEvent) {
    if (this.contextMenuVisible()) {
      this.closeContextMenu();
    }
    if (ev.button === 1 || ev.ctrlKey) {
      this.panning = true;
      this.lastPointer.x = ev.clientX;
      this.lastPointer.y = ev.clientY;
      const target = ev.currentTarget as HTMLElement;
      if (target?.setPointerCapture) {
        target.setPointerCapture(ev.pointerId);
      }
    }

    const rect = this.canvasEl.nativeElement.getBoundingClientRect();
    const visX = ev.clientX - rect.left;
    const visY = ev.clientY - rect.top;
    const w = this.document.canvasWidth();
    const h = this.document.canvasHeight();
    const ratioX = w / Math.max(1, rect.width);
    const ratioY = h / Math.max(1, rect.height);
    const logicalX = Math.floor(visX * ratioX);
    const logicalY = Math.floor(visY * ratioY);
    const tool = this.tools.currentTool();
    const insideCanvas =
      logicalX >= 0 && logicalX < w && logicalY >= 0 && logicalY < h;

    if (ev.button === 2) {
      return;
    }

    if (ev.button === 0) {
      if (
        (tool === 'rect-select' ||
          tool === 'ellipse-select' ||
          tool === 'lasso-select') &&
        insideCanvas
      ) {
        const target = ev.currentTarget as HTMLElement;
        if (target?.setPointerCapture) {
          target.setPointerCapture(ev.pointerId);
        }
        if (tool === 'lasso-select') {
          this.selectionStart = { x: logicalX, y: logicalY };
          this.selectionDragging = true;
          this.document.beginSelection(logicalX, logicalY, 'lasso' as any);
          this.document.addLassoPoint(logicalX, logicalY);
          return;
        }

        this.selectionStart = { x: logicalX, y: logicalY };
        this.selectionDragging = true;
        const shape = tool === 'ellipse-select' ? 'ellipse' : 'rect';
        this.document.beginSelection(logicalX, logicalY, shape as any);
        return;
      }
      if (
        (tool === 'line' || tool === 'circle' || tool === 'square') &&
        insideCanvas
      ) {
        const target = ev.currentTarget as HTMLElement;
        if (target?.setPointerCapture) {
          target.setPointerCapture(ev.pointerId);
        }
        if (tool === 'square' || tool === 'circle') {
          this.shapeConstrainUniform.set(ev.shiftKey);
        } else {
          this.shapeConstrainUniform.set(false);
        }
        this.startShape(tool, logicalX, logicalY);
        return;
      }
      if (tool === 'fill' && insideCanvas) {
        const selectionActive = this.document.selectionRect();
        if (selectionActive && !this.isPointInSelection(logicalX, logicalY)) {
          return;
        }
        this.document.beginAction('fill');
        const layerId = this.document.selectedLayerId();
        const fillMode = this.tools.fillMode();
        const fillColor = fillMode === 'erase' ? null : this.tools.fillColor();
        this.document.applyFillToLayer(layerId, logicalX, logicalY, fillColor);
        this.document.endAction();
      } else if ((tool === 'brush' || tool === 'eraser') && insideCanvas) {
        const target = ev.currentTarget as HTMLElement;
        if (target?.setPointerCapture) {
          target.setPointerCapture(ev.pointerId);
        }
        this.document.beginAction('paint');
        this.painting = true;
        this.lastPaintPos = { x: logicalX, y: logicalY };
        const layerId = this.document.selectedLayerId();
        const color = tool === 'eraser' ? null : this.tools.brushColor();
        const size =
          tool === 'eraser' ? this.tools.eraserSize() : this.tools.brushSize();
        this.document.applyBrushToLayer(
          layerId,
          logicalX,
          logicalY,
          size,
          color,
          tool === 'eraser'
            ? { eraserStrength: this.tools.eraserStrength() }
            : undefined,
        );
      }
    }
  }

  onCanvasContextMenu(ev: MouseEvent) {
    ev.preventDefault();
    const canvasRect = this.canvasEl.nativeElement.getBoundingClientRect();
    const visX = ev.clientX - canvasRect.left;
    const visY = ev.clientY - canvasRect.top;
    const w = this.document.canvasWidth();
    const h = this.document.canvasHeight();
    const ratioX = w / Math.max(1, canvasRect.width);
    const ratioY = h / Math.max(1, canvasRect.height);
    const logicalX = Math.floor(visX * ratioX);
    const logicalY = Math.floor(visY * ratioY);
    const insideCanvas =
      logicalX >= 0 && logicalX < w && logicalY >= 0 && logicalY < h;
    if (!insideCanvas) {
      this.closeContextMenu();
      return;
    }
    const actions: ContextMenuAction[] = [];
    const hasSelection = !!this.document.selectionRect();
    const hasNonEmptySelection = this.hasNonEmptySelection();
    if (hasSelection) {
      actions.push({
        id: 'invertSelection',
        labelKey: 'editor.canvas.menu.invertSelection',
        icon: 'heroIconsBarsArrowUpMini',
        disabled: false,
      });
      actions.push({
        id: 'growSelection',
        labelKey: 'editor.canvas.menu.growSelection',
        icon: 'heroIconsArrowsPointingOutMini',
        disabled: false,
        submenu: [
          {
            id: 'growBy1px',
            labelKey: 'editor.canvas.menu.growBy1px',
            icon: 'heroIconsPlusSmallMini',
          },
          {
            id: 'growBy2px',
            labelKey: 'editor.canvas.menu.growBy2px',
            icon: 'heroIconsPlusSmallMini',
          },
          {
            id: 'growBy5px',
            labelKey: 'editor.canvas.menu.growBy5px',
            icon: 'heroIconsPlusSmallMini',
          },
          {
            id: 'growCustom',
            labelKey: 'editor.canvas.menu.growCustom',
            icon: 'heroIconsEllipsisHorizontalMini',
          },
        ],
      });
      actions.push({
        id: 'makeCopyLayer',
        labelKey: 'editor.canvas.menu.makeCopyLayer',
        icon: 'heroIconsDocumentDuplicateMini',
        disabled: !hasNonEmptySelection,
      });
      actions.push({
        id: 'mergeVisibleToNewLayer',
        labelKey: 'editor.canvas.menu.mergeVisibleToNewLayer',
        icon: 'heroIconsRectangleStackMini',
        disabled: false,
      });
      actions.push({
        id: 'deselect',
        labelKey: 'editor.canvas.menu.deselect',
        icon: 'bootstrapBoundingBox',
      });
    }
    if (!actions.length) {
      this.closeContextMenu();
      return;
    }
    const containerRect =
      this.canvasContainer.nativeElement.getBoundingClientRect();
    const offsetX = ev.clientX - containerRect.left;
    const offsetY = ev.clientY - containerRect.top;
    const estimatedWidth = 200;
    const estimatedHeight = Math.max(40, actions.length * 36);
    const maxX = Math.max(0, containerRect.width - estimatedWidth);
    const maxY = Math.max(0, containerRect.height - estimatedHeight);
    const clampedX = Math.max(0, Math.min(offsetX, maxX));
    const clampedY = Math.max(0, Math.min(offsetY, maxY));
    this.contextMenuPosition.set({ x: clampedX, y: clampedY });
    this.contextMenuActions.set(actions);
    this.contextMenuVisible.set(true);
  }

  private hasNonEmptySelection(): boolean {
    const sel = this.document.selectionRect();
    if (!sel) return false;
    const shape = this.document.selectionShape();
    const poly = this.document.selectionPolygon();
    const layerId = this.document.selectedLayerId();
    const buf = this.document.getLayerBuffer(layerId);
    if (!buf) return false;
    const w = this.document.canvasWidth();
    const h = this.document.canvasHeight();
    for (let y = sel.y; y < sel.y + sel.height && y < h; y++) {
      for (let x = sel.x; x < sel.x + sel.width && x < w; x++) {
        if (
          this.isPointInSelection(x, y) &&
          buf[y * w + x] &&
          buf[y * w + x].length > 0
        ) {
          return true;
        }
      }
    }
    return false;
  }

  closeContextMenu() {
    this.contextMenuVisible.set(false);
    this.contextMenuActions.set([]);
    this.submenuVisible.set(false);
    this.submenuActions.set([]);
  }

  onSubmenuTrigger(
    action: ContextMenuAction,
    event: MouseEvent,
    buttonElement: HTMLElement,
  ) {
    if (!action.submenu || action.submenu.length === 0) return;
    event.stopPropagation();
    const rect = buttonElement.getBoundingClientRect();
    const containerRect =
      this.canvasContainer.nativeElement.getBoundingClientRect();
    const submenuX = rect.right - containerRect.left + 4;
    const submenuY = rect.top - containerRect.top;
    this.submenuPosition.set({ x: submenuX, y: submenuY });
    this.submenuActions.set(action.submenu);
    this.submenuVisible.set(true);
  }

  onContextMenuAction(actionId: ContextMenuActionId, event?: MouseEvent) {
    if (actionId === 'deselect') {
      this.document.clearSelection();
    } else if (actionId === 'invertSelection') {
      this.document.invertSelection();
    } else if (actionId === 'growBy1px') {
      this.document.growSelection(1);
    } else if (actionId === 'growBy2px') {
      this.document.growSelection(2);
    } else if (actionId === 'growBy5px') {
      this.document.growSelection(5);
    } else if (actionId === 'growCustom') {
      if (event) {
        const containerRect =
          this.canvasContainer.nativeElement.getBoundingClientRect();
        const offsetX = event.clientX - containerRect.left;
        const offsetY = event.clientY - containerRect.top;
        this.inputDialogPosition.set({ x: offsetX + 10, y: offsetY });
        this.inputDialogTitle.set('Enter growth amount (pixels):');
        this.inputDialogValue.set('10');
        this.inputDialogCallback.set((value: string) => {
          const parsed = parseInt(value, 10);
          if (!isNaN(parsed) && parsed > 0) {
            this.document.growSelection(parsed);
          }
          this.closeInputDialog();
        });
        this.inputDialogVisible.set(true);
        return;
      }
    } else if (actionId === 'makeCopyLayer') {
      this.document.makeCopyLayer();
    } else if (actionId === 'mergeVisibleToNewLayer') {
      this.document.mergeVisibleToNewLayer();
    }
    this.closeContextMenu();
  }

  closeInputDialog() {
    this.inputDialogVisible.set(false);
    this.inputDialogCallback.set(null);
  }

  onInputDialogSubmit() {
    const callback = this.inputDialogCallback();
    if (callback) {
      callback(this.inputDialogValue());
    }
  }

  onInputDialogCancel() {
    this.closeInputDialog();
  }

  onPointerUp(ev: PointerEvent) {
    const target = ev.currentTarget as HTMLElement;
    if (target?.releasePointerCapture && target.hasPointerCapture(ev.pointerId)) {
      target.releasePointerCapture(ev.pointerId);
    }
    this.panning = false;
    if (this.shaping) {
      this.finishShape(ev.shiftKey);
    }
    if (this.painting) {
      this.painting = false;
      this.lastPaintPos = null;
      this.document.endAction();
    }

    if (this.selectionDragging) {
      this.selectionDragging = false;
      this.selectionStart = null;
      this.document.endSelection();
    }
  }

  infoVisible = signal(true);

  setCanvasWidth(event: Event) {
    const target = event.target as HTMLInputElement;
    const width = parseInt(target.value, 10);
    if (width > 0) {
      this.document.setCanvasSize(width, this.document.canvasHeight());
      // ensure buffers for all layers
      for (const l of this.document.layers()) {
        this.document.ensureLayerBuffer(
          l.id,
          width,
          this.document.canvasHeight(),
        );
      }
    }
  }

  setCanvasHeight(event: Event) {
    const target = event.target as HTMLInputElement;
    const height = parseInt(target.value, 10);
    if (height > 0) {
      this.document.setCanvasSize(this.document.canvasWidth(), height);
      // ensure buffers for all layers
      for (const l of this.document.layers()) {
        this.document.ensureLayerBuffer(
          l.id,
          this.document.canvasWidth(),
          height,
        );
      }
    }
  }

  // Note: per-layer pixel buffers are stored in EditorStateService; ensureLayerBuffer
  // calls that service method when needed.

  // applyBrush removed: logic delegated to EditorDocumentService.applyBrushToLayer

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
    color: string | null,
  ) {
    const dx = Math.abs(x1 - x0);
    const sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0);
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let x = x0;
    let y = y0;
    const eraserOptions =
      color === null
        ? { eraserStrength: this.tools.eraserStrength() }
        : undefined;
    while (true) {
      this.document.applyBrushToLayer(
        layerId,
        x,
        y,
        brushSize,
        color,
        eraserOptions,
      );
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
    this.applyZoom(v);
  }

  resetRotation() {
    this.rotation.set(0);
  }

  increaseZoom(step = 0.1) {
    const factor = 1 + Math.max(0, step);
    this.applyZoom(this.scale() * factor);
  }

  decreaseZoom(step = 0.1) {
    const factor = 1 + Math.max(0, step);
    this.applyZoom(this.scale() / factor);
  }

  ngOnDestroy(): void {
    this.viewReady.set(false);
    this.closeContextMenu();
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
        window.removeEventListener(
          'resize',
          this.resizeListener as EventListener,
        );
      } catch {}
      this.resizeListener = null;
    }
    if (this.keyListener && typeof window !== 'undefined') {
      try {
        window.removeEventListener(
          'keydown',
          this.keyListener as EventListener,
        );
      } catch {}
      this.keyListener = null;
    }
  }

  private centerAndFitCanvas() {
    try {
      const canvas = this.canvasEl?.nativeElement;
      if (!canvas) return;
      const w = Math.max(1, this.document.canvasWidth());
      const h = Math.max(1, this.document.canvasHeight());

      const { contentWidth, contentHeight, paddingLeft, paddingTop } =
        this.measureContainer();
      if (contentWidth <= 0 || contentHeight <= 0) return;

      const fitScale = Math.max(
        this.minScale,
        Math.min(contentWidth / w, contentHeight / h),
      );
      const initialScale = Math.min(this.maxScale, fitScale);
      this.scale.set(initialScale);

      const displayWidth = w * initialScale;
      const displayHeight = h * initialScale;
      const offsetX = paddingLeft + (contentWidth - displayWidth) / 2;
      const offsetY = paddingTop + (contentHeight - displayHeight) / 2;
      this.panX.set(offsetX);
      this.panY.set(offsetY);
      this.updateTileSize(this.tools.brushSize());
    } catch (e) {
      // best-effort: ignore errors
    }
  }

  private applyZoom(
    nextScale: number,
    anchor?: { clientX: number; clientY: number },
  ) {
    const clamped = Math.min(this.maxScale, Math.max(this.minScale, nextScale));
    const prev = this.scale();
    if (!this.canvasEl?.nativeElement) {
      this.scale.set(clamped);
      this.updateTileSize(this.tools.brushSize());
      return;
    }
    if (Math.abs(clamped - prev) < 0.0001) {
      return;
    }

    const container = this.canvasContainer?.nativeElement;
    const containerRect = container ? container.getBoundingClientRect() : null;
    const prevPanX = this.panX();
    const prevPanY = this.panY();

    const pivotX =
      anchor?.clientX ??
      (containerRect ? containerRect.left + containerRect.width / 2 : 0);
    const pivotY =
      anchor?.clientY ??
      (containerRect ? containerRect.top + containerRect.height / 2 : 0);
    const containerOffsetX = containerRect ? pivotX - containerRect.left : 0;
    const containerOffsetY = containerRect ? pivotY - containerRect.top : 0;
    const worldX = containerRect ? (containerOffsetX - prevPanX) / prev : 0;
    const worldY = containerRect ? (containerOffsetY - prevPanY) / prev : 0;

    this.scale.set(clamped);

    if (containerRect) {
      const newOffsetX = worldX * clamped;
      const newOffsetY = worldY * clamped;
      this.panX.set(containerOffsetX - newOffsetX);
      this.panY.set(containerOffsetY - newOffsetY);
    }

    this.updateTileSize(this.tools.brushSize());
  }

  private drawCanvas() {
    const canvas = this.canvasEl?.nativeElement;
    if (!canvas) return;
    const w = this.document.canvasWidth();
    const h = this.document.canvasHeight();
    const scale = this.scale();
    const dpr =
      typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const displayWidth = Math.max(1, w * scale);
    const displayHeight = Math.max(1, h * scale);
    const pixelWidth = Math.max(1, Math.floor(displayWidth * dpr));
    const pixelHeight = Math.max(1, Math.floor(displayHeight * dpr));
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    canvas.style.width = displayWidth + 'px';
    canvas.style.height = displayHeight + 'px';

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const root =
      typeof document !== 'undefined' ? document.documentElement : null;
    const isDark = !!root && root.classList.contains('dark');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, pixelWidth, pixelHeight);
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const pxLineWidth = 1 / (scale * dpr);

    const tile = this.tileSize();
    const darkTile = isDark ? 'rgba(0,0,0,0.06)' : 'rgba(0,0,0,0.04)';
    const lightTile = isDark
      ? 'rgba(255,255,255,0.03)'
      : 'rgba(255,255,255,0.02)';
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
    this.document.layerPixelsVersion();

    // draw layers in reverse order so the first layer in the UI (layers()[0])
    // is treated as the topmost and drawn last. Iterate from last -> first to
    // draw bottom layers first and top layers last (so top overlays lower ones).
    const layers = this.document.layers();
    for (let li = layers.length - 1; li >= 0; li--) {
      const layer = layers[li];
      if (!layer.visible) continue;
      const buf = this.document.getLayerBuffer(layer.id);
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

    const activeShape = this.activeShapeTool();
    const shapeStart = this.shapeStart();
    const shapeCurrent = this.shapeCurrent();
    if (activeShape && shapeStart && shapeCurrent) {
      ctx.save();
      if (activeShape === 'line') {
        ctx.strokeStyle = this.tools.lineColor();
        ctx.lineWidth = Math.max(pxLineWidth, this.tools.lineThickness());
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(shapeStart.x + 0.5, shapeStart.y + 0.5);
        ctx.lineTo(shapeCurrent.x + 0.5, shapeCurrent.y + 0.5);
        ctx.stroke();
      } else {
        if (activeShape === 'square') {
          const bounds = this.computeRectBounds(
            shapeStart,
            shapeCurrent,
            this.shapeConstrainUniform(),
          );
          this.renderSquarePreview(
            ctx,
            bounds,
            this.getSquareDrawOptions(),
            pxLineWidth,
          );
        } else {
          const bounds = this.computeRectBounds(
            shapeStart,
            shapeCurrent,
            this.shapeConstrainUniform(),
          );
          this.renderEllipsePreview(
            ctx,
            bounds,
            this.getCircleDrawOptions(),
            pxLineWidth,
          );
        }
      }
      ctx.restore();
    }

    const hx = this.hoverX();
    const hy = this.hoverY();
    // Only show brush/eraser highlight when using the brush or eraser tool.
    if (hx !== null && hy !== null) {
      const tool = this.tools.currentTool();
      if (tool === 'brush' || tool === 'eraser') {
        ctx.save();
        const size =
          tool === 'eraser' ? this.tools.eraserSize() : this.tools.brushSize();
        const bSize = Math.max(1, size);

        // center the brush highlight on the hovered pixel
        const half = Math.floor((bSize - 1) / 2);
        const x0 = Math.max(0, hx - half);
        const y0 = Math.max(0, hy - half);
        const wRect = Math.min(bSize, w - x0);
        const hRect = Math.min(bSize, h - y0);

        ctx.lineWidth = pxLineWidth;
        if (tool === 'eraser') {
          // Eraser: light overlay + visible border depending on theme
          ctx.fillStyle = isDark
            ? 'rgba(255,255,255,0.12)'
            : 'rgba(0,0,0,0.10)';
          ctx.fillRect(x0, y0, wRect, hRect);
          ctx.strokeStyle = isDark
            ? 'rgba(255,255,255,0.5)'
            : 'rgba(0,0,0,0.5)';
          ctx.strokeRect(
            x0 + 0.5,
            y0 + 0.5,
            Math.max(0, wRect - 1),
            Math.max(0, hRect - 1),
          );
        } else {
          // Brush: use current brush color with translucency and border
          ctx.fillStyle = this.tools.brushColor();
          ctx.globalAlpha = 0.9;
          ctx.fillRect(x0, y0, wRect, hRect);
          ctx.globalAlpha = 1;
          ctx.strokeStyle = isDark
            ? 'rgba(255,255,255,0.6)'
            : 'rgba(0,0,0,0.6)';
          ctx.strokeRect(
            x0 + 0.5,
            y0 + 0.5,
            Math.max(0, wRect - 1),
            Math.max(0, hRect - 1),
          );
        }
        ctx.restore();
      }
    }

    // Draw active selection if present
    const sel = this.document.selectionRect();
    const selShape = this.document.selectionShape();
    if (sel && sel.width > 0 && sel.height > 0) {
      ctx.save();
      
      // Check if we have a mask-based selection
      const mask = this.document.selectionMask();
      
      if (mask) {
        // Draw mask-based selection by rendering individual pixels
        ctx.fillStyle = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';
        for (const key of mask) {
          const [xStr, yStr] = key.split(',');
          const x = parseInt(xStr, 10);
          const y = parseInt(yStr, 10);
          ctx.fillRect(x, y, 1, 1);
        }
        
        // Draw marching ants border by detecting edges
        // An edge exists where a selected pixel borders an unselected pixel
        ctx.setLineDash([4 / scale, 3 / scale]);
        ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.8)';
        ctx.lineWidth = pxLineWidth;
        ctx.beginPath();
        
        for (const key of mask) {
          const [xStr, yStr] = key.split(',');
          const x = parseInt(xStr, 10);
          const y = parseInt(yStr, 10);
          
          // Check all 4 neighbors to see if we need to draw an edge
          // Top edge
          if (!mask.has(`${x},${y - 1}`)) {
            ctx.moveTo(x, y);
            ctx.lineTo(x + 1, y);
          }
          // Right edge
          if (!mask.has(`${x + 1},${y}`)) {
            ctx.moveTo(x + 1, y);
            ctx.lineTo(x + 1, y + 1);
          }
          // Bottom edge
          if (!mask.has(`${x},${y + 1}`)) {
            ctx.moveTo(x, y + 1);
            ctx.lineTo(x + 1, y + 1);
          }
          // Left edge
          if (!mask.has(`${x - 1},${y}`)) {
            ctx.moveTo(x, y);
            ctx.lineTo(x, y + 1);
          }
        }
        
        ctx.stroke();
      } else {
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
          ctx.setLineDash([4 / scale, 3 / scale]);
          ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.8)';
          ctx.lineWidth = pxLineWidth;
          ctx.stroke();
        } else if (selShape === 'lasso') {
          const poly = this.document.selectionPolygon();
          if (poly && poly.length > 0) {
            ctx.beginPath();
            ctx.moveTo(poly[0].x + 0.5, poly[0].y + 0.5);
            for (let i = 1; i < poly.length; i++) {
              ctx.lineTo(poly[i].x + 0.5, poly[i].y + 0.5);
            }
            // Optionally close the path for visual completeness
            ctx.closePath();
            ctx.fill();
            ctx.setLineDash([4 / scale, 3 / scale]);
            ctx.strokeStyle = isDark
              ? 'rgba(255,255,255,0.8)'
              : 'rgba(0,0,0,0.8)';
            ctx.lineWidth = pxLineWidth;
            ctx.stroke();
          }
        } else {
          // ctx.fillRect(sel.x, sel.y, sel.width, sel.height);
          // dashed stroke
          ctx.setLineDash([4 / scale, 3 / scale]);
          ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.8)';
          ctx.lineWidth = pxLineWidth;
          ctx.strokeRect(
            sel.x,
            sel.y,
            Math.max(0, sel.width),
            Math.max(0, sel.height),
          );
        }
      }
      ctx.restore();
    }
  }

  private startShape(mode: 'line' | 'circle' | 'square', x: number, y: number) {
    const width = Math.max(1, this.document.canvasWidth());
    const height = Math.max(1, this.document.canvasHeight());
    const point = {
      x: this.clampCoord(x, width),
      y: this.clampCoord(y, height),
    };
    this.document.beginAction(mode);
    this.shaping = true;
    this.activeShapeTool.set(mode);
    this.shapeStart.set(point);
    this.shapeCurrent.set(point);
  }

  private finishShape(constrainOverride?: boolean) {
    if (!this.shaping) return;
    const mode = this.activeShapeTool();
    const start = this.shapeStart();
    const current = this.shapeCurrent();
    if (!mode || !start || !current) {
      this.document.endAction();
      this.clearShapeState();
      return;
    }
    const layerId = this.document.selectedLayerId();
    if (!layerId) {
      this.document.endAction();
      this.clearShapeState();
      return;
    }
    if (mode === 'line') {
      const thickness = this.tools.lineThickness();
      const color = this.tools.lineColor();
      this.document.applyLineToLayer(
        layerId,
        start.x,
        start.y,
        current.x,
        current.y,
        color,
        thickness,
      );
    } else if (mode === 'circle') {
      this.document.applyCircleToLayer(
        layerId,
        start.x,
        start.y,
        current.x,
        current.y,
        this.getCircleDrawOptions(),
        typeof constrainOverride === 'boolean'
          ? constrainOverride
          : this.shapeConstrainUniform(),
      );
    } else {
      const constrainSquare =
        typeof constrainOverride === 'boolean'
          ? constrainOverride
          : this.shapeConstrainUniform();
      this.document.applySquareToLayer(
        layerId,
        start.x,
        start.y,
        current.x,
        current.y,
        this.getSquareDrawOptions(),
        constrainSquare,
      );
    }
    this.document.endAction();
    this.clearShapeState();
  }

  private cancelShape() {
    if (!this.shaping) return;
    this.document.endAction();
    this.clearShapeState();
  }

  private clearShapeState() {
    this.shaping = false;
    this.activeShapeTool.set(null);
    this.shapeStart.set(null);
    this.shapeCurrent.set(null);
    this.shapeConstrainUniform.set(false);
  }

  private isPointInSelection(x: number, y: number): boolean {
    const rect = this.document.selectionRect();
    if (!rect) return false;
    const shape = this.document.selectionShape();
    if (shape === 'lasso') {
      const polygon = this.document.selectionPolygon();
      if (!polygon || polygon.length < 3) return false;
      return this.pointInPolygon(x, y, polygon);
    }
    const maxX = rect.x + Math.max(0, rect.width - 1);
    const maxY = rect.y + Math.max(0, rect.height - 1);
    const withinRect = x >= rect.x && x <= maxX && y >= rect.y && y <= maxY;
    if (!withinRect) return false;
    if (shape === 'ellipse') {
      const rx = rect.width / 2;
      const ry = rect.height / 2;
      if (rx <= 0 || ry <= 0) return false;
      const cx = rect.x + (rect.width - 1) / 2;
      const cy = rect.y + (rect.height - 1) / 2;
      const normX = x - cx;
      const normY = y - cy;
      const ellipseTest =
        (normX * normX) / (rx * rx) + (normY * normY) / (ry * ry);
      return ellipseTest <= 1;
    }
    return withinRect;
  }

  private pointInPolygon(
    x: number,
    y: number,
    polygon: { x: number; y: number }[],
  ): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x;
      const yi = polygon[i].y;
      const xj = polygon[j].x;
      const yj = polygon[j].y;
      const intersects =
        yi > y !== yj > y &&
        x <= ((xj - xi) * (y - yi)) / (yj - yi || Number.EPSILON) + xi;
      if (intersects) inside = !inside;
    }
    return inside;
  }

  private clampCoord(value: number, max: number) {
    return Math.max(0, Math.min(Math.floor(value), max - 1));
  }

  private computeRectBounds(
    start: { x: number; y: number },
    current: { x: number; y: number },
    constrainToSquare: boolean,
  ) {
    const width = Math.max(1, this.document.canvasWidth());
    const height = Math.max(1, this.document.canvasHeight());
    const sx = this.clampCoord(start.x, width);
    const sy = this.clampCoord(start.y, height);
    const cx = this.clampCoord(current.x, width);
    const cy = this.clampCoord(current.y, height);
    const dx = cx - sx;
    const dy = cy - sy;
    let ex = cx;
    let ey = cy;
    if (constrainToSquare) {
      const stepX = dx >= 0 ? 1 : -1;
      const stepY = dy >= 0 ? 1 : -1;
      const span = Math.max(Math.abs(dx), Math.abs(dy));
      ex = this.clampCoord(sx + stepX * span, width);
      ey = this.clampCoord(sy + stepY * span, height);
    }
    const minX = Math.max(0, Math.min(sx, ex));
    const maxX = Math.min(width - 1, Math.max(sx, ex));
    const minY = Math.max(0, Math.min(sy, ey));
    const maxY = Math.min(height - 1, Math.max(sy, ey));
    return { minX, minY, maxX, maxY };
  }

  private getCircleDrawOptions(): ShapeDrawOptions {
    return {
      strokeThickness: Math.max(
        0,
        Math.floor(this.tools.circleStrokeThickness()),
      ),
      strokeColor: this.tools.circleStrokeColor(),
      fillMode: this.tools.circleFillMode(),
      fillColor: this.tools.circleFillColor(),
      gradientStartColor: this.tools.circleGradientStartColor(),
      gradientEndColor: this.tools.circleGradientEndColor(),
      gradientType: this.tools.circleGradientType(),
      gradientAngle: this.tools.circleGradientAngle(),
    };
  }

  private getSquareDrawOptions(): ShapeDrawOptions {
    return {
      strokeThickness: Math.max(
        0,
        Math.floor(this.tools.squareStrokeThickness()),
      ),
      strokeColor: this.tools.squareStrokeColor(),
      fillMode: this.tools.squareFillMode(),
      fillColor: this.tools.squareFillColor(),
      gradientStartColor: this.tools.squareGradientStartColor(),
      gradientEndColor: this.tools.squareGradientEndColor(),
      gradientType: this.tools.squareGradientType(),
      gradientAngle: this.tools.squareGradientAngle(),
    };
  }

  private renderSquarePreview(
    ctx: CanvasRenderingContext2D,
    bounds: { minX: number; minY: number; maxX: number; maxY: number },
    options: ShapeDrawOptions,
    pxLineWidth: number,
  ) {
    const widthRect = Math.max(1, bounds.maxX - bounds.minX + 1);
    const heightRect = Math.max(1, bounds.maxY - bounds.minY + 1);
    if (options.fillMode === 'gradient') {
      this.fillSquareGradientPreview(ctx, bounds, options);
    } else if (options.fillColor) {
      ctx.fillStyle = options.fillColor;
      ctx.globalAlpha = 0.35;
      ctx.fillRect(bounds.minX, bounds.minY, widthRect, heightRect);
      ctx.globalAlpha = 1;
    }
    if (options.strokeThickness > 0 && options.strokeColor) {
      ctx.lineWidth = Math.max(pxLineWidth, options.strokeThickness);
      ctx.strokeStyle = options.strokeColor;
      ctx.strokeRect(bounds.minX, bounds.minY, widthRect, heightRect);
    }
  }

  private renderEllipsePreview(
    ctx: CanvasRenderingContext2D,
    bounds: { minX: number; minY: number; maxX: number; maxY: number },
    options: ShapeDrawOptions,
    pxLineWidth: number,
  ) {
    const widthRect = Math.max(1, bounds.maxX - bounds.minX + 1);
    const heightRect = Math.max(1, bounds.maxY - bounds.minY + 1);
    const cx = bounds.minX + widthRect / 2;
    const cy = bounds.minY + heightRect / 2;
    const rx = widthRect / 2;
    const ry = heightRect / 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    if (options.fillMode === 'gradient' && rx > 0 && ry > 0) {
      this.fillEllipseGradientPreview(ctx, bounds, options, cx, cy, rx, ry);
    } else if (options.fillColor) {
      ctx.fillStyle = options.fillColor;
      ctx.globalAlpha = 0.35;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (options.strokeThickness > 0 && options.strokeColor) {
      ctx.lineWidth = Math.max(pxLineWidth, options.strokeThickness);
      ctx.strokeStyle = options.strokeColor;
      ctx.stroke();
    }
  }

  private fillSquareGradientPreview(
    ctx: CanvasRenderingContext2D,
    bounds: { minX: number; minY: number; maxX: number; maxY: number },
    options: ShapeDrawOptions,
  ) {
    const minX = bounds.minX;
    const minY = bounds.minY;
    const maxX = bounds.maxX;
    const maxY = bounds.maxY;
    const widthRect = Math.max(1, maxX - minX + 1);
    const heightRect = Math.max(1, maxY - minY + 1);
    const fillColor = options.fillColor;
    const startColor = options.gradientStartColor || fillColor;
    const endColor = options.gradientEndColor || startColor;
    const fallbackStart = startColor || endColor;
    const fallbackEnd = endColor || startColor;
    if (!fallbackStart && !fallbackEnd) return;
    const parsedStart = this.parseHexColor(startColor);
    const parsedEnd = this.parseHexColor(endColor);
    const gradientType: GradientType =
      options.gradientType === 'radial' ? 'radial' : 'linear';
    const gradientAngle =
      typeof options.gradientAngle === 'number' ? options.gradientAngle : 0;
    const angleRad = (gradientAngle * Math.PI) / 180;
    const dirX = Math.cos(angleRad);
    const dirY = Math.sin(angleRad);
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
        if (minVal === maxVal) maxVal = minVal + 1;
        minProj = minVal;
        maxProj = maxVal;
      }
    }
    const radius = Math.max(widthRect, heightRect) / 2;
    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = 0.35;
    for (let yy = minY; yy <= maxY; yy++) {
      for (let xx = minX; xx <= maxX; xx++) {
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
        const dither = this.computeDitheredRatio(ratio, xx, yy);
        const startFallback = fallbackStart || fallbackEnd;
        const endFallback = fallbackEnd || fallbackStart;
        if (!startFallback || !endFallback) continue;
        const color = this.mixParsedColors(
          parsedStart,
          parsedEnd,
          dither,
          startFallback,
          endFallback,
        );
        ctx.fillStyle = color;
        ctx.fillRect(xx, yy, 1, 1);
      }
    }
    ctx.globalAlpha = prevAlpha;
  }

  private fillEllipseGradientPreview(
    ctx: CanvasRenderingContext2D,
    bounds: { minX: number; minY: number; maxX: number; maxY: number },
    options: ShapeDrawOptions,
    cx: number,
    cy: number,
    rx: number,
    ry: number,
  ) {
    const minX = bounds.minX;
    const minY = bounds.minY;
    const maxX = bounds.maxX;
    const maxY = bounds.maxY;
    const fillColor = options.fillColor;
    const startColor = options.gradientStartColor || fillColor;
    const endColor = options.gradientEndColor || startColor;
    const fallbackStart = startColor || endColor;
    const fallbackEnd = endColor || startColor;
    if (!fallbackStart && !fallbackEnd) return;
    const parsedStart = this.parseHexColor(startColor);
    const parsedEnd = this.parseHexColor(endColor);
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
        if (minVal === maxVal) maxVal = minVal + 1;
        minProj = minVal;
        maxProj = maxVal;
      }
    }
    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = 0.35;
    const invRx = rx > 0 ? 1 / rx : 0;
    const invRy = ry > 0 ? 1 / ry : 0;
    for (let yy = minY; yy <= maxY; yy++) {
      for (let xx = minX; xx <= maxX; xx++) {
        const dx = xx + 0.5 - cx;
        const dy = yy + 0.5 - cy;
        const norm =
          invRx > 0 && invRy > 0
            ? dx * dx * invRx * invRx + dy * dy * invRy * invRy
            : 0;
        if (norm > 1) continue;
        let ratio = 0;
        if (gradientType === 'radial') {
          ratio = Math.sqrt(norm);
        } else {
          const proj = (xx + 0.5) * dirX + (yy + 0.5) * dirY;
          const span = maxProj - minProj;
          ratio = span !== 0 ? (proj - minProj) / span : 0;
        }
        const dither = this.computeDitheredRatio(ratio, xx, yy);
        const startFallback = fallbackStart || fallbackEnd;
        const endFallback = fallbackEnd || fallbackStart;
        if (!startFallback || !endFallback) continue;
        const color = this.mixParsedColors(
          parsedStart,
          parsedEnd,
          dither,
          startFallback,
          endFallback,
        );
        ctx.fillStyle = color;
        ctx.fillRect(xx, yy, 1, 1);
      }
    }
    ctx.globalAlpha = prevAlpha;
  }

  private computeDitheredRatio(ratio: number, x: number, y: number) {
    const clamped = Math.min(1, Math.max(0, ratio));
    const steps = this.gradientSteps;
    if (steps <= 0) return clamped;
    const scaled = clamped * steps;
    const base = Math.floor(scaled);
    const fraction = scaled - base;
    const matrix = this.bayer4;
    const size = matrix.length;
    const xi = x % size;
    const yi = y % size;
    const threshold = (matrix[yi][xi] + 0.5) / (size * size);
    const offset = fraction > threshold ? 1 : 0;
    const index = Math.min(steps, Math.max(0, base + offset));
    return index / steps;
  }

  private parseHexColor(value: string | undefined) {
    if (!value || typeof value !== 'string') return null;
    const match = /^#?([0-9a-fA-F]{6})$/.exec(value.trim());
    if (!match) return null;
    const raw = match[1];
    const r = Number.parseInt(raw.slice(0, 2), 16);
    const g = Number.parseInt(raw.slice(2, 4), 16);
    const b = Number.parseInt(raw.slice(4, 6), 16);
    if ([r, g, b].some((v) => Number.isNaN(v))) return null;
    return { r, g, b };
  }

  private componentToHex(value: number) {
    const clamped = Math.max(0, Math.min(255, Math.round(value)));
    return clamped.toString(16).padStart(2, '0');
  }

  private composeHexColor(r: number, g: number, b: number) {
    return `#${this.componentToHex(r)}${this.componentToHex(g)}${this.componentToHex(b)}`;
  }

  private mixParsedColors(
    start: { r: number; g: number; b: number } | null,
    end: { r: number; g: number; b: number } | null,
    ratio: number,
    fallbackStart: string,
    fallbackEnd: string,
  ) {
    const t = Math.min(1, Math.max(0, ratio));
    if (start && end) {
      const r = start.r + (end.r - start.r) * t;
      const g = start.g + (end.g - start.g) * t;
      const b = start.b + (end.b - start.b) * t;
      return this.composeHexColor(r, g, b);
    }
    const startValue = fallbackStart || fallbackEnd || '#000000';
    const endValue = fallbackEnd || fallbackStart || '#000000';
    return t <= 0.5 ? startValue : endValue;
  }

  private measureContainer() {
    const container = this.canvasContainer?.nativeElement;
    if (!container) {
      return {
        contentWidth: this.document.canvasWidth(),
        contentHeight: this.document.canvasHeight(),
        paddingLeft: 0,
        paddingTop: 0,
      };
    }
    const styles =
      typeof window !== 'undefined' ? window.getComputedStyle(container) : null;
    const paddingLeft = styles ? parseFloat(styles.paddingLeft) || 0 : 0;
    const paddingRight = styles ? parseFloat(styles.paddingRight) || 0 : 0;
    const paddingTop = styles ? parseFloat(styles.paddingTop) || 0 : 0;
    const paddingBottom = styles ? parseFloat(styles.paddingBottom) || 0 : 0;
    const contentWidth = Math.max(
      1,
      container.clientWidth - paddingLeft - paddingRight,
    );
    const contentHeight = Math.max(
      1,
      container.clientHeight - paddingTop - paddingBottom,
    );
    return { contentWidth, contentHeight, paddingLeft, paddingTop };
  }
}
