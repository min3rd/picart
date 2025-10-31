import { Injectable, inject, signal } from '@angular/core';
import { EditorFrameService } from './editor-frame.service';

@Injectable({ providedIn: 'root' })
export class EditorAnimationService {
  private readonly frameService = inject(EditorFrameService);

  readonly isPlaying = signal<boolean>(false);
  readonly fps = signal<number>(10);

  private animationFrameId: number | null = null;
  private lastFrameTime = 0;

  play() {
    if (this.isPlaying()) return;
    this.isPlaying.set(true);
    this.lastFrameTime = performance.now();
    this.animate();
  }

  stop() {
    this.isPlaying.set(false);
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  setFps(fps: number) {
    this.fps.set(Math.max(1, Math.min(60, fps)));
  }

  private animate = () => {
    if (!this.isPlaying()) return;

    const now = performance.now();
    const frameInterval = 1000 / this.fps();

    if (now - this.lastFrameTime >= frameInterval) {
      this.advanceFrame();
      this.lastFrameTime = now;
    }

    this.animationFrameId = requestAnimationFrame(this.animate);
  };

  private advanceFrame() {
    const frames = this.frameService.frames();
    const currentIndex = this.frameService.currentFrameIndex();
    const nextIndex = (currentIndex + 1) % frames.length;
    this.frameService.setCurrentFrame(nextIndex);
  }
}
