export interface MetadataInfo {
  fps: number;
  status: 'Initializing...' | 'Tracking' | 'Face Lost' | 'Countdown' | 'Recording';
  resolution: string;
  keyframeMapCount: number;
  elapsedTime: number;
  inputMode: 'Webcam' | 'Video File';
}

export class MetadataOverlay {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D context for metadata overlay');
    this.ctx = ctx;
  }

  resize(width: number, height: number): void {
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  render(info: MetadataInfo): void {
    const { width, height } = this.canvas;
    this.ctx.clearRect(0, 0, width, height);

    // Dark semi-transparent HUD top bar
    const barHeight = 44;
    this.ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    this.ctx.fillRect(0, 0, width, barHeight);

    // Top border glow line
    this.ctx.fillStyle = '#38bdf8';
    this.ctx.fillRect(0, barHeight - 2, width, 2);

    // Font settings
    this.ctx.font = '600 13px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    this.ctx.textBaseline = 'middle';

    // Left side: Mode & Status badge
    let statusColor = '#38bdf8';
    if (info.status === 'Tracking') statusColor = '#34d399';
    if (info.status === 'Face Lost') statusColor = '#f87171';
    if (info.status === 'Recording') statusColor = '#ef4444';
    if (info.status === 'Countdown') statusColor = '#fbbf24';

    // Status Indicator Dot
    this.ctx.beginPath();
    this.ctx.arc(18, barHeight / 2, 5, 0, Math.PI * 2);
    this.ctx.fillStyle = statusColor;
    this.ctx.fill();

    // Mode + Status Text
    this.ctx.fillStyle = '#f8fafc';
    this.ctx.fillText(`${info.inputMode} • ${info.status}`, 30, barHeight / 2);

    // Right side: Resolution & FPS
    const rightText = `${info.resolution} | ${info.fps} FPS`;
    this.ctx.fillStyle = '#94a3b8';
    this.ctx.textAlign = 'right';
    this.ctx.fillText(rightText, width - 16, barHeight / 2);

    // Bottom left overlay if recording or active
    if (info.status === 'Recording' || info.keyframeMapCount > 0) {
      const recBoxWidth = 180;
      const recBoxHeight = 50;
      const recX = 12;
      const recY = height - recBoxHeight - 12;

      this.ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      this.ctx.beginPath();
      this.ctx.roundRect(recX, recY, recBoxWidth, recBoxHeight, 8);
      this.ctx.fill();
      this.ctx.strokeStyle = info.status === 'Recording' ? 'rgba(239, 68, 68, 0.6)' : 'rgba(56, 189, 248, 0.4)';
      this.ctx.lineWidth = 1;
      this.ctx.stroke();

      this.ctx.textAlign = 'left';
      this.ctx.fillStyle = '#ef4444';
      if (info.status === 'Recording') {
        this.ctx.beginPath();
        this.ctx.arc(recX + 16, recY + 18, 4, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.fillStyle = '#f8fafc';
        this.ctx.fillText('REC', recX + 26, recY + 18);
      } else {
        this.ctx.fillStyle = '#38bdf8';
        this.ctx.fillText('FRAMES', recX + 16, recY + 18);
      }

      this.ctx.fillStyle = '#f8fafc';
      const mins = Math.floor(info.elapsedTime / 60);
      const secs = (info.elapsedTime % 60).toFixed(2).padStart(5, '0');
      this.ctx.fillText(`${mins}:${secs}`, recX + recBoxWidth - 65, recY + 18);

      this.ctx.fillStyle = '#94a3b8';
      this.ctx.font = '500 11px system-ui, sans-serif';
      this.ctx.fillText(`Keyframes captured: ${info.keyframeMapCount}`, recX + 16, recY + 36);
    }
  }
}
