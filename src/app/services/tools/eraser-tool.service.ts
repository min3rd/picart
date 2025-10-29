import { Injectable, signal } from '@angular/core';
import {
  EraserToolSnapshot,
  ToolDefinition,
  ToolHistoryAdapter,
  ToolMetaKey,
  ToolRestoreContext,
  ToolService,
} from './tool.types';

@Injectable({ providedIn: 'root' })
export class EraserToolService implements ToolService<EraserToolSnapshot> {
  readonly definition: ToolDefinition = {
    id: 'eraser',
    name: 'Eraser',
    labelKey: 'tools.eraser',
    icon: 'bootstrapEraser',
  };

  readonly size = signal<number>(1);
  readonly strength = signal<number>(100);

  private historyAdapter?: ToolHistoryAdapter;

  connectHistory(adapter: ToolHistoryAdapter) {
    this.historyAdapter = adapter;
  }

  setSize(size: number, max?: number) {
    const limit = max && max > 0 ? max : Number.MAX_SAFE_INTEGER;
    const next = Math.max(1, Math.min(Math.floor(size), limit));
    const prev = this.size();
    if (prev === next) return;
    this.historyAdapter?.('eraserSize', prev, next);
    this.size.set(next);
  }

  setStrength(strength: number) {
    const next = Math.max(0, Math.min(100, Math.floor(strength)));
    const prev = this.strength();
    if (prev === next) return;
    this.historyAdapter?.('eraserStrength', prev, next);
    this.strength.set(next);
  }

  snapshot(): EraserToolSnapshot {
    return {
      size: this.size(),
      strength: this.strength(),
    };
  }

  restore(
    snapshot: Partial<EraserToolSnapshot> | undefined,
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
    if (typeof snapshot.strength === 'number') {
      const next = Math.max(0, Math.min(100, Math.floor(snapshot.strength)));
      this.strength.set(next);
    }
  }

  applyMeta(key: ToolMetaKey, value: unknown): boolean {
    switch (key) {
      case 'eraserSize':
        if (typeof value === 'number') {
          this.size.set(Math.max(1, Math.floor(value)));
          return true;
        }
        break;
      case 'eraserStrength':
        if (typeof value === 'number') {
          this.strength.set(Math.max(0, Math.min(100, Math.floor(value))));
          return true;
        }
        break;
    }
    return false;
  }
}
