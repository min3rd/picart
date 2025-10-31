import { Injectable, signal } from '@angular/core';
import { AnimationItem, FrameItem } from './editor.types';

@Injectable({ providedIn: 'root' })
export class EditorAnimationCollectionService {
  readonly animations = signal<AnimationItem[]>([
    {
      id: 'anim_default',
      name: 'Animation 1',
      frames: [
        { id: 'f1', name: 'Frame 1', duration: 100 },
        { id: 'f2', name: 'Frame 2', duration: 100 },
        { id: 'f3', name: 'Frame 3', duration: 100 },
      ],
      boneIds: [],
      duration: 300,
    },
  ]);
  readonly currentAnimationIndex = signal<number>(0);

  getCurrentAnimation(): AnimationItem | null {
    const anims = this.animations();
    const idx = this.currentAnimationIndex();
    return anims[idx] || null;
  }

  setCurrentAnimation(index: number) {
    const max = this.animations().length - 1;
    this.currentAnimationIndex.set(Math.max(0, Math.min(index, max)));
  }

  addAnimation(name?: string): AnimationItem {
    const sanitizedName = this.sanitizeAnimationName(
      name || `Animation ${this.animations().length + 1}`,
    );
    const id = `anim_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const animation: AnimationItem = {
      id,
      name: sanitizedName,
      frames: [{ id: `f${Date.now()}`, name: 'Frame 1', duration: 100 }],
      boneIds: [],
      duration: 100,
    };
    this.animations.update((arr) => [...arr, animation]);
    return animation;
  }

  removeAnimation(id: string): boolean {
    if (this.animations().length <= 1) return false;
    const index = this.animations().findIndex((a) => a.id === id);
    if (index === -1) return false;
    this.animations.update((arr) => arr.filter((a) => a.id !== id));
    const newLength = this.animations().length;
    if (this.currentAnimationIndex() >= newLength) {
      this.currentAnimationIndex.set(Math.max(0, newLength - 1));
    }
    return true;
  }

  renameAnimation(id: string, newName: string): boolean {
    const sanitizedName = this.sanitizeAnimationName(newName);
    if (!sanitizedName) return false;
    this.animations.update((arr) =>
      arr.map((a) => (a.id === id ? { ...a, name: sanitizedName } : a)),
    );
    return true;
  }

  reorderAnimations(fromIndex: number, toIndex: number): boolean {
    const anims = this.animations();
    if (
      fromIndex < 0 ||
      fromIndex >= anims.length ||
      toIndex < 0 ||
      toIndex >= anims.length
    ) {
      return false;
    }
    const newAnims = [...anims];
    const [moved] = newAnims.splice(fromIndex, 1);
    newAnims.splice(toIndex, 0, moved);
    this.animations.set(newAnims);
    if (this.currentAnimationIndex() === fromIndex) {
      this.currentAnimationIndex.set(toIndex);
    }
    return true;
  }

  attachBone(animationId: string, boneId: string): boolean {
    let updated = false;
    this.animations.update((arr) =>
      arr.map((a) => {
        if (a.id === animationId && !a.boneIds.includes(boneId)) {
          updated = true;
          return { ...a, boneIds: [...a.boneIds, boneId] };
        }
        return a;
      }),
    );
    return updated;
  }

  detachBone(animationId: string, boneId: string): boolean {
    let updated = false;
    this.animations.update((arr) =>
      arr.map((a) => {
        if (a.id === animationId && a.boneIds.includes(boneId)) {
          updated = true;
          return { ...a, boneIds: a.boneIds.filter((id) => id !== boneId) };
        }
        return a;
      }),
    );
    return updated;
  }

  addFrameToAnimation(animationId: string, name?: string): FrameItem | null {
    const anim = this.animations().find((a) => a.id === animationId);
    if (!anim) return null;
    const frameId = `f${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const frame: FrameItem = {
      id: frameId,
      name: name || `Frame ${anim.frames.length + 1}`,
      duration: 100,
    };
    this.animations.update((arr) =>
      arr.map((a) => {
        if (a.id === animationId) {
          const newFrames = [...a.frames, frame];
          return {
            ...a,
            frames: newFrames,
            duration: newFrames.reduce((sum, f) => sum + f.duration, 0),
          };
        }
        return a;
      }),
    );
    return frame;
  }

  removeFrameFromAnimation(animationId: string, frameId: string): boolean {
    const anim = this.animations().find((a) => a.id === animationId);
    if (!anim || anim.frames.length <= 1) return false;
    let removed = false;
    this.animations.update((arr) =>
      arr.map((a) => {
        if (a.id === animationId) {
          const newFrames = a.frames.filter((f) => f.id !== frameId);
          if (newFrames.length < a.frames.length) {
            removed = true;
            return {
              ...a,
              frames: newFrames,
              duration: newFrames.reduce((sum, f) => sum + f.duration, 0),
            };
          }
        }
        return a;
      }),
    );
    return removed;
  }

  sanitizeAnimationName(name: string): string {
    return name.replace(/[^a-zA-Z0-9\s_-]/g, '').trim();
  }

  validateAnimationName(name: string): boolean {
    const sanitized = this.sanitizeAnimationName(name);
    return sanitized.length > 0 && sanitized === name;
  }
}
