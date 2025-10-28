import { Injectable } from '@angular/core';
import { ToolDefinition, ToolService } from './tool.types';

@Injectable({ providedIn: 'root' })
export class FillToolService implements ToolService<void> {
  readonly definition: ToolDefinition = {
    id: 'fill',
    name: 'Fill',
    labelKey: 'tools.fill',
    icon: 'bootstrapDroplet',
  };

  snapshot(): undefined {
    return undefined;
  }

  restore(): void {}
}
