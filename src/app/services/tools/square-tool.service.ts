import { Injectable, signal } from '@angular/core';
import {
  ShapeFillMode,
  SquareToolSnapshot,
  ToolDefinition,
  ToolHistoryAdapter,
  ToolMetaKey,
  ToolService,
} from './tool.types';

@Injectable({ providedIn: 'root' })
export class SquareToolService implements ToolService<SquareToolSnapshot> {
  readonly definition: ToolDefinition = {
    id: 'square',
    name: 'Square',
    labelKey: 'tools.square',
    icon: 'bootstrapSquare',
  };

  readonly strokeThickness = signal<number>(1);
  readonly strokeColor = signal<string>('#000000');
  readonly fillMode = signal<ShapeFillMode>('solid');
  readonly fillColor = signal<string>('#000000');
  readonly gradientStartColor = signal<string>('#000000');
  readonly gradientEndColor = signal<string>('#ffffff');

  private historyAdapter?: ToolHistoryAdapter;

  connectHistory(adapter: ToolHistoryAdapter) {
    this.historyAdapter = adapter;
  }

  setStrokeThickness(value: number, max?: number) {
    const limit = max && max > 0 ? max : Number.MAX_SAFE_INTEGER;
    const next = Math.max(0, Math.min(Math.floor(value), limit));
    const prev = this.strokeThickness();
    if (prev === next) return;
    this.historyAdapter?.('squareStrokeThickness', prev, next);
    this.strokeThickness.set(next);
  }

  setStrokeColor(color: string) {
    if (typeof color !== 'string' || !color.length) return;
    const prev = this.strokeColor();
    if (prev === color) return;
    this.historyAdapter?.('squareStrokeColor', prev, color);
    this.strokeColor.set(color);
  }

  setFillMode(mode: ShapeFillMode) {
    if (mode !== 'solid' && mode !== 'gradient') return;
    const prev = this.fillMode();
    if (prev === mode) return;
    this.historyAdapter?.('squareFillMode', prev, mode);
    this.fillMode.set(mode);
  }

  setFillColor(color: string) {
    if (typeof color !== 'string' || !color.length) return;
    const prev = this.fillColor();
    if (prev === color) return;
    this.historyAdapter?.('squareFillColor', prev, color);
    this.fillColor.set(color);
  }

  setGradientStartColor(color: string) {
    if (typeof color !== 'string' || !color.length) return;
    const prev = this.gradientStartColor();
    if (prev === color) return;
    this.historyAdapter?.('squareGradientStart', prev, color);
    this.gradientStartColor.set(color);
  }

  setGradientEndColor(color: string) {
    if (typeof color !== 'string' || !color.length) return;
    const prev = this.gradientEndColor();
    if (prev === color) return;
    this.historyAdapter?.('squareGradientEnd', prev, color);
    this.gradientEndColor.set(color);
  }

  snapshot(): SquareToolSnapshot {
    return {
      strokeThickness: this.strokeThickness(),
      strokeColor: this.strokeColor(),
      fillMode: this.fillMode(),
      fillColor: this.fillColor(),
      gradientStartColor: this.gradientStartColor(),
      gradientEndColor: this.gradientEndColor(),
    };
  }

  restore(snapshot: Partial<SquareToolSnapshot> | undefined) {
    if (!snapshot) return;
    if (typeof snapshot.strokeThickness === 'number') {
      this.strokeThickness.set(Math.max(0, Math.floor(snapshot.strokeThickness)));
    }
    if (typeof snapshot.strokeColor === 'string' && snapshot.strokeColor.length) {
      this.strokeColor.set(snapshot.strokeColor);
    }
    if (snapshot.fillMode === 'solid' || snapshot.fillMode === 'gradient') {
      this.fillMode.set(snapshot.fillMode);
    }
    if (typeof snapshot.fillColor === 'string' && snapshot.fillColor.length) {
      this.fillColor.set(snapshot.fillColor);
    }
    if (typeof snapshot.gradientStartColor === 'string' && snapshot.gradientStartColor.length) {
      this.gradientStartColor.set(snapshot.gradientStartColor);
    }
    if (typeof snapshot.gradientEndColor === 'string' && snapshot.gradientEndColor.length) {
      this.gradientEndColor.set(snapshot.gradientEndColor);
    }
  }

  applyMeta(key: ToolMetaKey, value: unknown): boolean {
    if (key === 'squareStrokeThickness' && typeof value === 'number') {
      this.strokeThickness.set(Math.max(0, Math.floor(value)));
      return true;
    }
    if (key === 'squareStrokeColor' && typeof value === 'string' && value.length) {
      this.strokeColor.set(value);
      return true;
    }
    if (key === 'squareFillMode' && (value === 'solid' || value === 'gradient')) {
      this.fillMode.set(value);
      return true;
    }
    if (key === 'squareFillColor' && typeof value === 'string' && value.length) {
      this.fillColor.set(value);
      return true;
    }
    if (key === 'squareGradientStart' && typeof value === 'string' && value.length) {
      this.gradientStartColor.set(value);
      return true;
    }
    if (key === 'squareGradientEnd' && typeof value === 'string' && value.length) {
      this.gradientEndColor.set(value);
      return true;
    }
    return false;
  }
}
