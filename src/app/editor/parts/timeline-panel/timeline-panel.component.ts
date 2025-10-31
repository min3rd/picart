import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  QueryList,
  ViewChild,
  ViewChildren,
  effect,
  inject,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import {
  heroPlay,
  heroStop,
  heroPlus,
  heroEllipsisVertical,
} from '@ng-icons/heroicons/outline';
import { EditorDocumentService } from '../../../services/editor-document.service';

@Component({
  selector: 'pa-timeline-panel',
  templateUrl: './timeline-panel.component.html',
  styleUrls: ['./timeline-panel.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, TranslocoPipe, NgIconComponent],
  providers: [
    provideIcons({
      heroPlay,
      heroStop,
      heroPlus,
      heroEllipsisVertical,
    }),
  ],
  host: {
    class: 'block h-full',
  },
})
export class TimelinePanel implements AfterViewInit {
  readonly document = inject(EditorDocumentService);

  readonly contextMenuVisible = signal(false);
  readonly contextMenuX = signal(0);
  readonly contextMenuY = signal(0);
  readonly contextMenuFrameId = signal<string | null>(null);

  @ViewChild('contextMenuEl')
  contextMenuEl?: ElementRef<HTMLDivElement>;

  @ViewChildren('frameCanvas')
  frameCanvases?: QueryList<ElementRef<HTMLCanvasElement>>;

  constructor() {
    effect(() => {
      if (this.contextMenuVisible()) {
        const handler = (e: MouseEvent) => {
          const menu = this.contextMenuEl?.nativeElement;
          if (menu && !menu.contains(e.target as Node)) {
            this.closeContextMenu();
          }
        };
        setTimeout(() => document.addEventListener('click', handler), 0);
        return () => document.removeEventListener('click', handler);
      }
      return;
    });

    effect(() => {
      const frames = this.document.frames();
      const currentIndex = this.document.currentFrameIndex();
      setTimeout(() => this.renderAllPreviews(), 0);
    });
  }

  ngAfterViewInit() {
    this.renderAllPreviews();
  }

  renderAllPreviews() {
    this.frameCanvases?.forEach((canvasRef) => {
      const canvas = canvasRef.nativeElement;
      const frameId = canvas.getAttribute('data-frame-id');
      if (frameId) {
        this.renderFramePreview(canvas, frameId, 80, 64);
      }
    });
  }

  setFrame(idx: number) {
    this.document.saveCurrentFrameState();
    this.document.loadFrameState(idx);
  }

  addFrame() {
    this.document.saveCurrentFrameState();
    this.document.addFrame();
  }

  deleteFrame(id: string) {
    this.document.removeFrame(id);
    this.closeContextMenu();
  }

  duplicateFrame(id: string) {
    this.document.saveCurrentFrameState();
    this.document.duplicateFrame(id);
    this.closeContextMenu();
  }

  playAnimation() {
    if (this.document.isAnimationPlaying()) {
      this.document.stopAnimation();
    } else {
      this.document.saveCurrentFrameState();
      this.document.playAnimation();
    }
  }

  setFps(fps: number) {
    this.document.setAnimationFps(fps);
  }

  showContextMenu(event: MouseEvent, frameId: string) {
    event.preventDefault();
    event.stopPropagation();
    this.contextMenuFrameId.set(frameId);
    this.contextMenuX.set(event.clientX);
    this.contextMenuY.set(event.clientY);
    this.contextMenuVisible.set(true);
  }

  closeContextMenu() {
    this.contextMenuVisible.set(false);
    this.contextMenuFrameId.set(null);
  }

  renderFramePreview(
    canvas: HTMLCanvasElement,
    frameId: string,
    width: number,
    height: number
  ) {
    const frame = this.document.frames().find((f) => f.id === frameId);
    if (!frame || !frame.layers || !frame.buffers) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#e5e5e5';
        ctx.fillRect(0, 0, width, height);
      }
      return;
    }

    const canvasWidth = this.document.canvasWidth();
    const canvasHeight = this.document.canvasHeight();
    
    const scaleX = width / canvasWidth;
    const scaleY = height / canvasHeight;
    const scale = Math.min(scaleX, scaleY);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#e5e5e5';
    ctx.fillRect(0, 0, width, height);

    const offsetX = (width - canvasWidth * scale) / 2;
    const offsetY = (height - canvasHeight * scale) / 2;

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    const flatLayers = this.flattenLayers(frame.layers);
    for (let li = flatLayers.length - 1; li >= 0; li--) {
      const layer = flatLayers[li];
      if (!layer.visible) continue;
      const buf = frame.buffers[layer.id];
      if (!buf || buf.length !== canvasWidth * canvasHeight) continue;

      for (let y = 0; y < canvasHeight; y++) {
        for (let x = 0; x < canvasWidth; x++) {
          const col = buf[y * canvasWidth + x];
          if (col && col.length) {
            ctx.fillStyle = col;
            ctx.fillRect(x, y, 1, 1);
          }
        }
      }
    }

    ctx.restore();
  }

  private flattenLayers(items: any[]): any[] {
    const result: any[] = [];
    for (const item of items) {
      if (item.type === 'group' && item.children) {
        result.push(...this.flattenLayers(item.children));
      } else {
        result.push(item);
      }
    }
    return result;
  }
}
