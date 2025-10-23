import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { EditorStateService } from '../../services/editor-state.service';

@Component({
  selector: 'pa-timeline-panel',
  templateUrl: './timeline-panel.component.html',
  styleUrl: './timeline-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block h-full'
  }
})
export class TimelinePanel {
  readonly state = inject(EditorStateService);

  setFrame(idx: number) {
    this.state.setCurrentFrame(idx);
  }
}
