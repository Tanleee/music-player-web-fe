import React, { useRef, useState } from 'react';
import {
  Upload,
  Play,
  Pause,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Download,
  Edit3,
  Trash2,
  HardDrive,
  Volume2,
  RefreshCw,
  Send,
  Bluetooth,
} from 'lucide-react';
import {
  ApiStatusResponse,
  DeviceTrackItem,
  StagedAudioTrack,
} from '../types/player';
import {
  TARGET_AUDIO_SAMPLE_RATE,
  TARGET_AUDIO_BIT_DEPTH,
  formatBytes,
  formatDuration,
  sanitizeFatFilename,
} from '../utils/encoders';

interface MusicLibraryPageProps {
  deviceTracks: DeviceTrackItem[];
  stagedTracks: StagedAudioTrack[];
  status: ApiStatusResponse;
  isConnected: boolean;
  isLoadingTracks: boolean;
  tracksError: string | null;
  uploadingTrackId: string | null;
  isUploadingAny: boolean;
  uploadProgress: number;
  actionError: string | null;
  onClearError: () => void;
  onRefreshTracks: () => void;
  onPlayDeviceTrack: (trackName: string) => Promise<void>;
  onDeleteDeviceTrack: (trackName: string) => Promise<void>;
  onSelectLocalFiles: (files: File[]) => void;
  onUpdateStagedTitle: (id: string, newTitle: string, newArtist: string) => void;
  onRemoveStagedTrack: (id: string) => void;
  onUploadStagedTrack: (track: StagedAudioTrack) => Promise<void>;
}

