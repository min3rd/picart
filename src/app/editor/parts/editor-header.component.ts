import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FileService } from '../../services/file.service';
import { EditorStateService } from '../../services/editor-state.service';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

@Component({
  selector: 'pa-editor-header',
  templateUrl: './editor-header.component.html',
  styleUrl: './editor-header.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe],
  host: {
    class: 'block w-full bg-neutral-100 dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-800'
  }
})
export class EditorHeader {
  private readonly fileService = inject(FileService);
  readonly state = inject(EditorStateService);
  private readonly i18n = inject(TranslocoService);

  async onNewProject() {
    // Minimal new project; in future wire modal
    // No-op here, just placeholder
  }
  async onOpen() {
    await this.fileService.openProjectFromPicker();
  }
  async onSave() {
    // Placeholder: serialize minimal state later
  }

  setLang(lang: 'en' | 'vi') {
    this.i18n.setActiveLang(lang);
  }
}
