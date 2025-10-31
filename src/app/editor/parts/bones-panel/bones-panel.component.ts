import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
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
import type { BoneItem } from '../../../services/editor-document.service';

interface BoneWithDepth {
  item: BoneItem;
  depth: number;
}

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
  readonly translocoService = inject(TranslocoService);
  readonly editingBoneId = signal<string>('');
  readonly newBoneName = signal<string>('');

  selectBone(id: string) {
    this.document.selectBone(id);
  }

  addRootBone() {
    const name = this.newBoneName().trim();
    if (name) {
      this.document.addBone(name, null);
      this.newBoneName.set('');
    } else {
      this.document.addBone();
    }
  }

  addChildBone(parentId: string, event: Event) {
    event.stopPropagation();
    const parentBone = this.document.getBone(parentId);
    if (!parentBone) return;
    
    const childCount = this.getChildBonesCount(parentId);
    const name = `${parentBone.name} Child ${childCount + 1}`;
    this.document.addBone(name, parentId);
  }

  removeBone(id: string, event: Event) {
    event.stopPropagation();
    const msg = this.translocoService.translate('bones.confirmRemove');
    if (confirm(msg)) {
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

  getRootBones(): BoneItem[] {
    return this.document.boneHierarchy().filter(b => !b.parentId);
  }

  getChildBones(parentId: string): BoneItem[] {
    return this.document.getChildBones(parentId);
  }

  getChildBonesCount(parentId: string): number {
    return this.getChildBones(parentId).length;
  }

  getCurrentAnimationName(): string {
    const anim = this.document.getCurrentAnimation();
    return anim ? anim.name : 'None';
  }

  getAttachedBonesCount(): number {
    const anim = this.document.getCurrentAnimation();
    return anim ? anim.boneIds.length : 0;
  }

  getAllBonesWithDepth(): BoneWithDepth[] {
    const result: BoneWithDepth[] = [];
    const bones = this.document.boneHierarchy();
    
    const addBoneWithChildren = (bone: BoneItem, depth: number) => {
      result.push({ item: bone, depth });
      const children = this.getChildBones(bone.id);
      children.forEach(child => addBoneWithChildren(child, depth + 1));
    };
    
    const rootBones = bones.filter(b => !b.parentId);
    rootBones.forEach(bone => addBoneWithChildren(bone, 0));
    
    return result;
  }
}
