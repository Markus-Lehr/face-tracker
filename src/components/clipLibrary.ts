import { AnimationClip, dbService } from '../services/dbService';

export class ClipLibrary {
  private container: HTMLElement;
  private clips: AnimationClip[] = [];

  onSelectClip?: (clip: AnimationClip) => void;
  onExportClip?: (clip: AnimationClip) => void;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async refresh(): Promise<void> {
    this.clips = await dbService.getAllClips();
    this.render();
  }

  private render(): void {
    if (this.clips.length === 0) {
      this.container.innerHTML = `
        <div class="flex flex-col items-center justify-center p-8 text-center bg-slate-900/50 border border-slate-800/80 rounded-xl">
          <svg width="32" height="32" class="text-slate-600 mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
          <p class="text-xs text-slate-400 font-medium">No saved facial animation clips yet.</p>
          <p class="text-[11px] text-slate-500 mt-1">Record from your webcam or video file to start building your ARKit clip library.</p>
        </div>
      `;
      return;
    }

    this.container.innerHTML = `
      <div class="space-y-3">
        <div class="flex items-center justify-between px-1">
          <h3 class="text-xs font-bold text-slate-300 uppercase tracking-wider">IndexedDB Clip Library (${this.clips.length})</h3>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-60 overflow-y-auto pr-1">
          ${this.clips.map(clip => `
            <div class="group bg-slate-900/80 border border-slate-800 hover:border-sky-500/50 rounded-xl p-3.5 flex flex-col justify-between transition shadow-lg">
              <div class="flex items-start justify-between">
                <div class="space-y-1 truncate pr-2">
                  <div class="flex items-center gap-2">
                    <span class="font-semibold text-xs text-slate-100 truncate clip-name-text" data-id="${clip.id}">${clip.name}</span>
                    <button class="rename-clip-btn text-slate-500 hover:text-sky-400 transition" data-id="${clip.id}" title="Rename">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                  </div>
                  <div class="flex items-center gap-3 text-[11px] text-slate-400 font-mono">
                    <span>${clip.duration}s (${clip.keyframeMapCount} frames)</span>
                    <span>${new Date(clip.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
                <button class="delete-clip-btn p-1 text-slate-500 hover:text-red-400 rounded-lg hover:bg-slate-800 transition" data-id="${clip.id}" title="Delete Clip">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              </div>

              <div class="flex items-center gap-2 mt-3 pt-2.5 border-t border-slate-800/80">
                <button class="load-clip-btn flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition flex items-center justify-center gap-1.5" data-id="${clip.id}">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> Load Timeline
                </button>
                <button class="export-clip-btn px-3 py-1.5 bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/30 text-xs font-semibold rounded-lg transition flex items-center gap-1" data-id="${clip.id}">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Export
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    this.attachEvents();
  }

  private attachEvents(): void {
    // Load Timeline Buttons
    this.container.querySelectorAll('.load-clip-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const clip = this.clips.find(c => c.id === id);
        if (clip) this.onSelectClip?.(clip);
      });
    });

    // Export Buttons
    this.container.querySelectorAll('.export-clip-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const clip = this.clips.find(c => c.id === id);
        if (clip) this.onExportClip?.(clip);
      });
    });

    // Delete Buttons
    this.container.querySelectorAll('.delete-clip-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (id && confirm('Delete this animation clip from IndexedDB?')) {
          await dbService.deleteClip(id);
          await this.refresh();
        }
      });
    });

    // Rename Buttons
    this.container.querySelectorAll('.rename-clip-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const clip = this.clips.find(c => c.id === id);
        if (!clip || !id) return;
        const newName = prompt('Enter new clip name:', clip.name);
        if (newName && newName.trim()) {
          await dbService.updateClipName(id, newName.trim());
          await this.refresh();
        }
      });
    });
  }
}
