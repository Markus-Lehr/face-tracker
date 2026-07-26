import { KeyframeData, AnimationClip, dbService } from './dbService';
import { extractARKitWeights } from '../utils/arkitShapes';
import { FaceLandmarkerResult } from '@mediapipe/tasks-vision';

export type RecordingState = 'idle' | 'countdown' | 'recording';

export class RecordingManager {
  private state: RecordingState = 'idle';
  private countdownValue = 3;
  private countdownTimer: number | null = null;
  private keyframes: KeyframeData[] = [];
  private startTime = 0;
  private activeClipName = '';

  // Callbacks
  onStateChange?: (state: RecordingState, countdown?: number) => void;
  onFrameRecorded?: (keyframeIndex: number, timestamp: number) => void;
  onClipSaved?: (clip: AnimationClip) => void;

  getState(): RecordingState {
    return this.state;
  }

  getRecordingDuration(): number {
    if (this.state !== 'recording') return 0;
    return (performance.now() - this.startTime) / 1000;
  }

  getKeyframeOptionsCount(): number {
    return this.keyframes.length;
  }

  startRecordingSequence(clipName?: string): void {
    if (this.state !== 'idle') return;

    this.activeClipName = clipName || `Face Clip ${new Date().toLocaleTimeString()}`;
    this.state = 'countdown';
    this.countdownValue = 3;
    this.onStateChange?.(this.state, this.countdownValue);

    this.countdownTimer = window.setInterval(() => {
      this.countdownValue -= 1;
      if (this.countdownValue > 0) {
        this.onStateChange?.('countdown', this.countdownValue);
      } else {
        if (this.countdownTimer !== null) {
          clearInterval(this.countdownTimer);
          this.countdownTimer = null;
        }
        this.startActualRecording();
      }
    }, 1000);
  }

  private startActualRecording(): void {
    this.state = 'recording';
    this.keyframes = [];
    this.startTime = performance.now();
    this.onStateChange?.('recording');
  }

  processDetectedFrame(result: FaceLandmarkerResult | null): number[] | null {
    if (!result || !result.faceBlendshapes || result.faceBlendshapes.length === 0) {
      return null;
    }

    const categories = result.faceBlendshapes[0].categories;
    const weights = extractARKitWeights(categories);

    if (this.state === 'recording') {
      const elapsedSeconds = (performance.now() - this.startTime) / 1000;
      const keyframe: KeyframeData = {
        time: Number(elapsedSeconds.toFixed(3)),
        weights
      };
      this.keyframes.push(keyframe);
      this.onFrameRecorded?.(this.keyframes.length - 1, keyframe.time);
    }

    return weights;
  }

  async stopRecording(): Promise<AnimationClip | null> {
    if (this.state !== 'recording' && this.state !== 'countdown') {
      return null;
    }

    if (this.countdownTimer !== null) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }

    if (this.state === 'countdown') {
      this.state = 'idle';
      this.onStateChange?.('idle');
      return null;
    }

    this.state = 'idle';
    this.onStateChange?.('idle');

    if (this.keyframes.length === 0) {
      return null;
    }

    const duration = this.keyframes[this.keyframes.length - 1].time;
    const estimatedFps = Math.round(this.keyframes.length / (duration || 1)) || 30;

    const clip: AnimationClip = {
      id: `clip_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: this.activeClipName,
      createdAt: Date.now(),
      duration: Number(duration.toFixed(2)),
      fps: estimatedFps,
      keyframeMapCount: this.keyframes.length,
      trimStartFrame: 0,
      trimEndFrame: this.keyframes.length - 1,
      keyframes: [...this.keyframes]
    };

    await dbService.saveClip(clip);
    this.onClipSaved?.(clip);
    return clip;
  }

  cancelCountdown(): void {
    if (this.countdownTimer !== null) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    this.state = 'idle';
    this.onStateChange?.('idle');
  }
}

export const recordingManager = new RecordingManager();
