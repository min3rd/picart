import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { EditorStateService } from '../../services/editor-state.service';
import { TranslocoPipe } from '@jsverse/transloco';
import { NgIcon } from '@ng-icons/core';

@Component({
  selector: 'pa-layers-panel',
  templateUrl: './layers-panel.component.html',
  styleUrl: './layers-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe, NgIcon],
  host: {
    class: 'block h-full'
  }
})
export class LayersPanel {
  readonly state = inject(EditorStateService);

  get maxCanvasDim() {
    return Math.max(1, Math.max(this.state.canvasWidth(), this.state.canvasHeight()));
  }

  onBrushSizeInput(event: Event) {
    const v = (event.target as HTMLInputElement).value;
    const n = Number(v);
    if (!Number.isNaN(n)) this.state.setBrushSize(Math.floor(n));
  }

  onBrushColorInput(event: Event) {
    const v = (event.target as HTMLInputElement).value;
    this.state.setBrushColor(v);
  }

  private dragIndex: number | null = null;

  select(id: string) {
    this.state.selectLayer(id);
  }

  onAddLayer() {
    this.state.addLayer();
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
      this.state.reorderLayers(from, index);
    }
    this.dragIndex = null;
  }
}
