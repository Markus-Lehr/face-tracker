import * as THREE from 'three';
import { mediapipeService } from './services/mediapipeService';
import { threeService } from './services/threeService';
import { recordingManager, RecordingState } from './services/recordingManager';
import { MetadataOverlay } from './components/metadataOverlay';
import { TimelineTrimmer } from './components/timelineTrimmer';
import { ClipLibrary } from './components/clipLibrary';
import { ExportDialog } from './components/exportDialog';
import { AnimationClip } from './services/dbService';

class App {
  // Elements
  private videoEl!: HTMLVideoElement;
  private videoCanvas!: HTMLCanvasElement;
  private videoCtx!: CanvasRenderingContext2D;
  private metadataCanvas!: HTMLCanvasElement;
  private metadataOverlay!: MetadataOverlay;

  private timelineTrimmer!: TimelineTrimmer;
  private clipLibrary!: ClipLibrary;
  private exportDialog!: ExportDialog;

  // State
  private inputMode: 'Webcam' | 'Video File' = 'Webcam';
  private webcamStream: MediaStream | null = null;
  private isProcessingLoopActive = false;
  private lastFrameTimestamp = 0;
  private frameCount = 0;
  private currentFps = 0;
  private lastFpsCalcTime = performance.now();
  private isHistoricalScrubbing = false;

  // Controls & Badges
  private statusBadgeText!: HTMLElement;
  private countdownOverlay!: HTMLElement;
  private countdownNumber!: HTMLElement;
  private startRecBtn!: HTMLButtonElement;
  private stopRecBtn!: HTMLButtonElement;
  private clipNameInput!: HTMLInputElement;
  private videoFileInput!: HTMLInputElement;
  private gltfFileInput!: HTMLInputElement;
  private videoFilenameTag!: HTMLElement;

  constructor() {
    this.bindDOM();
    this.initComponents();
    this.setupEventListeners();
    this.initServices();
  }

  private bindDOM(): void {
    this.videoEl = document.querySelector('#input-video')!;
    this.videoCanvas = document.querySelector('#video-canvas')!;
    this.videoCtx = this.videoCanvas.getContext('2d')!;
    this.metadataCanvas = document.querySelector('#metadata-canvas')!;

    this.statusBadgeText = document.querySelector('#mediapipe-status-text')!;
    this.countdownOverlay = document.querySelector('#countdown-overlay')!;
    this.countdownNumber = document.querySelector('#countdown-number')!;
    this.startRecBtn = document.querySelector('#start-rec-btn')!;
    this.stopRecBtn = document.querySelector('#stop-rec-btn')!;
    this.clipNameInput = document.querySelector('#clip-name-input')!;
    this.videoFileInput = document.querySelector('#video-file-input')!;
    this.gltfFileInput = document.querySelector('#gltf-file-input')!;
    this.videoFilenameTag = document.querySelector('#video-filename-tag')!;
  }

  private initComponents(): void {
    // Metadata HUD Overlay
    this.metadataOverlay = new MetadataOverlay(this.metadataCanvas);

    // Timeline Trimmer Bottom Panel
    const timelineContainer = document.querySelector('#timeline-container')!;
    this.timelineTrimmer = new TimelineTrimmer(timelineContainer as HTMLElement);
    this.timelineTrimmer.onFrameSeek = (_frameIdx, weights) => {
      this.isHistoricalScrubbing = true;
      threeService.updateBlendshapes(weights);
    };

    // Clip Library Manager
    const libraryContainer = document.querySelector('#library-container')!;
    this.clipLibrary = new ClipLibrary(libraryContainer as HTMLElement);
    this.clipLibrary.onSelectClip = (clip: AnimationClip) => {
      this.timelineTrimmer.loadClip(clip);
    };
    this.clipLibrary.onExportClip = (clip: AnimationClip) => {
      this.exportDialog.open(clip);
    };

    // Export Dialog Modal
    const exportModalContainer = document.querySelector('#export-modal-container')!;
    this.exportDialog = new ExportDialog(exportModalContainer as HTMLElement);

    // Three.js 3D Avatar Container
    const threeContainer = document.querySelector('#three-container')!;
    threeService.init(threeContainer as HTMLElement);
  }

