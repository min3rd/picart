import { Injectable } from '@angular/core';
import { ParsedColor } from './editor.types';

@Injectable({ providedIn: 'root' })
export class EditorColorService {
  private readonly bayer4 = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ];
  private readonly gradientSteps = 8;

  clampByte(value: number): number {
    return Math.max(0, Math.min(255, Math.round(value)));
  }

  clampUnit(value: number): number {
    return Math.max(0, Math.min(1, value));
  }

  parseColor(value: string): ParsedColor & { a: number } {
    if (!value) return { r: 0, g: 0, b: 0, a: 0 };
    const trimmed = value.trim();
    if (trimmed.startsWith('#')) {
      const hex = trimmed.slice(1);
      if (hex.length === 3) {
        const r = Number.parseInt(hex[0] + hex[0], 16);
        const g = Number.parseInt(hex[1] + hex[1], 16);
        const b = Number.parseInt(hex[2] + hex[2], 16);
        return { r, g, b, a: 1 };
      }
      if (hex.length === 6) {
        const r = Number.parseInt(hex.slice(0, 2), 16);
        const g = Number.parseInt(hex.slice(2, 4), 16);
        const b = Number.parseInt(hex.slice(4, 6), 16);
        return { r, g, b, a: 1 };
      }
    }
    const match = trimmed.match(/^rgba?\((.+)\)$/i);
    if (match) {
      const parts = match[1].split(',').map((p) => p.trim());
      if (parts.length >= 3) {
        const r = Number.parseFloat(parts[0]);
        const g = Number.parseFloat(parts[1]);
        const b = Number.parseFloat(parts[2]);
        if ([r, g, b].some((v) => Number.isNaN(v)))
          return { r: 0, g: 0, b: 0, a: 0 };
        let a = 1;
        if (parts.length > 3) {
          const alpha = Number.parseFloat(parts[3]);
          if (!Number.isNaN(alpha)) a = alpha;
        }
        return {
          r: this.clampByte(r),
          g: this.clampByte(g),
          b: this.clampByte(b),
          a: this.clampUnit(a),
        };
      }
    }
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  parseHexColor(value: string): ParsedColor | null {
    if (!value || typeof value !== 'string') return null;
    const hex = value.trim();
    const match = /^#?([0-9a-fA-F]{6})$/.exec(hex);
    if (!match) return null;
    const raw = match[1];
    const r = Number.parseInt(raw.slice(0, 2), 16);
    const g = Number.parseInt(raw.slice(2, 4), 16);
    const b = Number.parseInt(raw.slice(4, 6), 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
    return { r, g, b };
  }

  componentToHex(value: number): string {
    const clamped = Math.max(0, Math.min(255, Math.round(value)));
    return clamped.toString(16).padStart(2, '0');
  }

  composeHexColor(r: number, g: number, b: number): string {
    return `#${this.componentToHex(r)}${this.componentToHex(g)}${this.componentToHex(b)}`;
  }

  mixParsedColors(
    start: ParsedColor | null,
    end: ParsedColor | null,
    ratio: number,
    fallbackStart: string,
    fallbackEnd: string,
  ): string {
    const t = Math.min(1, Math.max(0, ratio));
    if (start && end) {
      const r = start.r + (end.r - start.r) * t;
      const g = start.g + (end.g - start.g) * t;
      const b = start.b + (end.b - start.b) * t;
      return this.composeHexColor(r, g, b);
    }
    const startValue = fallbackStart || fallbackEnd || '#000000';
    const endValue = fallbackEnd || fallbackStart || '#000000';
    return t <= 0.5 ? startValue : endValue;
  }

  computeDitheredRatio(ratio: number, x: number, y: number): number {
    const clamped = Math.min(1, Math.max(0, ratio));
    const steps = this.gradientSteps;
    if (steps <= 0) return clamped;
    const scaled = clamped * steps;
    const base = Math.floor(scaled);
    const fraction = scaled - base;
    const matrix = this.bayer4;
    const matrixSize = matrix.length;
    const xi = x % matrixSize;
    const yi = y % matrixSize;
    const threshold = (matrix[yi][xi] + 0.5) / (matrixSize * matrixSize);
    const offset = fraction > threshold ? 1 : 0;
    const index = Math.min(steps, Math.max(0, base + offset));
    return index / steps;
  }

  computeEraserValue(existing: string, strength: number): string {
    const pct = Math.max(0, Math.min(100, Math.floor(strength)));
    if (pct <= 0) return existing || '';
    if (pct >= 100) return '';
    if (!existing) return '';
    const rgba = this.parseColor(existing);
    if (rgba.a <= 0) return '';
    const nextAlpha = rgba.a * (1 - pct / 100);
    if (nextAlpha <= 0.001) return '';
    const alpha = Number.parseFloat(nextAlpha.toFixed(3));
    return `rgba(${rgba.r},${rgba.g},${rgba.b},${alpha})`;
  }
}
