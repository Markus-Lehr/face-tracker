import { AnimationClip } from '../services/dbService';
import { ARKIT_BLENDSHAPE_NAMES } from '../utils/arkitShapes';

export class ExportDialog {
  private container: HTMLElement;
  private clip: AnimationClip | null = null;
  private threshold = 0.05;
  private shapeSelection: Map<string, boolean> = new Map();

  constructor(container: HTMLElement) {
    this.container = container;
  }

  open(clip: AnimationClip): void {
    this.clip = clip;
    this.threshold = 0.05;
    this.initShapeSelection();
    this.render();
  }

  private initShapeSelection(): void {
    if (!this.clip) return;
    this.shapeSelection.clear();

    // Trimmed keyframes range
    const trimmedFrames = this.clip.keyframes.slice(
      this.clip.trimStartFrame,
      this.clip.trimEndFrame + 1
    );

    // Calculate max weight per shape
    ARKIT_BLENDSHAPE_NAMES.forEach((shapeName, shapeIdx) => {
      let maxVal = 0;
      for (const kf of trimmedFrames) {
        const val = kf.weights[shapeIdx] ?? 0;
        if (val > maxVal) maxVal = val;
      }
      const included = maxVal >= this.threshold;
      this.shapeSelection.set(shapeName, included);
    });
  }

  private recalculateByThreshold(): void {
    if (!this.clip) return;
    const trimmedFrames = this.clip.keyframes.slice(
      this.clip.trimStartFrame,
      this.clip.trimEndFrame + 1
    );

    ARKIT_BLENDSHAPE_NAMES.forEach((shapeName, shapeIdx) => {
      let maxVal = 0;
      for (const kf of trimmedFrames) {
        const val = kf.weights[shapeIdx] ?? 0;
        if (val > maxVal) maxVal = val;
      }
      this.shapeSelection.set(shapeName, maxVal >= this.threshold);
    });
  }

