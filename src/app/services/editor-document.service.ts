import { Injectable, Signal, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { EditorToolsService } from './editor-tools.service';
import {
  EditorAnimationService,
  EditorCanvasStateService,
  EditorColorService,
  EditorDrawingService,
  EditorFrameService,
  EditorHistoryService,
  EditorLayerService,
  EditorProjectService,
  EditorSelectionService,
  FrameItem,
  GroupItem,
  LayerItem,
  LayerTreeItem,
  isGroup,
  isLayer,
} from './editor/index';
import { GradientType, ShapeFillMode, ToolMetaKey } from './tools/tool.types';

export type { FrameItem, GroupItem, LayerItem, LayerTreeItem };
export { isGroup, isLayer };

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
export class EditorDocumentService {
  private readonly tools = inject(EditorToolsService);
  private readonly canvasState = inject(EditorCanvasStateService);
  private readonly layerService = inject(EditorLayerService);
  private readonly frameService = inject(EditorFrameService);
  private readonly animationService = inject(EditorAnimationService);
  private readonly historyService = inject(EditorHistoryService);
  private readonly selectionService = inject(EditorSelectionService);
  private readonly drawingService = inject(EditorDrawingService);
  private readonly colorService = inject(EditorColorService);
  private readonly projectService = inject(EditorProjectService);

  readonly layers = this.layerService.layers;
  readonly selectedLayerId = this.layerService.selectedLayerId;
  readonly selectedLayerIds = this.layerService.selectedLayerIds;
  readonly selectedLayer: Signal<LayerTreeItem | null> =
    this.layerService.selectedLayer;

  readonly frames = this.frameService.frames;
  readonly currentFrameIndex = this.frameService.currentFrameIndex;

  readonly isAnimationPlaying = this.animationService.isPlaying;
  readonly animationFps = this.animationService.fps;

  readonly canvasWidth = this.canvasState.canvasWidth;
  readonly canvasHeight = this.canvasState.canvasHeight;
  readonly canvasSaved = this.canvasState.canvasSaved;
  readonly layerPixelsVersion = this.canvasState.layerPixelsVersion;

  readonly selectionRect = this.selectionService.selectionRect;
  readonly selectionShape = this.selectionService.selectionShape;
  readonly selectionPolygon = this.selectionService.selectionPolygon;
  readonly selectionMask = this.selectionService.selectionMask;

  readonly undoVersion = this.historyService.undoVersion;
  readonly redoVersion = this.historyService.redoVersion;

  constructor() {
    this.tools.registerHistoryAdapter((key, previous, next) =>
      this.commitMetaChange({ key, previous, next }),
    );
    
    this.animationService.setLoadFrameCallback((index: number) => {
      this.loadFrameState(index);
    });
    
    setTimeout(() => this.initializeFirstFrame(), 0);
  }

  private initializeFirstFrame() {
    const firstFrame = this.frames()[0];
    if (firstFrame && !firstFrame.layers && !firstFrame.buffers) {
      this.saveFrameStateById(firstFrame.id);
    }
  }

  loadProjectFromLocalStorage(): Observable<boolean> {
    return this.projectService.loadProjectFromLocalStorage();
  }

  exportProjectSnapshot() {
    this.saveCurrentFrameState();
    return this.projectService.exportProjectSnapshot();
  }

  restoreProjectSnapshot(parsed: any): boolean {
    return this.projectService.restoreProjectSnapshot(parsed);
  }

  resetToNewProject(width = 64, height = 64) {
    this.canvasState.canvasWidth.set(Math.max(1, Math.floor(width)));
    this.canvasState.canvasHeight.set(Math.max(1, Math.floor(height)));
    this.layerService.resetLayers();
    const firstLayer = this.layerService.layers()[0];
    if (firstLayer) {
      this.canvasState.ensureLayerBuffer(
        firstLayer.id,
        this.canvasState.canvasWidth(),
        this.canvasState.canvasHeight(),
      );
    }
    this.selectionService.clearSelection();
    this.clearHistory();
    this.canvasState.incrementPixelsVersion();
    this.canvasState.setCanvasSaved(true);
  }

  saveProjectToLocalStorage(): boolean {
    return this.projectService.saveProjectToLocalStorage();
  }

  selectLayer(id: string) {
    this.layerService.selectLayer(id);
  }

  toggleLayerSelection(id: string, multi = false) {
    this.layerService.toggleLayerSelection(id, multi);
  }

  selectLayerRange(fromId: string, toId: string) {
    this.layerService.selectLayerRange(fromId, toId);
  }

  setCurrentFrame(index: number) {
    this.frameService.setCurrentFrame(index);
  }

  setCanvasSize(width: number, height: number) {
    const prevSnapshot = this.snapshotLayersAndBuffers();
    const prevSize = {
      width: this.canvasState.canvasWidth(),
      height: this.canvasState.canvasHeight(),
      buffers: prevSnapshot.buffers,
    };
    this.canvasState.setCanvasSize(width, height);
    const layers = this.layerService.layers();
    for (const l of layers) {
      this.canvasState.ensureLayerBuffer(l.id, width, height);
    }
    const nextSnapshot = this.snapshotLayersAndBuffers();
    const nextSize = { width, height, buffers: nextSnapshot.buffers };
    this.commitMetaChange({
      key: 'canvasSnapshot',
      previous: prevSize,
      next: nextSize,
    });
  }

  getLayerBuffer(layerId: string): string[] {
    return this.canvasState.getLayerBuffer(layerId);
  }

  ensureLayerBuffer(layerId: string, width: number, height: number) {
    this.canvasState.ensureLayerBuffer(layerId, width, height);
  }

  getFlattenedLayers(): LayerItem[] {
    return this.layerService.getFlattenedLayers();
  }

  findItemById(items: LayerTreeItem[], id: string): LayerTreeItem | null {
    return this.layerService.findItemById(items, id);
  }

  renameLayer(id: string, newName: string) {
    const prev = this.snapshotLayersAndBuffers();
    this.layerService.renameLayer(id, newName);
    this.canvasState.incrementPixelsVersion();
    const next = this.snapshotLayersAndBuffers();
    this.commitMetaChange({ key: 'layersSnapshot', previous: prev, next });
  }

  toggleGroupExpanded(id: string) {
    this.layerService.toggleGroupExpanded(id);
  }

  toggleLayerVisibility(id: string) {
    const prev = this.snapshotLayersAndBuffers();
    this.layerService.toggleLayerVisibility(id);
    this.canvasState.incrementPixelsVersion();
    const next = this.snapshotLayersAndBuffers();
    this.commitMetaChange({ key: 'layersSnapshot', previous: prev, next });
  }

  toggleLayerLock(id: string) {
    const prev = this.snapshotLayersAndBuffers();
    this.layerService.toggleLayerLock(id);
    const next = this.snapshotLayersAndBuffers();
    this.commitMetaChange({ key: 'layersSnapshot', previous: prev, next });
  }

  removeLayer(id: string): boolean {
    const prevSnapshot = this.snapshotLayersAndBuffers();
    const item = this.layerService.findItemById(
      this.layerService.layers(),
      id,
    );
    const success = this.layerService.removeLayer(id);
    if (!success) return false;
    if (item && isLayer(item)) {
      this.canvasState.deleteLayerBuffer(id);
    } else if (item && isGroup(item)) {
      const groupLayerIds = this.layerService.getAllLayerIds([item]);
      for (const lid of groupLayerIds) {
        if (lid !== id) {
          this.canvasState.deleteLayerBuffer(lid);
        }
      }
    }
    this.canvasState.incrementPixelsVersion();
    const nextSnapshot = this.snapshotLayersAndBuffers();
    this.commitMetaChange({
      key: 'layersSnapshot',
      previous: prevSnapshot,
      next: nextSnapshot,
    });
    return true;
  }

  addLayer(name?: string) {
    const prevSnapshot = this.snapshotLayersAndBuffers();
    const item = this.layerService.addLayer(name);
    this.canvasState.ensureLayerBuffer(
      item.id,
      this.canvasState.canvasWidth(),
      this.canvasState.canvasHeight(),
    );
    const nextSnapshot = this.snapshotLayersAndBuffers();
    this.commitMetaChange({
      key: 'layersSnapshot',
      previous: prevSnapshot,
      next: nextSnapshot,
    });
    return item;
  }

  reorderLayers(fromIndex: number, toIndex: number) {
    const prev = this.snapshotLayersAndBuffers();
    const success = this.layerService.reorderLayers(fromIndex, toIndex);
    if (!success) return false;
    const next = this.snapshotLayersAndBuffers();
    this.commitMetaChange({ key: 'layersSnapshot', previous: prev, next });
    return true;
  }

  duplicateLayer(layerId?: string): LayerItem | null {
    const id = layerId || this.layerService.selectedLayerId();
    const item = this.layerService.findItemById(
      this.layerService.layers(),
      id,
    );
    if (!item || !isLayer(item)) return null;
    const prevSnapshot = this.snapshotLayersAndBuffers();
    const newLayerId = `layer_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newLayer: LayerItem = {
      id: newLayerId,
      name: `${item.name} copy`,
      visible: item.visible,
      locked: item.locked,
      type: 'layer',
    };
    const sourceBuf = this.canvasState.getLayerBuffer(id);
    if (sourceBuf && sourceBuf.length > 0) {
      this.canvasState.setLayerBuffer(newLayerId, sourceBuf.slice());
    } else {
      this.canvasState.ensureLayerBuffer(
        newLayerId,
        this.canvasState.canvasWidth(),
        this.canvasState.canvasHeight(),
      );
    }
    this.layerService.layers.update((arr) => [newLayer, ...arr]);
    this.layerService.selectedLayerId.set(newLayerId);
    this.layerService.selectedLayerIds.set(new Set([newLayerId]));
    this.canvasState.incrementPixelsVersion();
    const nextSnapshot = this.snapshotLayersAndBuffers();
    this.commitMetaChange({
      key: 'layersSnapshot',
      previous: prevSnapshot,
      next: nextSnapshot,
    });
    this.canvasState.setCanvasSaved(false);
    return newLayer;
  }

  selectPixelForLayer(layerId?: string) {
    const id = layerId || this.layerService.selectedLayerId();
    const buf = this.canvasState.getLayerBuffer(id);
    if (!buf || buf.length === 0) return;
    const w = this.canvasState.canvasWidth();
    const h = this.canvasState.canvasHeight();
    let minX = w;
    let minY = h;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const pixel = buf[idx];
        if (pixel && pixel.length > 0) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (minX > maxX || minY > maxY) {
      return;
    }
    const prevSelection = this.selectionService.getSelectionSnapshot();
    this.selectionService.selectionRect.set({
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    });
    this.selectionService.selectionShape.set('rect');
    this.selectionService.selectionPolygon.set(null);
    this.selectionService.selectionMask.set(null);
    this.commitMetaChange({
      key: 'selectionSnapshot',
      previous: prevSelection,
      next: this.selectionService.getSelectionSnapshot(),
    });
  }

  mergeLayers(layerIds: string[]): LayerItem | null {
    if (layerIds.length < 2) return null;
    const prevSnapshot = this.snapshotLayersAndBuffers();
    const w = this.canvasState.canvasWidth();
    const h = this.canvasState.canvasHeight();
    const mergedBuf = new Array<string>(w * h).fill('');
    const flatLayers = this.layerService.getFlattenedLayers();
    const layerSet = new Set(layerIds);
    const selectedLayers = flatLayers.filter((l) => layerSet.has(l.id));
    for (let li = selectedLayers.length - 1; li >= 0; li--) {
      const layer = selectedLayers[li];
      const buf = this.canvasState.getLayerBuffer(layer.id);
      if (!buf || buf.length !== w * h) continue;
      for (let idx = 0; idx < w * h; idx++) {
        const pixel = buf[idx];
        if (pixel && pixel.length > 0) {
          mergedBuf[idx] = pixel;
        }
      }
    }
    const newLayerId = `layer_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newLayer: LayerItem = {
      id: newLayerId,
      name: 'Merged layer',
      visible: true,
      locked: false,
      type: 'layer',
    };
    let updatedLayers = this.layerService.layers();
    for (const lid of layerIds) {
      updatedLayers = this.layerService.removeItemById(updatedLayers, lid);
      this.canvasState.deleteLayerBuffer(lid);
    }
    updatedLayers = [newLayer, ...updatedLayers];
    this.layerService.layers.set(updatedLayers);
    this.canvasState.setLayerBuffer(newLayerId, mergedBuf);
    this.layerService.selectedLayerId.set(newLayerId);
    this.layerService.selectedLayerIds.set(new Set([newLayerId]));
    this.canvasState.incrementPixelsVersion();
    const nextSnapshot = this.snapshotLayersAndBuffers();
    this.commitMetaChange({
      key: 'layersSnapshot',
      previous: prevSnapshot,
      next: nextSnapshot,
    });
    this.canvasState.setCanvasSaved(false);
    return newLayer;
  }

  groupLayers(layerIds: string[]): GroupItem | null {
    const prevSnapshot = this.snapshotLayersAndBuffers();
    const group = this.layerService.groupLayers(layerIds);
    if (!group) return null;
    this.canvasState.incrementPixelsVersion();
    const nextSnapshot = this.snapshotLayersAndBuffers();
    this.commitMetaChange({
      key: 'layersSnapshot',
      previous: prevSnapshot,
      next: nextSnapshot,
    });
    this.canvasState.setCanvasSaved(false);
    return group;
  }

  ungroupLayers(groupId: string): boolean {
    const prevSnapshot = this.snapshotLayersAndBuffers();
    const success = this.layerService.ungroupLayers(groupId);
    if (!success) return false;
    this.canvasState.incrementPixelsVersion();
    const nextSnapshot = this.snapshotLayersAndBuffers();
    this.commitMetaChange({
      key: 'layersSnapshot',
      previous: prevSnapshot,
      next: nextSnapshot,
    });
    this.canvasState.setCanvasSaved(false);
    return true;
  }

  async insertImageAsLayer(
    imageFile: File,
    targetWidth?: number,
    targetHeight?: number,
  ): Promise<{
    layerId: string;
    bounds: { x: number; y: number; width: number; height: number };
  } | null> {
    try {
      const img = await this.loadImage(imageFile);
      const finalWidth =
        targetWidth && targetWidth > 0 ? targetWidth : img.width;
      const finalHeight =
        targetHeight && targetHeight > 0 ? targetHeight : img.height;
      const canvas = document.createElement('canvas');
      canvas.width = finalWidth;
      canvas.height = finalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, finalWidth, finalHeight);
      const imageData = ctx.getImageData(0, 0, finalWidth, finalHeight);
      const layerName =
        imageFile.name.replace(/\.[^.]+$/, '') ||
        `Inserted Image ${this.layerService.layers().length + 1}`;
      const newLayer = this.addLayer(layerName);
      const canvasWidth = this.canvasState.canvasWidth();
      const canvasHeight = this.canvasState.canvasHeight();
      const startX = 0;
      const startY = 0;
      const buf = this.canvasState.getLayerBuffer(newLayer.id);
      if (!buf || buf.length === 0) return null;
      this.beginAction(`Insert image: ${layerName}`);
      for (let y = 0; y < finalHeight; y++) {
        for (let x = 0; x < finalWidth; x++) {
          const px = startX + x;
          const py = startY + y;
          if (px < 0 || px >= canvasWidth || py < 0 || py >= canvasHeight)
            continue;
          const srcIdx = (y * finalWidth + x) * 4;
          const r = imageData.data[srcIdx];
          const g = imageData.data[srcIdx + 1];
          const b = imageData.data[srcIdx + 2];
          const a = imageData.data[srcIdx + 3] / 255;
          if (a <= 0) continue;
          const color =
            a >= 1
              ? `rgb(${r},${g},${b})`
              : `rgba(${r},${g},${b},${a.toFixed(3)})`;
          const idx = py * canvasWidth + px;
          const oldVal = buf[idx] || '';
          if (oldVal !== color) {
            this.historyService.recordPixelChange(
              newLayer.id,
              idx,
              oldVal,
              color,
            );
            buf[idx] = color;
          }
        }
      }
      this.canvasState.incrementPixelsVersion();
      this.canvasState.setCanvasSaved(false);
      this.endAction();
      const bounds = {
        x: startX,
        y: startY,
        width: Math.min(finalWidth, canvasWidth - startX),
        height: Math.min(finalHeight, canvasHeight - startY),
      };
      this.selectionService.selectionRect.set(bounds);
      this.selectionService.selectionShape.set('rect');
      this.selectionService.selectionPolygon.set(null);
      return { layerId: newLayer.id, bounds };
    } catch (error) {
      console.error('Failed to insert image as layer:', error);
      return null;
    }
  }

  private loadImage(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          img.src = e.target.result as string;
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  applyBrushToLayer(
    layerId: string,
    x: number,
    y: number,
    brushSize: number,
    color: string | null,
    options?: { eraserStrength?: number },
  ) {
    return this.drawingService.applyBrushToLayer(
      layerId,
      x,
      y,
      brushSize,
      color,
      options,
    );
  }

  applyFillToLayer(
    layerId: string,
    x: number,
    y: number,
    color: string | null,
  ) {
    return this.drawingService.applyFillToLayer(layerId, x, y, color);
  }

  applyLineToLayer(
    layerId: string,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    color: string,
    thickness: number,
  ) {
    return this.drawingService.applyLineToLayer(
      layerId,
      x0,
      y0,
      x1,
      y1,
      color,
      thickness,
    );
  }

  applySquareToLayer(
    layerId: string,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    options: ShapeDrawOptions,
    constrainToSquare = true,
  ) {
    return this.drawingService.applySquareToLayer(
      layerId,
      x0,
      y0,
      x1,
      y1,
      options,
      constrainToSquare,
    );
  }

  applyCircleToLayer(
    layerId: string,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    options: ShapeDrawOptions,
    constrainToCircle = true,
  ) {
    return this.drawingService.applyCircleToLayer(
      layerId,
      x0,
      y0,
      x1,
      y1,
      options,
      constrainToCircle,
    );
  }

  beginAction(description?: string) {
    this.historyService.beginAction(description);
  }

  endAction() {
    this.historyService.endAction();
  }

  private commitMetaChange(meta: { key: string; previous: any; next: any }) {
    this.historyService.commitMetaChange(meta);
  }

  beginSelection(
    x: number,
    y: number,
    shape: 'rect' | 'ellipse' | 'lasso' = 'rect',
  ) {
    this.selectionService.beginSelection(x, y, shape);
  }

  addLassoPoint(x: number, y: number) {
    this.selectionService.addLassoPoint(x, y);
  }

  updateSelection(x: number, y: number) {
    this.selectionService.updateSelection(x, y);
  }

  endSelection() {
    const snapshot = this.selectionService.getSelectionSnapshot();
    this.commitMetaChange({
      key: 'selectionSnapshot',
      previous: null,
      next: snapshot,
    });
  }

  clearSelection() {
    const prev = this.selectionService.getSelectionSnapshot();
    if (!prev.rect) return;
    this.selectionService.clearSelection();
    this.commitMetaChange({
      key: 'selectionSnapshot',
      previous: prev,
      next: null,
    });
  }

  moveSelection(dx: number, dy: number) {
    const prevSelection = this.selectionService.getSelectionSnapshot();
    this.selectionService.moveSelection(
      dx,
      dy,
      this.canvasState.canvasWidth(),
      this.canvasState.canvasHeight(),
    );
    this.commitMetaChange({
      key: 'selectionSnapshot',
      previous: prevSelection,
      next: this.selectionService.getSelectionSnapshot(),
    });
  }

  invertSelection() {
    const prevSelection = this.selectionService.getSelectionSnapshot();
    this.selectionService.invertSelection(
      this.canvasState.canvasWidth(),
      this.canvasState.canvasHeight(),
    );
    this.commitMetaChange({
      key: 'selectionSnapshot',
      previous: prevSelection,
      next: this.selectionService.getSelectionSnapshot(),
    });
  }

  growSelection(pixels: number) {
    const prevSelection = this.selectionService.getSelectionSnapshot();
    this.selectionService.growSelection(
      pixels,
      this.canvasState.canvasWidth(),
      this.canvasState.canvasHeight(),
    );
    this.commitMetaChange({
      key: 'selectionSnapshot',
      previous: prevSelection,
      next: this.selectionService.getSelectionSnapshot(),
    });
  }

  makeCopyLayer() {
    const sel = this.selectionService.selectionRect();
    if (!sel) return null;
    const shape = this.selectionService.selectionShape();
    const poly = this.selectionService.selectionPolygon();
    const sourceLayerId = this.layerService.selectedLayerId();
    const sourceBuf = this.canvasState.getLayerBuffer(sourceLayerId);
    if (!sourceBuf || sourceBuf.length === 0) return null;
    const w = this.canvasState.canvasWidth();
    const h = this.canvasState.canvasHeight();
    const prevSnapshot = this.snapshotLayersAndBuffers();
    const sourceItem = this.layerService.findItemById(
      this.layerService.layers(),
      sourceLayerId,
    );
    const newName = sourceItem ? `${sourceItem.name}-copy` : 'Layer copy';
    const newLayerId = `layer_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newLayer: LayerItem = {
      id: newLayerId,
      name: newName,
      visible: true,
      locked: false,
      type: 'layer',
    };
    const newBuf = new Array<string>(w * h).fill('');
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (
          this.selectionService.isPixelWithinSelection(x, y, sel, shape, poly)
        ) {
          const idx = y * w + x;
          newBuf[idx] = sourceBuf[idx] || '';
        }
      }
    }
    const currentLayers = this.layerService.layers();
    const sourceIndex = currentLayers.findIndex((l) => l.id === sourceLayerId);
    if (sourceIndex >= 0) {
      this.layerService.layers.update((arr) => [
        ...arr.slice(0, sourceIndex),
        newLayer,
        ...arr.slice(sourceIndex),
      ]);
    } else {
      this.layerService.layers.update((arr) => [newLayer, ...arr]);
    }
    this.canvasState.setLayerBuffer(newLayerId, newBuf);
    this.layerService.selectedLayerId.set(newLayerId);
    this.canvasState.incrementPixelsVersion();
    const nextSnapshot = this.snapshotLayersAndBuffers();
    this.commitMetaChange({
      key: 'layersSnapshot',
      previous: prevSnapshot,
      next: nextSnapshot,
    });
    return newLayer;
  }

  mergeVisibleToNewLayer() {
    const sel = this.selectionService.selectionRect();
    if (!sel) return null;
    const shape = this.selectionService.selectionShape();
    const poly = this.selectionService.selectionPolygon();
    const w = this.canvasState.canvasWidth();
    const h = this.canvasState.canvasHeight();
    const prevSnapshot = this.snapshotLayersAndBuffers();
    const mergedBuf = new Array<string>(w * h).fill('');
    const layers = this.layerService.layers();
    for (let li = layers.length - 1; li >= 0; li--) {
      const layer = layers[li];
      if (!layer.visible) continue;
      const buf = this.canvasState.getLayerBuffer(layer.id);
      if (!buf || buf.length !== w * h) continue;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (
            !this.selectionService.isPixelWithinSelection(
              x,
              y,
              sel,
              shape,
              poly,
            )
          )
            continue;
          const idx = y * w + x;
          const pixel = buf[idx];
          if (pixel && pixel.length > 0) {
            const existing = mergedBuf[idx];
            if (!existing || existing.length === 0) {
              mergedBuf[idx] = pixel;
            } else {
              mergedBuf[idx] = pixel;
            }
          }
        }
      }
    }
    const newLayerId = `layer_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newLayer: LayerItem = {
      id: newLayerId,
      name: 'Merged layer',
      visible: true,
      locked: false,
      type: 'layer',
    };
    this.layerService.layers.update((arr) => [newLayer, ...arr]);
    this.canvasState.setLayerBuffer(newLayerId, mergedBuf);
    this.layerService.selectedLayerId.set(newLayerId);
    this.canvasState.incrementPixelsVersion();
    const nextSnapshot = this.snapshotLayersAndBuffers();
    this.commitMetaChange({
      key: 'layersSnapshot',
      previous: prevSnapshot,
      next: nextSnapshot,
    });
    return newLayer;
  }

  private snapshotLayersAndBuffers(): {
    layers: LayerTreeItem[];
    buffers: Record<string, string[]>;
  } {
    const layersCopy = this.layerService.layers().map((l) => ({ ...l }));
    const buffers: Record<string, string[]> = {};
    for (const [id, buf] of this.canvasState.getAllBuffers().entries()) {
      buffers[id] = buf.slice();
    }
    return { layers: layersCopy, buffers };
  }

  private applyMetaChange(meta: { key: string; previous: any; next: any }, useNext: boolean) {
    const val = useNext ? meta.next : meta.previous;
    switch (meta.key) {
      case 'currentTool':
      case 'brushSize':
      case 'brushColor':
      case 'eraserStrength':
      case 'eraserSize':
        this.tools.applyMeta(meta.key as ToolMetaKey, val);
        break;
      case 'layersSnapshot':
        if (val && typeof val === 'object') {
          const layers = (val.layers as LayerItem[]) || [];
          const buffers = (val.buffers as Record<string, string[]>) || {};
          this.layerService.layers.set(layers.map((l) => ({ ...l })));
          const newBuffers = new Map<string, string[]>();
          for (const k of Object.keys(buffers)) {
            newBuffers.set(k, (buffers[k] || []).slice());
          }
          this.canvasState.replaceAllBuffers(newBuffers);
          this.layerService.ensureValidSelection();
          this.canvasState.incrementPixelsVersion();
        }
        break;
      case 'canvasSnapshot':
        if (val && typeof val === 'object') {
          const w = Number(val.width) || this.canvasState.canvasWidth();
          const h = Number(val.height) || this.canvasState.canvasHeight();
          this.canvasState.canvasWidth.set(w);
          this.canvasState.canvasHeight.set(h);
          if (val.buffers && typeof val.buffers === 'object') {
            const newBuffers = new Map<string, string[]>();
            for (const k of Object.keys(val.buffers)) {
              newBuffers.set(k, (val.buffers[k] || []).slice());
            }
            this.canvasState.replaceAllBuffers(newBuffers);
            this.canvasState.incrementPixelsVersion();
          } else {
            for (const l of this.layerService.layers())
              this.canvasState.ensureLayerBuffer(l.id, w, h);
          }
        }
        break;
      case 'selectionSnapshot':
        this.selectionService.restoreSelection(val);
        break;
      default:
        try {
        } catch {}
    }
  }

  canUndo(): boolean {
    return this.historyService.canUndo();
  }

  canRedo(): boolean {
    return this.historyService.canRedo();
  }

  undo() {
    if (!this.canUndo()) return false;
    const entry = this.historyService.popUndo();
    if (!entry) return false;
    if (entry.pixelChanges) {
      for (const ch of entry.pixelChanges) {
        const buf = this.canvasState.getLayerBuffer(ch.layerId);
        if (!buf || buf.length === 0) continue;
        for (let i = 0; i < ch.indices.length; i++) {
          buf[ch.indices[i]] = ch.previous[i];
        }
      }
    }
    if (entry.metaChanges) {
      for (const m of entry.metaChanges) {
        this.applyMetaChange(m, false);
      }
    }
    this.canvasState.incrementPixelsVersion();
    this.canvasState.setCanvasSaved(false);
    return true;
  }

  redo() {
    if (!this.canRedo()) return false;
    const entry = this.historyService.popRedo();
    if (!entry) return false;
    if (entry.pixelChanges) {
      for (const ch of entry.pixelChanges) {
        const buf = this.canvasState.getLayerBuffer(ch.layerId);
        if (!buf || buf.length === 0) continue;
        for (let i = 0; i < ch.indices.length; i++) {
          buf[ch.indices[i]] = ch.next[i];
        }
      }
    }
    if (entry.metaChanges) {
      for (const m of entry.metaChanges) {
        this.applyMetaChange(m, true);
      }
    }
    this.canvasState.incrementPixelsVersion();
    this.canvasState.setCanvasSaved(false);
    return true;
  }

  clearHistory() {
    this.historyService.clearHistory();
  }

  addFrame(): FrameItem {
    const layers = this.layerService.layers();
    const buffers: Record<string, string[]> = {};
    for (const [id, buf] of this.canvasState.getAllBuffers().entries()) {
      buffers[id] = buf.slice();
    }
    return this.frameService.addFrame(undefined, layers, buffers);
  }

  removeFrame(id: string): boolean {
    return this.frameService.removeFrame(id);
  }

  duplicateFrame(id: string): FrameItem | null {
    return this.frameService.duplicateFrame(id);
  }

  updateFrameDuration(id: string, duration: number): boolean {
    return this.frameService.updateFrameDuration(id, duration);
  }

  saveCurrentFrameState() {
    const currentFrame = this.frames()[this.currentFrameIndex()];
    if (!currentFrame) return;
    this.saveFrameStateById(currentFrame.id);
  }

  private saveFrameStateById(frameId: string) {
    const layers = this.layerService.layers();
    const buffers: Record<string, string[]> = {};
    for (const [id, buf] of this.canvasState.getAllBuffers().entries()) {
      buffers[id] = buf.slice();
    }
    
    this.frameService.saveFrameState(frameId, layers, buffers);
  }

  loadFrameState(frameIndex: number) {
    const frame = this.frames()[frameIndex];
    if (!frame) return;

    if (frame.layers && frame.buffers) {
      this.layerService.layers.set(structuredClone(frame.layers));
      
      const newBuffers = new Map<string, string[]>();
      for (const [key, value] of Object.entries(frame.buffers)) {
        newBuffers.set(key, [...value]);
      }
      this.canvasState.replaceAllBuffers(newBuffers);
      this.layerService.ensureValidSelection();
      this.canvasState.incrementPixelsVersion();
    }

    this.frameService.setCurrentFrame(frameIndex);
  }

  playAnimation() {
    this.animationService.play();
  }

  stopAnimation() {
    this.animationService.stop();
  }

  setAnimationFps(fps: number) {
    this.animationService.setFps(fps);
  }

  setCanvasSaved(saved: boolean) {
    this.canvasState.setCanvasSaved(saved);
  }
}
