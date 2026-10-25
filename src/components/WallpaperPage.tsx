import React, { useEffect, useRef, useState } from 'react';
import {
  ImagePlus,
  Download,
  BookmarkCheck,
  Send,
  Trash2,
  RotateCcw,
  Eye,
  Sliders,
} from 'lucide-react';
import { SavedWallpaper } from '../types/player';
import {
  TFT_WIDTH,
  TFT_HEIGHT,
  TFT_RGB565_BYTE_LENGTH,
  encodeRgb565LittleEndian,
  decodeRgb565LittleEndianToRgba,
  formatBytes,
} from '../utils/encoders';
import { ARTWORK_PRESETS, ArtworkPreset } from '../utils/presetWallpapers';

interface WallpaperPageProps {
  savedWallpapers: SavedWallpaper[];
  activeWallpaperId: string;
  onSaveWallpaper: (wallpaper: SavedWallpaper) => void;
  onSelectSavedWallpaper: (wallpaper: SavedWallpaper) => void;
  onDeleteSavedWallpaper: (wallpaperId: string) => void;
  onPushWallpaperToDevice: (wallpaper: SavedWallpaper) => void;
}

export function WallpaperPage({
  savedWallpapers,
  activeWallpaperId,
  onSaveWallpaper,
  onSelectSavedWallpaper,
  onDeleteSavedWallpaper,
  onPushWallpaperToDevice,
}: WallpaperPageProps) {
  const workCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const tftPreviewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const loadedImageRef = useRef<HTMLImageElement | null>(null);

  const initialWp =
    savedWallpapers.find((w) => w.id === activeWallpaperId) ?? savedWallpapers[0];

  const [wallpaperName, setWallpaperName] = useState(
    initialWp ? initialWp.name : 'Sunset Signal 320'
  );
  const [sourceDataUrl, setSourceDataUrl] = useState<string>(
    initialWp ? initialWp.sourceDataUrl : ''
  );
  const [fitMode, setFitMode] = useState<'cover' | 'contain' | 'stretch'>('cover');
  const [zoom, setZoom] = useState<number>(1);
  const [panX, setPanX] = useState<number>(0); // -100 to 100
  const [panY, setPanY] = useState<number>(0); // -100 to 100
  const [brightness, setBrightness] = useState<number>(100); // 50 to 150%
  const [dither, setDither] = useState<boolean>(true);
  const [showHudOverlay, setShowHudOverlay] = useState<boolean>(true);
  const [currentRgb565, setCurrentRgb565] = useState<Uint8Array>(
    initialWp ? initialWp.rgb565Bytes : new Uint8Array(TFT_RGB565_BYTE_LENGTH)
  );
  const [statusBanner, setStatusBanner] = useState<string>('');

  // Dragging directly inside the TFT preview frame to pan crop
  const [isDraggingCrop, setIsDraggingCrop] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number }>({
    x: 0,
    y: 0,
    panX: 0,
    panY: 0,
  });

  // Re-render 320x240 crop and compute RGB565 little-endian buffer whenever image or crop params change
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
    ctx.filter = `brightness(${brightness}%)`;

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

    // Decode back from RGB565 so the preview displays genuine 16-bit ST7789 color output
    const quantizedRgba = decodeRgb565LittleEndianToRgba(
      encoded565,
      TFT_WIDTH,
      TFT_HEIGHT
    );
    const quantizedImgData = new ImageData(new Uint8ClampedArray(quantizedRgba), TFT_WIDTH, TFT_HEIGHT);
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
  }, [fitMode, zoom, panX, panY, brightness, dither]);

  const handleUploadImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const baseName = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ');
    setWallpaperName(baseName || 'Custom TFT Wallpaper');
    setZoom(1);
    setPanX(0);
    setPanY(0);
    setBrightness(100);

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setSourceDataUrl(reader.result);
        setStatusBanner(`Loaded "${file.name}" — cropped to 320×240 RGB565`);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleLoadPresetTemplate = (preset: ArtworkPreset) => {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = 640;
    tempCanvas.height = 480;
    const ctx = tempCanvas.getContext('2d');
    if (!ctx) return;
    preset.draw(ctx, 640, 480);
    setWallpaperName(preset.name);
    setZoom(1);
    setPanX(0);
    setPanY(0);
    setBrightness(100);
    setSourceDataUrl(tempCanvas.toDataURL('image/png'));
    setStatusBanner(`Loaded template "${preset.name}"`);
  };

  const buildCurrentWallpaperObject = (): SavedWallpaper => {
    const previewCanvas = tftPreviewCanvasRef.current;
    const previewDataUrl = previewCanvas
      ? previewCanvas.toDataURL('image/png')
      : sourceDataUrl;
    const now = new Date();
    const timeStr = `${now.toISOString().slice(0, 10)} ${now.toTimeString().slice(0, 5)}`;

    return {
      id: `wp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: wallpaperName.trim() || 'Untitled 320x240 Wallpaper',
      createdAt: timeStr,
      width: 320,
      height: 240,
      byteLength: 153600,
      rgb565Bytes: new Uint8Array(currentRgb565),
      previewDataUrl,
      sourceDataUrl,
      dithered: dither,
      isActiveOnDevice: false,
    };
  };

  const triggerBinDownload = (bytes: Uint8Array, name: string) => {
    const safeSlug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
    const blob = new Blob([bytes], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeSlug || 'wallpaper'}_320x240_rgb565le.bin`;
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
      `Exported "${wp.name}_320x240_rgb565le.bin" (153,600 bytes raw little-endian RGB565) and saved to library.`
    );
  };

  const handleSaveToGalleryOnly = () => {
    const wp = buildCurrentWallpaperObject();
    onSaveWallpaper(wp);
    setStatusBanner(`Saved "${wp.name}" (320×240 RGB565) to Saved Wallpapers.`);
  };

  const handleReselectWallpaper = (wp: SavedWallpaper) => {
    setWallpaperName(wp.name);
    setDither(wp.dithered);
    setZoom(1);
    setPanX(0);
    setPanY(0);
    setBrightness(100);
    setSourceDataUrl(wp.sourceDataUrl || wp.previewDataUrl);
    onSelectSavedWallpaper(wp);
    setStatusBanner(`Reselected saved wallpaper "${wp.name}".`);
  };

  // Sample first 8 bytes in hex for hardware inspection
  const hexHeaderPreview = Array.from(currentRgb565.slice(0, 8))
    .map((b) => `0x${b.toString(16).padStart(2, '0').toUpperCase()}`)
    .join(' ');

  return (
    <div className="space-y-6 sm:space-y-8 min-w-0">
      {/* Hidden 320x240 offscreen work canvas (exact 320x240 target resolution) */}
      <canvas
        ref={workCanvasRef}
        width={TFT_WIDTH}
        height={TFT_HEIGHT}
        className="hidden"
      />

      {/* Top Editor & Mock ST7789 TFT Screen Frame Split */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start min-w-0">
        {/* Left 6 cols: Upload, Crop/Resize Controls, & Export Actions */}
        <div className="lg:col-span-6 min-w-0 rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:p-6 space-y-5">
          <div className="border-b border-slate-800 pb-4 min-w-0">
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-100">
              320×240 RGB565 TFT Wallpaper Studio
            </h1>
            <p className="mt-1 text-xs text-slate-400">
              Target Display: ST7789 320×240 IPS (LovyanGFX) · Raw 16-bit RGB565 Little-Endian (153,600 bytes)
            </p>
          </div>

          {/* Upload & Built-in Artwork Templates */}
          <div className="space-y-3 min-w-0">
            <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center justify-between gap-2.5 min-w-0">
              <label
                htmlFor="wallpaper-upload-input"
                className="min-h-[44px] sm:min-h-[38px] inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-400 rounded-lg hover:bg-amber-300 transition-colors cursor-pointer whitespace-nowrap shrink-0"
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

              <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                {ARTWORK_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleLoadPresetTemplate(preset)}
                    className="min-h-[44px] sm:min-h-[34px] flex-1 sm:flex-initial px-2.5 py-1.5 text-xs font-medium text-slate-300 bg-slate-950 border border-slate-800 rounded-lg hover:border-slate-700 hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Wallpaper Name Input */}
            <div className="min-w-0">
              <label
                htmlFor="wallpaper-title-input"
                className="block text-xs font-medium text-slate-300 mb-1"
              >
                Wallpaper Name
              </label>
              <input
                id="wallpaper-title-input"
                type="text"
                value={wallpaperName}
                onChange={(e) => setWallpaperName(e.target.value)}
                placeholder="Enter wallpaper title..."
                className="min-h-[44px] sm:min-h-[38px] w-full min-w-0 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-amber-400 focus:outline-none"
              />
            </div>
          </div>

          {/* Crop, Fit, Pan, Zoom Controls */}
          <div className="rounded-lg border border-slate-800/90 bg-slate-950/60 p-3.5 sm:p-4 space-y-4 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
              <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5 min-w-0">
                <Sliders className="h-3.5 w-3.5 text-amber-400 shrink-0" aria-hidden="true" />
                <span>320×240 Crop & Framing Controls</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setFitMode('cover');
                  setZoom(1);
                  setPanX(0);
                  setPanY(0);
                  setBrightness(100);
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
                      ? 'Fill 320×240'
                      : mode === 'contain'
                      ? 'Fit Inside'
                      : 'Stretch'}
                  </button>
                ))}
              </div>
            </div>

            {/* Zoom & Pan Sliders */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 min-w-0">
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

              <div className="min-w-0">
                <div className="flex justify-between text-xs text-slate-400 mb-1">
                  <label htmlFor="crop-brightness-slider">TFT Backlight Gain</label>
                  <span className="font-mono tabular-nums text-slate-200">
                    {brightness}%
                  </span>
                </div>
                <input
                  id="crop-brightness-slider"
                  type="range"
                  min={60}
                  max={140}
                  step={5}
                  value={brightness}
                  onChange={(e) => setBrightness(parseInt(e.target.value, 10))}
                  className="w-full h-6 accent-amber-400 cursor-pointer"
                />
              </div>

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

          {/* Primary Export & Save Actions */}
          <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2.5 pt-1 min-w-0">
            <button
              type="button"
              onClick={handleExportAndDownloadBin}
              className="min-h-[44px] sm:min-h-[40px] inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-slate-950 bg-amber-400 rounded-lg hover:bg-amber-300 transition-colors cursor-pointer"
            >
              <Download className="h-4 w-4 shrink-0" />
              <span>Download RGB565 .bin (153,600 B)</span>
            </button>

            <button
              type="button"
              onClick={handleSaveToGalleryOnly}
              className="min-h-[44px] sm:min-h-[40px] inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 text-xs font-medium text-slate-200 bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors cursor-pointer"
            >
              <BookmarkCheck className="h-4 w-4 text-amber-400 shrink-0" />
              <span>Save to Wallpaper List</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const wp = buildCurrentWallpaperObject();
                onSaveWallpaper(wp);
                onPushWallpaperToDevice(wp);
                setStatusBanner(
                  `Queued "${wp.name}" (153,600 B RGB565 LE) for ESP32-C3 transfer.`
                );
              }}
              className="min-h-[44px] sm:min-h-[40px] inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 text-xs font-medium text-slate-300 bg-slate-950 border border-slate-800 rounded-lg hover:border-slate-700 hover:text-slate-100 transition-colors cursor-pointer"
            >
              <Send className="h-3.5 w-3.5 text-amber-400 shrink-0" />
              <span>Send to Device</span>
            </button>
          </div>

          {statusBanner && (
            <p className="text-xs text-emerald-400 font-medium break-words">{statusBanner}</p>
          )}
        </div>

        {/* Right 6 cols: Mock 320x240 ST7789 Hardware Bezel Frame & Byte Telemetry */}
        <div className="lg:col-span-6 min-w-0 rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:p-6 flex flex-col items-center">
          <div className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-4 border-b border-slate-800 mb-5 min-w-0">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-slate-100">
                ST7789 320×240 TFT Display Frame
              </h2>
              <p className="text-xs text-slate-400">
                Live 16-bit RGB565 color quantization preview (drag inside screen to pan crop)
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowHudOverlay((prev) => !prev)}
              className="min-h-[44px] sm:min-h-[36px] self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-950 border border-slate-800 rounded-lg hover:border-slate-700 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Eye className="h-3.5 w-3.5 text-amber-400 shrink-0" />
              <span>{showHudOverlay ? 'Hide Player OSD Overlay' : 'Show Player OSD Overlay'}</span>
            </button>
          </div>

          {/* Physical ST7789 Hardware Module Bezel Simulation (Fluid 4:3 container up to 20rem / 320px screen) */}
          <div className="w-full max-w-[22.5rem] rounded-2xl border-2 border-slate-700 bg-[#111622] p-3 sm:p-5 shadow-inner">
            <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] font-mono text-slate-400 mb-2.5 px-1">
              <span>ST7789V · 2.0&quot; IPS SPI</span>
              <span>320×240 RGB565 LE</span>
            </div>

            {/* Inner dark glass polarizer bezel around 320x240 display */}
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
              className="relative mx-auto w-full max-w-[20rem] aspect-[4/3] overflow-hidden rounded border border-slate-800 bg-black cursor-move select-none"
            >
              <canvas
                ref={tftPreviewCanvasRef}
                width={TFT_WIDTH}
                height={TFT_HEIGHT}
                data-testid="tft-preview-canvas"
                className="block h-full w-full"
              />

              {/* Simulated LovyanGFX Music Player On-Screen Display (OSD) */}
              {showHudOverlay && (
                <div className="pointer-events-none absolute inset-0 flex flex-col justify-between bg-gradient-to-t from-black/80 via-black/20 to-black/50 p-2.5 sm:p-3 font-mono text-white">
                  <div className="flex items-center justify-between gap-2 text-[10px] text-slate-200 min-w-0">
                    <span className="truncate">SD:/MUSIC/WAV</span>
                    <span className="shrink-0">44.1kHz 16b · 86%</span>
                  </div>

                  <div className="space-y-1.5 min-w-0">
                    <p className="truncate text-xs font-bold tracking-tight text-white drop-shadow">
                      01. Solar Wind Drift
                    </p>
                    <p className="truncate text-[10px] text-amber-300">
                      Helios Ensemble
                    </p>
                    <div className="h-1 w-full overflow-hidden rounded bg-white/25">
                      <div className="h-full w-2/5 bg-amber-400" />
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-300 tabular-nums">
                      <span>01:14</span>
                      <span>03:12</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-1 text-[11px] font-mono text-slate-400 px-1">
              <span>ESP32-C3 SPI @ 40MHz</span>
              <span>LovyanGFX pushImage()</span>
            </div>
          </div>

          {/* Binary Format Verification Summary */}
          <div className="mt-5 w-full rounded-lg border border-slate-800 bg-slate-950/70 p-3.5 text-xs font-mono tabular-nums text-slate-300 space-y-1.5 min-w-0">
            <div className="flex flex-wrap justify-between gap-2 min-w-0">
              <span className="text-slate-400">Export Resolution:</span>
              <span>320 × 240 px (76,800 pixels)</span>
            </div>
            <div className="flex flex-wrap justify-between gap-2 min-w-0">
              <span className="text-slate-400">Binary Encoding:</span>
              <span>RGB565 Little-Endian (2 bytes/px)</span>
            </div>
            <div className="flex flex-wrap justify-between gap-2 min-w-0">
              <span className="text-slate-400">Output .bin File Size:</span>
              <span className="text-amber-300 font-semibold">
                {currentRgb565.byteLength.toLocaleString()} bytes ({formatBytes(currentRgb565.byteLength)})
              </span>
            </div>
            <div className="flex flex-wrap justify-between gap-2 min-w-0">
              <span className="text-slate-400">First 8 Bytes (LE Hex):</span>
              <span className="text-slate-400 break-all sm:break-normal">{hexHeaderPreview}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom Section: Saved Wallpapers History List to Reselect */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:p-6 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-800 min-w-0">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-100">
              Saved Wallpapers ({savedWallpapers.length})
            </h2>
            <p className="text-xs text-slate-400">
              Click any previously created 320×240 wallpaper to reselect it into the TFT preview and download its raw RGB565 .bin file
            </p>
          </div>
        </div>

        {savedWallpapers.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm text-slate-400">
              No wallpapers saved yet. Use the studio above to save or export a 320×240 wallpaper.
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
                    <div className="overflow-hidden rounded border border-slate-800 bg-black aspect-[4/3]">
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
                        {wp.width}×{wp.height} · RGB565 LE · {wp.byteLength.toLocaleString()} B
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

                      {savedWallpapers.length > 1 && (
                        <button
                          type="button"
                          onClick={() => onDeleteSavedWallpaper(wp.id)}
                          aria-label={`Delete wallpaper ${wp.name}`}
                          className="min-h-[44px] min-w-[44px] sm:min-h-[34px] sm:min-w-[34px] inline-flex items-center justify-center p-2 text-slate-500 hover:text-rose-400 cursor-pointer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
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
