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
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  GripVertical,
  RotateCcw,
  HardDrive,
  Volume2,
} from 'lucide-react';
import { AudioTrack, DeviceStatus, Playlist } from '../types/player';
import {
  TARGET_AUDIO_SAMPLE_RATE,
  TARGET_AUDIO_BIT_DEPTH,
  formatBytes,
  formatDuration,
} from '../utils/encoders';

interface MusicLibraryPageProps {
  tracks: AudioTrack[];
  playlists: Playlist[];
  deviceStatus: DeviceStatus;
  onUploadFiles: (files: File[]) => void;
  onAddSimulatedBatch: () => void;
  onRetryTrackConversion: (trackId: string) => void;
  onUpdateTrackMetadata: (trackId: string, title: string, artist: string) => void;
  onDeleteTrack: (trackId: string) => void;
  onCreatePlaylist: (name: string, description: string) => void;
  onDeletePlaylist: (playlistId: string) => void;
  onAddTrackToPlaylist: (playlistId: string, trackId: string) => void;
  onRemoveTrackFromPlaylist: (playlistId: string, trackIndex: number) => void;
  onReorderPlaylistTracks: (playlistId: string, fromIndex: number, toIndex: number) => void;
  onSendTrackToNowPlaying: (trackId: string) => void;
}

