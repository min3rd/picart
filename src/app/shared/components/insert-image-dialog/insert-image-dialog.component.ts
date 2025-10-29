import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NgIcon } from '@ng-icons/core';

export interface InsertImageResult {
  file: File;
  width: number;
  height: number;
}

@Component({
  selector: 'pa-insert-image-dialog',
  templateUrl: './insert-image-dialog.component.html',
  styleUrls: ['./insert-image-dialog.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe, NgIcon],
})
export class InsertImageDialog {
  readonly isOpen = signal(false);
  readonly imageFile = signal<File | null>(null);
  readonly imagePreviewUrl = signal<string | null>(null);
  readonly originalWidth = signal<number>(0);
  readonly originalHeight = signal<number>(0);
  readonly targetWidth = signal<string>('');
  readonly targetHeight = signal<string>('');

  readonly onConfirm = output<InsertImageResult>();
  readonly onCancel = output<void>();

  readonly previewWidth = computed(() => {
    const val = this.targetWidth().trim();
    return val ? Number.parseInt(val, 10) : this.originalWidth();
  });

  readonly previewHeight = computed(() => {
    const val = this.targetHeight().trim();
    return val ? Number.parseInt(val, 10) : this.originalHeight();
  });

  readonly previewDimensions = computed(() => {
    const w = this.previewWidth();
    const h = this.previewHeight();
    return `${w} × ${h}`;
  });

  open(file: File) {
    this.imageFile.set(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      if (!e.target?.result) return;
      const url = e.target.result as string;
      this.imagePreviewUrl.set(url);
      const img = new Image();
      img.onload = () => {
        this.originalWidth.set(img.width);
        this.originalHeight.set(img.height);
        this.targetWidth.set('');
        this.targetHeight.set('');
      };
      img.src = url;
    };
    reader.readAsDataURL(file);
    this.isOpen.set(true);
  }

  close() {
    this.isOpen.set(false);
    this.imageFile.set(null);
    this.imagePreviewUrl.set(null);
    this.originalWidth.set(0);
    this.originalHeight.set(0);
    this.targetWidth.set('');
    this.targetHeight.set('');
  }

  handleConfirm() {
    const file = this.imageFile();
    if (!file) return;
    const width = this.previewWidth();
    const height = this.previewHeight();
    this.onConfirm.emit({ file, width, height });
    this.close();
  }

  handleCancel() {
    this.onCancel.emit();
    this.close();
  }

  handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      this.handleCancel();
    }
  }

  onWidthInput(event: Event) {
    const input = event.target as HTMLInputElement;
    this.targetWidth.set(input.value);
  }

  onHeightInput(event: Event) {
    const input = event.target as HTMLInputElement;
    this.targetHeight.set(input.value);
  }
}
