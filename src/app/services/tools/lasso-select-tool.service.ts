import { Injectable } from '@angular/core';
import { ToolDefinition, ToolService } from './tool.types';

@Injectable({ providedIn: 'root' })
export class LassoSelectToolService implements ToolService<void> {
  readonly definition: ToolDefinition = {
    id: 'lasso-select',
    name: 'Lasso select',
    labelKey: 'tools.lassoSelect',
    icon: 'featherOctagon',
  };

  snapshot(): undefined {
    return undefined;
  }

  restore(): void {}
}
