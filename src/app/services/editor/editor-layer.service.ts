import { Injectable, Signal, computed, signal } from '@angular/core';
import {
  GroupItem,
  LayerItem,
  LayerTreeItem,
  isGroup,
  isLayer,
} from './editor.types';

@Injectable({ providedIn: 'root' })
export class EditorLayerService {
  readonly layers = signal<LayerTreeItem[]>([
    { id: 'l1', name: 'Layer 1', visible: true, locked: false, type: 'layer' },
  ]);
  readonly selectedLayerId = signal<string>('l1');
  readonly selectedLayerIds = signal<Set<string>>(new Set(['l1']));
  private groupCounter = 0;

  readonly selectedLayer: Signal<LayerTreeItem | null> = computed(() =>
    this.findItemById(this.layers(), this.selectedLayerId()),
  );

  selectLayer(id: string) {
    this.selectedLayerId.set(id);
    this.selectedLayerIds.set(new Set([id]));
  }

  toggleLayerSelection(id: string, multi = false) {
    if (!multi) {
      this.selectLayer(id);
      return;
    }
    const current = new Set(this.selectedLayerIds());
    if (current.has(id)) {
      current.delete(id);
      if (current.size === 0) {
        current.add(id);
      }
    } else {
      current.add(id);
    }
    this.selectedLayerIds.set(current);
    this.selectedLayerId.set(Array.from(current)[0] || id);
  }

  selectLayerRange(fromId: string, toId: string) {
    const layers = this.layers();
    const fromIndex = layers.findIndex((l) => l.id === fromId);
    const toIndex = layers.findIndex((l) => l.id === toId);
    if (fromIndex === -1 || toIndex === -1) return;
    const start = Math.min(fromIndex, toIndex);
    const end = Math.max(fromIndex, toIndex);
    const selected = new Set<string>();
    for (let i = start; i <= end; i++) {
      selected.add(layers[i].id);
    }
    this.selectedLayerIds.set(selected);
    this.selectedLayerId.set(layers[start].id);
  }

  flattenLayers(items: LayerTreeItem[]): LayerItem[] {
    const result: LayerItem[] = [];
    for (const item of items) {
      if (isGroup(item)) {
        result.push(...this.flattenLayers(item.children));
      } else {
        result.push(item);
      }
    }
    return result;
  }

  getFlattenedLayers(): LayerItem[] {
    return this.flattenLayers(this.layers());
  }

  findItemById(items: LayerTreeItem[], id: string): LayerTreeItem | null {
    for (const item of items) {
      if (item.id === id) return item;
      if (isGroup(item)) {
        const found = this.findItemById(item.children, id);
        if (found) return found;
      }
    }
    return null;
  }

  findParentGroup(
    items: LayerTreeItem[],
    childId: string,
    parent: GroupItem | null = null,
  ): GroupItem | null {
    for (const item of items) {
      if (item.id === childId) return parent;
      if (isGroup(item)) {
        const found = this.findParentGroup(item.children, childId, item);
        if (found !== null) return found;
      }
    }
    return null;
  }

  removeItemById(items: LayerTreeItem[], id: string): LayerTreeItem[] {
    const result: LayerTreeItem[] = [];
    for (const item of items) {
      if (item.id === id) continue;
      if (isGroup(item)) {
        result.push({
          ...item,
          children: this.removeItemById(item.children, id),
        });
      } else {
        result.push(item);
      }
    }
    return result;
  }

  getAllLayerIds(items: LayerTreeItem[]): string[] {
    const result: string[] = [];
    for (const item of items) {
      result.push(item.id);
      if (isGroup(item)) {
        result.push(...this.getAllLayerIds(item.children));
      }
    }
    return result;
  }

  renameLayer(id: string, newName: string) {
    const updateName = (items: LayerTreeItem[]): LayerTreeItem[] => {
      return items.map((item) => {
        if (item.id === id) {
          return { ...item, name: newName };
        }
        if (isGroup(item)) {
          return { ...item, children: updateName(item.children) };
        }
        return item;
      });
    };
    this.layers.set(updateName(this.layers()));
  }

  toggleGroupExpanded(id: string) {
    const toggleExpanded = (items: LayerTreeItem[]): LayerTreeItem[] => {
      return items.map((item) => {
        if (item.id === id && isGroup(item)) {
          return { ...item, expanded: !item.expanded };
        }
        if (isGroup(item)) {
          return { ...item, children: toggleExpanded(item.children) };
        }
        return item;
      });
    };
    this.layers.set(toggleExpanded(this.layers()));
  }

  toggleLayerVisibility(id: string) {
    const toggleVis = (items: LayerTreeItem[]): LayerTreeItem[] => {
      return items.map((item) => {
        if (item.id === id) {
          return { ...item, visible: !item.visible };
        }
        if (isGroup(item)) {
          return { ...item, children: toggleVis(item.children) };
        }
        return item;
      });
    };
    this.layers.set(toggleVis(this.layers()));
  }

