import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { EditorDocumentService } from '../../../services/editor-document.service';
import { EditorToolsService } from '../../../services/editor-tools.service';
import { GradientType, ToolId } from '../../../services/tools/tool.types';
import { NgIcon } from '@ng-icons/core';
import { TranslocoPipe } from '@jsverse/transloco';

@Component({
  selector: 'pa-tool-palette',
  templateUrl: './tool-palette.component.html',
  styleUrls: ['./tool-palette.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, TranslocoPipe],
  host: {
    class: 'block h-full',
  },
})
export class ToolPalette {
  readonly document = inject(EditorDocumentService);
  readonly tools = inject(EditorToolsService);

  select(id: ToolId) {
    this.tools.selectTool(id);
  }

  setFillMode(mode: 'color' | 'erase') {
    this.tools.setFillMode(mode);
  }

  onFillColorInput(event: Event) {
    const v = (event.target as HTMLInputElement).value;
    this.tools.setFillColor(v);
  }

  get maxCanvasDim() {
    return Math.max(
      1,
      Math.max(this.document.canvasWidth(), this.document.canvasHeight()),
    );
  }

  onBrushSizeInput(event: Event) {
    const v = (event.target as HTMLInputElement).value;
    const n = Number(v);
    if (!Number.isNaN(n))
      this.tools.setBrushSize(Math.floor(n), this.maxCanvasDim);
  }

  onBrushColorInput(event: Event) {
    const v = (event.target as HTMLInputElement).value;
    this.tools.setBrushColor(v);
  }

  onLineThicknessInput(event: Event) {
    const v = (event.target as HTMLInputElement).value;
    const n = Number(v);
    if (!Number.isNaN(n))
      this.tools.setLineThickness(Math.floor(n), this.maxCanvasDim);
  }

  onLineColorInput(event: Event) {
    const v = (event.target as HTMLInputElement).value;
    this.tools.setLineColor(v);
  }

  onCircleStrokeThicknessInput(event: Event) {
    const v = (event.target as HTMLInputElement).value;
    const n = Number(v);
    if (!Number.isNaN(n))
      this.tools.setCircleStrokeThickness(Math.floor(n), this.maxCanvasDim);
  }

  onCircleStrokeColorInput(event: Event) {
    const v = (event.target as HTMLInputElement).value;
    this.tools.setCircleStrokeColor(v);
  }

  onCircleFillColorInput(event: Event) {
    const v = (event.target as HTMLInputElement).value;
    this.tools.setCircleFillColor(v);
  }

  setCircleFillMode(mode: 'solid' | 'gradient') {
    this.tools.setCircleFillMode(mode);
  }

  onCircleGradientStartInput(event: Event) {
    const v = (event.target as HTMLInputElement).value;
    this.tools.setCircleGradientStartColor(v);
  }

  onCircleGradientEndInput(event: Event) {
    const v = (event.target as HTMLInputElement).value;
    this.tools.setCircleGradientEndColor(v);
  }

  setCircleGradientType(type: GradientType) {
    this.tools.setCircleGradientType(type === 'radial' ? 'radial' : 'linear');
  }

  onCircleGradientAngleInput(event: Event) {
    const v = (event.target as HTMLInputElement).value;
    const n = Number(v);
    if (!Number.isNaN(n)) this.tools.setCircleGradientAngle(Math.round(n));
  }

  onSquareStrokeThicknessInput(event: Event) {
    const v = (event.target as HTMLInputElement).value;
    const n = Number(v);
    if (!Number.isNaN(n))
      this.tools.setSquareStrokeThickness(Math.floor(n), this.maxCanvasDim);
  }

  onSquareStrokeColorInput(event: Event) {
    const v = (event.target as HTMLInputElement).value;
    this.tools.setSquareStrokeColor(v);
  }

  onSquareFillColorInput(event: Event) {
    const v = (event.target as HTMLInputElement).value;
    this.tools.setSquareFillColor(v);
  }

  setSquareFillMode(mode: 'solid' | 'gradient') {
    this.tools.setSquareFillMode(mode);
  }

  onSquareGradientStartInput(event: Event) {
    const v = (event.target as HTMLInputElement).value;
    this.tools.setSquareGradientStartColor(v);
  }

  onSquareGradientEndInput(event: Event) {
    const v = (event.target as HTMLInputElement).value;
    this.tools.setSquareGradientEndColor(v);
  }

  setSquareGradientType(type: GradientType) {
    this.tools.setSquareGradientType(type === 'radial' ? 'radial' : 'linear');
  }

  onSquareGradientAngleInput(event: Event) {
    const v = (event.target as HTMLInputElement).value;
    const n = Number(v);
    if (!Number.isNaN(n)) this.tools.setSquareGradientAngle(Math.round(n));
  }

  onEraserSizeInput(event: Event) {
    const v = (event.target as HTMLInputElement).value;
    const n = Number(v);
    if (!Number.isNaN(n))
      this.tools.setEraserSize(Math.floor(n), this.maxCanvasDim);
  }

  onEraserStrengthInput(event: Event) {
    const v = (event.target as HTMLInputElement).value;
    const n = Number(v);
    if (!Number.isNaN(n)) this.tools.setEraserStrength(Math.floor(n));
  }
}
