export interface LayerItem {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  type: 'layer';
}

export interface GroupItem {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  type: 'group';
  expanded: boolean;
  children: LayerTreeItem[];
}

export type LayerTreeItem = LayerItem | GroupItem;

export function isGroup(item: LayerTreeItem): item is GroupItem {
  return item.type === 'group';
}

export function isLayer(item: LayerTreeItem): item is LayerItem {
  return item.type === 'layer';
}

export interface FrameItem {
  id: string;
  name: string;
  duration: number;
}

export interface BoneItem {
  id: string;
  name: string;
  parentId: string | null;
  x: number;
  y: number;
  rotation: number;
  length: number;
}

export interface AnimationItem {
  id: string;
  name: string;
  frames: FrameItem[];
  boneIds: string[];
  duration: number;
}

export interface ParsedColor {
  r: number;
  g: number;
  b: number;
  a?: number;
}
