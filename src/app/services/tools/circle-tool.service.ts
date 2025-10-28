import { Injectable } from '@angular/core';
import { ToolDefinition, ToolService } from './tool.types';

@Injectable({ providedIn: 'root' })
export class CircleToolService implements ToolService<void> {
  readonly definition: ToolDefinition = {
    id: 'circle',
    name: 'Circle',
    labelKey: 'tools.circle',
    icon: 'bootstrapCircle',
  };

  snapshot(): undefined {
    return undefined;
  }

  restore(): void {}
}
