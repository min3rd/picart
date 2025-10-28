import { Injectable } from '@angular/core';
import { ToolDefinition, ToolService } from './tool.types';

@Injectable({ providedIn: 'root' })
export class EyedropperToolService implements ToolService<void> {
  readonly definition: ToolDefinition = {
    id: 'eyedropper',
    name: 'Eyedropper',
    labelKey: 'tools.eyedropper',
    icon: 'bootstrapEyedropper',
  };

  snapshot(): undefined {
    return undefined;
  }

  restore(): void {}
}
