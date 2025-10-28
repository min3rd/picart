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
  readonly lineThickness = this.lineTool.thickness.asReadonly();
  readonly lineColor = this.lineTool.color.asReadonly();
  readonly circleStrokeThickness = this.circleTool.strokeThickness.asReadonly();
  readonly circleStrokeColor = this.circleTool.strokeColor.asReadonly();
  readonly circleFillMode = this.circleTool.fillMode.asReadonly();
  readonly circleFillColor = this.circleTool.fillColor.asReadonly();
  readonly circleGradientStartColor = this.circleTool.gradientStartColor.asReadonly();
  readonly circleGradientEndColor = this.circleTool.gradientEndColor.asReadonly();
  readonly squareStrokeThickness = this.squareTool.strokeThickness.asReadonly();
  readonly squareStrokeColor = this.squareTool.strokeColor.asReadonly();
  readonly squareFillMode = this.squareTool.fillMode.asReadonly();
  readonly squareFillColor = this.squareTool.fillColor.asReadonly();
  readonly squareGradientStartColor = this.squareTool.gradientStartColor.asReadonly();
  readonly squareGradientEndColor = this.squareTool.gradientEndColor.asReadonly();

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

  setLineThickness(value: number, max?: number) {
    this.lineTool.setThickness(value, max);
    this.saveToStorage();
  }

  setLineColor(color: string) {
    this.lineTool.setColor(color);
    this.saveToStorage();
  }

  setCircleStrokeThickness(value: number, max?: number) {
    this.circleTool.setStrokeThickness(value, max);
    this.saveToStorage();
  }

  setCircleStrokeColor(color: string) {
    this.circleTool.setStrokeColor(color);
    this.saveToStorage();
  }

  setCircleFillMode(mode: 'solid' | 'gradient') {
    this.circleTool.setFillMode(mode);
    this.saveToStorage();
  }

  setCircleFillColor(color: string) {
    this.circleTool.setFillColor(color);
    this.saveToStorage();
  }

  setCircleGradientStartColor(color: string) {
    this.circleTool.setGradientStartColor(color);
    this.saveToStorage();
  }

  setCircleGradientEndColor(color: string) {
    this.circleTool.setGradientEndColor(color);
    this.saveToStorage();
  }

  setSquareStrokeThickness(value: number, max?: number) {
    this.squareTool.setStrokeThickness(value, max);
    this.saveToStorage();
  }

  setSquareStrokeColor(color: string) {
    this.squareTool.setStrokeColor(color);
    this.saveToStorage();
  }

  setSquareFillMode(mode: 'solid' | 'gradient') {
    this.squareTool.setFillMode(mode);
    this.saveToStorage();
  }

  setSquareFillColor(color: string) {
    this.squareTool.setFillColor(color);
    this.saveToStorage();
  }

  setSquareGradientStartColor(color: string) {
    this.squareTool.setGradientStartColor(color);
    this.saveToStorage();
  }

  setSquareGradientEndColor(color: string) {
    this.squareTool.setGradientEndColor(color);
    this.saveToStorage();
  }

  applySnapshot(snapshot: Partial<ToolSnapshot>, context?: ToolRestoreContext) {
    if (!snapshot) return;
    if (snapshot.currentTool && this.hasTool(snapshot.currentTool)) {
      this.currentTool.set(snapshot.currentTool);
    }
    this.brushTool.restore(snapshot.brush, context);
    this.eraserTool.restore(snapshot.eraser, context);
    this.lineTool.restore(snapshot.line, context);
    this.circleTool.restore(snapshot.circle);
    this.squareTool.restore(snapshot.square);
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

    const handled =
      (this.brushTool.applyMeta?.(key, value) ?? false) ||
      (this.eraserTool.applyMeta?.(key, value) ?? false) ||
      (this.lineTool.applyMeta?.(key, value) ?? false) ||
      (this.circleTool.applyMeta?.(key, value) ?? false) ||
      (this.squareTool.applyMeta?.(key, value) ?? false);

    if (handled) {
      this.saveToStorage();
    }
  }

  snapshot(): ToolSnapshot {
    return {
      currentTool: this.currentTool(),
      brush: this.brushTool.snapshot(),
      eraser: this.eraserTool.snapshot(),
      line: this.lineTool.snapshot(),
      circle: this.circleTool.snapshot(),
      square: this.squareTool.snapshot(),
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
        lineThickness: this.lineTool.thickness(),
        lineColor: this.lineTool.color(),
        circleStrokeThickness: this.circleTool.strokeThickness(),
        circleStrokeColor: this.circleTool.strokeColor(),
        circleFillMode: this.circleTool.fillMode(),
        circleFillColor: this.circleTool.fillColor(),
        circleGradientStartColor: this.circleTool.gradientStartColor(),
        circleGradientEndColor: this.circleTool.gradientEndColor(),
        squareStrokeThickness: this.squareTool.strokeThickness(),
        squareStrokeColor: this.squareTool.strokeColor(),
        squareFillMode: this.squareTool.fillMode(),
        squareFillColor: this.squareTool.fillColor(),
        squareGradientStartColor: this.squareTool.gradientStartColor(),
        squareGradientEndColor: this.squareTool.gradientEndColor(),
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
        lineThickness: number;
        lineColor: string;
        circleStrokeThickness: number;
        circleStrokeColor: string;
        circleFillMode: 'solid' | 'gradient';
        circleFillColor: string;
        circleGradientStartColor: string;
        circleGradientEndColor: string;
        squareStrokeThickness: number;
        squareStrokeColor: string;
        squareFillMode: 'solid' | 'gradient';
        squareFillColor: string;
        squareGradientStartColor: string;
        squareGradientEndColor: string;
        circleColor: string;
        squareColor: string;
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
      const lineSnapshot: Partial<ToolSnapshot['line']> = {};
      if (typeof parsed.lineThickness === 'number') {
        lineSnapshot.thickness = parsed.lineThickness;
      }
      if (typeof parsed.lineColor === 'string' && parsed.lineColor.length) {
        lineSnapshot.color = parsed.lineColor;
      }
      const circleSnapshot: Partial<ToolSnapshot['circle']> = {};
      if (typeof parsed.circleStrokeThickness === 'number') {
        circleSnapshot.strokeThickness = parsed.circleStrokeThickness;
      }
      if (typeof parsed.circleStrokeColor === 'string' && parsed.circleStrokeColor.length) {
        circleSnapshot.strokeColor = parsed.circleStrokeColor;
      }
      if (parsed.circleFillMode === 'solid' || parsed.circleFillMode === 'gradient') {
        circleSnapshot.fillMode = parsed.circleFillMode;
      }
      if (typeof parsed.circleFillColor === 'string' && parsed.circleFillColor.length) {
        circleSnapshot.fillColor = parsed.circleFillColor;
      }
      if (typeof parsed.circleGradientStartColor === 'string' && parsed.circleGradientStartColor.length) {
        circleSnapshot.gradientStartColor = parsed.circleGradientStartColor;
      }
      if (typeof parsed.circleGradientEndColor === 'string' && parsed.circleGradientEndColor.length) {
        circleSnapshot.gradientEndColor = parsed.circleGradientEndColor;
      }
      if (!circleSnapshot.fillColor && typeof parsed.circleColor === 'string' && parsed.circleColor.length) {
        circleSnapshot.fillColor = parsed.circleColor;
      }
      const squareSnapshot: Partial<ToolSnapshot['square']> = {};
      if (typeof parsed.squareStrokeThickness === 'number') {
        squareSnapshot.strokeThickness = parsed.squareStrokeThickness;
      }
      if (typeof parsed.squareStrokeColor === 'string' && parsed.squareStrokeColor.length) {
        squareSnapshot.strokeColor = parsed.squareStrokeColor;
      }
      if (parsed.squareFillMode === 'solid' || parsed.squareFillMode === 'gradient') {
        squareSnapshot.fillMode = parsed.squareFillMode;
      }
      if (typeof parsed.squareFillColor === 'string' && parsed.squareFillColor.length) {
        squareSnapshot.fillColor = parsed.squareFillColor;
      }
      if (typeof parsed.squareGradientStartColor === 'string' && parsed.squareGradientStartColor.length) {
        squareSnapshot.gradientStartColor = parsed.squareGradientStartColor;
      }
      if (typeof parsed.squareGradientEndColor === 'string' && parsed.squareGradientEndColor.length) {
        squareSnapshot.gradientEndColor = parsed.squareGradientEndColor;
      }
      if (!squareSnapshot.fillColor && typeof parsed.squareColor === 'string' && parsed.squareColor.length) {
        squareSnapshot.fillColor = parsed.squareColor;
      }
      this.brushTool.restore(brushSnapshot);
      this.eraserTool.restore(eraserSnapshot);
      this.lineTool.restore(lineSnapshot);
      this.circleTool.restore(circleSnapshot);
      this.squareTool.restore(squareSnapshot);
    } catch {}
  }
}