  addLayer(name?: string): LayerItem {
    const id = `layer_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const flatLayers = this.flattenLayers(this.layers());
    const item: LayerItem = {
      id,
      name: name || `Layer ${flatLayers.length + 1}`,
      visible: true,
      locked: false,
      type: 'layer',
    };
    this.layers.update((arr) => [item, ...arr]);
    this.selectedLayerId.set(item.id);
    this.selectedLayerIds.set(new Set([item.id]));
    return item;
  }

  removeLayer(id: string): boolean {
    const flatLayers = this.flattenLayers(this.layers());
    if (flatLayers.length <= 1) {
      return false;
    }
    const item = this.findItemById(this.layers(), id);
    if (!item) return false;
    const next = this.removeItemById(this.layers(), id);
    this.layers.set(next);
    const currentSelectedIds = this.selectedLayerIds();
    if (currentSelectedIds.has(id)) {
      const newSelectedIds = new Set(currentSelectedIds);
      newSelectedIds.delete(id);
      if (newSelectedIds.size === 0) {
        const newAllIds = this.getAllLayerIds(next);
        if (newAllIds.length > 0) {
          newSelectedIds.add(newAllIds[0]);
          this.selectedLayerId.set(newAllIds[0]);
        }
      } else {
        this.selectedLayerId.set(Array.from(newSelectedIds)[0]);
      }
      this.selectedLayerIds.set(newSelectedIds);
    }
    return true;
  }

  reorderLayers(fromIndex: number, toIndex: number): boolean {
    const arr = [...this.layers()];
    if (fromIndex < 0 || fromIndex >= arr.length) return false;
    if (toIndex < 0) toIndex = 0;
    if (toIndex >= arr.length) toIndex = arr.length - 1;
    const [item] = arr.splice(fromIndex, 1);
    arr.splice(toIndex, 0, item);
    this.layers.set(arr);
    return true;
  }

  groupLayers(layerIds: string[]): GroupItem | null {
    if (layerIds.length < 2) return null;
    this.groupCounter++;
    const groupId = `group_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newGroup: GroupItem = {
      id: groupId,
      name: `Group ${this.groupCounter}`,
      visible: true,
      locked: false,
      type: 'group',
      expanded: true,
      children: [],
    };
    let updatedLayers = this.layers();
    const itemsToGroup: LayerTreeItem[] = [];
    for (const lid of layerIds) {
      const item = this.findItemById(updatedLayers, lid);
      if (item) {
        itemsToGroup.push(item);
        updatedLayers = this.removeItemById(updatedLayers, lid);
      }
    }
    newGroup.children = itemsToGroup;
    updatedLayers = [newGroup, ...updatedLayers];
    this.layers.set(updatedLayers);
    this.selectedLayerId.set(groupId);
    this.selectedLayerIds.set(new Set([groupId]));
    return newGroup;
  }

  ungroupLayers(groupId: string): boolean {
    const group = this.findItemById(this.layers(), groupId);
    if (!group || !isGroup(group)) return false;
    let updatedLayers = this.removeItemById(this.layers(), groupId);
    updatedLayers = [...group.children, ...updatedLayers];
    this.layers.set(updatedLayers);
    const firstChildId = group.children[0]?.id;
    if (firstChildId) {
      this.selectedLayerId.set(firstChildId);
      this.selectedLayerIds.set(new Set([firstChildId]));
    }
    return true;
  }

  resetLayers() {
    const id = `l_${Date.now().toString(36).slice(2, 8)}`;
    const item: LayerItem = {
      id,
      name: 'Layer 1',
      visible: true,
      locked: false,
      type: 'layer',
    };
    this.layers.set([item]);
    this.selectedLayerId.set(item.id);
    this.selectedLayerIds.set(new Set([item.id]));
  }

  ensureValidSelection() {
    const currentLayers = this.layers();
    const allIds = this.getAllLayerIds(currentLayers);
    if (allIds.length === 0) return;
    const currentSelectedId = this.selectedLayerId();
    const currentSelectedIds = this.selectedLayerIds();
    const validSelectedIds = new Set(
      Array.from(currentSelectedIds).filter((id) => allIds.includes(id)),
    );
    if (validSelectedIds.size === 0) {
      validSelectedIds.add(allIds[0]);
      this.selectedLayerId.set(allIds[0]);
      this.selectedLayerIds.set(validSelectedIds);
    } else if (!validSelectedIds.has(currentSelectedId)) {
      this.selectedLayerId.set(Array.from(validSelectedIds)[0]);
      this.selectedLayerIds.set(validSelectedIds);
    }
  }
}
