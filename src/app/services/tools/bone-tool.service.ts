import { Injectable, signal } from '@angular/core';
import {
  BoneToolSnapshot,
  ToolDefinition,
  ToolHistoryAdapter,
  ToolMetaKey,
  ToolRestoreContext,
  ToolService,
} from './tool.types';

@Injectable({ providedIn: 'root' })
export class BoneToolService implements ToolService<BoneToolSnapshot> {
  readonly definition: ToolDefinition = {
    id: 'bone',
    name: 'Bone',
    labelKey: 'tools.bone',
    icon: 'heroLink',
  };

  readonly color = signal<string>('#ff6600');
  readonly thickness = signal<number>(2);

  private historyAdapter?: ToolHistoryAdapter;

  connectHistory(adapter: ToolHistoryAdapter) {
    this.historyAdapter = adapter;
  }

  setColor(color: string) {
    if (typeof color !== 'string' || !color.length) return;
    const prev = this.color();
    if (prev === color) return;
    this.historyAdapter?.('boneColor', prev, color);
    this.color.set(color);
  }

  setThickness(value: number, max?: number) {
    const limit = max && max > 0 ? max : Number.MAX_SAFE_INTEGER;
    const next = Math.max(1, Math.min(Math.floor(value), limit));
    const prev = this.thickness();
    if (prev === next) return;
    this.historyAdapter?.('boneThickness', prev, next);
    this.thickness.set(next);
  }

  snapshot(): BoneToolSnapshot {
    return {
      color: this.color(),
      thickness: this.thickness(),
    };
  }

  restore(
    snapshot: Partial<BoneToolSnapshot> | undefined,
    context?: ToolRestoreContext,
  ) {
    if (!snapshot) return;
    const limit =
      context?.maxBrush && context.maxBrush > 0
        ? context.maxBrush
        : Number.MAX_SAFE_INTEGER;
    if (typeof snapshot.thickness === 'number') {
      const next = Math.max(1, Math.min(Math.floor(snapshot.thickness), limit));
      this.thickness.set(next);
    }
    if (typeof snapshot.color === 'string' && snapshot.color.length) {
      this.color.set(snapshot.color);
    }
  }

  applyMeta(key: ToolMetaKey, value: unknown): boolean {
    if (key === 'boneThickness' && typeof value === 'number') {
      this.thickness.set(Math.max(1, Math.floor(value)));
      return true;
    }
    if (key === 'boneColor' && typeof value === 'string' && value.length) {
      this.color.set(value);
      return true;
    }
    return false;
  }
}
