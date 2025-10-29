import { Injectable, signal } from '@angular/core';
import {
  FillToolMode,
  FillToolSnapshot,
  ToolDefinition,
  ToolHistoryAdapter,
  ToolMetaKey,
  ToolService,
} from './tool.types';

@Injectable({ providedIn: 'root' })
export class FillToolService implements ToolService<FillToolSnapshot> {
  readonly definition: ToolDefinition = {
    id: 'fill',
    name: 'Fill',
    labelKey: 'tools.fill',
    icon: 'bootstrapDroplet',
  };

  readonly color = signal<string>('#000000');
  readonly mode = signal<FillToolMode>('color');

  private historyAdapter?: ToolHistoryAdapter;

  connectHistory(adapter: ToolHistoryAdapter) {
    this.historyAdapter = adapter;
  }

  setColor(color: string) {
    if (typeof color !== 'string' || !color.length) return;
    const prev = this.color();
    if (prev === color) return;
    this.historyAdapter?.('fillColor', prev, color);
    this.color.set(color);
  }

  setMode(mode: FillToolMode) {
    if (mode !== 'color' && mode !== 'erase') return;
    const prev = this.mode();
    if (prev === mode) return;
    this.historyAdapter?.('fillMode', prev, mode);
    this.mode.set(mode);
  }

  snapshot(): FillToolSnapshot {
    return {
      color: this.color(),
      mode: this.mode(),
    };
  }

  restore(snapshot: Partial<FillToolSnapshot> | undefined): void {
    if (!snapshot) return;
    if (typeof snapshot.color === 'string' && snapshot.color.length) {
      this.color.set(snapshot.color);
    }
    if (snapshot.mode === 'color' || snapshot.mode === 'erase') {
      this.mode.set(snapshot.mode);
    }
  }

  applyMeta(key: ToolMetaKey, value: unknown): boolean {
    if (key === 'fillColor' && typeof value === 'string' && value.length) {
      this.color.set(value);
      return true;
    }
    if (key === 'fillMode' && (value === 'color' || value === 'erase')) {
      this.mode.set(value);
      return true;
    }
    return false;
  }
}
