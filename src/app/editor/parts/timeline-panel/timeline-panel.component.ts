import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import {
  heroPlay,
  heroStop,
  heroPlus,
  heroTrash,
  heroDocumentDuplicate,
} from '@ng-icons/heroicons/outline';
import { EditorDocumentService } from '../../../services/editor-document.service';

@Component({
  selector: 'pa-timeline-panel',
  templateUrl: './timeline-panel.component.html',
  styleUrls: ['./timeline-panel.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, TranslocoPipe, NgIconComponent],
  providers: [
    provideIcons({
      heroPlay,
      heroStop,
      heroPlus,
      heroTrash,
      heroDocumentDuplicate,
    }),
  ],
  host: {
    class: 'block h-full',
  },
})
export class TimelinePanel {
  readonly document = inject(EditorDocumentService);

  setFrame(idx: number) {
    this.document.saveCurrentFrameState();
    this.document.loadFrameState(idx);
  }

  addFrame() {
    this.document.saveCurrentFrameState();
    this.document.addFrame();
  }

  deleteFrame(id: string) {
    this.document.removeFrame(id);
  }

  duplicateFrame(id: string) {
    this.document.saveCurrentFrameState();
    this.document.duplicateFrame(id);
  }

  playAnimation() {
    if (this.document.isAnimationPlaying()) {
      this.document.stopAnimation();
    } else {
      this.document.saveCurrentFrameState();
      this.document.playAnimation();
    }
  }

  setFps(fps: number) {
    this.document.setAnimationFps(fps);
  }
}
