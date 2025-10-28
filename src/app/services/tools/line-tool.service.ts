import { Injectable, signal } from '@angular/core';
import {
  LineToolSnapshot,
  ToolDefinition,
  ToolHistoryAdapter,
  ToolMetaKey,
  ToolRestoreContext,
  ToolService,
} from './tool.types';

@Injectable({ providedIn: 'root' })
export class LineToolService implements ToolService<LineToolSnapshot> {
  readonly definition: ToolDefinition = {
    id: 'line',
    name: 'Line',
    labelKey: 'tools.line',
    icon: 'bootstrapVectorPen',
  };

  readonly thickness = signal<number>(1);
  readonly color = signal<string>('#000000');

  private historyAdapter?: ToolHistoryAdapter;

  connectHistory(adapter: ToolHistoryAdapter) {
    this.historyAdapter = adapter;
  }

  setThickness(value: number, max?: number) {
    const limit = max && max > 0 ? max : Number.MAX_SAFE_INTEGER;
    const next = Math.max(1, Math.min(Math.floor(value), limit));
    const prev = this.thickness();
    if (prev === next) return;
    this.historyAdapter?.('lineThickness', prev, next);
    this.thickness.set(next);
  }

  setColor(color: string) {
    if (typeof color !== 'string' || !color.length) return;
    const prev = this.color();
    if (prev === color) return;
    this.historyAdapter?.('lineColor', prev, color);
    this.color.set(color);
  }

  snapshot(): LineToolSnapshot {
    return {
      thickness: this.thickness(),
      color: this.color(),
    };
  }

  restore(snapshot: Partial<LineToolSnapshot> | undefined, context?: ToolRestoreContext) {
    if (!snapshot) return;
    const limit =
      context?.maxBrush && context.maxBrush > 0 ? context.maxBrush : Number.MAX_SAFE_INTEGER;
    if (typeof snapshot.thickness === 'number') {
      const next = Math.max(1, Math.min(Math.floor(snapshot.thickness), limit));
      this.thickness.set(next);
    }
    if (typeof snapshot.color === 'string' && snapshot.color.length) {
      this.color.set(snapshot.color);
    }
  }

  applyMeta(key: ToolMetaKey, value: unknown): boolean {
    if (key === 'lineThickness' && typeof value === 'number') {
      this.thickness.set(Math.max(1, Math.floor(value)));
      return true;
    }
    if (key === 'lineColor' && typeof value === 'string' && value.length) {
      this.color.set(value);
      return true;
    }
    return false;
  }
}
