import { Injectable, inject, signal } from '@angular/core';
import {
  ToolDefinition,
  ToolHistoryAdapter,
  ToolId,
  ToolMetaKey,
  ToolRestoreContext,
  ToolService,
  ToolSnapshot,
} from './tools/tool.types';
import { BrushToolService } from './tools/brush-tool.service';
import { CircleToolService } from './tools/circle-tool.service';
import { EllipseSelectToolService } from './tools/ellipse-select-tool.service';
import { EraserToolService } from './tools/eraser-tool.service';
import { EyedropperToolService } from './tools/eyedropper-tool.service';
import { FillToolService } from './tools/fill-tool.service';
import { LassoSelectToolService } from './tools/lasso-select-tool.service';
import { LineToolService } from './tools/line-tool.service';
import { RectSelectToolService } from './tools/rect-select-tool.service';
import { SelectLayerToolService } from './tools/select-layer-tool.service';
import { SquareToolService } from './tools/square-tool.service';

@Injectable({ providedIn: 'root' })
export class EditorToolsService {
  private readonly STORAGE_KEY = 'picart.editor.settings.v1';
  private historyAdapter?: ToolHistoryAdapter;

  private readonly selectLayerTool = inject(SelectLayerToolService);
  private readonly rectSelectTool = inject(RectSelectToolService);
  private readonly ellipseSelectTool = inject(EllipseSelectToolService);
  private readonly lassoSelectTool = inject(LassoSelectToolService);
  private readonly eyedropperTool = inject(EyedropperToolService);
  private readonly fillTool = inject(FillToolService);
  private readonly brushTool = inject(BrushToolService);
  private readonly eraserTool = inject(EraserToolService);
  private readonly lineTool = inject(LineToolService);
  private readonly circleTool = inject(CircleToolService);
  private readonly squareTool = inject(SquareToolService);

  private readonly toolRegistry = new Map<ToolId, ToolService>([
    ['select-layer', this.selectLayerTool],
    ['rect-select', this.rectSelectTool],
    ['ellipse-select', this.ellipseSelectTool],
    ['lasso-select', this.lassoSelectTool],
    ['eyedropper', this.eyedropperTool],
    ['fill', this.fillTool],
    ['brush', this.brushTool],
    ['eraser', this.eraserTool],
    ['line', this.lineTool],
    ['circle', this.circleTool],
    ['square', this.squareTool],
  ]);

  readonly tools = signal<ToolDefinition[]>(
    Array.from(this.toolRegistry.values()).map((service) => service.definition),
  );

  readonly currentTool = signal<ToolId>('select-layer');
  readonly brushSize = this.brushTool.size.asReadonly();
  readonly brushColor = this.brushTool.color.asReadonly();
  readonly eraserSize = this.eraserTool.size.asReadonly();
  readonly eraserStrength = this.eraserTool.strength.asReadonly();

  constructor() {
    this.loadFromStorage();
  }

  private hasTool(id: ToolId): boolean {
    return this.toolRegistry.has(id);
  }

  registerHistoryAdapter(adapter: ToolHistoryAdapter) {
    this.historyAdapter = adapter;
    for (const service of this.toolRegistry.values()) {
      service.connectHistory?.(adapter);
    }
  }

  selectTool(id: ToolId) {
    if (!this.hasTool(id)) return;
    const prev = this.currentTool();
    if (prev === id) return;
    this.historyAdapter?.('currentTool', prev, id);
    this.currentTool.set(id);
    this.saveToStorage();
  }

  setBrushSize(size: number, max?: number) {
    this.brushTool.setSize(size, max);
    this.saveToStorage();
  }

  setBrushColor(color: string) {
    this.brushTool.setColor(color);
    this.saveToStorage();
  }

  setEraserSize(size: number, max?: number) {
    this.eraserTool.setSize(size, max);
    this.saveToStorage();
  }

  setEraserStrength(strength: number) {
    this.eraserTool.setStrength(strength);
    this.saveToStorage();
  }

  applySnapshot(snapshot: Partial<ToolSnapshot>, context?: ToolRestoreContext) {
    if (!snapshot) return;
    if (snapshot.currentTool && this.hasTool(snapshot.currentTool)) {
      this.currentTool.set(snapshot.currentTool);
    }
    this.brushTool.restore(snapshot.brush, context);
    this.eraserTool.restore(snapshot.eraser, context);
    this.saveToStorage();
  }

  applyMeta(key: ToolMetaKey, value: unknown) {
    if (key === 'currentTool') {
      if (typeof value === 'string' && this.hasTool(value as ToolId)) {
        this.currentTool.set(value as ToolId);
        this.saveToStorage();
      }
      return;
    }

    const brushHandled = this.brushTool.applyMeta?.(key, value) ?? false;
    const eraserHandled = this.eraserTool.applyMeta?.(key, value) ?? false;

    if (brushHandled || eraserHandled) {
      this.saveToStorage();
    }
  }

  snapshot(): ToolSnapshot {
    return {
      currentTool: this.currentTool(),
      brush: this.brushTool.snapshot(),
      eraser: this.eraserTool.snapshot(),
    };
  }

  private saveToStorage() {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      const data = {
        currentTool: this.currentTool(),
        brushSize: this.brushTool.size(),
        brushColor: this.brushTool.color(),
        eraserStrength: this.eraserTool.strength(),
        eraserSize: this.eraserTool.size(),
      } as const;
      window.localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    } catch {}
  }

  private loadFromStorage() {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      const raw = window.localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<{
        currentTool: ToolId;
        brushSize: number;
        brushColor: string;
        eraserStrength: number;
        eraserSize: number;
      }> | null;
      if (!parsed) return;
      if (parsed.currentTool && this.hasTool(parsed.currentTool)) {
        this.currentTool.set(parsed.currentTool);
      }
      const brushSnapshot: Partial<ToolSnapshot['brush']> = {};
      if (typeof parsed.brushSize === 'number') {
        brushSnapshot.size = parsed.brushSize;
      }
      if (typeof parsed.brushColor === 'string') {
        brushSnapshot.color = parsed.brushColor;
      }
      const eraserSnapshot: Partial<ToolSnapshot['eraser']> = {};
      if (typeof parsed.eraserSize === 'number') {
        eraserSnapshot.size = parsed.eraserSize;
      }
      if (typeof parsed.eraserStrength === 'number') {
        eraserSnapshot.strength = parsed.eraserStrength;
      }
      this.brushTool.restore(brushSnapshot);
      this.eraserTool.restore(eraserSnapshot);
    } catch {}
  }
}
