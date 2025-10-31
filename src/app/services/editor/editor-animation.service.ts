import { Injectable, inject, signal } from '@angular/core';
import { EditorFrameService } from './editor-frame.service';

@Injectable({ providedIn: 'root' })
export class EditorAnimationService {
  private readonly frameService = inject(EditorFrameService);
  private loadFrameCallback: ((index: number) => void) | null = null;

  readonly isPlaying = signal<boolean>(false);
  readonly fps = signal<number>(10);

  private animationFrameId: number | null = null;
  private lastFrameTime = 0;

  setLoadFrameCallback(callback: (index: number) => void) {
    this.loadFrameCallback = callback;
  }

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
    if (frames.length === 0) return;
    
    const currentIndex = this.frameService.currentFrameIndex();
    const nextIndex = (currentIndex + 1) % frames.length;
    
    if (this.loadFrameCallback) {
      this.loadFrameCallback(nextIndex);
    } else {
      this.frameService.setCurrentFrame(nextIndex);
    }
  }
}
