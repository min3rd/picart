export type ToolId =
  | 'select-layer'
  | 'rect-select'
  | 'ellipse-select'
  | 'lasso-select'
  | 'eyedropper'
  | 'fill'
  | 'brush'
  | 'eraser'
  | 'line'
  | 'circle'
  | 'square';

export interface ToolDefinition {
  id: ToolId;
  name: string;
  labelKey: string;
  icon: string;
}

export type ToolMetaKey =
  | 'currentTool'
  | 'brushSize'
  | 'brushColor'
  | 'eraserStrength'
  | 'eraserSize';

export interface ToolRestoreContext {
  maxBrush?: number;
}

export type ToolHistoryAdapter = (key: ToolMetaKey, previous: unknown, next: unknown) => void;

export interface ToolService<TSnapshot = unknown> {
  readonly definition: ToolDefinition;
  snapshot(): TSnapshot | undefined;
  restore(snapshot: Partial<TSnapshot> | undefined, context?: ToolRestoreContext): void;
  connectHistory?(adapter: ToolHistoryAdapter): void;
  applyMeta?(key: ToolMetaKey, value: unknown): boolean;
}

export interface BrushToolSnapshot {
  size: number;
  color: string;
}

export interface EraserToolSnapshot {
  size: number;
  strength: number;
}

export interface ToolSnapshot {
  currentTool: ToolId;
  brush: BrushToolSnapshot;
  eraser: EraserToolSnapshot;
}
