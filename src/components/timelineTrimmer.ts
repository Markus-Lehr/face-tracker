import { AnimationClip, dbService } from '../services/dbService';

export class TimelineTrimmer {
  private container: HTMLElement;
  private clip: AnimationClip | null = null;
  private currentFrame = 0;
  private isPlaying = false;
  private playAnimId: number | null = null;

  // Callbacks
  onFrameSeek?: (frameIndex: number, weights: number[], time: number) => void;
  onTrimChange?: (trimStartFrame: number, trimEndFrame: number) => void;

  // UI elements
  private playBtn!: HTMLButtonElement;
  private scrubberTrack!: HTMLDivElement;
  private playhead!: HTMLDivElement;
  private trimStartHandle!: HTMLDivElement;
  private trimEndHandle!: HTMLDivElement;
  private trimHighlight!: HTMLDivElement;
  private timeLabel!: HTMLSpanElement;
  private frameLabel!: HTMLSpanElement;

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderSkeleton();
  }

  private renderSkeleton(): void {
    this.container.innerHTML = `
      <div class="timeline-panel flex flex-col gap-2 p-3 bg-slate-900/90 rounded-xl border border-slate-800">
        <div class="flex items-center justify-between text-xs text-slate-400 mb-1">
          <div class="flex items-center gap-2">
            <button id="timeline-play-btn" class="px-3 py-1 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold rounded-lg flex items-center gap-1 transition disabled:opacity-50" disabled>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> Play
            </button>
            <span id="timeline-name" class="font-semibold text-slate-200">No clip loaded</span>
          </div>
          <div class="flex items-center gap-4 font-mono text-slate-300">
            <span id="timeline-time">00:00.00 / 00:00.00</span>
            <span id="timeline-frame" class="text-sky-400 font-bold">Frame 0 / 0</span>
          </div>
        </div>

        <div id="scrubber-track" class="relative h-8 bg-slate-950 rounded-lg border border-slate-800 cursor-pointer overflow-hidden select-none">
          <div id="trim-highlight" class="absolute top-0 bottom-0 bg-sky-500/20 border-x border-sky-400/50"></div>
          <div id="trim-start-handle" class="absolute top-0 bottom-0 w-2.5 bg-sky-400 cursor-ew-resize rounded-l z-20 hover:bg-sky-300 flex items-center justify-center">
            <div class="w-0.5 h-3 bg-slate-950"></div>
          </div>
          <div id="trim-end-handle" class="absolute top-0 bottom-0 w-2.5 bg-sky-400 cursor-ew-resize rounded-r z-20 hover:bg-sky-300 flex items-center justify-center">
            <div class="w-0.5 h-3 bg-slate-950"></div>
          </div>
          <div id="timeline-playhead" class="absolute top-0 bottom-0 w-1 bg-red-500 z-30 pointer-events-none shadow-[0_0_8px_rgba(239,68,68,0.8)]"></div>
        </div>
      </div>
    `;

    this.playBtn = this.container.querySelector('#timeline-play-btn')!;
    this.scrubberTrack = this.container.querySelector('#scrubber-track')!;
    this.playhead = this.container.querySelector('#timeline-playhead')!;
    this.trimStartHandle = this.container.querySelector('#trim-start-handle')!;
    this.trimEndHandle = this.container.querySelector('#trim-end-handle')!;
    this.trimHighlight = this.container.querySelector('#trim-highlight')!;
    this.timeLabel = this.container.querySelector('#timeline-time')!;
    this.frameLabel = this.container.querySelector('#timeline-frame')!;

    this.setupEventListeners();
  }

  loadClip(clip: AnimationClip): void {
    this.clip = clip;
    this.currentFrame = clip.trimStartFrame;
    this.isPlaying = false;
    if (this.playAnimId) cancelAnimationFrame(this.playAnimId);

    const nameEl = this.container.querySelector('#timeline-name')!;
    nameEl.textContent = clip.name;

    this.playBtn.disabled = false;
    this.updateUI();
    this.seekFrame(this.currentFrame);
  }

  private setupEventListeners(): void {
    this.playBtn.addEventListener('click', () => this.togglePlay());

    // Track click seek
    this.scrubberTrack.addEventListener('click', (e) => {
      if (!this.clip || this.clip.keyframes.length === 0) return;
      const rect = this.scrubberTrack.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const targetFrame = Math.round(ratio * (this.clip.keyframes.length - 1));
      this.seekFrame(targetFrame);
    });

    // Handle Dragging
    let activeDrag: 'start' | 'end' | null = null;

    const onPointerMove = (e: PointerEvent) => {
      if (!activeDrag || !this.clip) return;
      const rect = this.scrubberTrack.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const frameIdx = Math.round(ratio * (this.clip.keyframes.length - 1));

      if (activeDrag === 'start') {
        this.clip.trimStartFrame = Math.min(frameIdx, this.clip.trimEndFrame - 1);
        if (this.currentFrame < this.clip.trimStartFrame) {
          this.seekFrame(this.clip.trimStartFrame);
        }
      } else if (activeDrag === 'end') {
        this.clip.trimEndFrame = Math.max(frameIdx, this.clip.trimStartFrame + 1);
        if (this.currentFrame > this.clip.trimEndFrame) {
          this.seekFrame(this.clip.trimEndFrame);
        }
      }

      this.updateUI();
    };

    const onPointerUp = async () => {
      if (activeDrag && this.clip) {
        activeDrag = null;
        // Non-destructively persist trim to IndexedDB
        await dbService.updateClipTrim(this.clip.id, this.clip.trimStartFrame, this.clip.trimEndFrame);
        this.onTrimChange?.(this.clip.trimStartFrame, this.clip.trimEndFrame);
      }
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    this.trimStartHandle.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      activeDrag = 'start';
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    });

    this.trimEndHandle.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      activeDrag = 'end';
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    });
  }

  togglePlay(): void {
    if (!this.clip || this.clip.keyframes.length === 0) return;
    this.isPlaying = !this.isPlaying;

    if (this.isPlaying) {
      this.playBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg> Pause`;
      if (this.currentFrame >= this.clip.trimEndFrame) {
        this.currentFrame = this.clip.trimStartFrame;
      }
      let lastTime = performance.now();
      const frameInterval = 1000 / (this.clip.fps || 30);

      const loop = (now: number) => {
        if (!this.isPlaying || !this.clip) return;
        const delta = now - lastTime;
        if (delta >= frameInterval) {
          lastTime = now - (delta % frameInterval);
          this.currentFrame += 1;
          if (this.currentFrame > this.clip.trimEndFrame) {
            this.currentFrame = this.clip.trimStartFrame;
          }
          this.seekFrame(this.currentFrame);
        }
        this.playAnimId = requestAnimationFrame(loop);
      };
      this.playAnimId = requestAnimationFrame(loop);
    } else {
      this.playBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> Play`;
      if (this.playAnimId) cancelAnimationFrame(this.playAnimId);
    }
  }

  seekFrame(frameIndex: number): void {
    if (!this.clip || this.clip.keyframes.length === 0) return;

    this.currentFrame = Math.max(0, Math.min(frameIndex, this.clip.keyframes.length - 1));
    const kf = this.clip.keyframes[this.currentFrame];

    this.updateUI();
    this.onFrameSeek?.(this.currentFrame, kf.weights, kf.time);
  }

  private updateUI(): void {
    if (!this.clip || this.clip.keyframes.length === 0) return;

    const total = this.clip.keyframes.length - 1 || 1;
    const startRatio = this.clip.trimStartFrame / total;
    const endRatio = this.clip.trimEndFrame / total;
    const currentRatio = this.currentFrame / total;

    // Handles & highlight positions
    this.trimStartHandle.style.left = `${startRatio * 100}%`;
    this.trimEndHandle.style.left = `calc(${endRatio * 100}% - 10px)`;
    this.trimHighlight.style.left = `${startRatio * 100}%`;
    this.trimHighlight.style.width = `${(endRatio - startRatio) * 100}%`;
    this.playhead.style.left = `${currentRatio * 100}%`;

    // Labels
    const currentTime = this.clip.keyframes[this.currentFrame]?.time ?? 0;
    const totalTime = this.clip.duration;
    this.timeLabel.textContent = `${currentTime.toFixed(2)}s / ${totalTime.toFixed(2)}s`;
    this.frameLabel.textContent = `Frame ${this.currentFrame} / ${total}`;
  }
}
