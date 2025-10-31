import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import {
  heroPlus,
  heroTrash,
  heroPencil,
  heroArrowDownTray,
  heroChevronUp,
  heroChevronDown,
} from '@ng-icons/heroicons/outline';
import { EditorDocumentService } from '../../../services/editor-document.service';
import type { AnimationItem } from '../../../services/editor-document.service';

@Component({
  selector: 'pa-timeline-panel',
  templateUrl: './timeline-panel.component.html',
  styleUrls: ['./timeline-panel.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, TranslocoPipe, NgIconComponent, FormsModule],
  providers: [
    provideIcons({
      heroPlus,
      heroTrash,
      heroPencil,
      heroArrowDownTray,
      heroChevronUp,
      heroChevronDown,
    }),
  ],
  host: {
    class: 'block h-full',
  },
})
export class TimelinePanel {
  readonly document = inject(EditorDocumentService);
  readonly editingAnimationId = signal<string>('');
  readonly newAnimationName = signal<string>('');

  setAnimation(idx: number) {
    this.document.setCurrentAnimation(idx);
  }

  addAnimation() {
    const name = this.newAnimationName().trim();
    if (name) {
      if (!this.document.validateAnimationName(name)) {
        alert(this.getInvalidNameMessage());
        return;
      }
      this.document.addAnimation(name);
      this.newAnimationName.set('');
    } else {
      this.document.addAnimation();
    }
  }

  removeAnimation(id: string, event: Event) {
    event.stopPropagation();
    if (confirm(this.getRemoveConfirmMessage())) {
      this.document.removeAnimation(id);
    }
  }

  startRename(id: string, currentName: string, event: Event) {
    event.stopPropagation();
    this.editingAnimationId.set(id);
    this.newAnimationName.set(currentName);
  }

  saveRename(id: string) {
    const name = this.newAnimationName().trim();
    if (name) {
      if (!this.document.validateAnimationName(name)) {
        alert(this.getInvalidNameMessage());
        return;
      }
      this.document.renameAnimation(id, name);
    }
    this.editingAnimationId.set('');
    this.newAnimationName.set('');
  }

  cancelRename() {
    this.editingAnimationId.set('');
    this.newAnimationName.set('');
  }

  moveUp(index: number, event: Event) {
    event.stopPropagation();
    if (index > 0) {
      this.document.reorderAnimations(index, index - 1);
    }
  }

  moveDown(index: number, event: Event) {
    event.stopPropagation();
    const maxIndex = this.document.animations().length - 1;
    if (index < maxIndex) {
      this.document.reorderAnimations(index, index + 1);
    }
  }

  async exportSpriteSheet(animation: AnimationItem, event: Event) {
    event.stopPropagation();
    const blob = await this.document.exportAnimationAsSpriteSheet(animation, {
      padding: 2,
      columns: 8,
    });
    if (blob) {
      this.downloadBlob(blob, `${animation.name}_spritesheet.png`);
    }
  }

  async exportPackage(animation: AnimationItem, event: Event) {
    event.stopPropagation();
    const pkg = await this.document.exportAnimationAsPackage(animation);
    if (pkg) {
      const metadataBlob = new Blob([pkg.metadata], {
        type: 'application/json',
      });
      this.downloadBlob(metadataBlob, `${animation.name}_metadata.json`);
      for (const [filename, blob] of pkg.files) {
        this.downloadBlob(blob, filename);
      }
    }
  }

  private downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  private getInvalidNameMessage(): string {
    return 'Animation name contains invalid characters. Only letters, numbers, spaces, hyphens and underscores are allowed.';
  }

  private getRemoveConfirmMessage(): string {
    return 'Are you sure you want to remove this animation?';
  }
}