  private render(): void {
    if (!this.clip) return;

    const trimmedFrames = this.clip.keyframes.slice(
      this.clip.trimStartFrame,
      this.clip.trimEndFrame + 1
    );

    // Calculate max weights
    const maxWeights = new Map<string, number>();
    ARKIT_BLENDSHAPE_NAMES.forEach((shapeName, shapeIdx) => {
      let maxVal = 0;
      for (const kf of trimmedFrames) {
        const val = kf.weights[shapeIdx] ?? 0;
        if (val > maxVal) maxVal = val;
      }
      maxWeights.set(shapeName, maxVal);
    });

    const activeCount = Array.from(this.shapeSelection.values()).filter(Boolean).length;

    this.container.innerHTML = `
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
        <div class="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
          <!-- Header -->
          <div class="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50">
            <div>
              <h2 class="text-lg font-bold text-slate-100 flex items-center gap-2">
                <svg width="20" height="20" class="text-sky-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Export ARKit Facial Animation JSON
              </h2>
              <p class="text-xs text-slate-400">Clip: "${this.clip.name}" (${trimmedFrames.length} keyframes, ${this.clip.duration}s)</p>
            </div>
            <button id="modal-close-btn" class="p-2 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <!-- Content Body -->
          <div class="p-6 overflow-y-auto space-y-6 flex-1">
            <!-- Threshold Controls -->
            <div class="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-3">
              <div class="flex items-center justify-between">
                <label class="text-sm font-semibold text-slate-200">Weight Threshold Filter</label>
                <div class="flex items-center gap-2">
                  <input id="threshold-input-num" type="number" step="0.005" min="0" max="1" value="${this.threshold.toFixed(3)}"
                    class="w-20 px-2 py-1 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 text-xs text-right font-mono focus:outline-none focus:border-sky-400" />
                  <button id="threshold-reset-btn" class="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg transition font-medium">
                    Reset (0.05)
                  </button>
                </div>
              </div>
              <div class="flex items-center gap-4">
                <input id="threshold-slider" type="range" min="0" max="1" step="0.005" value="${this.threshold}"
                  class="w-full accent-sky-400 bg-slate-800 h-2 rounded-lg cursor-pointer" />
              </div>
              <p class="text-xs text-slate-400">
                Shapes with a maximum keyframe weight below <span class="font-mono text-sky-400 font-bold">${this.threshold.toFixed(3)}</span> will be excluded from the output JSON.
              </p>
            </div>

            <!-- Summary & Checklist Header -->
            <div class="flex items-center justify-between">
              <span class="text-sm font-bold text-slate-200">
                Active Blendshapes: <span class="text-sky-400 font-mono">${activeCount}</span> / ${ARKIT_BLENDSHAPE_NAMES.length}
              </span>
              <div class="flex items-center gap-2 text-xs">
                <button id="select-all-btn" class="text-sky-400 hover:underline">Select All</button>
                <span class="text-slate-600">•</span>
                <button id="deselect-all-btn" class="text-slate-400 hover:underline">Deselect All</button>
              </div>
            </div>

            <!-- Blendshape Checklist Grid -->
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-60 overflow-y-auto pr-1">
              ${ARKIT_BLENDSHAPE_NAMES.map(name => {
                const maxVal = maxWeights.get(name) ?? 0;
                const checked = this.shapeSelection.get(name) ?? false;
                const isBelow = maxVal < this.threshold;
                return `
                  <label class="flex items-center justify-between p-2 bg-slate-950/40 border border-slate-800/80 rounded-lg text-xs cursor-pointer hover:bg-slate-800/40 transition">
                    <div class="flex items-center gap-2 truncate">
                      <input type="checkbox" data-shape="${name}" ${checked ? 'checked' : ''} class="shape-checkbox accent-sky-400 rounded cursor-pointer" />
                      <span class="truncate font-mono ${checked ? 'text-slate-200' : 'text-slate-500 line-through'}">${name}</span>
                    </div>
                    <span class="font-mono text-[10px] px-1.5 py-0.5 rounded ${isBelow ? 'bg-slate-800 text-slate-500' : 'bg-sky-500/20 text-sky-300'}">
                      ${maxVal.toFixed(2)}
                    </span>
                  </label>
                `;
              }).join('')}
            </div>
          </div>

          <!-- Footer Actions -->
          <div class="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-900/50">
            <button id="copy-json-btn" class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy JSON
            </button>

            <div class="flex items-center gap-3">
              <button id="close-dialog-btn" class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition">
                Cancel
              </button>
              <button id="download-json-btn" class="px-5 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold rounded-xl shadow-lg shadow-sky-500/20 transition flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download ARKit JSON
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    this.attachEvents();
  }

  private attachEvents(): void {
    const closeBtn = this.container.querySelector('#modal-close-btn');
    const cancelBtn = this.container.querySelector('#close-dialog-btn');
    const closeHandler = () => this.close();
    closeBtn?.addEventListener('click', closeHandler);
    cancelBtn?.addEventListener('click', closeHandler);

    // Slider
    const slider = this.container.querySelector('#threshold-slider') as HTMLInputElement;
    const numInput = this.container.querySelector('#threshold-input-num') as HTMLInputElement;
    const resetBtn = this.container.querySelector('#threshold-reset-btn');

    slider?.addEventListener('input', (e) => {
      this.threshold = parseFloat((e.target as HTMLInputElement).value);
      if (numInput) numInput.value = this.threshold.toFixed(3);
      this.recalculateByThreshold();
      this.render();
    });

    numInput?.addEventListener('change', (e) => {
      let val = parseFloat((e.target as HTMLInputElement).value);
      if (isNaN(val)) val = 0.05;
      this.threshold = Math.max(0, Math.min(1, val));
      if (slider) slider.value = this.threshold.toString();
      this.recalculateByThreshold();
      this.render();
    });

    resetBtn?.addEventListener('click', () => {
      this.threshold = 0.05;
      this.recalculateByThreshold();
      this.render();
    });

    // Checkboxes
    const checkboxes = this.container.querySelectorAll('.shape-checkbox');
    checkboxes.forEach(cb => {
      cb.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        const name = target.getAttribute('data-shape');
        if (name) {
          this.shapeSelection.set(name, target.checked);
          this.render();
        }
      });
    });

    // Select/Deselect All
    this.container.querySelector('#select-all-btn')?.addEventListener('click', () => {
      ARKIT_BLENDSHAPE_NAMES.forEach(n => this.shapeSelection.set(n, true));
      this.render();
    });

    this.container.querySelector('#deselect-all-btn')?.addEventListener('click', () => {
      ARKIT_BLENDSHAPE_NAMES.forEach(n => this.shapeSelection.set(n, false));
      this.render();
    });

    // Actions
    this.container.querySelector('#copy-json-btn')?.addEventListener('click', () => this.copyJson());
    this.container.querySelector('#download-json-btn')?.addEventListener('click', () => this.downloadJson());
  }

  private generateExportJSON(): object | null {
    if (!this.clip) return null;

    const trimmedFrames = this.clip.keyframes.slice(
      this.clip.trimStartFrame,
      this.clip.trimEndFrame + 1
    );

    // Selected blendshape names and original indices
    const exportBlendShapes: string[] = [];
    const activeIndices: number[] = [];

    ARKIT_BLENDSHAPE_NAMES.forEach((shapeName, idx) => {
      if (this.shapeSelection.get(shapeName)) {
        exportBlendShapes.push(shapeName);
        activeIndices.push(idx);
      }
    });

    // Normalize time to start at 0.0 for exported clip
    const startTime = trimmedFrames[0]?.time ?? 0;

    const keyframes = trimmedFrames.map(kf => ({
      time: Number((kf.time - startTime).toFixed(3)),
      weights: activeIndices.map(idx => kf.weights[idx] ?? 0)
    }));

    const duration = keyframes.length > 0 ? keyframes[keyframes.length - 1].time : 0;

    return {
      name: this.clip.name,
      fps: this.clip.fps,
      duration: Number(duration.toFixed(2)),
      blendShapes: exportBlendShapes,
      keyframes
    };
  }

  private copyJson(): void {
    const data = this.generateExportJSON();
    if (!data) return;
    const str = JSON.stringify(data, null, 2);
    navigator.clipboard.writeText(str).then(() => {
      const btn = this.container.querySelector('#copy-json-btn');
      if (btn) btn.innerHTML = `Copied!`;
      setTimeout(() => this.render(), 1500);
    });
  }

  private downloadJson(): void {
    const data = this.generateExportJSON();
    if (!data || !this.clip) return;
    const str = JSON.stringify(data, null, 2);
    const blob = new Blob([str], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.clip.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_arkit.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.close();
  }

  close(): void {
    this.container.innerHTML = '';
    this.clip = null;
  }
}
