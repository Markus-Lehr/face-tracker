export interface KeyframeData {
  time: number;
  weights: number[]; // 52 ARKit blendshape weights
}

export interface AnimationClip {
  id: string;
  name: string;
  createdAt: number;
  duration: number;
  fps: number;
  keyframeMapCount: number;
  trimStartFrame: number;
  trimEndFrame: number;
  keyframes: KeyframeData[];
}

const DB_NAME = 'FaceTrackerDB';
const DB_VERSION = 1;
const STORE_NAME = 'animation_clips';

export class DbService {
  private dbPromise: Promise<IDBDatabase>;

  constructor() {
    this.dbPromise = this.openDB();
  }

  private openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async saveClip(clip: AnimationClip): Promise<string> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(clip);

      request.onsuccess = () => resolve(clip.id);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllClips(): Promise<AnimationClip[]> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('createdAt');
      const request = index.openCursor(null, 'prev'); // sorted newest first
      const results: AnimationClip[] = [];

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getClipById(id: string): Promise<AnimationClip | null> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async updateClipTrim(id: string, trimStartFrame: number, trimEndFrame: number): Promise<void> {
    const clip = await this.getClipById(id);
    if (!clip) return;
    clip.trimStartFrame = trimStartFrame;
    clip.trimEndFrame = trimEndFrame;
    await this.saveClip(clip);
  }

  async updateClipName(id: string, name: string): Promise<void> {
    const clip = await this.getClipById(id);
    if (!clip) return;
    clip.name = name;
    await this.saveClip(clip);
  }

  async deleteClip(id: string): Promise<void> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

export const dbService = new DbService();
