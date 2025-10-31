import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { EditorToolsService } from '../editor-tools.service';
import { ToolSnapshot } from '../tools/tool.types';
import { EditorCanvasStateService } from './editor-canvas-state.service';
import { EditorFrameService } from './editor-frame.service';
import { EditorLayerService } from './editor-layer.service';
import { EditorSelectionService } from './editor-selection.service';
import { EditorAnimationService } from './editor-animation.service';
import { EditorBoneService } from './editor-bone.service';
import { FrameItem, LayerTreeItem, AnimationItem, BoneItem } from './editor.types';

@Injectable({ providedIn: 'root' })
export class EditorProjectService {
  private readonly PROJECT_STORAGE_KEY = 'pixart.project.local.v1';
  private readonly canvasState = inject(EditorCanvasStateService);
  private readonly layerService = inject(EditorLayerService);
  private readonly frameService = inject(EditorFrameService);
  private readonly selectionService = inject(EditorSelectionService);
  private readonly tools = inject(EditorToolsService);
  private readonly animationService = inject(EditorAnimationService);
  private readonly boneService = inject(EditorBoneService);

  loadProjectFromLocalStorage(): Observable<boolean> {
    try {
      if (typeof window === 'undefined' || !window.localStorage)
        return of(false);
      const raw = window.localStorage.getItem(this.PROJECT_STORAGE_KEY);
      if (!raw) return of(false);
      const parsed = JSON.parse(raw) as any;
      if (!parsed) return of(false);
      return of(this.restoreProjectSnapshot(parsed));
    } catch (e) {
      try {
        console.warn('Failed to load project from localStorage', e);
      } catch {}
      return of(false);
    }
  }

  exportProjectSnapshot() {
    const now = new Date().toISOString();
    const layers = this.layerService.layers().map((l) => ({ ...l }));
    const buffers: Record<string, string[]> = {};
    for (const [id, buf] of this.canvasState.getAllBuffers().entries()) {
      buffers[id] = buf.slice();
    }
    const toolSnapshot = this.tools.snapshot();
    return {
      id: `local_${Date.now()}`,
      name: `Local Project ${new Date().toISOString()}`,
      created: now,
      modified: now,
      canvas: {
        width: this.canvasState.canvasWidth(),
        height: this.canvasState.canvasHeight(),
      },
      layers,
      layerBuffers: buffers,
      selectedLayerId: this.layerService.selectedLayerId(),
      currentTool: toolSnapshot.currentTool,
      brush: toolSnapshot.brush,
      eraser: toolSnapshot.eraser,
      line: toolSnapshot.line,
      circle: toolSnapshot.circle,
      square: toolSnapshot.square,
      selection: this.selectionService.selectionRect(),
      selectionPolygon: this.selectionService.selectionPolygon(),
      frames: this.frameService.frames(),
      animations: this.animationService.animations(),
      bones: this.boneService.bones(),
    } as const;
  }

