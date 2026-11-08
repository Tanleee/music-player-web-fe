import React, { useEffect, useState } from 'react';
import {
  Play,
  Pause,
  Square,
  SkipBack,
  SkipForward,
  Volume2,
  Sun,
  HardDrive,
  Bluetooth,
  Wifi,
  WifiOff,
  ArrowUpDown,
  AlertTriangle,
} from 'lucide-react';
import { ApiCmdRequest, ApiStatusResponse } from '../types/player';
import { formatDuration } from '../utils/encoders';

interface DeviceControlPageProps {
  status: ApiStatusResponse;
  isConnected: boolean;
  isUploading: boolean;
  uploadProgress: number;
  uploadingLabel: string;
  actionError: string | null;
  onClearError: () => void;
  onSendCommand: (payload: ApiCmdRequest) => Promise<void>;
}

export function DeviceControlPage({
  status,
  isConnected,
  isUploading,
  uploadProgress,
  uploadingLabel,
  actionError,
  onClearError,
  onSendCommand,
}: DeviceControlPageProps) {
  // Local slider states so dragging is smooth and commands only fire on release
  const [volumeDraft, setVolumeDraft] = useState<number>(status.player.volume);
  const [isDraggingVolume, setIsDraggingVolume] = useState(false);

  const [brightnessDraft, setBrightnessDraft] = useState<number>(
    status.display.brightness
  );
  const [isDraggingBrightness, setIsDraggingBrightness] = useState(false);

  const controlsDisabled = !isConnected || isUploading;

  useEffect(() => {
    if (!isDraggingVolume) {
      setVolumeDraft(status.player.volume);
    }
  }, [status.player.volume, isDraggingVolume]);

  useEffect(() => {
    if (!isDraggingBrightness) {
      setBrightnessDraft(status.display.brightness);
    }
  }, [status.display.brightness, isDraggingBrightness]);

  const progressPercent =
    status.player.duration_s > 0
      ? Math.min(
          100,
          Math.max(0, (status.player.position_s / status.player.duration_s) * 100)
        )
      : 0;

  const sdUsedMb = Math.max(0, status.sd.total_mb - status.sd.free_mb);
  const sdUsedPercent =
    status.sd.total_mb > 0
      ? Math.min(100, (sdUsedMb / status.sd.total_mb) * 100)
      : 0;

  const commitVolume = () => {
    if (!isDraggingVolume) return;
    setIsDraggingVolume(false);
    if (!controlsDisabled) {
      void onSendCommand({ cmd: 'volume', value: volumeDraft });
    }
  };

  const commitBrightness = () => {
    if (!isDraggingBrightness) return;
    setIsDraggingBrightness(false);
    if (!controlsDisabled) {
      void onSendCommand({ cmd: 'brightness', value: brightnessDraft });
    }
  };

  const isPlaying = status.player.state === 'playing';
  const showActiveTransfer = isUploading || status.transfer.active;
  const activeTransferPercent = isUploading ? uploadProgress : status.transfer.percent;
  const activeTransferText = isUploading
    ? uploadingLabel || 'UPLOADING...'
    : `${status.transfer.type.toUpperCase()}: ${status.transfer.name}`;

  return (
    <div className="space-y-6 sm:space-y-8 min-w-0">
      {/* Connection Status & WiFi Bar */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3 min-w-0">
        <div className="flex flex-wrap items-center gap-3 min-w-0">
          <div className="inline-flex items-center gap-2">
            {isConnected ? (
              <>
                <Wifi className="h-4 w-4 text-emerald-400 shrink-0" aria-hidden="true" />
                <span className="text-sm font-bold text-emerald-400">Connected</span>
              </>
            ) : (
              <>
                <WifiOff className="h-4 w-4 text-rose-400 shrink-0" aria-hidden="true" />
                <span className="text-rose-400 font-sans font-bold text-sm">Disconnected</span>
              </>
            )}
          </div>
          <span className="text-slate-600" aria-hidden="true">
            ·
          </span>
          <span className="text-xs font-mono tabular-nums text-slate-300">
            IP: {status.wifi.ip || '—'}
          </span>
          <span className="text-slate-600" aria-hidden="true">
            ·
          </span>
          <span className="text-xs font-mono tabular-nums text-slate-300">
            WiFi RSSI: {status.wifi.rssi} dBm
          </span>
        </div>

        <span className="text-xs text-slate-400 font-mono">
          {isUploading
            ? `Upload active (${uploadProgress}%) · Polling paused`
            : 'Polling /api/status (1000 ms)'}
        </span>
      </section>

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

      {/* Main Grid: Player Card (7 cols) + Display & Hardware Status Cards (5 cols) */}
      <div
        className={`grid grid-cols-1 gap-6 lg:grid-cols-12 items-start min-w-0 transition-opacity ${
          !isConnected ? 'opacity-50' : ''
        }`}
      >
        {/* Left 7 cols: Player Card */}
        <div className="lg:col-span-7 min-w-0 rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-800 min-w-0">
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-100">
                Player Control
              </h1>
              <p className="mt-1 text-xs text-slate-400">
                State: <span className="font-mono uppercase text-slate-200">{status.player.state}</span>
              </p>
            </div>
          </div>

          {/* Now Playing Track & Progress Bar */}
          <div className="rounded-xl border border-slate-800/90 bg-slate-950/75 p-4 space-y-4 min-w-0">
            <div className="min-w-0">
              <p className="text-xs font-mono text-amber-300">CURRENT TRACK</p>
              <h2 className="mt-1 text-base sm:text-lg font-bold text-slate-100 truncate">
                {status.player.track || 'No track selected'}
              </h2>
            </div>

            {/* Position / Duration Progress Bar */}
            <div className="space-y-1.5 min-w-0">
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-900 border border-slate-800">
                <div
                  className="h-full bg-amber-400 transition-all duration-300"
                  style={{ width: `${progressPercent.toFixed(1)}%` }}
                />
              </div>
              <div className="flex justify-between text-xs font-mono tabular-nums text-slate-400">
                <span>{formatDuration(status.player.position_s)}</span>
                <span>{formatDuration(status.player.duration_s)}</span>
              </div>
            </div>
          </div>

          {/* Transport Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            <button
              type="button"
              disabled={controlsDisabled}
              onClick={() => void onSendCommand({ cmd: 'prev' })}
              aria-label="Previous track"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-800 bg-slate-950 text-slate-200 hover:border-slate-700 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <SkipBack className="h-4 w-4" />
            </button>

            <button
              type="button"
              disabled={controlsDisabled}
              onClick={() =>
                void onSendCommand({ cmd: isPlaying ? 'pause' : 'play' })
              }
              aria-label={isPlaying ? 'Pause' : 'Play'}
              className="min-h-[44px] inline-flex items-center justify-center gap-2 px-6 py-2.5 text-xs font-bold text-slate-950 bg-amber-400 rounded-lg hover:bg-amber-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isPlaying ? (
                <>
                  <Pause className="h-4 w-4" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  <span>Play</span>
                </>
              )}
            </button>

            <button
              type="button"
              disabled={controlsDisabled}
              onClick={() => void onSendCommand({ cmd: 'stop' })}
              aria-label="Stop playback"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-800 bg-slate-950 text-slate-200 hover:border-slate-700 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <Square className="h-4 w-4" />
            </button>

            <button
              type="button"
              disabled={controlsDisabled}
              onClick={() => void onSendCommand({ cmd: 'next' })}
              aria-label="Next track"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-800 bg-slate-950 text-slate-200 hover:border-slate-700 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <SkipForward className="h-4 w-4" />
            </button>
          </div>

          {/* Volume Slider (sent on release) */}
          <div className="pt-4 border-t border-slate-800 space-y-2 min-w-0">
            <div className="flex items-center justify-between text-xs text-slate-300">
              <label
                htmlFor="player-volume-slider"
                className="flex items-center gap-2 font-medium"
              >
                <Volume2 className="h-4 w-4 text-amber-400 shrink-0" aria-hidden="true" />
                <span>Volume (sends on release)</span>
              </label>
              <span className="font-mono tabular-nums font-semibold text-slate-100">
                {volumeDraft}%
              </span>
            </div>
            <input
              id="player-volume-slider"
              type="range"
              min={0}
              max={100}
              step={1}
              disabled={controlsDisabled}
              value={volumeDraft}
              onChange={(e) => {
                setIsDraggingVolume(true);
                setVolumeDraft(parseInt(e.target.value, 10));
              }}
              onMouseUp={commitVolume}
              onTouchEnd={commitVolume}
              onPointerUp={commitVolume}
              onKeyUp={commitVolume}
              className="w-full h-6 accent-amber-400 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            />
          </div>
        </div>

        {/* Right 5 cols: Display, Storage, Bluetooth, & Transfer Cards */}
        <div className="lg:col-span-5 min-w-0 space-y-4">
          {/* Display Card */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:p-5 space-y-3 min-w-0">
            <div className="flex items-center justify-between text-xs text-slate-300">
              <label
                htmlFor="display-brightness-slider"
                className="flex items-center gap-2 font-semibold text-slate-100"
              >
                <Sun className="h-4 w-4 text-amber-400 shrink-0" aria-hidden="true" />
                <span>Display Brightness (sends on release)</span>
              </label>
              <span className="font-mono tabular-nums font-semibold text-slate-100">
                {brightnessDraft}%
              </span>
            </div>
            <input
              id="display-brightness-slider"
              type="range"
              min={0}
              max={100}
              step={1}
              disabled={controlsDisabled}
              value={brightnessDraft}
              onChange={(e) => {
                setIsDraggingBrightness(true);
                setBrightnessDraft(parseInt(e.target.value, 10));
              }}
              onMouseUp={commitBrightness}
              onTouchEnd={commitBrightness}
              onPointerUp={commitBrightness}
              onKeyUp={commitBrightness}
              className="w-full h-6 accent-amber-400 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            />
          </div>

          {/* Storage Card */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:p-5 space-y-2.5 min-w-0">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 font-semibold text-slate-100">
                <HardDrive className="h-4 w-4 text-amber-400 shrink-0" aria-hidden="true" />
                <span>SD Card Storage</span>
              </span>
              <span
                className={`font-mono font-semibold ${
                  status.sd.ok ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {status.sd.ok ? 'OK' : 'ERROR'}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-950 border border-slate-800">
              <div
                className="h-full bg-amber-400 transition-all duration-200"
                style={{ width: `${sdUsedPercent.toFixed(1)}%` }}
              />
            </div>
            <div className="flex flex-wrap justify-between gap-2 text-xs font-mono tabular-nums text-slate-300">
              <span>Free: {status.sd.free_mb.toLocaleString()} MB</span>
              <span>Total: {status.sd.total_mb.toLocaleString()} MB</span>
            </div>
          </div>

          {/* Bluetooth Card */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:p-5 space-y-1.5 min-w-0">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 font-semibold text-slate-100">
                <Bluetooth className="h-4 w-4 text-amber-400 shrink-0" aria-hidden="true" />
                <span>Bluetooth Speaker</span>
              </span>
              <span
                className={`font-mono font-semibold ${
                  status.bt.connected ? 'text-emerald-400' : 'text-slate-400'
                }`}
              >
                {status.bt.connected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            <p className="text-sm font-mono text-slate-200 truncate">
              Device: {status.bt.device || 'None'}
            </p>
          </div>

          {/* Transfer Card */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:p-5 space-y-2 min-w-0">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 font-semibold text-slate-100">
                <ArrowUpDown className="h-4 w-4 text-amber-400 shrink-0" aria-hidden="true" />
                <span>File Transfer</span>
              </span>
              <span className="font-mono text-slate-400">
                {showActiveTransfer ? `${activeTransferPercent}%` : 'Idle'}
              </span>
            </div>
            {showActiveTransfer ? (
              <div className="space-y-1.5">
                <p className="text-xs font-mono text-amber-300 truncate">
                  {activeTransferText}
                </p>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-950 border border-slate-800">
                  <div
                    className="h-full bg-amber-400 transition-all duration-150"
                    style={{ width: `${activeTransferPercent}%` }}
                  />
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400">No active upload</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
