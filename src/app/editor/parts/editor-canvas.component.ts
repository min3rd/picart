import { ChangeDetectionStrategy, Component, ElementRef, HostListener, ViewChild, inject, signal } from '@angular/core';
import { NgIf } from '@angular/common';
import { EditorStateService } from '../../services/editor-state.service';
import { TranslocoPipe } from '@jsverse/transloco';
import { NgIcon } from '@ng-icons/core';

@Component({
  selector: 'pa-editor-canvas',
  templateUrl: './editor-canvas.component.html',
  styleUrl: './editor-canvas.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe, NgIcon, NgIf],
  host: {
    class: 'block h-full w-full'
  }
})
export class EditorCanvas {
  @ViewChild('canvasEl', { static: true }) canvasEl!: ElementRef<HTMLCanvasElement>;
  readonly state = inject(EditorStateService);

  // Interaction state
  readonly mouseX = signal<number | null>(null);
  readonly mouseY = signal<number | null>(null);

  // Transform state
  readonly panX = signal(0);
  readonly panY = signal(0);
  readonly scale = signal(1);
  readonly rotation = signal(0); // degrees

  private panning = false;
  private rotating = false;
  private lastPointer = { x: 0, y: 0 };

  onPointerMove(ev: PointerEvent) {
    const rect = (this.canvasEl.nativeElement as HTMLCanvasElement).getBoundingClientRect();
    const cx = ev.clientX - rect.left;
    const cy = ev.clientY - rect.top;
    this.mouseX.set(Math.round(cx));
    this.mouseY.set(Math.round(cy));

    if (this.panning) {
      const dx = ev.clientX - this.lastPointer.x;
      const dy = ev.clientY - this.lastPointer.y;
      this.panX.set(this.panX() + dx);
      this.panY.set(this.panY() + dy);
      this.lastPointer.x = ev.clientX;
      this.lastPointer.y = ev.clientY;
    }

    if (this.rotating) {
      const dx = ev.clientX - this.lastPointer.x;
      this.rotation.set(this.rotation() + dx * 0.2);
      this.lastPointer.x = ev.clientX;
    }
  }

  onWheel(ev: WheelEvent) {
    ev.preventDefault();
    const delta = ev.deltaY > 0 ? -0.1 : 0.1;
    const next = Math.max(0.1, Math.min(8, this.scale() + delta));
    this.scale.set(Number(next.toFixed(2)));
  }

  onPointerDown(ev: PointerEvent) {
    // middle button or space -> pan
    if (ev.button === 1 || ev.shiftKey || ev.ctrlKey) {
      this.panning = true;
      this.lastPointer.x = ev.clientX;
      this.lastPointer.y = ev.clientY;
    }
    // right button -> rotate
    if (ev.button === 2) {
      this.rotating = true;
      this.lastPointer.x = ev.clientX;
      this.lastPointer.y = ev.clientY;
    }
  }

  onPointerUp(ev: PointerEvent) {
    this.panning = false;
    this.rotating = false;
  }

  // Toggleable info panel visibility - controlled by state in header via settings in previous work
  infoVisible = signal(true);

  setCanvasWidth(event: Event) {
    const target = event.target as HTMLInputElement;
    const width = parseInt(target.value, 10);
    if (width > 0) {
      this.state.setCanvasSize(width, this.state.canvasHeight());
    }
  }

  setCanvasHeight(event: Event) {
    const target = event.target as HTMLInputElement;
    const height = parseInt(target.value, 10);
    if (height > 0) {
      this.state.setCanvasSize(this.state.canvasWidth(), height);
    }
  }
}
