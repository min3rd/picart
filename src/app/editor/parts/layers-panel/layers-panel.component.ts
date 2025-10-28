import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { EditorDocumentService } from '../../../services/editor-document.service';
import { EditorToolsService } from '../../../services/editor-tools.service';
import { TranslocoPipe } from '@jsverse/transloco';
import { NgIcon } from '@ng-icons/core';

@Component({
  selector: 'pa-layers-panel',
  templateUrl: './layers-panel.component.html',
  styleUrls: ['./layers-panel.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe, NgIcon],
  host: {
    class: 'block h-full',
  },
})
export class LayersPanel {
  readonly document = inject(EditorDocumentService);
  readonly tools = inject(EditorToolsService);

  get maxCanvasDim() {
    return Math.max(1, Math.max(this.document.canvasWidth(), this.document.canvasHeight()));
  }

  onBrushSizeInput(event: Event) {
    const v = (event.target as HTMLInputElement).value;
    const n = Number(v);
    if (!Number.isNaN(n)) this.tools.setBrushSize(Math.floor(n), this.maxCanvasDim);
  }

  onBrushColorInput(event: Event) {
    const v = (event.target as HTMLInputElement).value;
    this.tools.setBrushColor(v);
  }

  onEraserSizeInput(event: Event) {
    const v = (event.target as HTMLInputElement).value;
    const n = Number(v);
    if (!Number.isNaN(n)) this.tools.setEraserSize(Math.floor(n), this.maxCanvasDim);
  }

  onEraserStrengthInput(event: Event) {
    const v = (event.target as HTMLInputElement).value;
    const n = Number(v);
    if (!Number.isNaN(n)) this.tools.setEraserStrength(Math.floor(n));
  }

  private dragIndex: number | null = null;

  select(id: string) {
    this.document.selectLayer(id);
  }

  onAddLayer() {
    this.document.addLayer();
  }

  onDragStart(ev: DragEvent, index: number) {
    this.dragIndex = index;
    try {
      ev.dataTransfer?.setData('text/plain', String(index));
    } catch {}
  }

  onDragOver(ev: DragEvent, index: number) {
    ev.preventDefault();
  }

  onDrop(ev: DragEvent, index: number) {
    ev.preventDefault();
    const from = this.dragIndex ?? parseInt(ev.dataTransfer?.getData('text/plain') || '-1', 10);
    if (from >= 0 && from !== index) {
      this.document.reorderLayers(from, index);
    }
    this.dragIndex = null;
  }
}
