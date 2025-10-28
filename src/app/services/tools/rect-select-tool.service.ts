import { Injectable } from '@angular/core';
import { ToolDefinition, ToolService } from './tool.types';

@Injectable({ providedIn: 'root' })
export class RectSelectToolService implements ToolService<void> {
  readonly definition: ToolDefinition = {
    id: 'rect-select',
    name: 'Rect select',
    labelKey: 'tools.rectSelect',
    icon: 'featherSquare',
  };

  snapshot(): undefined {
    return undefined;
  }

  restore(): void {}
}
