import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  EditorDocumentService,
  isGroup,
  isLayer,
  LayerTreeItem,
} from '../../../services/editor-document.service';
import { TranslocoPipe } from '@jsverse/transloco';
import { NgIcon } from '@ng-icons/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'pa-layers-panel',
  templateUrl: './layers-panel.component.html',
  styleUrls: ['./layers-panel.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe, NgIcon, FormsModule],
  host: {
    class: 'block h-full',
  },
})
export class LayersPanel {
  readonly document = inject(EditorDocumentService);
  private dragIndex: number | null = null;
  private lastSelectedIndex: number | null = null;
  readonly contextMenuVisible = signal(false);
  readonly contextMenuPosition = signal<{ x: number; y: number }>({ x: 0, y: 0 });
  readonly contextMenuLayerId = signal<string | null>(null);
  readonly editingLayerId = signal<string | null>(null);
  readonly editingLayerName = signal('');

  readonly isGroup = isGroup;
  readonly isLayer = isLayer;

  select(id: string, event?: MouseEvent) {
    if (event?.ctrlKey || event?.metaKey) {
      this.document.toggleLayerSelection(id, true);
      const layers = this.document.layers();
      this.lastSelectedIndex = layers.findIndex((l) => l.id === id);
    } else if (event?.shiftKey && this.lastSelectedIndex !== null) {
      const layers = this.document.layers();
      const currentIndex = layers.findIndex((l) => l.id === id);
      if (currentIndex !== -1) {
        const fromId = layers[this.lastSelectedIndex].id;
        this.document.selectLayerRange(fromId, id);
      }
    } else {
      this.document.selectLayer(id);
      const layers = this.document.layers();
      this.lastSelectedIndex = layers.findIndex((l) => l.id === id);
    }
  }

  isSelected(id: string): boolean {
    return this.document.selectedLayerIds().has(id);
  }

  onAddLayer() {
    this.document.addLayer();
  }

  onDragStart(ev: DragEvent, index: number) {
    this.dragIndex = index;
    try {
      ev.dataTransfer?.setData('text/plain', String(index));
    } catch {}
  }

  onDragOver(ev: DragEvent, index: number) {
    ev.preventDefault();
  }

  onDrop(ev: DragEvent, index: number) {
    ev.preventDefault();
    const from =
      this.dragIndex ??
      parseInt(ev.dataTransfer?.getData('text/plain') || '-1', 10);
    if (from >= 0 && from !== index) {
      this.document.reorderLayers(from, index);
    }
    this.dragIndex = null;
  }

  onContextMenu(event: MouseEvent, layerId: string) {
    event.preventDefault();
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    this.contextMenuPosition.set({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    });
    this.contextMenuLayerId.set(layerId);
    this.contextMenuVisible.set(true);
  }

  closeContextMenu() {
    this.contextMenuVisible.set(false);
    this.contextMenuLayerId.set(null);
  }

  onSelectPixel() {
    const layerId = this.contextMenuLayerId();
    if (layerId) {
      this.document.selectPixelForLayer(layerId);
    }
    this.closeContextMenu();
  }

  onDuplicate() {
    const layerId = this.contextMenuLayerId();
    if (layerId) {
      this.document.duplicateLayer(layerId);
    }
    this.closeContextMenu();
  }

  onDelete() {
    const layerId = this.contextMenuLayerId();
    if (layerId) {
      this.document.removeLayer(layerId);
    }
    this.closeContextMenu();
  }

  onMerge() {
    const selectedIds = Array.from(this.document.selectedLayerIds());
    if (selectedIds.length >= 2) {
      this.document.mergeLayers(selectedIds);
    }
    this.closeContextMenu();
  }

  onGroup() {
    const selectedIds = Array.from(this.document.selectedLayerIds());
    if (selectedIds.length >= 2) {
      this.document.groupLayers(selectedIds);
    }
    this.closeContextMenu();
  }

  onUngroup() {
    const layerId = this.contextMenuLayerId();
    if (layerId) {
      this.document.ungroupLayers(layerId);
    }
    this.closeContextMenu();
  }

  get selectedCount(): number {
    return this.document.selectedLayerIds().size;
  }

  onToggleExpand(id: string, event: MouseEvent) {
    event.stopPropagation();
    this.document.toggleGroupExpanded(id);
  }

  onDoubleClick(item: LayerTreeItem) {
    this.editingLayerId.set(item.id);
    this.editingLayerName.set(item.name);
  }

  onRenameBlur() {
    const id = this.editingLayerId();
    const newName = this.editingLayerName().trim();
    if (id && newName) {
      this.document.renameLayer(id, newName);
    }
    this.editingLayerId.set(null);
  }

  onRenameKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.onRenameBlur();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.editingLayerId.set(null);
    }
  }

  getFlattenedLayers(): { item: LayerTreeItem; depth: number }[] {
    const result: { item: LayerTreeItem; depth: number }[] = [];
    const traverse = (items: LayerTreeItem[], depth: number) => {
      for (const item of items) {
        result.push({ item, depth });
        if (isGroup(item) && item.expanded) {
          traverse(item.children, depth + 1);
        }
      }
    };
    traverse(this.document.layers(), 0);
    return result;
  }
}