  restoreProjectSnapshot(parsed: any): boolean {
    if (!parsed || typeof parsed !== 'object') return false;
    try {
      const canvas = parsed.canvas || {};
      const w = Number(canvas.width) || this.canvasState.canvasWidth();
      const h = Number(canvas.height) || this.canvasState.canvasHeight();
      this.canvasState.canvasWidth.set(Math.max(1, Math.floor(w)));
      this.canvasState.canvasHeight.set(Math.max(1, Math.floor(h)));

      if (
        parsed.layers &&
        Array.isArray(parsed.layers) &&
        parsed.layers.length > 0
      ) {
        const layers = (parsed.layers as any[]).map((l) => ({
          id: l.id,
          name: l.name,
          visible: !!l.visible,
          locked: !!l.locked,
          type: l.type || 'layer',
          ...(l.type === 'group'
            ? { expanded: !!l.expanded, children: l.children || [] }
            : {}),
        })) as LayerTreeItem[];
        this.layerService.layers.set(layers);
      }

      const newBuffers = new Map<string, string[]>();
      if (parsed.layerBuffers && typeof parsed.layerBuffers === 'object') {
        for (const k of Object.keys(parsed.layerBuffers)) {
          const buf = parsed.layerBuffers[k];
          if (Array.isArray(buf)) {
            const need =
              Math.max(1, this.canvasState.canvasWidth()) *
              Math.max(1, this.canvasState.canvasHeight());
            const next = new Array<string>(need).fill('');
            for (let i = 0; i < Math.min(buf.length, need); i++)
              next[i] = buf[i] || '';
            newBuffers.set(k, next);
          }
        }
      }
      this.canvasState.replaceAllBuffers(newBuffers);
      for (const l of this.layerService.layers()) {
        if (!this.canvasState.getLayerBuffer(l.id).length)
          this.canvasState.ensureLayerBuffer(
            l.id,
            this.canvasState.canvasWidth(),
            this.canvasState.canvasHeight(),
          );
      }

      if (
        parsed.selectedLayerId &&
        typeof parsed.selectedLayerId === 'string'
      ) {
        const exists = this.layerService
          .layers()
          .some((x) => x.id === parsed.selectedLayerId);
        if (exists) {
          this.layerService.selectedLayerId.set(parsed.selectedLayerId);
          this.layerService.selectedLayerIds.set(
            new Set([parsed.selectedLayerId]),
          );
        }
      }
      this.layerService.ensureValidSelection();

      const maxBrush = Math.max(
        1,
        Math.max(
          this.canvasState.canvasWidth(),
          this.canvasState.canvasHeight(),
        ),
      );
      const toolSnapshot: Partial<ToolSnapshot> = {};
      if (parsed.currentTool && typeof parsed.currentTool === 'string') {
        toolSnapshot.currentTool = parsed.currentTool as any;
      }
      if (parsed.brush && typeof parsed.brush === 'object') {
        const brush: Partial<ToolSnapshot['brush']> = {};
        if (typeof parsed.brush.size === 'number')
          brush.size = parsed.brush.size;
        if (typeof parsed.brush.color === 'string')
          brush.color = parsed.brush.color;
        if (Object.keys(brush).length)
          toolSnapshot.brush = brush as ToolSnapshot['brush'];
      }
      if (parsed.eraser && typeof parsed.eraser === 'object') {
        const eraser: Partial<ToolSnapshot['eraser']> = {};
        if (typeof parsed.eraser.size === 'number')
          eraser.size = parsed.eraser.size;
        if (typeof parsed.eraser.strength === 'number')
          eraser.strength = parsed.eraser.strength;
        if (Object.keys(eraser).length)
          toolSnapshot.eraser = eraser as ToolSnapshot['eraser'];
      }
      const line: Partial<ToolSnapshot['line']> = {};
      if (parsed.line && typeof parsed.line === 'object') {
        if (typeof parsed.line.thickness === 'number')
          line.thickness = parsed.line.thickness;
        if (typeof parsed.line.color === 'string')
          line.color = parsed.line.color;
      }
      if (typeof parsed.lineThickness === 'number')
        line.thickness = parsed.lineThickness;
      if (typeof parsed.lineColor === 'string') line.color = parsed.lineColor;
      if (Object.keys(line).length)
        toolSnapshot.line = line as ToolSnapshot['line'];
      const circle: Partial<ToolSnapshot['circle']> = this.parseShapeOptions(
        parsed,
        'circle',
      );
      if (Object.keys(circle).length)
        toolSnapshot.circle = circle as ToolSnapshot['circle'];
      const square: Partial<ToolSnapshot['square']> = this.parseShapeOptions(
        parsed,
        'square',
      );
      if (Object.keys(square).length)
        toolSnapshot.square = square as ToolSnapshot['square'];
      if (Object.keys(toolSnapshot).length) {
        this.tools.applySnapshot(toolSnapshot, { maxBrush });
      }

      if (parsed.selection) {
        const s = parsed.selection as any;
        if (s && typeof s === 'object' && typeof s.x === 'number') {
          this.selectionService.selectionRect.set({
            x: Math.max(0, Math.floor(s.x)),
            y: Math.max(0, Math.floor(s.y)),
            width: Math.max(0, Math.floor(s.width || 0)),
            height: Math.max(0, Math.floor(s.height || 0)),
          });
        }
      }
      if (parsed.selectionPolygon && Array.isArray(parsed.selectionPolygon)) {
        this.selectionService.selectionPolygon.set(
          (parsed.selectionPolygon as any[]).map((p) => ({
            x: Math.floor(p.x),
            y: Math.floor(p.y),
          })),
        );
        if (this.selectionService.selectionPolygon())
          this.selectionService.selectionShape.set('lasso');
      }

      if (parsed.frames && Array.isArray(parsed.frames))
        this.frameService.frames.set(
          (parsed.frames as any[]).map((f) => ({
            id: f.id,
            name: f.name,
            duration: Number(f.duration) || 100,
          })) as FrameItem[],
        );

      if (parsed.animations && Array.isArray(parsed.animations))
        this.animationService.animations.set(
          (parsed.animations as any[]).map((a) => ({
            id: a.id,
            name: a.name,
            frames: Array.isArray(a.frames)
              ? a.frames.map((f: any) => ({
                  id: f.id,
                  name: f.name,
                  duration: Number(f.duration) || 100,
                }))
              : [],
            boneIds: Array.isArray(a.boneIds) ? a.boneIds : [],
            duration: Number(a.duration) || 100,
          })) as AnimationItem[],
        );

      if (parsed.bones && Array.isArray(parsed.bones))
        this.boneService.bones.set(
          (parsed.bones as any[]).map((b) => ({
            id: b.id,
            name: b.name,
            parentId: b.parentId || null,
            x: Number(b.x) || 0,
            y: Number(b.y) || 0,
            rotation: Number(b.rotation) || 0,
            length: Number(b.length) || 50,
          })) as BoneItem[],
        );

      this.canvasState.layerPixelsVersion.update((v) => v + 1);
      this.canvasState.setCanvasSaved(true);
      return true;
    } catch (e) {
      console.warn('Failed to restore project snapshot', e);
      return false;
    }
  }

