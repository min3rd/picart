import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import {
  heroPlus,
  heroTrash,
  heroPencil,
  heroLink,
} from '@ng-icons/heroicons/outline';
import { EditorDocumentService } from '../../../services/editor-document.service';
import { EditorBoneService, type Bone } from '../../../services/editor/editor-bone.service';

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
  readonly boneService = inject(EditorBoneService);
  readonly translocoService = inject(TranslocoService);
  readonly editingBoneId = signal<string>('');
  readonly newBoneName = signal<string>('');

  readonly currentFrameBones = computed(() => {
    const currentFrame = this.document.frames()[this.document.currentFrameIndex()];
    if (!currentFrame) return [];
    return this.boneService.getBones(currentFrame.id);
  });

  selectBone(id: string) {
    this.boneService.selectBone(id);
  }

  removeBone(id: string, event: Event) {
    event.stopPropagation();
    const msg = this.translocoService.translate('bones.confirmRemove');
    if (confirm(msg)) {
      const currentFrame = this.document.frames()[this.document.currentFrameIndex()];
      if (currentFrame) {
        this.boneService.deleteBone(currentFrame.id, id);
      }
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
      const currentFrame = this.document.frames()[this.document.currentFrameIndex()];
      if (currentFrame) {
        const bone = this.currentFrameBones().find(b => b.id === id);
        if (bone) {
          this.boneService.updateBone(currentFrame.id, id, { ...bone, id: name });
        }
      }
    }
    this.editingBoneId.set('');
    this.newBoneName.set('');
  }

  cancelRename() {
    this.editingBoneId.set('');
    this.newBoneName.set('');
  }

  toggleBoneAttachment(boneId: string, event: Event) {
    event.stopPropagation();
    const currentAnim = this.document.getCurrentAnimation();
    if (!currentAnim) return;
    
    if (this.isBoneAttachedToCurrentAnimation(boneId)) {
      this.document.detachBoneFromAnimation(currentAnim.id, boneId);
    } else {
      this.document.attachBoneToAnimation(currentAnim.id, boneId);
    }
  }

  isBoneAttachedToCurrentAnimation(boneId: string): boolean {
    const currentAnim = this.document.getCurrentAnimation();
    if (!currentAnim) return false;
    return currentAnim.boneIds.includes(boneId);
  }

  getCurrentAnimationName(): string {
    const anim = this.document.getCurrentAnimation();
    return anim ? anim.name : 'None';
  }

  getAttachedBonesCount(): number {
    const anim = this.document.getCurrentAnimation();
    return anim ? anim.boneIds.length : 0;
  }

  getPointsCount(bone: Bone): number {
    return bone.points.length;
  }
}
