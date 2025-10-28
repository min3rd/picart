import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { EditorDocumentService } from '../../services/editor-document.service';

@Component({
  selector: 'pa-timeline-panel',
  templateUrl: './timeline-panel.component.html',
  styleUrl: './timeline-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, TranslocoPipe],
  host: {
    class: 'block h-full',
  },
})
export class TimelinePanel {
  readonly document = inject(EditorDocumentService);

  setFrame(idx: number) {
    this.document.setCurrentFrame(idx);
  }
}
