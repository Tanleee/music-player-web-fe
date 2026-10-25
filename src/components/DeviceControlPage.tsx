import React from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Volume2,
  VolumeX,
  BatteryCharging,
  Wifi,
  Cpu,
  HardDrive,
  RefreshCw,
  Terminal,
} from 'lucide-react';
import {
  AudioTrack,
  DeviceCommandLog,
  DeviceStatus,
  PlaybackState,
  Playlist,
  SavedWallpaper,
} from '../types/player';
import { formatBytes, formatDuration } from '../utils/encoders';

interface DeviceControlPageProps {
  tracks: AudioTrack[];
  playlists: Playlist[];
  playback: PlaybackState;
  deviceStatus: DeviceStatus;
  activeWallpaper: SavedWallpaper | undefined;
  commandLogs: DeviceCommandLog[];
  onPlayPause: () => void;
  onNextTrack: () => void;
  onPrevTrack: () => void;
  onToggleShuffle: () => void;
  onCycleRepeat: () => void;
  onSeek: (timeSec: number) => void;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
  onSelectTrack: (trackId: string) => void;
  onRefreshTelemetry: () => void;
}

export function DeviceControlPage({
  tracks,
  playlists,
  playback,
  deviceStatus,
  activeWallpaper,
  commandLogs,
  onPlayPause,
  onNextTrack,
  onPrevTrack,
  onToggleShuffle,
  onCycleRepeat,
  onSeek,
  onVolumeChange,
  onToggleMute,
  onSelectTrack,
  onRefreshTelemetry,
}: DeviceControlPageProps) {
  const readyTracks = tracks.filter((t) => t.status === 'done');
  const currentTrack =
    readyTracks.find((t) => t.id === playback.currentTrackId) ?? readyTracks[0] ?? null;

  const activePlaylist =
    playlists.find((p) => p.id === playback.activePlaylistId) ?? playlists[0] ?? null;

  const effectiveDuration = currentTrack?.durationSec ?? playback.durationSec ?? 180;

  const sdFreePercent =
    deviceStatus.sdTotalBytes > 0
      ? ((deviceStatus.sdFreeBytes / deviceStatus.sdTotalBytes) * 100).toFixed(1)
      : '0.0';

  const rssiQuality =
    deviceStatus.wifiRssiDbm >= -60
      ? 'Excellent'
      : deviceStatus.wifiRssiDbm >= -70
      ? 'Good'
      : 'Fair';

  return (
    <div className="space-y-6 sm:space-y-8 min-w-0">
      {/* Top Split: Now Playing & Transport Deck (7 cols) + Device Hardware Telemetry (5 cols) */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-stretch min-w-0">
        {/* Left 7 cols: Remote Playback Transport & Now Playing Display */}
        <div className="lg:col-span-7 min-w-0 flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-800 min-w-0">
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-100">
                ESP32-C3 Playback Control & Now Playing
              </h1>
              <p className="mt-1 text-xs text-slate-400">
                Remote transport deck — commands route through modular deviceApi.ts stub
              </p>
            </div>
            <span className="text-xs font-mono text-slate-400">
              DAC: I2S PCM5102A · 44.1kHz 16-bit Mono
            </span>
          </div>

          {/* Now Playing Card with Mini 320x240 Screen Mirror */}
          <div className="my-5 grid grid-cols-1 sm:grid-cols-12 gap-4 sm:gap-5 items-center rounded-xl border border-slate-800/90 bg-slate-950/75 p-3.5 sm:p-4 min-w-0">
            {/* Mini ST7789 Wallpaper + OSD Mirror */}
            <div className="sm:col-span-5 min-w-0">
              <div className="relative overflow-hidden rounded-lg border border-slate-700 bg-black aspect-[4/3]">
                {activeWallpaper ? (
                  <img
                    src={activeWallpaper.previewDataUrl}
                    alt={activeWallpaper.name}
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover opacity-80"
                  />
                ) : null}
                <div className="absolute inset-0 flex flex-col justify-between bg-gradient-to-t from-black/85 via-black/30 to-black/50 p-2.5 font-mono text-white">
                  <div className="flex justify-between gap-2 text-[10px] text-slate-300 min-w-0">
                    <span>{playback.isPlaying ? 'STATE: PLAY' : 'STATE: PAUSE'}</span>
                    <span>VOL {playback.isMuted ? 'MUTE' : `${playback.volume}%`}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-white">
                      {currentTrack ? currentTrack.title : 'No Track Loaded'}
                    </p>
                    <p className="truncate text-[10px] text-amber-300">
                      {currentTrack ? currentTrack.artist : 'SD Card Idle'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Track Details & Seek Scrubber */}
            <div className="sm:col-span-7 space-y-3 min-w-0">
              <div className="min-w-0">
                <p className="text-xs font-mono text-amber-300 truncate">
                  NOW PLAYING · {activePlaylist ? activePlaylist.name : 'SD Library'}
                </p>
                <h2 className="mt-0.5 text-base sm:text-lg font-bold text-slate-100 truncate">
                  {currentTrack ? currentTrack.title : 'No Track Selected'}
                </h2>
                <p className="text-xs text-slate-400 truncate">
                  {currentTrack
                    ? `${currentTrack.artist} · WAV 44,100 Hz 16-bit PCM Mono`
                    : 'Select a track from the queue below'}
                </p>
              </div>

              {/* Interactive Progress Bar */}
              <div className="space-y-1.5 min-w-0">
                <label htmlFor="now-playing-seek" className="sr-only">
                  Seek playback position
                </label>
                <input
                  id="now-playing-seek"
                  type="range"
                  min={0}
                  max={Math.max(1, Math.round(effectiveDuration))}
                  step={1}
                  value={Math.min(
                    Math.round(effectiveDuration),
                    Math.round(playback.currentTimeSec)
                  )}
                  onChange={(e) => onSeek(parseInt(e.target.value, 10))}
                  className="w-full h-6 accent-amber-400 cursor-pointer"
                />
                <div className="flex justify-between text-xs font-mono tabular-nums text-slate-400">
                  <span>{formatDuration(playback.currentTimeSec)}</span>
                  <span>-{formatDuration(Math.max(0, effectiveDuration - playback.currentTimeSec))}</span>
                  <span>{formatDuration(effectiveDuration)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Primary Transport Controls Bar */}
          <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center justify-between gap-3.5 pt-3 border-t border-slate-800 min-w-0">
            {/* Left: Shuffle & Repeat */}
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={onToggleShuffle}
                aria-pressed={playback.isShuffle}
                className={`flex-1 sm:flex-initial min-h-[44px] sm:min-h-[38px] inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  playback.isShuffle
                    ? 'border-amber-400 bg-amber-400/15 text-amber-300'
                    : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Shuffle className="h-3.5 w-3.5 shrink-0" />
                <span>Shuffle {playback.isShuffle ? 'On' : 'Off'}</span>
              </button>

              <button
                type="button"
                onClick={onCycleRepeat}
                className={`flex-1 sm:flex-initial min-h-[44px] sm:min-h-[38px] inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  playback.repeatMode !== 'off'
                    ? 'border-amber-400 bg-amber-400/15 text-amber-300'
                    : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Repeat className="h-3.5 w-3.5 shrink-0" />
                <span>
                  Repeat:{' '}
                  {playback.repeatMode === 'off'
                    ? 'Off'
                    : playback.repeatMode === 'all'
                    ? 'All'
                    : 'One'}
                </span>
              </button>
            </div>

            {/* Center: Prev / Play-Pause / Next */}
            <div className="flex items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={onPrevTrack}
                aria-label="Previous track"
                className="flex h-11 w-11 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg border border-slate-800 bg-slate-950 text-slate-200 hover:border-slate-700 hover:text-white transition-colors cursor-pointer"
              >
                <SkipBack className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={onPlayPause}
                aria-label={playback.isPlaying ? 'Pause playback' : 'Start playback'}
                className="min-h-[44px] sm:min-h-[40px] flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-bold text-slate-950 bg-amber-400 rounded-lg hover:bg-amber-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {playback.isPlaying ? (
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
                onClick={onNextTrack}
                aria-label="Next track"
                className="flex h-11 w-11 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg border border-slate-800 bg-slate-950 text-slate-200 hover:border-slate-700 hover:text-white transition-colors cursor-pointer"
              >
                <SkipForward className="h-4 w-4" />
              </button>
            </div>

            {/* Right: Volume Slider */}
            <div className="flex items-center gap-2.5 w-full sm:w-auto min-w-0">
              <button
                type="button"
                onClick={onToggleMute}
                aria-label={playback.isMuted ? 'Unmute volume' : 'Mute volume'}
                className="min-h-[44px] min-w-[44px] sm:min-h-[36px] sm:min-w-[36px] inline-flex items-center justify-center p-2 text-slate-300 hover:text-amber-300 transition-colors cursor-pointer shrink-0"
              >
                {playback.isMuted || playback.volume === 0 ? (
                  <VolumeX className="h-4 w-4 text-rose-400" />
                ) : (
                  <Volume2 className="h-4 w-4 text-amber-400" />
                )}
              </button>
              <label htmlFor="device-volume-slider" className="sr-only">
                Output Volume
              </label>
              <input
                id="device-volume-slider"
                type="range"
                min={0}
                max={100}
                step={1}
                value={playback.isMuted ? 0 : playback.volume}
                onChange={(e) => onVolumeChange(parseInt(e.target.value, 10))}
                className="flex-1 sm:w-24 h-6 min-w-0 accent-amber-400 cursor-pointer"
              />
              <span className="w-10 text-right text-xs font-mono tabular-nums text-slate-300 shrink-0">
                {playback.isMuted ? '0%' : `${playback.volume}%`}
              </span>
            </div>
          </div>
        </div>

        {/* Right 5 cols: Device Status Telemetry Panel */}
        <div className="lg:col-span-5 min-w-0 flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2.5 pb-4 border-b border-slate-800 min-w-0">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-slate-100">
                ESP32-C3 Device Status
              </h2>
              <p className="text-xs text-slate-400">
                Mocked hardware telemetry · Protocol: {deviceStatus.transportType}
              </p>
            </div>
            <button
              type="button"
              onClick={onRefreshTelemetry}
              className="min-h-[44px] sm:min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-950 border border-slate-800 rounded-lg hover:border-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5 text-amber-400 shrink-0" />
              <span>Poll Status</span>
            </button>
          </div>

          {/* 4 Requested Device Telemetry Metrics */}
          <div className="my-4 grid grid-cols-1 sm:grid-cols-2 gap-3.5 min-w-0">
            {/* 1. Battery Status */}
            <div className="rounded-lg border border-slate-800 bg-slate-950/75 p-3.5 min-w-0">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Battery Level</span>
                <BatteryCharging className="h-4 w-4 text-emerald-400 shrink-0" aria-hidden="true" />
              </div>
              <p className="mt-1.5 text-lg font-bold font-mono tabular-nums text-slate-100">
                {deviceStatus.batteryPercent}%
              </p>
              <p className="mt-0.5 text-xs font-mono tabular-nums text-slate-400 truncate">
                {(deviceStatus.batteryVoltageMv / 1000).toFixed(2)} V LiPo ·{' '}
                {deviceStatus.isCharging ? 'Charging' : 'Nominal'}
              </p>
            </div>

            {/* 2. WiFi Signal */}
            <div className="rounded-lg border border-slate-800 bg-slate-950/75 p-3.5 min-w-0">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>WiFi Signal</span>
                <Wifi className="h-4 w-4 text-amber-400 shrink-0" aria-hidden="true" />
              </div>
              <p className="mt-1.5 text-lg font-bold font-mono tabular-nums text-slate-100">
                {deviceStatus.wifiRssiDbm} dBm
              </p>
              <p className="mt-0.5 text-xs text-slate-400 truncate">
                {rssiQuality} · {deviceStatus.wifiSsid}
              </p>
            </div>

            {/* 3. Firmware Version */}
            <div className="rounded-lg border border-slate-800 bg-slate-950/75 p-3.5 min-w-0">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Firmware Version</span>
                <Cpu className="h-4 w-4 text-amber-400 shrink-0" aria-hidden="true" />
              </div>
              <p className="mt-1.5 text-sm font-bold font-mono text-slate-100 truncate">
                {deviceStatus.firmwareVersion}
              </p>
              <p className="mt-1 text-xs text-slate-400 truncate">
                {deviceStatus.mcuModel}
              </p>
            </div>

            {/* 4. Free SD Space */}
            <div className="rounded-lg border border-slate-800 bg-slate-950/75 p-3.5 min-w-0">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Free SD Space</span>
                <HardDrive className="h-4 w-4 text-emerald-400 shrink-0" aria-hidden="true" />
              </div>
              <p className="mt-1.5 text-lg font-bold font-mono tabular-nums text-slate-100">
                {formatBytes(deviceStatus.sdFreeBytes)}
              </p>
              <p className="mt-0.5 text-xs font-mono tabular-nums text-slate-400 truncate">
                {sdFreePercent}% free of {formatBytes(deviceStatus.sdTotalBytes)}
              </p>
            </div>
          </div>

          <div className="text-xs font-mono text-slate-400 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800 min-w-0">
            <span className="min-w-0">Display: {deviceStatus.displayDriver}</span>
            <span className="min-w-0">Last Poll: {deviceStatus.lastSyncAt}</span>
          </div>
        </div>
      </section>

      {/* Bottom Split: SD Card Track Queue Selector (7 cols) + Placeholder Transport Dispatch Log (5 cols) */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start min-w-0">
        {/* Track Queue on Device */}
        <div className="lg:col-span-7 min-w-0 rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:p-6">
          <div className="pb-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 min-w-0">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-slate-100">
                Active Device Queue ({readyTracks.length} WAV Tracks)
              </h2>
              <p className="text-xs text-slate-400">
                Select any track to trigger a remote track change on the player
              </p>
            </div>
          </div>

          <div className="mt-3 divide-y divide-slate-800/80">
            {readyTracks.map((track, idx) => {
              const isCurrent = currentTrack?.id === track.id;
              return (
                <div
                  key={track.id}
                  className={`flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 py-3 px-2 rounded-lg transition-colors min-w-0 ${
                    isCurrent ? 'bg-amber-400/10' : 'hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="font-mono tabular-nums text-xs text-slate-500 w-5 shrink-0">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-sm font-semibold truncate ${
                          isCurrent ? 'text-amber-300' : 'text-slate-100'
                        }`}
                      >
                        {track.title}
                      </p>
                      <p className="text-xs text-slate-400 truncate font-mono tabular-nums">
                        {track.artist} · {formatDuration(track.durationSec)} ·{' '}
                        {formatBytes(track.convertedSizeBytes)}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onSelectTrack(track.id)}
                    className={`min-h-[44px] sm:min-h-[34px] px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      isCurrent
                        ? 'bg-amber-400 text-slate-950'
                        : 'bg-slate-950 border border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white'
                    }`}
                  >
                    {isCurrent ? 'Now Playing' : 'Play Track'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Modular Protocol Stub Outbox */}
        <div className="lg:col-span-5 min-w-0 rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:p-6">
          <div className="pb-4 border-b border-slate-800 min-w-0">
            <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2 min-w-0">
              <Terminal className="h-4 w-4 text-amber-400 shrink-0" aria-hidden="true" />
              <span className="truncate">Device Protocol Outbox (Placeholder Stub)</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Shows structured API calls captured by <code className="text-slate-300">src/services/deviceApi.ts</code> ready for WebSerial, BLE, or WiFi WebSocket wiring
            </p>
          </div>

          <div className="mt-3 space-y-2 max-h-64 overflow-y-auto font-mono text-xs min-w-0">
            {commandLogs.length === 0 ? (
              <p className="text-slate-500 py-4 text-center">
                Interact with playback controls or click Sync to inspect outgoing device commands.
              </p>
            ) : (
              commandLogs.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded border border-slate-800/90 bg-slate-950 p-2.5 text-slate-300 min-w-0"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 min-w-0">
                    <span className="font-semibold text-amber-300 break-all">{entry.action}</span>
                    <span className="tabular-nums shrink-0">{entry.timestamp}</span>
                  </div>
                  <p className="mt-1 break-words text-slate-400">{entry.payloadSummary}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
