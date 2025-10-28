import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { EditorToolsService } from '../../services/editor-tools.service';
import { ToolId } from '../../services/tools/tool.types';
import { NgIcon } from '@ng-icons/core';
import { TranslocoPipe } from '@jsverse/transloco';

@Component({
  selector: 'pa-tool-palette',
  templateUrl: './tool-palette.component.html',
  styleUrl: './tool-palette.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, TranslocoPipe],
  host: {
    class: 'block h-full',
  },
})
export class ToolPalette {
  readonly tools = inject(EditorToolsService);

  select(id: ToolId) {
    this.tools.selectTool(id);
  }
}
