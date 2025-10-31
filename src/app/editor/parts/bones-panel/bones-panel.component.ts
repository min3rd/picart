import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import {
  heroPlus,
  heroTrash,
  heroPencil,
  heroLink,
} from '@ng-icons/heroicons/outline';
import { EditorDocumentService } from '../../../services/editor-document.service';

@Component({
  selector: 'pa-bones-panel',
  templateUrl: './bones-panel.component.html',
  styleUrls: ['./bones-panel.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, TranslocoPipe, NgIconComponent, FormsModule],
  providers: [
    provideIcons({
      heroPlus,
      heroTrash,
      heroPencil,
      heroLink,
    }),
  ],
  host: {
    class: 'block h-full',
  },
})
export class BonesPanel {
  readonly document = inject(EditorDocumentService);
  readonly editingBoneId = signal<string>('');
  readonly newBoneName = signal<string>('');

  selectBone(id: string) {
    this.document.selectBone(id);
  }

  addBone() {
    const name = this.newBoneName().trim();
    if (name) {
      this.document.addBone(name);
      this.newBoneName.set('');
    } else {
      this.document.addBone();
    }
  }

  removeBone(id: string, event: Event) {
    event.stopPropagation();
    if (confirm(this.getRemoveConfirmMessage())) {
      this.document.removeBone(id);
    }
  }

  startRename(id: string, currentName: string, event: Event) {
    event.stopPropagation();
    this.editingBoneId.set(id);
    this.newBoneName.set(currentName);
  }

  saveRename(id: string) {
    const name = this.newBoneName().trim();
    if (name) {
      this.document.renameBone(id, name);
    }
    this.editingBoneId.set('');
    this.newBoneName.set('');
  }

  cancelRename() {
    this.editingBoneId.set('');
    this.newBoneName.set('');
  }

  attachToCurrentAnimation(boneId: string, event: Event) {
    event.stopPropagation();
    const currentAnim = this.document.getCurrentAnimation();
    if (currentAnim) {
      this.document.attachBoneToAnimation(currentAnim.id, boneId);
    }
  }

  isBoneAttachedToCurrentAnimation(boneId: string): boolean {
    const currentAnim = this.document.getCurrentAnimation();
    if (!currentAnim) return false;
    return currentAnim.boneIds.includes(boneId);
  }

  private getRemoveConfirmMessage(): string {
    return 'Are you sure you want to remove this bone?';
  }
}
