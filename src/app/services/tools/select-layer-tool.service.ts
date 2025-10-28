import { Injectable } from '@angular/core';
import { ToolDefinition, ToolService } from './tool.types';

@Injectable({ providedIn: 'root' })
export class SelectLayerToolService implements ToolService<void> {
  readonly definition: ToolDefinition = {
    id: 'select-layer',
    name: 'Select layer',
    labelKey: 'tools.selectLayer',
    icon: 'featherMousePointer',
  };

  snapshot(): undefined {
    return undefined;
  }

  restore(): void {}
}