export function MusicLibraryPage({
  deviceTracks,
  stagedTracks,
  status,
  isConnected,
  isLoadingTracks,
  tracksError,
  uploadingTrackId,
  isUploadingAny,
  uploadProgress,
  actionError,
  onClearError,
  onRefreshTracks,
  onPlayDeviceTrack,
  onDeleteDeviceTrack,
  onSelectLocalFiles,
  onUpdateStagedTitle,
  onRemoveStagedTrack,
  onUploadStagedTrack,
}: MusicLibraryPageProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  const [isDraggingOverDropzone, setIsDraggingOverDropzone] = useState(false);
  const [confirmDeleteName, setConfirmDeleteName] = useState<string | null>(null);
  const [busyTrackName, setBusyTrackName] = useState<string | null>(null);

  // Local A/B preview state for staged conversions
  const [previewTrackId, setPreviewTrackId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<'converted' | 'original'>('converted');
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);

  // Staged track inline metadata/filename editing
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editArtist, setEditArtist] = useState('');

  const previewTrack =
    stagedTracks.find((t) => t.id === previewTrackId) ?? stagedTracks[0] ?? null;

  const isAnyTransferActive = isUploadingAny || status.transfer.active;
  const displayedProgress = isUploadingAny ? uploadProgress : status.transfer.percent;
  const isBtPlayingWarning =
    status.bt.connected && status.player.state === 'playing';

  const usedMb = Math.max(0, status.sd.total_mb - status.sd.free_mb);
  const usedPercent =
    status.sd.total_mb > 0
      ? Math.min(100, (usedMb / status.sd.total_mb) * 100)
      : 0;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onSelectLocalFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const handleDropFiles = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOverDropzone(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onSelectLocalFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleSelectPreview = (
    track: StagedAudioTrack,
    mode: 'original' | 'converted'
  ) => {
    const resolvedMode =
      mode === 'converted' && !track.convertedWavUrl ? 'original' : mode;
    setPreviewTrackId(track.id);
    setPreviewMode(resolvedMode);

    requestAnimationFrame(() => {
      const audioEl = audioPlayerRef.current;
      if (!audioEl) return;
      const targetSrc =
        resolvedMode === 'converted' && track.convertedWavUrl
          ? track.convertedWavUrl
          : track.originalAudioUrl;
      if (audioEl.src !== targetSrc) {
        audioEl.src = targetSrc;
      }
      audioEl
        .play()
        .then(() => setIsPreviewPlaying(true))
        .catch(() => setIsPreviewPlaying(false));
    });
  };

  const togglePreviewPlayback = () => {
    const audioEl = audioPlayerRef.current;
    if (!audioEl || !previewTrack) return;
    if (audioEl.paused) {
      audioEl
        .play()
        .then(() => setIsPreviewPlaying(true))
        .catch(() => setIsPreviewPlaying(false));
    } else {
      audioEl.pause();
      setIsPreviewPlaying(false);
    }
  };

  const handleDownloadWav = (track: StagedAudioTrack) => {
    if (!track.convertedWavUrl) return;
    const a = document.createElement('a');
    a.href = track.convertedWavUrl;
    a.download = track.sanitizedWavName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const startEditingTrack = (track: StagedAudioTrack) => {
    setEditingTrackId(track.id);
    setEditTitle(track.title);
    setEditArtist(track.artist);
  };

  const saveTrackMetadata = (trackId: string) => {
    const cleanTitle = editTitle.trim();
    const cleanArtist = editArtist.trim();
    if (!cleanTitle) return;
    onUpdateStagedTitle(trackId, cleanTitle, cleanArtist || 'Unknown Artist');
    setEditingTrackId(null);
  };

  const handlePlayClick = async (trackName: string) => {
    if (!isConnected || isUploadingAny) return;
    setBusyTrackName(trackName);
    try {
      await onPlayDeviceTrack(trackName);
    } finally {
      setBusyTrackName(null);
    }
  };

  const handleConfirmDelete = async (trackName: string) => {
    if (!isConnected || isUploadingAny) return;
    setBusyTrackName(trackName);
    try {
      await onDeleteDeviceTrack(trackName);
      setConfirmDeleteName(null);
    } finally {
      setBusyTrackName(null);
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8 min-w-0">
      {/* Bluetooth Audio Stutter Warning Banner */}
      <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-xs text-amber-200 flex flex-wrap items-center justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <Bluetooth className="h-4 w-4 text-amber-400 shrink-0" aria-hidden="true" />
          <span className="min-w-0">
            <strong>Note:</strong> Uploading audio or wallpaper files over WiFi during Bluetooth playback may cause temporary audio stutter.
            {isBtPlayingWarning && (
              <span className="ml-1 font-semibold text-amber-300">
                (Bluetooth speaker &quot;{status.bt.device}&quot; is currently playing)
              </span>
            )}
          </span>
        </div>
        {isAnyTransferActive && (
          <span className="font-mono text-amber-300 shrink-0">
            Transfer in progress ({displayedProgress}%)
          </span>
        )}
      </div>

      {/* Error Alert Banner */}
      {(actionError || tracksError) && (
        <div
          role="alert"
          className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-200 flex flex-wrap items-center justify-between gap-2 min-w-0"
        >
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" aria-hidden="true" />
            <span className="min-w-0 break-words">{actionError || tracksError}</span>
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

      {/* Top Row: Audio Dropzone & Converter + SD Storage & A/B Preview */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-stretch min-w-0">
        {/* Left 7 cols: Audio Upload Dropzone + Fixed Hardware Spec */}
        <div className="lg:col-span-7 min-w-0 flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:p-6">
          <div className="mb-4 border-b border-slate-800/80 pb-4 min-w-0">
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-100">
              Music Library & WAV Transcoder
            </h1>
            <p className="mt-1 text-xs text-slate-400">
              Fixed Output Target: WAV · {TARGET_AUDIO_SAMPLE_RATE.toLocaleString()} Hz · {TARGET_AUDIO_BIT_DEPTH}-bit Signed PCM · Mono (88.2 KB/s)
            </p>
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingOverDropzone(true);
            }}
            onDragLeave={() => setIsDraggingOverDropzone(false)}
            onDrop={handleDropFiles}
            className={`flex flex-col items-center justify-center rounded-lg border border-dashed px-4 sm:px-6 py-6 sm:py-7 text-center transition-colors min-w-0 ${
              isDraggingOverDropzone
                ? 'border-amber-400 bg-amber-400/5'
                : 'border-slate-700 bg-slate-950/50 hover:border-slate-600'
            }`}
          >
            <Upload className="h-7 w-7 text-amber-400 mb-2.5 shrink-0" aria-hidden="true" />
            <p className="text-sm font-medium text-slate-200">
              Drag and drop audio files here, or browse from disk
            </p>
            <p className="mt-1 text-xs text-slate-400 max-w-xl">
              Supported input formats: MP3 · M4A · FLAC · OGG · WAV — converted in-browser via Web Audio API to 44,100 Hz 16-bit PCM Mono WAV
            </p>
            <div className="mt-4">
              <input
                ref={fileInputRef}
                id="audio-file-picker"
                type="file"
                multiple
                accept=".mp3,.m4a,.flac,.ogg,.wav,audio/*"
                onChange={handleFileChange}
                className="sr-only"
              />
              <label
                htmlFor="audio-file-picker"
                className="min-h-[44px] sm:min-h-[38px] inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-slate-950 bg-amber-400 rounded-lg hover:bg-amber-300 transition-colors cursor-pointer whitespace-nowrap"
              >
                Select Audio Files
              </label>
            </div>
          </div>
        </div>

        {/* Right 5 cols: Real SD Card Storage + Before/After Preview Player */}
        <div className="lg:col-span-5 min-w-0 flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:p-6">
          {/* SD Storage Capacity from /api/status */}
          <div className={`min-w-0 ${!isConnected ? 'opacity-50' : ''}`}>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
              <span className="flex items-center gap-1.5 font-medium text-slate-200 min-w-0">
                <HardDrive className="h-4 w-4 text-amber-400 shrink-0" aria-hidden="true" />
                <span>
                  SD Card ({status.sd.ok ? 'FAT · Ready' : 'Not Ready'})
                </span>
              </span>
              <span className="font-mono tabular-nums text-slate-300">
                {status.sd.free_mb.toLocaleString()} MB free of {status.sd.total_mb.toLocaleString()} MB
              </span>
            </div>
            <div className="mt-2.5 h-2.5 w-full overflow-hidden rounded-full bg-slate-950 border border-slate-800">
              <div
                className="h-full bg-amber-400 transition-all duration-200"
                style={{ width: `${usedPercent.toFixed(1)}%` }}
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-slate-400 font-mono tabular-nums">
              <span>Used: {usedMb.toLocaleString()} MB</span>
              <span>Tracks on SD: {deviceTracks.length}</span>
            </div>
          </div>

          <hr className="my-4 border-slate-800/80" />

          {/* Before / After Conversion Audition Player */}
          <div className="min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 min-w-0">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 min-w-0">
                <Volume2 className="h-4 w-4 text-amber-400 shrink-0" aria-hidden="true" />
                <span>A/B Conversion Preview Player</span>
              </span>
              {previewTrack && (
                <div className="flex flex-wrap sm:flex-nowrap items-center gap-1 rounded-lg bg-slate-950 p-1 border border-slate-800 w-full sm:w-auto min-w-0">
                  <button
                    type="button"
                    onClick={() => handleSelectPreview(previewTrack, 'original')}
                    className={`flex-1 sm:flex-initial min-h-[44px] sm:min-h-[32px] px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer text-center ${
                      previewMode === 'original'
                        ? 'bg-slate-800 text-slate-100'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Before (Original)
                  </button>
                  <button
                    type="button"
                    disabled={!previewTrack.convertedWavUrl}
                    onClick={() => handleSelectPreview(previewTrack, 'converted')}
                    className={`flex-1 sm:flex-initial min-h-[44px] sm:min-h-[32px] px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer disabled:opacity-40 text-center ${
                      previewMode === 'converted'
                        ? 'bg-amber-400 text-slate-950 font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    After (44.1kHz WAV)
                  </button>
                </div>
              )}
            </div>

            {previewTrack ? (
              <div className="mt-3 rounded-lg border border-slate-800/90 bg-slate-950/70 p-3 min-w-0">
                <div className="flex items-center justify-between gap-3 min-w-0">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-100">
                      {previewTrack.title}
                    </p>
                    <p className="truncate text-xs text-slate-400">
                      {previewMode === 'converted'
                        ? `WAV · 44100 Hz · 16-bit PCM · Mono (${previewTrack.sanitizedWavName})`
                        : `Original ${previewTrack.originalFormat} · ${previewTrack.originalSampleRate} Hz`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={togglePreviewPlayback}
                    aria-label={isPreviewPlaying ? 'Pause preview' : 'Play preview'}
                    className="flex h-11 w-11 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg bg-amber-400 text-slate-950 hover:bg-amber-300 transition-colors cursor-pointer"
                  >
                    {isPreviewPlaying ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <audio
                  ref={audioPlayerRef}
                  controls
                  src={
                    previewMode === 'converted' && previewTrack.convertedWavUrl
                      ? previewTrack.convertedWavUrl
                      : previewTrack.originalAudioUrl
                  }
                  onPlay={() => setIsPreviewPlaying(true)}
                  onPause={() => setIsPreviewPlaying(false)}
                  onEnded={() => setIsPreviewPlaying(false)}
                  className="mt-2.5 h-9 w-full max-w-full"
                />
              </div>
            ) : (
              <p className="mt-3 text-xs text-slate-500">
                Select an audio file from disk to convert and audition before/after 44.1 kHz Mono WAV output.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Main Content Split: Device SD Card Tracks (/api/tracks) + Staged Local Conversions */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start min-w-0">
        {/* Left 7 cols: Device SD Card Track List (GET /api/tracks) */}
        <div className="lg:col-span-7 min-w-0 rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800 min-w-0">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-slate-100">
                Device SD Card Tracks ({deviceTracks.length})
              </h2>
              <p className="text-xs text-slate-400">
                Click a track to play on the ESP32 or delete it from the SD card
              </p>
            </div>

            <button
              type="button"
              onClick={onRefreshTracks}
              disabled={isLoadingTracks || isUploadingAny}
              className="min-h-[44px] sm:min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-950 border border-slate-800 rounded-lg hover:border-slate-700 disabled:opacity-50 transition-colors cursor-pointer shrink-0"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 text-amber-400 shrink-0 ${
                  isLoadingTracks ? 'animate-spin' : ''
                }`}
              />
              <span>Refresh List</span>
            </button>
          </div>

          {deviceTracks.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-slate-400">
                {isLoadingTracks
                  ? 'Loading tracks from /api/tracks...'
                  : 'No WAV tracks found on the device SD card.'}
              </p>
            </div>
          ) : (
            <div
              className={`mt-3 divide-y divide-slate-800/80 ${
                !isConnected ? 'opacity-50' : ''
              }`}
            >
              {deviceTracks.map((track) => {
                const isPlayingThis =
                  status.player.track === track.name &&
                  status.player.state === 'playing';
                const isCurrentTrack = status.player.track === track.name;
                const isConfirmingDelete = confirmDeleteName === track.name;
                const isBusy = busyTrackName === track.name;

                return (
                  <div
                    key={track.name}
                    className={`py-3.5 px-2 rounded-lg transition-colors flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 min-w-0 ${
                      isCurrentTrack ? 'bg-amber-400/10' : 'hover:bg-slate-800/40'
                    }`}
                  >
                    <button
                      type="button"
                      disabled={!isConnected || isBusy || isUploadingAny}
                      onClick={() => handlePlayClick(track.name)}
                      className="min-h-[44px] flex-1 min-w-0 flex items-center gap-3 text-left cursor-pointer disabled:cursor-not-allowed"
                    >
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
                          isPlayingThis
                            ? 'border-amber-400 bg-amber-400 text-slate-950'
                            : 'border-slate-700 bg-slate-950 text-slate-200'
                        }`}
                      >
                        <Play className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-sm font-semibold truncate ${
                            isCurrentTrack ? 'text-amber-300' : 'text-slate-100'
                          }`}
                        >
                          {track.name}
                        </p>
                        <p className="text-xs text-slate-400 font-mono tabular-nums">
                          {formatBytes(track.size)} · Est.{' '}
                          {formatDuration(Math.max(1, Math.round(track.size / 88200)))}
                        </p>
                      </div>
                    </button>

                    <div className="flex items-center gap-2 shrink-0">
                      {isConfirmingDelete ? (
                        <>
                          <button
                            type="button"
                            disabled={!isConnected || isBusy || isUploadingAny}
                            onClick={() => handleConfirmDelete(track.name)}
                            className="min-h-[44px] sm:min-h-[34px] px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 rounded-lg hover:bg-rose-500 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                          >
                            Confirm Delete
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteName(null)}
                            className="min-h-[44px] sm:min-h-[34px] px-2.5 py-1.5 text-xs text-slate-400 hover:text-slate-200 cursor-pointer whitespace-nowrap"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          disabled={!isConnected || isBusy || isUploadingAny}
                          onClick={() => setConfirmDeleteName(track.name)}
                          aria-label={`Delete ${track.name}`}
                          className="min-h-[44px] min-w-[44px] sm:min-h-[36px] sm:min-w-[36px] inline-flex items-center justify-center p-2 text-slate-400 hover:text-rose-400 disabled:opacity-40 transition-colors cursor-pointer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right 5 cols: Local Conversion & Upload Queue */}
        <div className="lg:col-span-5 min-w-0 rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:p-6">
          <div className="pb-4 border-b border-slate-800 min-w-0">
            <h2 className="text-base font-semibold text-slate-100">
              Conversion & Upload Queue ({stagedTracks.length})
            </h2>
            <p className="text-xs text-slate-400">
              Files are sanitized to FAT ASCII (max 24 chars) and uploaded via XMLHttpRequest
            </p>
          </div>

          {stagedTracks.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-xs text-slate-400">
                No local audio files queued. Drop or select files above to convert them to 44.1 kHz 16-bit Mono WAV and upload to the ESP32.
              </p>
            </div>
          ) : (
            <div className="mt-4 divide-y divide-slate-800/80">
              {stagedTracks.map((track) => {
                const isEditing = editingTrackId === track.id;
                const isUploadingThis = uploadingTrackId === track.id;

                return (
                  <div key={track.id} className="py-4 space-y-3 min-w-0">
                    {isEditing ? (
                      <div className="space-y-2 min-w-0">
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          placeholder="Track title (used for FAT filename)"
                          aria-label="Track title"
                          className="min-h-[44px] sm:min-h-[36px] w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-100 focus:border-amber-400 focus:outline-none"
                        />
                        <p className="text-[11px] font-mono text-slate-400">
                          FAT Name Preview: {sanitizeFatFilename(editTitle || 'track', 'wav')}
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => saveTrackMetadata(track.id)}
                            className="min-h-[44px] sm:min-h-[34px] px-3 py-1 text-xs font-semibold bg-amber-400 text-slate-950 rounded hover:bg-amber-300 cursor-pointer"
                          >
                            Save Name
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingTrackId(null)}
                            className="min-h-[44px] sm:min-h-[34px] px-2.5 py-1 text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-2 min-w-0">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-100 truncate">
                            {track.title}
                          </p>
                          <p className="text-xs font-mono text-amber-300/90 truncate">
                            SD Name: {track.sanitizedWavName}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => startEditingTrack(track)}
                          aria-label={`Rename ${track.title}`}
                          className="min-h-[44px] sm:min-h-[32px] px-2.5 py-1 inline-flex items-center gap-1 text-xs text-slate-300 bg-slate-950 border border-slate-800 rounded hover:text-amber-300 cursor-pointer shrink-0"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          <span>Rename</span>
                        </button>
                      </div>
                    )}

                    {/* Conversion status */}
                    <div className="text-xs font-mono text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span>{track.originalFormat}</span>
                      <span aria-hidden="true">·</span>
                      {track.status === 'converting' && (
                        <span className="text-amber-300 inline-flex items-center gap-1 font-sans">
                          <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                          Converting ({track.progress}%)
                        </span>
                      )}
                      {track.status === 'done' && (
                        <span className="text-emerald-400 inline-flex items-center gap-1 font-sans">
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                          WAV Ready ({formatBytes(track.convertedSizeBytes)})
                        </span>
                      )}
                      {track.status === 'error' && (
                        <span className="text-rose-400 inline-flex items-center gap-1 font-sans">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                          {track.errorMessage || 'Conversion error'}
                        </span>
                      )}
                    </div>

                    {/* XHR Upload Progress Bar */}
                    {isUploadingThis && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs font-mono text-amber-300">
                          <span>Uploading {track.sanitizedWavName}...</span>
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

                    {/* Action buttons */}
                    <div className="flex flex-wrap items-center gap-2">
                      {track.status === 'done' && (
                        <>
                          <button
                            type="button"
                            disabled={!isConnected || isAnyTransferActive}
                            onClick={() => onUploadStagedTrack(track)}
                            className="min-h-[44px] sm:min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-950 bg-amber-400 rounded-lg hover:bg-amber-300 disabled:opacity-40 cursor-pointer whitespace-nowrap"
                          >
                            <Send className="h-3.5 w-3.5" />
                            <span>
                              {track.uploadedToDevice ? 'Re-upload to SD' : 'Upload to SD'}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSelectPreview(track, 'converted')}
                            className="min-h-[44px] sm:min-h-[34px] px-2.5 py-1.5 text-xs font-medium text-slate-200 bg-slate-950 border border-slate-800 rounded-lg hover:border-slate-700 cursor-pointer whitespace-nowrap"
                          >
                            Preview WAV
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDownloadWav(track)}
                            aria-label={`Download ${track.sanitizedWavName}`}
                            className="min-h-[44px] min-w-[44px] sm:min-h-[34px] sm:min-w-[34px] inline-flex items-center justify-center p-2 text-slate-300 bg-slate-950 border border-slate-800 rounded-lg hover:text-white cursor-pointer"
                          >
                            <Download className="h-4 w-4" />
                          </button>
                        </>
                      )}

                      <button
                        type="button"
                        onClick={() => onRemoveStagedTrack(track.id)}
                        aria-label={`Remove ${track.title} from queue`}
                        className="min-h-[44px] min-w-[44px] sm:min-h-[34px] sm:min-w-[34px] inline-flex items-center justify-center p-2 text-slate-500 hover:text-rose-400 cursor-pointer ml-auto"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
