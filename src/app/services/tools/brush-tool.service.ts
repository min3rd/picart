import { Injectable, signal } from '@angular/core';
import {
  BrushToolSnapshot,
  ToolHistoryAdapter,
  ToolMetaKey,
  ToolRestoreContext,
  ToolService,
  ToolDefinition,
} from './tool.types';

@Injectable({ providedIn: 'root' })
export class BrushToolService implements ToolService<BrushToolSnapshot> {
  readonly definition: ToolDefinition = {
    id: 'brush',
    name: 'Brush',
    labelKey: 'tools.brush',
    icon: 'bootstrapBrush',
  };

  readonly size = signal<number>(1);
  readonly color = signal<string>('#000000');

  private historyAdapter?: ToolHistoryAdapter;

  connectHistory(adapter: ToolHistoryAdapter) {
    this.historyAdapter = adapter;
  }

  setSize(size: number, max?: number) {
    const limit = max && max > 0 ? max : Number.MAX_SAFE_INTEGER;
    const next = Math.max(1, Math.min(Math.floor(size), limit));
    const prev = this.size();
    if (prev === next) return;
    this.historyAdapter?.('brushSize', prev, next);
    this.size.set(next);
  }

  setColor(color: string) {
    if (typeof color !== 'string' || !color.length) return;
    const prev = this.color();
    if (prev === color) return;
    this.historyAdapter?.('brushColor', prev, color);
    this.color.set(color);
  }

  snapshot(): BrushToolSnapshot {
    return {
      size: this.size(),
      color: this.color(),
    };
  }

  restore(
    snapshot: Partial<BrushToolSnapshot> | undefined,
    context?: ToolRestoreContext,
  ) {
    if (!snapshot) return;
    const limit =
      context?.maxBrush && context.maxBrush > 0
        ? context.maxBrush
        : Number.MAX_SAFE_INTEGER;
    if (typeof snapshot.size === 'number') {
      const next = Math.max(1, Math.min(Math.floor(snapshot.size), limit));
      this.size.set(next);
    }
    if (typeof snapshot.color === 'string' && snapshot.color.length) {
      this.color.set(snapshot.color);
    }
  }

  applyMeta(key: ToolMetaKey, value: unknown): boolean {
    switch (key) {
      case 'brushSize':
        if (typeof value === 'number') {
          this.size.set(Math.max(1, Math.floor(value)));
          return true;
        }
        break;
      case 'brushColor':
        if (typeof value === 'string' && value.length) {
          this.color.set(value);
          return true;
        }
        break;
    }
    return false;
  }
}
