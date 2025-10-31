import { Injectable, signal } from '@angular/core';
import { BoneItem } from './editor.types';

@Injectable({ providedIn: 'root' })
export class EditorBoneService {
  readonly bones = signal<BoneItem[]>([]);
  readonly selectedBoneId = signal<string>('');

  addBone(
    name?: string,
    parentId: string | null = null,
    x = 0,
    y = 0,
  ): BoneItem {
    const id = `bone_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const bone: BoneItem = {
      id,
      name: name || `Bone ${this.bones().length + 1}`,
      parentId,
      x,
      y,
      rotation: 0,
      length: 50,
    };
    this.bones.update((arr) => [...arr, bone]);
    return bone;
  }

  removeBone(id: string): boolean {
    const index = this.bones().findIndex((b) => b.id === id);
    if (index === -1) return false;
    this.bones.update((arr) => {
      const filtered = arr.filter((b) => b.id !== id && b.parentId !== id);
      return filtered;
    });
    if (this.selectedBoneId() === id) {
      this.selectedBoneId.set('');
    }
    return true;
  }

  renameBone(id: string, newName: string): boolean {
    const bone = this.bones().find((b) => b.id === id);
    if (!bone) return false;
    this.bones.update((arr) =>
      arr.map((b) => (b.id === id ? { ...b, name: newName } : b)),
    );
    return true;
  }

  updateBone(
    id: string,
    updates: Partial<Omit<BoneItem, 'id'>>,
  ): boolean {
    const bone = this.bones().find((b) => b.id === id);
    if (!bone) return false;
    this.bones.update((arr) =>
      arr.map((b) => (b.id === id ? { ...b, ...updates } : b)),
    );
    return true;
  }

  selectBone(id: string) {
    this.selectedBoneId.set(id);
  }

  getBone(id: string): BoneItem | null {
    return this.bones().find((b) => b.id === id) || null;
  }

  getChildBones(parentId: string): BoneItem[] {
    return this.bones().filter((b) => b.parentId === parentId);
  }
}
