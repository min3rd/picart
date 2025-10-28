import { Injectable } from '@angular/core';
import { ToolDefinition, ToolService } from './tool.types';

@Injectable({ providedIn: 'root' })
export class EllipseSelectToolService implements ToolService<void> {
  readonly definition: ToolDefinition = {
    id: 'ellipse-select',
    name: 'Ellipse select',
    labelKey: 'tools.ellipseSelect',
    icon: 'featherCircle',
  };

  snapshot(): undefined {
    return undefined;
  }

  restore(): void {}
}
