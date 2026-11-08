import React, { useEffect, useRef, useState } from 'react';
import {
  ImagePlus,
  Download,
  BookmarkCheck,
  Send,
  Trash2,
  RotateCcw,
  Sliders,
  Bluetooth,
  AlertTriangle,
} from 'lucide-react';
import { ApiStatusResponse, SavedWallpaper } from '../types/player';
import {
  TFT_WIDTH,
  TFT_HEIGHT,
  TFT_RGB565_BYTE_LENGTH,
  encodeRgb565LittleEndian,
  decodeRgb565LittleEndianToRgba,
  formatBytes,
  sanitizeFatFilename,
} from '../utils/encoders';

interface WallpaperPageProps {
  savedWallpapers: SavedWallpaper[];
  activeWallpaperId: string;
  status: ApiStatusResponse;
  isConnected: boolean;
  isUploadingWallpaper: boolean;
  uploadProgress: number;
  actionError: string | null;
  onClearError: () => void;
  onSaveWallpaper: (wallpaper: SavedWallpaper) => void;
  onSelectSavedWallpaper: (wallpaper: SavedWallpaper) => void;
  onDeleteSavedWallpaper: (wallpaperId: string) => void;
  onSendWallpaperToDevice: (
    name: string,
    rgb565Bytes: Uint8Array
  ) => Promise<string | null>;
}

/**
 * Generates a clean initial 240x320 portrait gradient canvas data URL
 * so the crop and RGB565 encoder work immediately before an image is uploaded.
 */
function createDefaultPortraitSourceDataUrl(): string {
  const canvas = document.createElement('canvas');
  canvas.width = TFT_WIDTH;
  canvas.height = TFT_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 0, TFT_HEIGHT);
    grad.addColorStop(0, '#0f172a');
    grad.addColorStop(0.6, '#1e293b');
    grad.addColorStop(1, '#334155');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, TFT_WIDTH, TFT_HEIGHT);

    ctx.strokeStyle = 'rgba(251, 191, 36, 0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(12, 12, TFT_WIDTH - 24, TFT_HEIGHT - 24);
  }
  return canvas.toDataURL('image/png');
}

