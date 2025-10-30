import { Injectable, signal } from '@angular/core';
import {
  CurrentAction,
  HistoryEntry,
  LayerChange,
  MetaChange,
} from './history.types';

@Injectable({ providedIn: 'root' })
export class EditorHistoryService {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private historyLimit = 200;
  readonly undoVersion = signal(0);
  readonly redoVersion = signal(0);
  private currentAction: CurrentAction | null = null;

  beginAction(description?: string) {
    if (this.currentAction) {
      this.endAction();
    }
    this.currentAction = {
      map: new Map(),
      meta: [],
      description: description || '',
    };
  }

  endAction() {
    if (!this.currentAction) return;
    const map = this.currentAction.map;
    const pixelChanges: LayerChange[] = [];
    for (const [layerId, v] of map.entries()) {
      pixelChanges.push({
        layerId,
        indices: v.indices.slice(),
        previous: v.previous.slice(),
        next: v.next.slice(),
      });
    }
    const metaChanges =
      this.currentAction.meta && this.currentAction.meta.length
        ? this.currentAction.meta.slice()
        : undefined;
    if (pixelChanges.length > 0 || (metaChanges && metaChanges.length > 0)) {
      const entry: HistoryEntry = {
        pixelChanges: pixelChanges.length > 0 ? pixelChanges : undefined,
        metaChanges,
        description: this.currentAction.description,
      };
      this.pushUndo(entry);
    }
    this.currentAction = null;
  }

  commitMetaChange(meta: MetaChange) {
    if (this.currentAction) {
      this.currentAction.meta.push(meta);
      return;
    }
    const entry: HistoryEntry = { metaChanges: [meta], description: meta.key };
    this.pushUndo(entry);
  }

  recordPixelChange(
    layerId: string,
    idx: number,
    previous: string,
    next: string,
  ) {
    if (!this.currentAction) return;
    let entry = this.currentAction.map.get(layerId);
    if (!entry) {
      entry = { indices: [], previous: [], next: [] };
      this.currentAction.map.set(layerId, entry);
    }
    entry.indices.push(idx);
    entry.previous.push(previous);
    entry.next.push(next);
  }

  private pushUndo(entry: HistoryEntry) {
    this.undoStack.push(entry);
    if (this.undoStack.length > this.historyLimit) this.undoStack.shift();
    this.redoStack = [];
    this.undoVersion.update((v) => v + 1);
    this.redoVersion.update((v) => v + 1);
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  popUndo(): HistoryEntry | null {
    if (!this.canUndo()) return null;
    const entry = this.undoStack.pop() as HistoryEntry;
    this.redoStack.push(entry);
    this.undoVersion.update((v) => v + 1);
    this.redoVersion.update((v) => v + 1);
    return entry;
  }

  popRedo(): HistoryEntry | null {
    if (!this.canRedo()) return null;
    const entry = this.redoStack.pop() as HistoryEntry;
    this.undoStack.push(entry);
    this.undoVersion.update((v) => v + 1);
    this.redoVersion.update((v) => v + 1);
    return entry;
  }

  clearHistory() {
    this.undoStack = [];
    this.redoStack = [];
    this.undoVersion.set(0);
    this.redoVersion.set(0);
  }

  isActionInProgress(): boolean {
    return this.currentAction !== null;
  }
}
