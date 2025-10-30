export interface LayerChange {
  layerId: string;
  indices: number[];
  previous: string[];
  next: string[];
}

export interface MetaChange {
  key: string;
  previous: any;
  next: any;
}

export interface HistoryEntry {
  pixelChanges?: LayerChange[];
  metaChanges?: MetaChange[];
  description?: string;
}

export interface CurrentAction {
  map: Map<string, { indices: number[]; previous: string[]; next: string[] }>;
  meta: MetaChange[];
  description?: string;
}