export function WallpaperPage({
  savedWallpapers,
  activeWallpaperId,
  status,
  isConnected,
  isUploadingWallpaper,
  uploadProgress,
  actionError,
  onClearError,
  onSaveWallpaper,
  onSelectSavedWallpaper,
  onDeleteSavedWallpaper,
  onSendWallpaperToDevice,
}: WallpaperPageProps) {
  const workCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const tftPreviewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const loadedImageRef = useRef<HTMLImageElement | null>(null);

  const initialWp =
    savedWallpapers.find((w) => w.id === activeWallpaperId) ?? savedWallpapers[0];

  const [wallpaperName, setWallpaperName] = useState(
    initialWp ? initialWp.name : 'wallpaper_240x320'
  );
  const [sourceDataUrl, setSourceDataUrl] = useState<string>(() =>
    initialWp ? initialWp.sourceDataUrl : createDefaultPortraitSourceDataUrl()
  );
  const [fitMode, setFitMode] = useState<'cover' | 'contain' | 'stretch'>('cover');
  const [zoom, setZoom] = useState<number>(1);
  const [panX, setPanX] = useState<number>(0); // -100 to 100
  const [panY, setPanY] = useState<number>(0); // -100 to 100
  const [dither, setDither] = useState<boolean>(true);
  const [currentRgb565, setCurrentRgb565] = useState<Uint8Array>(
    initialWp ? initialWp.rgb565Bytes : new Uint8Array(TFT_RGB565_BYTE_LENGTH)
  );
  const [statusBanner, setStatusBanner] = useState<string>('');

  // Dragging directly inside the portrait 240x320 TFT preview frame to pan crop
  const [isDraggingCrop, setIsDraggingCrop] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number }>({
    x: 0,
    y: 0,
    panX: 0,
    panY: 0,
  });

  const isAnyTransferActive = status.transfer.active || isUploadingWallpaper;
  const sanitizedFileName = sanitizeFatFilename(wallpaperName || 'wallpaper', '');

  const recomputeTftFrame = () => {
    const workCanvas = workCanvasRef.current;
    const previewCanvas = tftPreviewCanvasRef.current;
    const img = loadedImageRef.current;
    if (!workCanvas || !previewCanvas || !img) return;

    const ctx = workCanvas.getContext('2d', { willReadFrequently: true });
    const previewCtx = previewCanvas.getContext('2d');
    if (!ctx || !previewCtx) return;

    ctx.save();
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, TFT_WIDTH, TFT_HEIGHT);

    const srcW = img.naturalWidth || TFT_WIDTH;
    const srcH = img.naturalHeight || TFT_HEIGHT;

    if (fitMode === 'stretch') {
      const drawW = TFT_WIDTH * zoom;
      const drawH = TFT_HEIGHT * zoom;
      const offsetX = (TFT_WIDTH - drawW) / 2 + (panX / 100) * (TFT_WIDTH * 0.5);
      const offsetY = (TFT_HEIGHT - drawH) / 2 + (panY / 100) * (TFT_HEIGHT * 0.5);
      ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
    } else {
      const scaleBase =
        fitMode === 'cover'
          ? Math.max(TFT_WIDTH / srcW, TFT_HEIGHT / srcH)
          : Math.min(TFT_WIDTH / srcW, TFT_HEIGHT / srcH);
      const scale = scaleBase * zoom;
      const drawW = srcW * scale;
      const drawH = srcH * scale;
      const maxOverflowX = Math.max(40, Math.abs(drawW - TFT_WIDTH) / 2 + 40);
      const maxOverflowY = Math.max(40, Math.abs(drawH - TFT_HEIGHT) / 2 + 40);
      const offsetX = (TFT_WIDTH - drawW) / 2 + (panX / 100) * maxOverflowX;
      const offsetY = (TFT_HEIGHT - drawH) / 2 + (panY / 100) * maxOverflowY;
      ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
    }
    ctx.restore();

    const rgbaData = ctx.getImageData(0, 0, TFT_WIDTH, TFT_HEIGHT);
    const encoded565 = encodeRgb565LittleEndian(
      rgbaData.data,
      TFT_WIDTH,
      TFT_HEIGHT,
      dither
    );
    setCurrentRgb565(encoded565);

    const quantizedRgba = decodeRgb565LittleEndianToRgba(
      encoded565,
      TFT_WIDTH,
      TFT_HEIGHT
    );
    const quantizedImgData = new ImageData(
      new Uint8ClampedArray(quantizedRgba),
      TFT_WIDTH,
      TFT_HEIGHT
    );
    previewCtx.putImageData(quantizedImgData, 0, 0);
  };

  useEffect(() => {
    if (!sourceDataUrl) return;
    const img = new Image();
    img.onload = () => {
      loadedImageRef.current = img;
      recomputeTftFrame();
    };
    img.src = sourceDataUrl;
  }, [sourceDataUrl]);

  useEffect(() => {
    if (loadedImageRef.current) {
      recomputeTftFrame();
    }
  }, [fitMode, zoom, panX, panY, dither]);

  const handleUploadImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const baseName = file.name.replace(/\.[^/.]+$/, '');
    setWallpaperName(sanitizeFatFilename(baseName, ''));
    setZoom(1);
    setPanX(0);
    setPanY(0);

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setSourceDataUrl(reader.result);
        setStatusBanner(`Loaded "${file.name}" — cropped to portrait 240×320 RGB565`);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const buildCurrentWallpaperObject = (): SavedWallpaper => {
    const previewCanvas = tftPreviewCanvasRef.current;
    const previewDataUrl = previewCanvas
      ? previewCanvas.toDataURL('image/png')
      : sourceDataUrl;
    const now = new Date();
    const timeStr = `${now.toISOString().slice(0, 10)} ${now.toTimeString().slice(0, 5)}`;
    const cleanName = wallpaperName.trim() || 'wallpaper_240x320';

    return {
      id: `wp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: cleanName,
      sanitizedBinName: sanitizeFatFilename(cleanName, ''),
      createdAt: timeStr,
      width: 240,
      height: 320,
      byteLength: 153600,
      rgb565Bytes: new Uint8Array(currentRgb565),
      previewDataUrl,
      sourceDataUrl,
      dithered: dither,
    };
  };

  const triggerBinDownload = (bytes: Uint8Array, rawName: string) => {
    const safeSlug = sanitizeFatFilename(rawName, '');
    const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeSlug}_240x320_rgb565le.bin`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const handleExportAndDownloadBin = () => {
    const wp = buildCurrentWallpaperObject();
    onSaveWallpaper(wp);
    triggerBinDownload(wp.rgb565Bytes, wp.name);
    setStatusBanner(
      `Downloaded "${wp.sanitizedBinName}_240x320_rgb565le.bin" (153,600 bytes raw little-endian RGB565).`
    );
  };

  const handleSaveToGalleryOnly = () => {
    const wp = buildCurrentWallpaperObject();
    onSaveWallpaper(wp);
    setStatusBanner(`Saved "${wp.name}" (240×320 RGB565) to Saved Wallpapers.`);
  };

  const handleSendToDeviceClick = async () => {
    const wp = buildCurrentWallpaperObject();
    onSaveWallpaper(wp);
    const uploadedName = await onSendWallpaperToDevice(wp.name, wp.rgb565Bytes);
    if (uploadedName) {
      setStatusBanner(
        `Uploaded "${uploadedName}" (153,600 bytes, 240×320 RGB565 LE) to ESP32.`
      );
    }
  };

  const handleReselectWallpaper = (wp: SavedWallpaper) => {
    setWallpaperName(wp.name);
    setDither(wp.dithered);
    setZoom(1);
    setPanX(0);
    setPanY(0);
    setSourceDataUrl(wp.sourceDataUrl || wp.previewDataUrl);
    onSelectSavedWallpaper(wp);
    setStatusBanner(`Reselected saved wallpaper "${wp.name}".`);
  };

  return (
    <div className="space-y-6 sm:space-y-8 min-w-0">
      {/* Hidden 240x320 portrait offscreen work canvas */}
      <canvas
        ref={workCanvasRef}
        width={TFT_WIDTH}
        height={TFT_HEIGHT}
        className="hidden"
      />

      {/* Bluetooth Audio Stutter Warning */}
      <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-xs text-amber-200 flex flex-wrap items-center justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <Bluetooth className="h-4 w-4 text-amber-400 shrink-0" aria-hidden="true" />
          <span className="min-w-0">
            <strong>Note:</strong> Uploading a 153,600-byte wallpaper during Bluetooth playback may cause audio stutter.
          </span>
        </div>
        {isAnyTransferActive && (
          <span className="font-mono text-amber-300 shrink-0">
            Transfer active ({status.transfer.active ? status.transfer.percent : uploadProgress}%)
          </span>
        )}
      </div>

      {actionError && (
        <div
          role="alert"
          className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-200 flex flex-wrap items-center justify-between gap-2 min-w-0"
        >
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" aria-hidden="true" />
            <span className="min-w-0 break-words">{actionError}</span>
          </div>
          <button
            type="button"
            onClick={onClearError}
            className="min-h-[44px] sm:min-h-[32px] px-3 text-xs font-semibold text-rose-300 hover:text-white cursor-pointer shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Top Editor & Portrait 240x320 TFT Screen Frame Split */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start min-w-0">
        {/* Left 6 cols: Upload, Crop/Resize Controls, & Export Actions */}
        <div className="lg:col-span-6 min-w-0 rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:p-6 space-y-5">
          <div className="border-b border-slate-800 pb-4 min-w-0">
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-100">
              Wallpaper Studio (240x320)
            </h1>
            <p className="mt-1 text-xs text-slate-400">
              Portrait Display Target: 240×320 px · Raw RGB565 Little-Endian (153,600 bytes)
            </p>
          </div>

          {/* Upload Image & Filename */}
          <div className="space-y-3 min-w-0">
            <div>
              <label
                htmlFor="wallpaper-upload-input"
                className="min-h-[44px] sm:min-h-[38px] inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-400 rounded-lg hover:bg-amber-300 transition-colors cursor-pointer whitespace-nowrap"
              >
                <ImagePlus className="h-4 w-4" />
                Upload Image File
              </label>
              <input
                id="wallpaper-upload-input"
                type="file"
                accept="image/*"
                onChange={handleUploadImageFile}
                className="sr-only"
              />
            </div>

            <div className="min-w-0">
              <label
                htmlFor="wallpaper-title-input"
                className="block text-xs font-medium text-slate-300 mb-1"
              >
                Wallpaper Name (FAT ASCII max 24 chars: <code className="text-amber-300">{sanitizedFileName}</code>)
              </label>
              <input
                id="wallpaper-title-input"
                type="text"
                value={wallpaperName}
                onChange={(e) => setWallpaperName(e.target.value)}
                placeholder="Enter wallpaper name..."
                className="min-h-[44px] sm:min-h-[38px] w-full min-w-0 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-amber-400 focus:outline-none"
              />
            </div>
          </div>

          {/* Crop, Fit, Pan, Zoom Controls (Portrait 240x320) */}
          <div className="rounded-lg border border-slate-800/90 bg-slate-950/60 p-3.5 sm:p-4 space-y-4 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
              <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5 min-w-0">
                <Sliders className="h-3.5 w-3.5 text-amber-400 shrink-0" aria-hidden="true" />
                <span>240×320 Portrait Crop & Framing</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setFitMode('cover');
                  setZoom(1);
                  setPanX(0);
                  setPanY(0);
                }}
                className="min-h-[44px] sm:min-h-[32px] px-2 inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 cursor-pointer whitespace-nowrap shrink-0"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset Crop
              </button>
            </div>

            {/* Fit Mode Segmented Control */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 min-w-0">
              <span className="text-xs text-slate-400">Aspect Fit Mode</span>
              <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-900 p-1 border border-slate-800 w-full sm:w-auto min-w-0">
                {(['cover', 'contain', 'stretch'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setFitMode(mode)}
                    className={`flex-1 sm:flex-initial min-h-[44px] sm:min-h-[32px] px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      fitMode === mode
                        ? 'bg-amber-400 text-slate-950 font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {mode === 'cover'
                      ? 'Fill 240×320'
                      : mode === 'contain'
                      ? 'Fit Inside'
                      : 'Stretch'}
                  </button>
                ))}
              </div>
            </div>

            {/* Zoom & Pan Sliders */}
            <div className="space-y-3 min-w-0">
              <div className="min-w-0">
                <div className="flex justify-between text-xs text-slate-400 mb-1">
                  <label htmlFor="crop-zoom-slider">Zoom Scale</label>
                  <span className="font-mono tabular-nums text-slate-200">
                    {zoom.toFixed(2)}×
                  </span>
                </div>
                <input
                  id="crop-zoom-slider"
                  type="range"
                  min={1}
                  max={3}
                  step={0.05}
                  value={zoom}
                  onChange={(e) => setZoom(parseFloat(e.target.value))}
                  className="w-full h-6 accent-amber-400 cursor-pointer"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 min-w-0">
                <div className="min-w-0">
                  <div className="flex justify-between text-xs text-slate-400 mb-1">
                    <label htmlFor="crop-panx-slider">Horizontal Offset (X)</label>
                    <span className="font-mono tabular-nums text-slate-200">
                      {panX > 0 ? `+${panX}` : panX}%
                    </span>
                  </div>
                  <input
                    id="crop-panx-slider"
                    type="range"
                    min={-100}
                    max={100}
                    step={1}
                    value={panX}
                    onChange={(e) => setPanX(parseInt(e.target.value, 10))}
                    className="w-full h-6 accent-amber-400 cursor-pointer"
                  />
                </div>

                <div className="min-w-0">
                  <div className="flex justify-between text-xs text-slate-400 mb-1">
                    <label htmlFor="crop-pany-slider">Vertical Offset (Y)</label>
                    <span className="font-mono tabular-nums text-slate-200">
                      {panY > 0 ? `+${panY}` : panY}%
                    </span>
                  </div>
                  <input
                    id="crop-pany-slider"
                    type="range"
                    min={-100}
                    max={100}
                    step={1}
                    value={panY}
                    onChange={(e) => setPanY(parseInt(e.target.value, 10))}
                    className="w-full h-6 accent-amber-400 cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* RGB565 Dithering Check */}
            <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-800/80 min-w-0">
              <label
                htmlFor="rgb565-dither-toggle"
                className="text-xs text-slate-300 cursor-pointer min-w-0 flex-1 py-1"
              >
                Apply Floyd-Steinberg Dithering (reduces 16-bit RGB565 banding)
              </label>
              <input
                id="rgb565-dither-toggle"
                type="checkbox"
                checked={dither}
                onChange={(e) => setDither(e.target.checked)}
                className="h-5 w-5 shrink-0 accent-amber-400 rounded cursor-pointer"
              />
            </div>
          </div>

          {/* Upload Progress Bar when sending wallpaper */}
          {isUploadingWallpaper && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-mono text-amber-300">
                <span>Uploading {sanitizedFileName} (153,600 B)...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-950 border border-slate-800">
                <div
                  className="h-full bg-amber-400 transition-all duration-150"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Primary Export & Upload Actions */}
          <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2.5 pt-1 min-w-0">
            <button
              type="button"
              disabled={!isConnected || isAnyTransferActive}
              onClick={handleSendToDeviceClick}
              className="min-h-[44px] sm:min-h-[40px] inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-slate-950 bg-amber-400 rounded-lg hover:bg-amber-300 disabled:opacity-40 transition-colors cursor-pointer"
            >
              <Send className="h-4 w-4 shrink-0" />
              <span>Send to device</span>
            </button>

            <button
              type="button"
              onClick={handleExportAndDownloadBin}
              className="min-h-[44px] sm:min-h-[40px] inline-flex items-center justify-center gap-2 px-3.5 py-2.5 text-xs font-medium text-slate-200 bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors cursor-pointer"
            >
              <Download className="h-4 w-4 text-amber-400 shrink-0" />
              <span>Download RGB565 .bin (153,600 B)</span>
            </button>

            <button
              type="button"
              onClick={handleSaveToGalleryOnly}
              className="min-h-[44px] sm:min-h-[40px] inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 text-xs font-medium text-slate-300 bg-slate-950 border border-slate-800 rounded-lg hover:border-slate-700 hover:text-slate-100 transition-colors cursor-pointer"
            >
              <BookmarkCheck className="h-4 w-4 text-amber-400 shrink-0" />
              <span>Save to List</span>
            </button>
          </div>

          {statusBanner && (
            <p className="text-xs text-emerald-400 font-medium break-words">
              {statusBanner}
            </p>
          )}
        </div>

        {/* Right 6 cols: Portrait 240x320 ST7789 Hardware Bezel Frame & Byte Summary */}
        <div className="lg:col-span-6 min-w-0 rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:p-6 flex flex-col items-center">
          <div className="w-full pb-4 border-b border-slate-800 mb-5 min-w-0">
            <h2 className="text-base font-semibold text-slate-100">
              Portrait 240×320 TFT Display Preview
            </h2>
            <p className="text-xs text-slate-400">
              16-bit RGB565 quantized frame (drag inside portrait screen to pan crop)
            </p>
          </div>

          {/* Portrait 240x320 Bezel Simulation */}
          <div className="w-full max-w-[18rem] rounded-2xl border-2 border-slate-700 bg-[#111622] p-3 sm:p-4 shadow-inner">
            <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] font-mono text-slate-400 mb-2 px-1">
              <span>ST7789 · PORTRAIT</span>
              <span>240×320 RGB565 LE</span>
            </div>

            {/* Portrait 3:4 aspect ratio container around exact 240x320 canvas */}
            <div
              onMouseDown={(e) => {
                setIsDraggingCrop(true);
                dragStartRef.current = {
                  x: e.clientX,
                  y: e.clientY,
                  panX,
                  panY,
                };
              }}
              onMouseMove={(e) => {
                if (!isDraggingCrop) return;
                const dx = e.clientX - dragStartRef.current.x;
                const dy = e.clientY - dragStartRef.current.y;
                setPanX(
                  Math.max(-100, Math.min(100, Math.round(dragStartRef.current.panX + dx * 0.6)))
                );
                setPanY(
                  Math.max(-100, Math.min(100, Math.round(dragStartRef.current.panY + dy * 0.6)))
                );
              }}
              onMouseUp={() => setIsDraggingCrop(false)}
              onMouseLeave={() => setIsDraggingCrop(false)}
              className="relative mx-auto w-full max-w-[15rem] aspect-[3/4] overflow-hidden rounded border border-slate-800 bg-black cursor-move select-none"
            >
              <canvas
                ref={tftPreviewCanvasRef}
                width={TFT_WIDTH}
                height={TFT_HEIGHT}
                data-testid="tft-preview-canvas"
                className="block h-full w-full"
              />
            </div>

            <div className="mt-2 flex flex-wrap items-center justify-between gap-1 text-[11px] font-mono text-slate-400 px-1">
              <span>240 W × 320 H</span>
              <span>153,600 Bytes</span>
            </div>
          </div>

          {/* Binary Format Summary */}
          <div className="mt-5 w-full rounded-lg border border-slate-800 bg-slate-950/70 p-3.5 text-xs font-mono tabular-nums text-slate-300 space-y-1.5 min-w-0">
            <div className="flex flex-wrap justify-between gap-2 min-w-0">
              <span className="text-slate-400">Export Resolution:</span>
              <span>240 × 320 px (Portrait, 76,800 pixels)</span>
            </div>
            <div className="flex flex-wrap justify-between gap-2 min-w-0">
              <span className="text-slate-400">Binary Encoding:</span>
              <span>RGB565 Little-Endian (2 bytes/px)</span>
            </div>
            <div className="flex flex-wrap justify-between gap-2 min-w-0">
              <span className="text-slate-400">Output .bin Size:</span>
              <span className="text-amber-300 font-semibold">
                {currentRgb565.byteLength.toLocaleString()} bytes ({formatBytes(currentRgb565.byteLength)})
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom Section: Saved Wallpapers History List */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:p-6 min-w-0">
        <div className="pb-4 border-b border-slate-800 min-w-0">
          <h2 className="text-base font-semibold text-slate-100">
            Saved Wallpapers ({savedWallpapers.length})
          </h2>
          <p className="text-xs text-slate-400">
            Previously saved 240×320 portrait wallpapers in this session
          </p>
        </div>

        {savedWallpapers.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-xs text-slate-400">
              No saved wallpapers yet. Upload an image and click &quot;Save to List&quot;, &quot;Download RGB565 .bin&quot;, or &quot;Send to device&quot;.
            </p>
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-1 gap-4 sm:gap-5 sm:grid-cols-2 lg:grid-cols-4 min-w-0">
            {savedWallpapers.map((wp) => {
              const isSelected = wp.id === activeWallpaperId;
              return (
                <div
                  key={wp.id}
                  className={`flex flex-col justify-between rounded-xl border p-3.5 transition-colors min-w-0 ${
                    isSelected
                      ? 'border-amber-400 bg-slate-950'
                      : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="mx-auto max-w-[10rem] overflow-hidden rounded border border-slate-800 bg-black aspect-[3/4]">
                      <img
                        src={wp.previewDataUrl}
                        alt={wp.name}
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="mt-3 min-w-0">
                      <p className="text-sm font-semibold text-slate-100 truncate">
                        {wp.name}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-400 font-mono tabular-nums">
                        {wp.width}×{wp.height} · {wp.byteLength.toLocaleString()} B
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 min-w-0">
                    <button
                      type="button"
                      onClick={() => handleReselectWallpaper(wp)}
                      className={`min-h-[44px] sm:min-h-[34px] px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        isSelected
                          ? 'bg-amber-400 text-slate-950'
                          : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                      }`}
                    >
                      {isSelected ? 'Selected' : 'Reselect'}
                    </button>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => triggerBinDownload(wp.rgb565Bytes, wp.name)}
                        aria-label={`Download .bin for ${wp.name}`}
                        className="min-h-[44px] min-w-[44px] sm:min-h-[34px] sm:min-w-[34px] inline-flex items-center justify-center p-2 text-slate-300 bg-slate-900 border border-slate-800 rounded-lg hover:text-amber-300 cursor-pointer"
                        title="Download RGB565 .bin"
                      >
                        <Download className="h-4 w-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => onDeleteSavedWallpaper(wp.id)}
                        aria-label={`Delete wallpaper ${wp.name}`}
                        className="min-h-[44px] min-w-[44px] sm:min-h-[34px] sm:min-w-[34px] inline-flex items-center justify-center p-2 text-slate-500 hover:text-rose-400 cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