  private parseShapeOptions(parsed: any, shapeName: string): any {
    const shape: any = {};
    if (parsed[shapeName] && typeof parsed[shapeName] === 'object') {
      const s = parsed[shapeName];
      if (typeof s.strokeThickness === 'number')
        shape.strokeThickness = s.strokeThickness;
      if (typeof s.strokeColor === 'string')
        shape.strokeColor = s.strokeColor;
      if (s.fillMode === 'solid' || s.fillMode === 'gradient')
        shape.fillMode = s.fillMode;
      if (typeof s.fillColor === 'string') shape.fillColor = s.fillColor;
      if (typeof s.gradientStartColor === 'string')
        shape.gradientStartColor = s.gradientStartColor;
      if (typeof s.gradientEndColor === 'string')
        shape.gradientEndColor = s.gradientEndColor;
      if (s.gradientType === 'linear' || s.gradientType === 'radial')
        shape.gradientType = s.gradientType;
      if (typeof s.gradientAngle === 'number')
        shape.gradientAngle = s.gradientAngle;
    }
    const legacyPrefix = shapeName.charAt(0).toUpperCase() + shapeName.slice(1);
    if (typeof parsed[`${shapeName}StrokeThickness`] === 'number')
      shape.strokeThickness = parsed[`${shapeName}StrokeThickness`];
    if (typeof parsed[`${shapeName}StrokeColor`] === 'string')
      shape.strokeColor = parsed[`${shapeName}StrokeColor`];
    if (
      parsed[`${shapeName}FillMode`] === 'solid' ||
      parsed[`${shapeName}FillMode`] === 'gradient'
    )
      shape.fillMode = parsed[`${shapeName}FillMode`];
    if (typeof parsed[`${shapeName}FillColor`] === 'string')
      shape.fillColor = parsed[`${shapeName}FillColor`];
    if (typeof parsed[`${shapeName}GradientStartColor`] === 'string')
      shape.gradientStartColor = parsed[`${shapeName}GradientStartColor`];
    if (typeof parsed[`${shapeName}GradientEndColor`] === 'string')
      shape.gradientEndColor = parsed[`${shapeName}GradientEndColor`];
    if (
      parsed[`${shapeName}GradientType`] === 'linear' ||
      parsed[`${shapeName}GradientType`] === 'radial'
    )
      shape.gradientType = parsed[`${shapeName}GradientType`];
    if (typeof parsed[`${shapeName}GradientAngle`] === 'number')
      shape.gradientAngle = parsed[`${shapeName}GradientAngle`];
    if (!shape.fillColor && typeof parsed[`${shapeName}Color`] === 'string')
      shape.fillColor = parsed[`${shapeName}Color`];
    return shape;
  }

  saveProjectToLocalStorage(): boolean {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return false;
      const snapshot = this.exportProjectSnapshot();
      window.localStorage.setItem(
        this.PROJECT_STORAGE_KEY,
        JSON.stringify(snapshot),
      );
      this.canvasState.setCanvasSaved(true);
      return true;
    } catch (e) {
      console.error('Failed to save project to localStorage', e);
      return false;
    }
  }
}