export function MusicLibraryPage({
  tracks,
  playlists,
  deviceStatus,
  onUploadFiles,
  onAddSimulatedBatch,
  onRetryTrackConversion,
  onUpdateTrackMetadata,
  onDeleteTrack,
  onCreatePlaylist,
  onDeletePlaylist,
  onAddTrackToPlaylist,
  onRemoveTrackFromPlaylist,
  onReorderPlaylistTracks,
  onSendTrackToNowPlaying,
}: MusicLibraryPageProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  const [isDraggingOverDropzone, setIsDraggingOverDropzone] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'done' | 'converting' | 'error'>('all');

  // Preview audio player state (supports comparing 'original' vs 'converted' 44.1kHz mono WAV)
  const [previewTrackId, setPreviewTrackId] = useState<string | null>(tracks[0]?.id ?? null);
  const [previewMode, setPreviewMode] = useState<'converted' | 'original'>('converted');
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);

  // Track Metadata Inline Editing state
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editArtist, setEditArtist] = useState('');

  // Playlist Management state
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>(
    playlists[0]?.id ?? ''
  );
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [newPlaylistDesc, setNewPlaylistDesc] = useState('');
  const [playlistCreationError, setPlaylistCreationError] = useState('');
  const [draggedPlaylistIndex, setDraggedPlaylistIndex] = useState<number | null>(null);

  const activePlaylist =
    playlists.find((p) => p.id === selectedPlaylistId) ?? playlists[0] ?? null;

  const previewTrack =
    tracks.find((t) => t.id === previewTrackId) ?? tracks[0] ?? null;

  // Storage math: base SD card usage + converted library size
  const convertedLibraryBytes = tracks
    .filter((t) => t.status === 'done')
    .reduce((sum, t) => sum + t.convertedSizeBytes, 0);
  const totalUsedBytes = deviceStatus.sdUsedBytes + convertedLibraryBytes;
  const freeBytes = Math.max(0, deviceStatus.sdTotalBytes - totalUsedBytes);
  const usedPercent = Math.min(100, (totalUsedBytes / deviceStatus.sdTotalBytes) * 100);

  const filteredTracks = tracks.filter((track) => {
    const matchesStatus = statusFilter === 'all' ? true : track.status === statusFilter;
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      track.title.toLowerCase().includes(q) ||
      track.artist.toLowerCase().includes(q) ||
      track.fileName.toLowerCase().includes(q);
    return matchesStatus && matchesSearch;
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onUploadFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const handleDropFiles = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOverDropzone(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onUploadFiles(Array.from(e.dataTransfer.files));
    }
  };

  const startEditingTrack = (track: AudioTrack) => {
    setEditingTrackId(track.id);
    setEditTitle(track.title);
    setEditArtist(track.artist);
  };

  const saveTrackMetadata = (trackId: string) => {
    const cleanTitle = editTitle.trim();
    const cleanArtist = editArtist.trim();
    if (!cleanTitle) return;
    onUpdateTrackMetadata(trackId, cleanTitle, cleanArtist || 'Unknown Artist');
    setEditingTrackId(null);
  };

  const handleSelectPreview = (track: AudioTrack, mode: 'original' | 'converted') => {
    const resolvedMode = mode === 'converted' && !track.convertedWavUrl ? 'original' : mode;
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

  const handleDownloadWav = (track: AudioTrack) => {
    if (!track.convertedWavUrl) return;
    const a = document.createElement('a');
    const safeName = `${track.artist} - ${track.title}`
      .replace(/[^a-zA-Z0-9_\-. ]/g, '')
      .trim()
      .replace(/\s+/g, '_');
    a.href = track.convertedWavUrl;
    a.download = `${safeName || 'track'}_44100_16bit_mono.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleCreatePlaylistSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newPlaylistName.trim();
    if (!trimmed) {
      setPlaylistCreationError('Enter a playlist name.');
      return;
    }
    setPlaylistCreationError('');
    onCreatePlaylist(trimmed, newPlaylistDesc.trim() || 'Custom SD card playlist');
    setNewPlaylistName('');
    setNewPlaylistDesc('');
  };

  return (
    <div className="space-y-6 sm:space-y-8 min-w-0">
      {/* Top Row: Fixed Hardware Audio Spec + SD Card Storage Telemetry */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-stretch min-w-0">
        {/* Left 7 cols: Audio Upload Dropzone + Fixed Hardware Spec */}
        <div className="lg:col-span-7 min-w-0 flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:p-6">
          <div className="mb-4 flex flex-col sm:flex-row sm:items-baseline justify-between gap-3 border-b border-slate-800/80 pb-4 min-w-0">
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-100">
                SD Card Audio Library & Transcoder
              </h1>
              <p className="mt-1 text-xs text-slate-400">
                Hardware Output Lock: WAV · {TARGET_AUDIO_SAMPLE_RATE.toLocaleString()} Hz · {TARGET_AUDIO_BIT_DEPTH}-bit Signed PCM · Mono (88.2 KB/s)
              </p>
            </div>
            <button
              type="button"
              onClick={onAddSimulatedBatch}
              className="min-h-[44px] sm:min-h-[36px] inline-flex items-center justify-center px-3.5 py-2 text-xs font-medium text-amber-300 border border-amber-400/40 rounded-lg hover:bg-amber-400/10 transition-colors whitespace-nowrap shrink-0 cursor-pointer self-start sm:self-auto"
            >
              + Load Demo Audio Batch
            </button>
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
              Supported input formats: MP3 · M4A · FLAC · OGG · WAV — automatically normalized to 44,100 Hz 16-bit PCM Mono WAV
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

        {/* Right 5 cols: SD Card Storage Meter & Before/After Preview Audition Deck */}
        <div className="lg:col-span-5 min-w-0 flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:p-6">
          {/* SD Storage Capacity */}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
              <span className="flex items-center gap-1.5 font-medium text-slate-200 min-w-0">
                <HardDrive className="h-4 w-4 text-amber-400 shrink-0" aria-hidden="true" />
                <span>MicroSD Storage (FAT32 · 16 GB)</span>
              </span>
              <span className="font-mono tabular-nums text-slate-300">
                {formatBytes(totalUsedBytes)} used · {formatBytes(freeBytes)} available
              </span>
            </div>
            <div className="mt-2.5 h-2.5 w-full overflow-hidden rounded-full bg-slate-950 border border-slate-800">
              <div
                className="h-full bg-amber-400 transition-all duration-200"
                style={{ width: `${usedPercent.toFixed(1)}%` }}
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-slate-400 font-mono tabular-nums">
              <span>Converted WAV Staged: {formatBytes(convertedLibraryBytes)}</span>
              <span>Est. Remaining Playtime: ~{Math.floor(freeBytes / 88200 / 60)} min</span>
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
                      {previewTrack.artist} ·{' '}
                      {previewMode === 'converted'
                        ? 'WAV · 44100 Hz · 16-bit PCM · Mono'
                        : `Original ${previewTrack.originalFormat} · ${previewTrack.originalSampleRate} Hz · ${
                            previewTrack.originalChannels === 2 ? 'Stereo' : 'Mono'
                          }`}
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
                Select a track below to compare source audio against converted 44.1kHz mono WAV.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Main Content Split: Track Conversion Table (7 cols) + Playlist Builder & Reorder (5 cols) */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start min-w-0">
        {/* Track Table */}
        <div className="lg:col-span-7 min-w-0 rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800 min-w-0">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-slate-100">
                Audio Files ({filteredTracks.length})
              </h2>
              <p className="text-xs text-slate-400">
                Edit track metadata, compare before/after audio, or add converted WAVs to a playlist
              </p>
            </div>

            <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2.5 w-full sm:w-auto min-w-0">
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by title or artist..."
                aria-label="Filter tracks by title or artist"
                className="min-h-[44px] sm:min-h-[36px] w-full sm:w-48 rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none min-w-0"
              />
              {/* Interactive segmented filter */}
              <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-950 p-1 border border-slate-800 w-full sm:w-auto min-w-0">
                {(['all', 'done', 'converting', 'error'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`flex-1 sm:flex-initial min-h-[44px] sm:min-h-[32px] px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      statusFilter === st
                        ? 'bg-slate-800 text-slate-100'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {st === 'all'
                      ? 'All'
                      : st === 'done'
                      ? 'Done'
                      : st === 'converting'
                      ? 'Converting'
                      : 'Errors'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {filteredTracks.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-slate-400">No audio tracks match the current filter.</p>
            </div>
          ) : (
            <div className="mt-4 divide-y divide-slate-800/80">
              {filteredTracks.map((track) => {
                const isEditing = editingTrackId === track.id;
                const isAuditioning = previewTrack?.id === track.id;

                return (
                  <div
                    key={track.id}
                    className={`py-4 transition-colors min-w-0 ${
                      isAuditioning ? 'bg-slate-800/25 px-2.5 rounded-lg' : ''
                    }`}
                  >
                    <div className="space-y-3 min-w-0">
                      {/* Title / Artist / Inline Edit */}
                      <div className="min-w-0">
                        {isEditing ? (
                          <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2 min-w-0">
                            <label className="sr-only" htmlFor={`edit-title-${track.id}`}>
                              Track Title
                            </label>
                            <input
                              id={`edit-title-${track.id}`}
                              type="text"
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              placeholder="Track title"
                              className="min-h-[44px] sm:min-h-[36px] flex-1 min-w-0 rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-100 focus:border-amber-400 focus:outline-none"
                            />
                            <label className="sr-only" htmlFor={`edit-artist-${track.id}`}>
                              Track Artist
                            </label>
                            <input
                              id={`edit-artist-${track.id}`}
                              type="text"
                              value={editArtist}
                              onChange={(e) => setEditArtist(e.target.value)}
                              placeholder="Artist name"
                              className="min-h-[44px] sm:min-h-[36px] flex-1 min-w-0 rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-100 focus:border-amber-400 focus:outline-none"
                            />
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => saveTrackMetadata(track.id)}
                                className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 text-xs font-semibold bg-amber-400 text-slate-950 rounded hover:bg-amber-300 whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                Save Metadata
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingTrackId(null)}
                                className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 min-w-0 flex-1">
                              <p className="text-sm font-semibold text-slate-100 truncate max-w-full">
                                {track.title}
                              </p>
                              <span className="text-slate-600" aria-hidden="true">
                                —
                              </span>
                              <p className="text-xs font-medium text-slate-300 truncate max-w-full">
                                {track.artist}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => startEditingTrack(track)}
                              aria-label={`Edit metadata for ${track.title}`}
                              className="min-h-[44px] sm:min-h-[32px] px-2.5 py-1 inline-flex items-center gap-1 text-xs text-slate-300 bg-slate-950/80 border border-slate-800 rounded hover:text-amber-300 hover:border-slate-700 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                              <span>Edit</span>
                            </button>
                          </div>
                        )}

                        {/* Unboxed metadata row with typographic separators */}
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-slate-400 font-mono tabular-nums min-w-0">
                          <span>Source: {track.originalFormat} ({formatBytes(track.originalSizeBytes)})</span>
                          <span aria-hidden="true">·</span>
                          <span>Duration: {formatDuration(track.durationSec)}</span>
                          <span aria-hidden="true">·</span>
                          {track.status === 'done' && (
                            <span className="text-emerald-400 inline-flex items-center gap-1 font-sans font-medium min-w-0">
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                              <span>Done · WAV 44.1kHz 16-bit Mono ({formatBytes(track.convertedSizeBytes)})</span>
                            </span>
                          )}
                          {track.status === 'converting' && (
                            <span className="text-amber-300 inline-flex items-center gap-1 font-sans font-medium min-w-0">
                              <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" aria-hidden="true" />
                              <span>Converting to 44.1kHz Mono WAV ({track.progress}%)</span>
                            </span>
                          )}
                          {track.status === 'error' && (
                            <span className="text-rose-400 inline-flex items-center gap-1 font-sans font-medium min-w-0">
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                              <span>Error: {track.errorMessage || 'Decode failed'}</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Track Action Controls */}
                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                        <button
                          type="button"
                          onClick={() => handleSelectPreview(track, 'original')}
                          className="min-h-[44px] sm:min-h-[34px] px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-950 border border-slate-800 rounded-lg hover:border-slate-700 hover:text-slate-100 whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          Preview Original
                        </button>

                        {track.status === 'done' && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleSelectPreview(track, 'converted')}
                              className="min-h-[44px] sm:min-h-[34px] px-3 py-1.5 text-xs font-medium text-amber-300 bg-slate-950 border border-amber-400/30 rounded-lg hover:bg-amber-400/10 whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              Preview WAV
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDownloadWav(track)}
                              aria-label={`Download converted WAV for ${track.title}`}
                              className="min-h-[44px] min-w-[44px] sm:min-h-[34px] sm:min-w-[34px] inline-flex items-center justify-center p-2 text-slate-300 bg-slate-950 border border-slate-800 rounded-lg hover:text-slate-100 hover:border-slate-700 cursor-pointer shrink-0"
                              title="Download 44100Hz 16-bit Mono WAV"
                            >
                              <Download className="h-4 w-4" />
                            </button>
                            {activePlaylist && (
                              <button
                                type="button"
                                onClick={() => onAddTrackToPlaylist(activePlaylist.id, track.id)}
                                className="min-h-[44px] sm:min-h-[34px] px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 rounded-lg hover:bg-slate-700 whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                + Playlist
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onSendTrackToNowPlaying(track.id)}
                              className="min-h-[44px] sm:min-h-[34px] px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-950 border border-slate-800 rounded-lg hover:text-amber-300 whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              Load in Player
                            </button>
                          </>
                        )}

                        {track.status === 'error' && (
                          <button
                            type="button"
                            onClick={() => onRetryTrackConversion(track.id)}
                            className="min-h-[44px] sm:min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-300 bg-amber-400/10 border border-amber-400/30 rounded-lg hover:bg-amber-400/20 whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Retry Conversion
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => onDeleteTrack(track.id)}
                          aria-label={`Remove ${track.title}`}
                          className="min-h-[44px] min-w-[44px] sm:min-h-[34px] sm:min-w-[34px] inline-flex items-center justify-center p-2 text-slate-500 hover:text-rose-400 transition-colors cursor-pointer shrink-0 ml-auto sm:ml-0"
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
        </div>

        {/* Playlist Creator & Drag-and-Drop Reorder Panel */}
        <div className="lg:col-span-5 min-w-0 rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:p-6">
          <div className="pb-4 border-b border-slate-800 min-w-0">
            <h2 className="text-base font-semibold text-slate-100">
              SD Card Playlists & Track Order
            </h2>
            <p className="text-xs text-slate-400">
              Create playlists and drag rows (or use Move Up / Down) to set playback sequence on the ESP32-C3
            </p>
          </div>

          {/* Create Playlist Form */}
          <form onSubmit={handleCreatePlaylistSubmit} className="mt-4 space-y-2.5 min-w-0">
            <div className="flex flex-col sm:flex-row gap-2 min-w-0">
              <div className="flex-1 min-w-0">
                <label htmlFor="new-playlist-name" className="sr-only">
                  New Playlist Name
                </label>
                <input
                  id="new-playlist-name"
                  type="text"
                  value={newPlaylistName}
                  onChange={(e) => {
                    setNewPlaylistName(e.target.value);
                    if (playlistCreationError) setPlaylistCreationError('');
                  }}
                  placeholder="New playlist name (e.g. Late Night Synth)..."
                  className="min-h-[44px] sm:min-h-[38px] w-full min-w-0 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                className="min-h-[44px] sm:min-h-[38px] inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-950 bg-amber-400 rounded-lg hover:bg-amber-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                Create Playlist
              </button>
            </div>
            {playlistCreationError && (
              <p className="text-xs text-rose-400">{playlistCreationError}</p>
            )}
          </form>

          {/* Playlist Selector Tabs */}
          <div className="mt-4 flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3 min-w-0">
            {playlists.map((pl) => {
              const isSelected = activePlaylist?.id === pl.id;
              return (
                <button
                  key={pl.id}
                  type="button"
                  onClick={() => setSelectedPlaylistId(pl.id)}
                  className={`min-h-[44px] sm:min-h-[36px] px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isSelected
                      ? 'bg-amber-400 text-slate-950 font-semibold'
                      : 'bg-slate-950 text-slate-300 border border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {pl.name} ({pl.trackIds.length})
                </button>
              );
            })}
          </div>

          {/* Active Playlist Track Sequence */}
          {activePlaylist ? (
            <div className="mt-4 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 mb-3 min-w-0">
                <span className="min-w-0">
                  Active Playlist: <strong className="text-slate-200">{activePlaylist.name}</strong> ·{' '}
                  {activePlaylist.trackIds.length} tracks
                </span>
                {playlists.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      const fallback = playlists.find((p) => p.id !== activePlaylist.id);
                      onDeletePlaylist(activePlaylist.id);
                      if (fallback) setSelectedPlaylistId(fallback.id);
                    }}
                    className="min-h-[44px] sm:min-h-[32px] px-2 inline-flex items-center text-xs text-slate-400 hover:text-rose-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Delete Playlist
                  </button>
                )}
              </div>

              {activePlaylist.trackIds.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-800 bg-slate-950/40 p-6 text-center">
                  <p className="text-xs text-slate-400">
                    This playlist is empty. Click <strong>+ Playlist</strong> on any converted track to add it here.
                  </p>
                </div>
              ) : (
                <ul className="space-y-2 min-w-0" aria-label={`Tracks in ${activePlaylist.name}`}>
                  {activePlaylist.trackIds.map((tId, idx) => {
                    const trackObj = tracks.find((t) => t.id === tId);
                    if (!trackObj) return null;

                    return (
                      <li
                        key={`${tId}-${idx}`}
                        draggable
                        onDragStart={() => setDraggedPlaylistIndex(idx)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                          if (draggedPlaylistIndex !== null && draggedPlaylistIndex !== idx) {
                            onReorderPlaylistTracks(
                              activePlaylist.id,
                              draggedPlaylistIndex,
                              idx
                            );
                          }
                          setDraggedPlaylistIndex(null);
                        }}
                        className={`flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/80 px-3 py-2.5 text-xs transition-colors min-w-0 ${
                          draggedPlaylistIndex === idx ? 'opacity-50 border-amber-400' : ''
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <GripVertical
                            className="h-4 w-4 text-slate-500 shrink-0 cursor-grab"
                            aria-hidden="true"
                          />
                          <span className="font-mono tabular-nums text-slate-500 w-5 shrink-0">
                            {String(idx + 1).padStart(2, '0')}.
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-slate-200 truncate">
                              {trackObj.title}
                            </p>
                            <p className="text-slate-400 truncate">
                              {trackObj.artist} · {formatDuration(trackObj.durationSec)}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() =>
                              onReorderPlaylistTracks(activePlaylist.id, idx, idx - 1)
                            }
                            aria-label={`Move ${trackObj.title} up`}
                            className="min-h-[44px] min-w-[44px] sm:min-h-[32px] sm:min-w-[32px] inline-flex items-center justify-center p-1.5 text-slate-400 hover:text-slate-100 disabled:opacity-30 cursor-pointer"
                          >
                            <ArrowUp className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === activePlaylist.trackIds.length - 1}
                            onClick={() =>
                              onReorderPlaylistTracks(activePlaylist.id, idx, idx + 1)
                            }
                            aria-label={`Move ${trackObj.title} down`}
                            className="min-h-[44px] min-w-[44px] sm:min-h-[32px] sm:min-w-[32px] inline-flex items-center justify-center p-1.5 text-slate-400 hover:text-slate-100 disabled:opacity-30 cursor-pointer"
                          >
                            <ArrowDown className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onRemoveTrackFromPlaylist(activePlaylist.id, idx)}
                            aria-label={`Remove ${trackObj.title} from playlist`}
                            className="min-h-[44px] min-w-[44px] sm:min-h-[32px] sm:min-w-[32px] inline-flex items-center justify-center p-1.5 text-slate-500 hover:text-rose-400 cursor-pointer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
