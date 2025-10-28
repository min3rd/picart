import { Injectable } from '@angular/core';
import { ToolDefinition, ToolService } from './tool.types';

@Injectable({ providedIn: 'root' })
export class LineToolService implements ToolService<void> {
  readonly definition: ToolDefinition = {
    id: 'line',
    name: 'Line',
    labelKey: 'tools.line',
    icon: 'bootstrapVectorPen',
  };

  snapshot(): undefined {
    return undefined;
  }

  restore(): void {}
}
