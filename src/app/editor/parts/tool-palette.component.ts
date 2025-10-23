import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { EditorStateService, ToolId } from '../../services/editor-state.service';
import { NgIcon } from '@ng-icons/core';

@Component({
  selector: 'pa-tool-palette',
  templateUrl: './tool-palette.component.html',
  styleUrl: './tool-palette.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon],
  host: {
    class: 'block h-full'
  }
})
export class ToolPalette {
  readonly state = inject(EditorStateService);

  select(id: ToolId) {
    this.state.selectTool(id);
  }
}
