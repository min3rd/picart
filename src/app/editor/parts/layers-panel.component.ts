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

  select(id: string) {
    this.state.selectLayer(id);
  }
}
