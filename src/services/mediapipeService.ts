import {
  FilesetResolver,
  FaceLandmarker,
  FaceLandmarkerResult
} from '@mediapipe/tasks-vision';

export class MediaPipeService {
  private landmarker: FaceLandmarker | null = null;
  private isInitializing = false;
  private isReady = false;

  async initialize(onProgress?: (msg: string) => void): Promise<void> {
    if (this.isReady && this.landmarker) return;
    if (this.isInitializing) return;

    this.isInitializing = true;
    onProgress?.('Loading MediaPipe vision tasks WASM runtime...');

    try {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );

      onProgress?.('Downloading face_landmarker.task model...');
      this.landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          delegate: 'GPU'
        },
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
        runningMode: 'VIDEO',
        numFaces: 1
      });

      this.isReady = true;
      this.isInitializing = false;
      onProgress?.('MediaPipe FaceLandmarker ready.');
    } catch (err) {
      console.warn('GPU delegate failed or initial loading error, trying CPU fallback...', err);
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );
        this.landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
            delegate: 'CPU'
          },
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true,
          runningMode: 'VIDEO',
          numFaces: 1
        });
        this.isReady = true;
        this.isInitializing = false;
        onProgress?.('MediaPipe FaceLandmarker ready (CPU fallback).');
      } catch (fatal) {
        this.isInitializing = false;
        console.error('Fatal MediaPipe initialization error:', fatal);
        throw fatal;
      }
    }
  }

  detectForVideo(videoElement: HTMLVideoElement, timestampMs: number): FaceLandmarkerResult | null {
    if (!this.landmarker || !this.isReady) return null;
    if (videoElement.readyState < 2) return null; // HAVE_CURRENT_DATA
    try {
      return this.landmarker.detectForVideo(videoElement, timestampMs);
    } catch (e) {
      console.warn('Detect frame error:', e);
      return null;
    }
  }

  get ready(): boolean {
    return this.isReady;
  }
}

export const mediapipeService = new MediaPipeService();
