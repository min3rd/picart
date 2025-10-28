import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { EditorHeader } from './parts/editor-header/editor-header.component';
import { ToolPalette } from './parts/tool-palette/tool-palette.component';
import { LayersPanel } from './parts/layers-panel/layers-panel.component';
import { TimelinePanel } from './parts/timeline-panel/timeline-panel.component';
import { EditorCanvas } from './parts/editor-canvas/editor-canvas.component';
import { UserSettingsService } from '../services/user-settings.service';

@Component({
  selector: 'pa-editor-page',
  templateUrl: './editor.page.html',
  styleUrl: './editor.page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EditorHeader, ToolPalette, LayersPanel, TimelinePanel, EditorCanvas],
  host: {
    class: 'block h-dvh w-dvw',
    '(window:pointermove)': 'onWindowMove($event)',
    '(window:pointerup)': 'onWindowUp()',
  },
})
export class EditorPage {
  private readonly settings = inject(UserSettingsService);

  // Panel sizes (px)
  readonly leftWidth = signal(this.settings.settings.panels.left);
  readonly rightWidth = signal(this.settings.settings.panels.right);
  readonly bottomHeight = signal(this.settings.settings.panels.bottom);

  // Computed grid tracks
  readonly gridCols = computed(() => `${this.leftWidth()}px 4px 1fr 4px ${this.rightWidth()}px`);
  readonly gridRows = computed(() => `auto 1fr 4px ${this.bottomHeight()}px`);

  // Drag state
  private dragging: null | {
    kind: 'left' | 'right' | 'bottom';
    startX: number;
    startY: number;
    startLeft: number;
    startRight: number;
    startBottom: number;
  } = null;

  onGripDown(kind: 'left' | 'right' | 'bottom', ev: PointerEvent) {
    ev.preventDefault();
    const t = ev.currentTarget as HTMLElement;
    t.setPointerCapture?.(ev.pointerId);
    this.dragging = {
      kind,
      startX: ev.clientX,
      startY: ev.clientY,
      startLeft: this.leftWidth(),
      startRight: this.rightWidth(),
      startBottom: this.bottomHeight(),
    };
  }

  onWindowMove(ev: PointerEvent) {
    if (!this.dragging) return;
    const dx = ev.clientX - this.dragging.startX;
    const dy = ev.clientY - this.dragging.startY;
    if (this.dragging.kind === 'left') {
      this.leftWidth.set(this.clamp(this.dragging.startLeft + dx, 120, 480));
    } else if (this.dragging.kind === 'right') {
      this.rightWidth.set(this.clamp(this.dragging.startRight - dx, 160, 520));
    } else if (this.dragging.kind === 'bottom') {
      this.bottomHeight.set(this.clamp(this.dragging.startBottom - dy, 96, 360));
    }
  }

  onWindowUp() {
    this.dragging = null;
    // persist panels sizes
    this.settings.setPanelSizes({
      left: this.leftWidth(),
      right: this.rightWidth(),
      bottom: this.bottomHeight(),
    });
  }

  private clamp(v: number, min: number, max: number) {
    return Math.max(min, Math.min(max, v | 0));
  }
}
