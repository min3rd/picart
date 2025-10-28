import { Injectable } from '@angular/core';
import { ToolDefinition, ToolService } from './tool.types';

@Injectable({ providedIn: 'root' })
export class SquareToolService implements ToolService<void> {
  readonly definition: ToolDefinition = {
    id: 'square',
    name: 'Square',
    labelKey: 'tools.square',
    icon: 'bootstrapSquare',
  };

  snapshot(): undefined {
    return undefined;
  }

  restore(): void {}
}