  private setupEventListeners(): void {
    // Webcam vs Video switch
    document.querySelector('#src-webcam-btn')?.addEventListener('click', () => this.switchToWebcam());
    document.querySelector('#src-video-btn')?.addEventListener('click', () => {
      this.videoFileInput.click();
    });

    this.videoFileInput.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) this.loadVideoFile(file);
    });

    // GLTF Custom File upload
    this.gltfFileInput.addEventListener('change', async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        try {
          await threeService.loadCustomGLTF(file);
          alert(`Successfully loaded custom GLTF model "${file.name}"!`);
        } catch (err) {
          alert('Failed to load custom GLTF model. Make sure it is a valid .gltf/.glb file.');
        }
      }
    });

    // Reset Avatar
    document.querySelector('#reset-avatar-btn')?.addEventListener('click', () => {
      threeService.resetToDefaultAvatar();
    });

    // Material & Depth Controls
    const depthTestCb = document.querySelector('#depth-test-cb') as HTMLInputElement;
    depthTestCb?.addEventListener('change', (e) => {
      threeService.updateMaterialSettings({ depthTest: (e.target as HTMLInputElement).checked });
    });

    const depthWriteCb = document.querySelector('#depth-write-cb') as HTMLInputElement;
    depthWriteCb?.addEventListener('change', (e) => {
      threeService.updateMaterialSettings({ depthWrite: (e.target as HTMLInputElement).checked });
    });

    const cullingSelect = document.querySelector('#culling-side-select') as HTMLSelectElement;
    cullingSelect?.addEventListener('change', (e) => {
      const val = (e.target as HTMLSelectElement).value;
      let side: THREE.Side = THREE.FrontSide;
      if (val === 'double') side = THREE.DoubleSide;
      if (val === 'back') side = THREE.BackSide;
      threeService.updateMaterialSettings({ side });
    });

    const forceOpaqueCb = document.querySelector('#force-opaque-cb') as HTMLInputElement;
    forceOpaqueCb?.addEventListener('change', (e) => {
      threeService.updateMaterialSettings({ forceOpaque: (e.target as HTMLInputElement).checked });
    });

    // Wireframe Checkbox
    const wireframeCb = document.querySelector('#toggle-wireframe-cb') as HTMLInputElement;
    wireframeCb?.addEventListener('change', (e) => {
      threeService.setWireframeVisible((e.target as HTMLInputElement).checked);
    });

    // Recording Controls
    this.startRecBtn.addEventListener('click', () => {
      this.timelineTrimmer.togglePlay(); // pause any playback
      this.isHistoricalScrubbing = false;
      recordingManager.startRecordingSequence(this.clipNameInput.value.trim());
    });

    this.stopRecBtn.addEventListener('click', async () => {
      const savedClip = await recordingManager.stopRecording();
      if (savedClip) {
        await this.clipLibrary.refresh();
        this.timelineTrimmer.loadClip(savedClip);
      }
    });

    // Recording State Callbacks
    recordingManager.onStateChange = (state: RecordingState, countdown?: number) => {
      if (state === 'countdown') {
        this.countdownOverlay.classList.remove('hidden');
        if (countdown !== undefined) {
          this.countdownNumber.textContent = countdown.toString();
        }
        this.startRecBtn.disabled = true;
      } else if (state === 'recording') {
        this.countdownOverlay.classList.add('hidden');
        this.startRecBtn.classList.add('hidden');
        this.stopRecBtn.classList.remove('hidden');
      } else {
        // Idle
        this.countdownOverlay.classList.add('hidden');
        this.startRecBtn.classList.remove('hidden');
        this.startRecBtn.disabled = !mediapipeService.ready;
        this.stopRecBtn.classList.add('hidden');
      }
    };
  }

  private async initServices(): Promise<void> {
    try {
      await mediapipeService.initialize((msg) => {
        this.statusBadgeText.textContent = msg;
      });

      this.statusBadgeText.textContent = 'MediaPipe Ready';
      document.querySelector('#mediapipe-status-badge span')?.classList.replace('bg-amber-400', 'bg-emerald-400');
      this.startRecBtn.disabled = false;

      // Load clips from IndexedDB
      await this.clipLibrary.refresh();

      // Default to Webcam
      await this.switchToWebcam();
    } catch (err) {
      this.statusBadgeText.textContent = 'Failed to load MediaPipe';
      console.error('MediaPipe Init Error:', err);
    }
  }

  private async switchToWebcam(): Promise<void> {
    this.inputMode = 'Webcam';

    // Highlight buttons
    document.querySelector('#src-webcam-btn')?.classList.add('bg-sky-500', 'text-slate-950');
    document.querySelector('#src-webcam-btn')?.classList.remove('text-slate-400');
    document.querySelector('#src-video-btn')?.classList.remove('bg-sky-500', 'text-slate-950');
    document.querySelector('#src-video-btn')?.classList.add('text-slate-400');
    this.videoFilenameTag.classList.add('hidden');

    try {
      if (this.webcamStream) {
        this.webcamStream.getTracks().forEach(t => t.stop());
      }
      this.webcamStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
      });

      this.videoEl.srcObject = this.webcamStream;
      await this.videoEl.play();
      document.querySelector('#video-placeholder')?.classList.add('hidden');

      if (!this.isProcessingLoopActive) {
        this.startProcessingLoop();
      }
    } catch (err) {
      console.warn('Webcam permission denied or unavailable:', err);
      alert('Could not access webcam. You can upload a video file instead.');
    }
  }

  private async loadVideoFile(file: File): Promise<void> {
    this.inputMode = 'Video File';

    // Highlight buttons
    document.querySelector('#src-video-btn')?.classList.add('bg-sky-500', 'text-slate-950');
    document.querySelector('#src-video-btn')?.classList.remove('text-slate-400');
    document.querySelector('#src-webcam-btn')?.classList.remove('bg-sky-500', 'text-slate-950');
    document.querySelector('#src-webcam-btn')?.classList.add('text-slate-400');

    this.videoFilenameTag.textContent = file.name;
    this.videoFilenameTag.classList.remove('hidden');

    if (this.webcamStream) {
      this.webcamStream.getTracks().forEach(t => t.stop());
      this.webcamStream = null;
    }

    this.videoEl.srcObject = null;
    this.videoEl.src = URL.createObjectURL(file);
    this.videoEl.loop = true;
    await this.videoEl.play();

    document.querySelector('#video-placeholder')?.classList.add('hidden');

    if (!this.isProcessingLoopActive) {
      this.startProcessingLoop();
    }
  }

  private startProcessingLoop(): void {
    this.isProcessingLoopActive = true;

    const processFrame = () => {
      requestAnimationFrame(processFrame);

      if (this.videoEl.readyState < 2) return;

      const vWidth = this.videoEl.videoWidth || 640;
      const vHeight = this.videoEl.videoHeight || 480;

      // Update Canvas Dimensions
      if (this.videoCanvas.width !== vWidth || this.videoCanvas.height !== vHeight) {
        this.videoCanvas.width = vWidth;
        this.videoCanvas.height = vHeight;
        this.metadataOverlay.resize(vWidth, vHeight);
      }

      // Draw Video frame to canvas
      this.videoCtx.drawImage(this.videoEl, 0, 0, vWidth, vHeight);

      // FPS calculation
      const now = performance.now();
      this.frameCount++;
      if (now - this.lastFpsCalcTime >= 1000) {
        this.currentFps = Math.round((this.frameCount * 1000) / (now - this.lastFpsCalcTime));
        this.frameCount = 0;
        this.lastFpsCalcTime = now;
      }

      // Detect MediaPipe FaceLandmarker
      let status: 'Tracking' | 'Face Lost' | 'Countdown' | 'Recording' | 'Initializing...' = 'Tracking';
      const recState = recordingManager.getState();
      if (recState === 'countdown') status = 'Countdown';
      if (recState === 'recording') status = 'Recording';

      const mpResult = mediapipeService.detectForVideo(this.videoEl, now);

      if (mpResult && mpResult.faceBlendshapes && mpResult.faceBlendshapes.length > 0) {
        const weights = recordingManager.processDetectedFrame(mpResult);

        // If not scrubbing historical clip from timeline, update 3D preview live!
        if (weights && !this.isHistoricalScrubbing) {
          threeService.updateBlendshapes(weights);
        }

        // Update 3D wireframe landmarks if available
        if (mpResult.faceLandmarks && mpResult.faceLandmarks.length > 0) {
          threeService.updateFaceLandmarks3D(mpResult.faceLandmarks[0]);
        }
      } else {
        if (status === 'Tracking') status = 'Face Lost';
      }

      // Render HUD Metadata
      this.metadataOverlay.render({
        fps: this.currentFps,
        status,
        resolution: `${vWidth}x${vHeight}`,
        keyframeMapCount: recordingManager.getKeyframeOptionsCount(),
        elapsedTime: recordingManager.getRecordingDuration(),
        inputMode: this.inputMode
      });
    };

    requestAnimationFrame(processFrame);
  }
}

// Instantiate on DOM load
window.addEventListener('DOMContentLoaded', () => {
  new App();
});
