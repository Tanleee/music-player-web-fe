import { SavedWallpaper } from '../types/player';
import {
  TFT_WIDTH,
  TFT_HEIGHT,
  encodeRgb565LittleEndian,
  decodeRgb565LittleEndianToRgba,
} from './encoders';

export interface ArtworkPreset {
  id: string;
  name: string;
  subtitle: string;
  draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
}

export const ARTWORK_PRESETS: ArtworkPreset[] = [
  {
    id: 'preset-horizon',
    name: 'Sunset Signal 320',
    subtitle: 'High-contrast geometric horizon optimized for ST7789 IPS contrast',
    draw: (ctx, w, h) => {
      const sky = ctx.createLinearGradient(0, 0, 0, h * 0.65);
      sky.addColorStop(0, '#090d16');
      sky.addColorStop(0.55, '#1e1b4b');
      sky.addColorStop(1, '#ea580c');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);

      // Sun disc
      const sunGrad = ctx.createLinearGradient(0, h * 0.2, 0, h * 0.62);
      sunGrad.addColorStop(0, '#fde047');
      sunGrad.addColorStop(1, '#f97316');
      ctx.fillStyle = sunGrad;
      ctx.beginPath();
      ctx.arc(w * 0.5, h * 0.45, h * 0.2, 0, Math.PI * 2);
      ctx.fill();

      // Mountain silhouettes
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.moveTo(0, h * 0.65);
      ctx.lineTo(w * 0.22, h * 0.43);
      ctx.lineTo(w * 0.44, h * 0.6);
      ctx.lineTo(w * 0.68, h * 0.38);
      ctx.lineTo(w * 0.88, h * 0.56);
      ctx.lineTo(w, h * 0.46);
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fill();

      // Perspective grid lines in foreground
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.38)';
      ctx.lineWidth = 1.5;
      const horizonY = h * 0.65;
      for (let i = 1; i <= 6; i++) {
        const y = horizonY + Math.pow(i / 6, 1.7) * (h - horizonY);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      for (let i = -6; i <= 6; i++) {
        ctx.beginPath();
        ctx.moveTo(w * 0.5 + i * (w * 0.04), horizonY);
        ctx.lineTo(w * 0.5 + i * (w * 0.18), h);
        ctx.stroke();
      }
    },
  },
  {
    id: 'preset-oscilloscope',
    name: 'Phosphor Matrix',
    subtitle: 'Emerald studio spectrum waves on deep obsidian background',
    draw: (ctx, w, h) => {
      ctx.fillStyle = '#050807';
      ctx.fillRect(0, 0, w, h);

      // Subtle instrument graticule
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.14)';
      ctx.lineWidth = 1;
      for (let x = 0; x <= w; x += 32) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y <= h; y += 24) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Harmonic waves
      const colors = ['#10b981', '#34d399', '#059669'];
      colors.forEach((color, idx) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5 - idx * 0.5;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 2) {
          const norm = x / w;
          const env = Math.sin(norm * Math.PI);
          const y =
            h * 0.5 +
            Math.sin(norm * Math.PI * (6 + idx * 2) + idx) * (h * 0.26) * env +
            Math.cos(norm * Math.PI * 13 - idx) * (h * 0.08) * env;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      });
    },
  },
  {
    id: 'preset-bauhaus',
    name: 'Analogue Tape Deck',
    subtitle: 'Warm industrial reel-to-reel geometric composition',
    draw: (ctx, w, h) => {
      ctx.fillStyle = '#18181b';
      ctx.fillRect(0, 0, w, h);

      // Brushed cassette window band
      ctx.fillStyle = '#27272a';
      ctx.fillRect(w * 0.08, h * 0.14, w * 0.84, h * 0.72);

      // Warm accent stripes
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(w * 0.08, h * 0.68, w * 0.84, h * 0.06);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(w * 0.08, h * 0.74, w * 0.84, h * 0.06);

      // Dual tape reels
      const drawReel = (cx: number, cy: number) => {
        ctx.fillStyle = '#09090b';
        ctx.beginPath();
        ctx.arc(cx, cy, h * 0.19, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#e4e4e7';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, h * 0.08, 0, Math.PI * 2);
        ctx.stroke();

        for (let a = 0; a < 3; a++) {
          const angle = (a * Math.PI * 2) / 3;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(angle) * (h * 0.08), cy + Math.sin(angle) * (h * 0.08));
          ctx.lineTo(cx + Math.cos(angle) * (h * 0.16), cy + Math.sin(angle) * (h * 0.16));
          ctx.stroke();
        }
      };

      drawReel(w * 0.32, h * 0.42);
      drawReel(w * 0.68, h * 0.42);
    },
  },
];

/**
 * Renders an artwork preset into a 640x480 source Data URL and a quantized
 * 320x240 RGB565 SavedWallpaper object.
 */
export function buildWallpaperFromPreset(
  preset: ArtworkPreset,
  dither: boolean = true,
  isActiveOnDevice: boolean = false
): SavedWallpaper {
  // 1. Render 640x480 high-res source image
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = 640;
  srcCanvas.height = 480;
  const srcCtx = srcCanvas.getContext('2d')!;
  preset.draw(srcCtx, 640, 480);
  const sourceDataUrl = srcCanvas.toDataURL('image/png');

  // 2. Render exact 320x240 target frame
  const tftCanvas = document.createElement('canvas');
  tftCanvas.width = TFT_WIDTH;
  tftCanvas.height = TFT_HEIGHT;
  const tftCtx = tftCanvas.getContext('2d')!;
  preset.draw(tftCtx, TFT_WIDTH, TFT_HEIGHT);

  const imgData = tftCtx.getImageData(0, 0, TFT_WIDTH, TFT_HEIGHT);
  const rgb565Bytes = encodeRgb565LittleEndian(imgData.data, TFT_WIDTH, TFT_HEIGHT, dither);
  const quantizedRgba = decodeRgb565LittleEndianToRgba(rgb565Bytes, TFT_WIDTH, TFT_HEIGHT);

  const previewImgData = new ImageData(new Uint8ClampedArray(quantizedRgba), TFT_WIDTH, TFT_HEIGHT);
  tftCtx.putImageData(previewImgData, 0, 0);
  const previewDataUrl = tftCanvas.toDataURL('image/png');

  return {
    id: `wp_${preset.id}`,
    name: preset.name,
    createdAt: '2026-10-25 08:10',
    width: 320,
    height: 240,
    byteLength: 153600,
    rgb565Bytes,
    previewDataUrl,
    sourceDataUrl,
    dithered: dither,
    isActiveOnDevice,
  };
}
