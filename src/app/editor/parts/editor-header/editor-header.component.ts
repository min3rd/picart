import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnDestroy,
  signal,
  viewChild,
} from '@angular/core';
import { FileService } from '../../../services/file.service';
import { EditorDocumentService } from '../../../services/editor-document.service';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { UserSettingsService } from '../../../services/user-settings.service';
import { NgIcon } from '@ng-icons/core';
import {
  InsertImageDialog,
  InsertImageResult,
} from '../../../shared/components/insert-image-dialog/insert-image-dialog.component';

@Component({
  selector: 'pa-editor-header',
  templateUrl: './editor-header.component.html',
  styleUrls: ['./editor-header.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe, NgIcon, InsertImageDialog],
  host: {
    class:
      'block w-full bg-neutral-100 dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-800',
  },
})
export class EditorHeader {
  readonly fileService = inject(FileService);
  readonly document = inject(EditorDocumentService);
  readonly i18n = inject(TranslocoService);
  readonly settings = inject(UserSettingsService);
  readonly showFileMenu = signal(false);
  readonly showInsertMenu = signal(false);
  readonly insertImageDialog = viewChild(InsertImageDialog);
  private hoverOpenTimer?: number;
  private hoverCloseTimer?: number;
  private insertHoverOpenTimer?: number;
  private insertHoverCloseTimer?: number;

  async onNewProject() {
    // Reset to a minimal new project
    this.document.resetToNewProject();
    this.showFileMenu.set(false);
  }
  async onOpen() {
    const parsed = await this.fileService.openProjectFromPicker();
    if (parsed) {
      // try to restore using editor snapshot shape; fallback to raw project
      try {
        this.document.restoreProjectSnapshot(parsed as any);
      } catch (e) {
        console.warn(
          'Open returned project but failed to restore into editor state',
          e,
        );
      }
    }
    this.showFileMenu.set(false);
  }

  async onOpenFromComputer() {
    // Use FileService open picker which falls back to input file when needed
    await this.onOpen();
  }
  async onSave() {
    // Save current project to localStorage via EditorDocumentService
    try {
      const ok = this.document.saveProjectToLocalStorage();
      if (ok) console.info('Project saved to localStorage');
    } catch (e) {
      console.error('Save failed', e);
    }
  }

  async onSaveToComputer() {
    try {
      const snapshot = this.document.exportProjectSnapshot();
      const name = `${(snapshot as any).name || 'project'}.pix`;
      this.fileService.exportProjectToDownload(snapshot as any, name);
    } catch (e) {
      console.error('Save to computer failed', e);
    }
    this.showFileMenu.set(false);
  }

  // Open the file menu when user hovers over the header. A short delay avoids
  // accidental flicker when moving the pointer across the header.
  openFileMenuHover() {
    // clear any pending close
    if (this.hoverCloseTimer) {
      clearTimeout(this.hoverCloseTimer);
      this.hoverCloseTimer = undefined;
    }
    // schedule open
    if (!this.showFileMenu()) {
      this.hoverOpenTimer = window.setTimeout(() => {
        this.showFileMenu.set(true);
        this.hoverOpenTimer = undefined;
      }, 150);
    }
  }

  // Close the file menu when pointer leaves; use a slight delay so submenu can
  // be focused without immediately closing.
  closeFileMenuHover() {
    if (this.hoverOpenTimer) {
      clearTimeout(this.hoverOpenTimer);
      this.hoverOpenTimer = undefined;
    }
    if (this.showFileMenu()) {
      this.hoverCloseTimer = window.setTimeout(() => {
        this.showFileMenu.set(false);
        this.hoverCloseTimer = undefined;
      }, 200);
    }
  }

  // Keep menu open if it receives focus (keyboard navigation); close when it
  // loses focus.
  onMenuFocusIn() {
    if (this.hoverCloseTimer) {
      clearTimeout(this.hoverCloseTimer);
      this.hoverCloseTimer = undefined;
    }
    this.showFileMenu.set(true);
  }

  onMenuFocusOut() {
    // close shortly after focus leaves
    if (this.hoverCloseTimer) clearTimeout(this.hoverCloseTimer);
    this.hoverCloseTimer = window.setTimeout(() => {
      this.showFileMenu.set(false);
      this.hoverCloseTimer = undefined;
    }, 150);
  }

  onUndo() {
    try {
      this.document.undo();
    } catch {}
  }

  onRedo() {
    try {
      this.document.redo();
    } catch {}
  }

  private keydownHandler = (ev: KeyboardEvent) => {
    const z = ev.key.toLowerCase() === 'z';
    const y = ev.key.toLowerCase() === 'y';
    const s = ev.key.toLowerCase() === 's';
    const meta = ev.ctrlKey || ev.metaKey;
    if (!meta) return;
    if (z) {
      ev.preventDefault();
      this.onUndo();
    } else if (y) {
      ev.preventDefault();
      this.onRedo();
    } else if (s) {
      ev.preventDefault();
      this.document.saveProjectToLocalStorage();
    }
  };

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.keydownHandler as EventListener);
    }
  }

  async onInsertImage() {
    this.showInsertMenu.set(false);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/jpg';
    input.onchange = async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const dialog = this.insertImageDialog();
      if (dialog) {
        dialog.open(file);
      }
    };
    input.click();
  }

  async handleInsertImageConfirm(result: InsertImageResult) {
    const insertResult = await this.document.insertImageAsLayer(
      result.file,
      result.width > 0 ? result.width : undefined,
      result.height > 0 ? result.height : undefined,
    );
    if (insertResult) {
      console.info(
        `Image inserted as layer: ${insertResult.layerId}`,
        insertResult.bounds,
      );
    } else {
      console.error('Failed to insert image');
    }
  }

  handleInsertImageCancel() {
    console.info('Image insertion cancelled');
  }

  openInsertMenuHover() {
    if (this.insertHoverCloseTimer) {
      clearTimeout(this.insertHoverCloseTimer);
      this.insertHoverCloseTimer = undefined;
    }
    if (!this.showInsertMenu()) {
      this.insertHoverOpenTimer = window.setTimeout(() => {
        this.showInsertMenu.set(true);
        this.insertHoverOpenTimer = undefined;
      }, 150);
    }
  }

  closeInsertMenuHover() {
    if (this.insertHoverOpenTimer) {
      clearTimeout(this.insertHoverOpenTimer);
      this.insertHoverOpenTimer = undefined;
    }
    if (this.showInsertMenu()) {
      this.insertHoverCloseTimer = window.setTimeout(() => {
        this.showInsertMenu.set(false);
        this.insertHoverCloseTimer = undefined;
      }, 200);
    }
  }

  onInsertMenuFocusIn() {
    if (this.insertHoverCloseTimer) {
      clearTimeout(this.insertHoverCloseTimer);
      this.insertHoverCloseTimer = undefined;
    }
    this.showInsertMenu.set(true);
  }

  onInsertMenuFocusOut() {
    if (this.insertHoverCloseTimer) clearTimeout(this.insertHoverCloseTimer);
    this.insertHoverCloseTimer = window.setTimeout(() => {
      this.showInsertMenu.set(false);
      this.insertHoverCloseTimer = undefined;
    }, 150);
  }

  ngOnDestroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener(
        'keydown',
        this.keydownHandler as EventListener,
      );
    }
    if (this.hoverOpenTimer) {
      clearTimeout(this.hoverOpenTimer);
      this.hoverOpenTimer = undefined;
    }
    if (this.hoverCloseTimer) {
      clearTimeout(this.hoverCloseTimer);
      this.hoverCloseTimer = undefined;
    }
    if (this.insertHoverOpenTimer) {
      clearTimeout(this.insertHoverOpenTimer);
      this.insertHoverOpenTimer = undefined;
    }
    if (this.insertHoverCloseTimer) {
      clearTimeout(this.insertHoverCloseTimer);
      this.insertHoverCloseTimer = undefined;
    }
  }

  setLang(lang: 'en' | 'vi') {
    this.settings.setLanguage(lang);
  }

  toggleTheme() {
    const next = this.settings.theme() === 'dark' ? 'light' : 'dark';
    this.settings.setTheme(next);
  }
}
