import { Injectable, signal } from '@angular/core';

export interface BonePoint {
  id: string;
  x: number;
  y: number;
  parentId?: string;
}

export interface Bone {
  id: string;
  points: BonePoint[];
  color: string;
  thickness: number;
}

export interface FrameBones {
  frameId: string;
  bones: Bone[];
}

@Injectable({ providedIn: 'root' })
export class EditorBoneService {
  private readonly bones = signal<Map<string, Bone[]>>(new Map());
  private readonly selectedBoneId = signal<string | null>(null);
  private readonly selectedPointId = signal<string | null>(null);

  getBones(frameId: string): Bone[] {
    return this.bones().get(frameId) || [];
  }

  addBone(frameId: string, bone: Bone): void {
    const current = new Map(this.bones());
    const frameBones = current.get(frameId) || [];
    current.set(frameId, [...frameBones, bone]);
    this.bones.set(current);
  }

  updateBone(frameId: string, boneId: string, updates: Partial<Bone>): void {
    const current = new Map(this.bones());
    const frameBones = current.get(frameId) || [];
    const updated = frameBones.map((b) =>
      b.id === boneId ? { ...b, ...updates } : b,
    );
    current.set(frameId, updated);
    this.bones.set(current);
  }

  deleteBone(frameId: string, boneId: string): void {
    const current = new Map(this.bones());
    const frameBones = current.get(frameId) || [];
    current.set(
      frameId,
      frameBones.filter((b) => b.id !== boneId),
    );
    this.bones.set(current);
  }

  addPointToBone(
    frameId: string,
    boneId: string,
    point: BonePoint,
  ): void {
    const current = new Map(this.bones());
    const frameBones = current.get(frameId) || [];
    const updated = frameBones.map((b) => {
      if (b.id === boneId) {
        return { ...b, points: [...b.points, point] };
      }
      return b;
    });
    current.set(frameId, updated);
    this.bones.set(current);
  }

  updatePoint(
    frameId: string,
    boneId: string,
    pointId: string,
    x: number,
    y: number,
  ): void {
    const current = new Map(this.bones());
    const frameBones = current.get(frameId) || [];
    const updated = frameBones.map((b) => {
      if (b.id === boneId) {
        return {
          ...b,
          points: b.points.map((p) =>
            p.id === pointId ? { ...p, x, y } : p,
          ),
        };
      }
      return b;
    });
    current.set(frameId, updated);
    this.bones.set(current);
  }

  getSelectedBone(): string | null {
    return this.selectedBoneId();
  }

  getSelectedPoint(): string | null {
    return this.selectedPointId();
  }

  selectBone(boneId: string | null): void {
    this.selectedBoneId.set(boneId);
  }

  selectPoint(pointId: string | null): void {
    this.selectedPointId.set(pointId);
  }

  clearSelection(): void {
    this.selectedBoneId.set(null);
    this.selectedPointId.set(null);
  }

  snapshot(): Map<string, Bone[]> {
    return new Map(this.bones());
  }

  restore(data: Map<string, Bone[]>): void {
    this.bones.set(new Map(data));
  }

  clear(): void {
    this.bones.set(new Map());
    this.clearSelection();
  }
}
