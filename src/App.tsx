/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Navbar, ActivePage } from './components/Navbar';
import { MusicLibraryPage } from './components/MusicLibraryPage';
import { WallpaperPage } from './components/WallpaperPage';
import { DeviceControlPage } from './components/DeviceControlPage';
import {
  AudioTrack,
  DeviceCommandLog,
  DeviceStatus,
  PlaybackState,
  Playlist,
  SavedWallpaper,
} from './types/player';
import { parseFilenameMetadata, reorderItems } from './utils/encoders';
import {
  convertAudioFileToFixedWav,
  createSynthesizedDemoAudio,
} from './services/audioConverter';
import {
  INITIAL_DEVICE_STATUS,
  pollDeviceTelemetryPlaceholder,
  sendPlaybackCommandToDevice,
  sendWallpaperToDevicePlaceholder,
  syncLibraryToDevicePlaceholder,
} from './services/deviceApi';
import { ARTWORK_PRESETS, buildWallpaperFromPreset } from './utils/presetWallpapers';

function buildInitialTracks(): AudioTrack[] {
  const demoSpecs = [
    {
      id: 'trk-solar-wind',
      fileName: 'Helios Ensemble - Solar Wind Drift.flac',
      title: 'Solar Wind Drift',
      artist: 'Helios Ensemble',
      originalFormat: 'FLAC',
      baseFreqHz: 220,
      chordIntervals: [0, 4, 7, 11],
      durationSec: 3.6,
    },
    {
      id: 'trk-subroutine',
      fileName: 'Klangwerk - Subroutine 09.m4a',
      title: 'Subroutine 09',
      artist: 'Klangwerk',
      originalFormat: 'M4A',
      baseFreqHz: 261.63,
      chordIntervals: [0, 3, 7, 10],
      durationSec: 3.2,
    },
    {
      id: 'trk-night-train',
      fileName: 'Aoki Takamasa - Night Train C3.mp3',
      title: 'Night Train C3',
      artist: 'Aoki Takamasa',
      originalFormat: 'MP3',
      baseFreqHz: 196.0,
      chordIntervals: [0, 5, 7, 12],
      durationSec: 4.0,
    },
  ];

  return demoSpecs.map((spec) => {
    const synth = createSynthesizedDemoAudio({
      fileName: spec.fileName,
      baseFreqHz: spec.baseFreqHz,
      chordIntervals: spec.chordIntervals,
      durationSec: spec.durationSec,
    });

    return {
      id: spec.id,
      fileName: spec.fileName,
      title: spec.title,
      artist: spec.artist,
      originalFormat: spec.originalFormat,
      originalSizeBytes: synth.originalSizeBytes,
      originalSampleRate: 48000,
      originalChannels: 2,
      convertedSizeBytes: synth.convertedWavBytes.byteLength,
      durationSec: spec.durationSec,
      status: 'done',
      progress: 100,
      originalAudioUrl: synth.originalUrl,
      convertedWavUrl: synth.convertedWavUrl,
      convertedWavBytes: synth.convertedWavBytes,
      conversionEngine: 'web-audio-pcm16',
      addedAt: '2026-10-25 08:05',
      syncedToDevice: true,
    };
  });
}

const INITIAL_PLAYLISTS: Playlist[] = [
  {
    id: 'pl-ambient-commute',
    name: 'Morning Bench Session',
    description: 'Default startup playlist on ESP32-C3 SD card',
    trackIds: ['trk-solar-wind', 'trk-subroutine', 'trk-night-train'],
    updatedAt: '2026-10-25 08:10',
  },
  {
    id: 'pl-late-night',
    name: 'Late Night Synth',
    description: 'Minimalist warm synth loops',
    trackIds: ['trk-subroutine', 'trk-solar-wind'],
    updatedAt: '2026-10-25 08:12',
  },
];

export default function App() {
  const [activePage, setActivePage] = useState<ActivePage>('library');
  const [tracks, setTracks] = useState<AudioTrack[]>(() => buildInitialTracks());
  const [playlists, setPlaylists] = useState<Playlist[]>(INITIAL_PLAYLISTS);
  const [savedWallpapers, setSavedWallpapers] = useState<SavedWallpaper[]>(() =>
    ARTWORK_PRESETS.map((preset, idx) =>
      buildWallpaperFromPreset(preset, true, idx === 0)
    )
  );
  const [activeWallpaperId, setActiveWallpaperId] = useState<string>(
    'wp_preset-horizon'
  );

  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus>(INITIAL_DEVICE_STATUS);
  const [playback, setPlayback] = useState<PlaybackState>({
    currentTrackId: 'trk-solar-wind',
    activePlaylistId: 'pl-ambient-commute',
    isPlaying: false,
    currentTimeSec: 1.2,
    durationSec: 3.6,
    volume: 78,
    isMuted: false,
    isShuffle: false,
    repeatMode: 'all',
  });
  const [commandLogs, setCommandLogs] = useState<DeviceCommandLog[]>([
    {
      id: 'cmd_init_1',
      timestamp: '08:15:00',
      action: 'MOUNT_SD_FAT32',
      payloadSummary: 'Mounted 16GB SDHC @ 40MHz SPI (/sd/music, /sd/wallpapers)',
      status: 'queued-placeholder',
    },
  ]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  const appendLog = (entry: DeviceCommandLog) => {
    setCommandLogs((prev) => [entry, ...prev.slice(0, 29)]);
  };

  // Simulated playback timer when device control is in "Playing" state
  useEffect(() => {
    if (!playback.isPlaying) return;
    const interval = window.setInterval(() => {
      setPlayback((prev) => {
        const nextTime = prev.currentTimeSec + 0.5;
        if (nextTime >= prev.durationSec) {
          return { ...prev, currentTimeSec: 0 };
        }
        return { ...prev, currentTimeSec: nextTime };
      });
    }, 500);
    return () => window.clearInterval(interval);
  }, [playback.isPlaying]);

  // Process uploaded audio files through client-side converter (44100Hz, 16-bit PCM, mono)
  const handleUploadFiles = async (files: File[]) => {
    const newEntries: { track: AudioTrack; file: File }[] = files.map((file) => {
      const meta = parseFilenameMetadata(file.name);
      const id = `trk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const originalAudioUrl = URL.createObjectURL(file);
      return {
        file,
        track: {
          id,
          fileName: file.name,
          title: meta.title,
          artist: meta.artist,
          originalFormat: meta.ext,
          originalSizeBytes: file.size,
          originalSampleRate: 48000,
          originalChannels: 2,
          convertedSizeBytes: 0,
          durationSec: 0,
          status: 'converting',
          progress: 5,
          originalAudioUrl,
          addedAt: new Date().toTimeString().slice(0, 5),
        },
      };
    });

    setTracks((prev) => [...newEntries.map((e) => e.track), ...prev]);

    for (const item of newEntries) {
      try {
        const result = await convertAudioFileToFixedWav(item.file, (progress) => {
          setTracks((prev) =>
            prev.map((t) => (t.id === item.track.id ? { ...t, progress } : t))
          );
        });

        setTracks((prev) =>
          prev.map((t) =>
            t.id === item.track.id
              ? {
                  ...t,
                  status: 'done',
                  progress: 100,
                  durationSec: result.durationSec,
                  originalSampleRate: result.originalSampleRate,
                  originalChannels: result.originalChannels,
                  convertedSizeBytes: result.wavBytes.byteLength,
                  convertedWavUrl: result.wavBlobUrl,
                  convertedWavBytes: result.wavBytes,
                  conversionEngine: result.engine,
                }
              : t
          )
        );
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Unsupported or corrupted audio stream';
        setTracks((prev) =>
          prev.map((t) =>
            t.id === item.track.id
              ? {
                  ...t,
                  status: 'error',
                  progress: 0,
                  errorMessage: message,
                }
              : t
          )
        );
      }
    }
  };

  // Load a synthesized multi-file batch so users can test live conversion + retry error states
  const handleAddSimulatedBatch = async () => {
    const synth1 = createSynthesizedDemoAudio({
      fileName: 'Boards of Canada - Olson.ogg',
      baseFreqHz: 246.94,
      chordIntervals: [0, 4, 7, 11],
      durationSec: 2.8,
    });
    const synth2 = createSynthesizedDemoAudio({
      fileName: 'Aphex Twin - Rhubarb.flac',
      baseFreqHz: 174.61,
      chordIntervals: [0, 5, 9, 12],
      durationSec: 3.4,
    });

    await handleUploadFiles([synth1.originalFile, synth2.originalFile]);
  };

  const handleRetryTrackConversion = async (trackId: string) => {
    const target = tracks.find((t) => t.id === trackId);
    if (!target) return;

    setTracks((prev) =>
      prev.map((t) =>
        t.id === trackId
          ? { ...t, status: 'converting', progress: 20, errorMessage: undefined }
          : t
      )
    );

    const synth = createSynthesizedDemoAudio({
      fileName: target.fileName,
      baseFreqHz: 220,
      chordIntervals: [0, 3, 7, 10],
      durationSec: 3.0,
    });

    setTracks((prev) =>
      prev.map((t) =>
        t.id === trackId
          ? {
              ...t,
              status: 'done',
              progress: 100,
              durationSec: 3.0,
              convertedSizeBytes: synth.convertedWavBytes.byteLength,
              convertedWavUrl: synth.convertedWavUrl,
              convertedWavBytes: synth.convertedWavBytes,
              errorMessage: undefined,
            }
          : t
      )
    );
  };

  const handleUpdateTrackMetadata = (trackId: string, title: string, artist: string) => {
    setTracks((prev) =>
      prev.map((t) => (t.id === trackId ? { ...t, title, artist } : t))
    );
  };

  const handleDeleteTrack = (trackId: string) => {
    setTracks((prev) => prev.filter((t) => t.id !== trackId));
    setPlaylists((prev) =>
      prev.map((pl) => ({
        ...pl,
        trackIds: pl.trackIds.filter((id) => id !== trackId),
      }))
    );
  };

  const handleCreatePlaylist = (name: string, description: string) => {
    const newPl: Playlist = {
      id: `pl_${Date.now()}`,
      name,
      description,
      trackIds: [],
      updatedAt: 'Just now',
    };
    setPlaylists((prev) => [...prev, newPl]);
  };

  const handleDeletePlaylist = (playlistId: string) => {
    setPlaylists((prev) => prev.filter((p) => p.id !== playlistId));
  };

  const handleAddTrackToPlaylist = (playlistId: string, trackId: string) => {
    setPlaylists((prev) =>
      prev.map((pl) =>
        pl.id === playlistId
          ? { ...pl, trackIds: [...pl.trackIds, trackId], updatedAt: 'Just now' }
          : pl
      )
    );
  };

  const handleRemoveTrackFromPlaylist = (playlistId: string, trackIndex: number) => {
    setPlaylists((prev) =>
      prev.map((pl) =>
        pl.id === playlistId
          ? {
              ...pl,
              trackIds: pl.trackIds.filter((_, idx) => idx !== trackIndex),
              updatedAt: 'Just now',
            }
          : pl
      )
    );
  };

  const handleReorderPlaylistTracks = (
    playlistId: string,
    fromIndex: number,
    toIndex: number
  ) => {
    setPlaylists((prev) =>
      prev.map((pl) =>
        pl.id === playlistId
          ? {
              ...pl,
              trackIds: reorderItems(pl.trackIds, fromIndex, toIndex),
              updatedAt: 'Just now',
            }
          : pl
      )
    );
  };

  const handleSendTrackToNowPlaying = async (trackId: string) => {
    const track = tracks.find((t) => t.id === trackId);
    if (!track) return;
    setPlayback((prev) => ({
      ...prev,
      currentTrackId: track.id,
      durationSec: track.durationSec || 180,
      currentTimeSec: 0,
      isPlaying: true,
    }));
    const log = await sendPlaybackCommandToDevice('select_track', {
      currentTrackId: track.id,
      isPlaying: true,
    });
    appendLog(log);
    setActivePage('control');
  };

  // Wallpaper handlers
  const handleSaveWallpaper = (wp: SavedWallpaper) => {
    setSavedWallpapers((prev) => [wp, ...prev]);
    setActiveWallpaperId(wp.id);
  };

  const handleSelectSavedWallpaper = (wp: SavedWallpaper) => {
    setActiveWallpaperId(wp.id);
  };

  const handleDeleteSavedWallpaper = (wallpaperId: string) => {
    setSavedWallpapers((prev) => {
      const remaining = prev.filter((w) => w.id !== wallpaperId);
      if (activeWallpaperId === wallpaperId && remaining[0]) {
        setActiveWallpaperId(remaining[0].id);
      }
      return remaining;
    });
  };

  const handlePushWallpaperToDevice = async (wp: SavedWallpaper) => {
    const log = await sendWallpaperToDevicePlaceholder(wp);
    appendLog(log);
  };

  // Global Sync to ESP32-C3 placeholder action
  const handleSyncAllToDevice = async () => {
    setIsSyncing(true);
    const result = await syncLibraryToDevicePlaceholder(tracks, playlists);
    appendLog(result.log);
    setIsSyncing(false);
    setSyncNotice(
      `Placeholder Sync Ready: ${result.syncedCount} WAV tracks (44.1kHz 16-bit Mono) and ${playlists.length} playlists staged for ESP32-C3 SD card.`
    );
    window.setTimeout(() => setSyncNotice(null), 5000);
  };

  // Playback control handlers
  const handlePlayPause = async () => {
    const nextPlaying = !playback.isPlaying;
    setPlayback((prev) => ({ ...prev, isPlaying: nextPlaying }));
    const log = await sendPlaybackCommandToDevice(nextPlaying ? 'play' : 'pause', {
      isPlaying: nextPlaying,
    });
    appendLog(log);
  };

  const handleNextTrack = async () => {
    const ready = tracks.filter((t) => t.status === 'done');
    if (ready.length === 0) return;
    const currentIndex = ready.findIndex((t) => t.id === playback.currentTrackId);
    const nextTrack = ready[(currentIndex + 1) % ready.length];
    setPlayback((prev) => ({
      ...prev,
      currentTrackId: nextTrack.id,
      currentTimeSec: 0,
      durationSec: nextTrack.durationSec || 180,
    }));
    const log = await sendPlaybackCommandToDevice('next', {
      currentTrackId: nextTrack.id,
    });
    appendLog(log);
  };

  const handlePrevTrack = async () => {
    const ready = tracks.filter((t) => t.status === 'done');
    if (ready.length === 0) return;
    const currentIndex = ready.findIndex((t) => t.id === playback.currentTrackId);
    const prevTrack = ready[(currentIndex - 1 + ready.length) % ready.length];
    setPlayback((prev) => ({
      ...prev,
      currentTrackId: prevTrack.id,
      currentTimeSec: 0,
      durationSec: prevTrack.durationSec || 180,
    }));
    const log = await sendPlaybackCommandToDevice('prev', {
      currentTrackId: prevTrack.id,
    });
    appendLog(log);
  };

  const handleToggleShuffle = async () => {
    const nextShuffle = !playback.isShuffle;
    setPlayback((prev) => ({ ...prev, isShuffle: nextShuffle }));
    const log = await sendPlaybackCommandToDevice('shuffle', {
      isShuffle: nextShuffle,
    });
    appendLog(log);
  };

  const handleCycleRepeat = async () => {
    const order: PlaybackState['repeatMode'][] = ['off', 'all', 'one'];
    const nextRepeat = order[(order.indexOf(playback.repeatMode) + 1) % order.length];
    setPlayback((prev) => ({ ...prev, repeatMode: nextRepeat }));
    const log = await sendPlaybackCommandToDevice('repeat', {
      repeatMode: nextRepeat,
    });
    appendLog(log);
  };

  const handleSeek = async (timeSec: number) => {
    setPlayback((prev) => ({ ...prev, currentTimeSec: timeSec }));
    const log = await sendPlaybackCommandToDevice('seek', {
      currentTimeSec: timeSec,
    });
    appendLog(log);
  };

  const handleVolumeChange = async (volume: number) => {
    setPlayback((prev) => ({ ...prev, volume, isMuted: volume === 0 }));
    const log = await sendPlaybackCommandToDevice('volume', { volume });
    appendLog(log);
  };

  const handleToggleMute = async () => {
    const nextMute = !playback.isMuted;
    setPlayback((prev) => ({ ...prev, isMuted: nextMute }));
    const log = await sendPlaybackCommandToDevice('volume', { isMuted: nextMute });
    appendLog(log);
  };

  const handleRefreshTelemetry = async () => {
    const res = await pollDeviceTelemetryPlaceholder(deviceStatus);
    setDeviceStatus(res.status);
    appendLog(res.log);
  };

  const activeWallpaper =
    savedWallpapers.find((w) => w.id === activeWallpaperId) ?? savedWallpapers[0];

  return (
    <div className="min-h-screen w-full flex flex-col bg-[#0b0f17] text-slate-100">
      <Navbar
        activePage={activePage}
        onNavigate={setActivePage}
        onSyncAllToDevice={handleSyncAllToDevice}
        isSyncing={isSyncing}
      />

      {syncNotice && (
        <div
          role="status"
          className="mx-auto mt-4 max-w-7xl px-3 sm:px-6 w-full"
        >
          <div className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3.5 py-2.5 text-xs font-medium text-amber-200 flex flex-wrap items-center justify-between gap-2">
            <span className="min-w-0 flex-1">{syncNotice}</span>
            <button
              type="button"
              onClick={() => setSyncNotice(null)}
              className="min-h-[44px] sm:min-h-[32px] px-3 inline-flex items-center text-amber-300 hover:text-white cursor-pointer shrink-0"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <main className="mx-auto w-full max-w-7xl flex-1 px-3 sm:px-6 py-5 sm:py-8 min-w-0">
        {activePage === 'library' && (
          <MusicLibraryPage
            tracks={tracks}
            playlists={playlists}
            deviceStatus={deviceStatus}
            onUploadFiles={handleUploadFiles}
            onAddSimulatedBatch={handleAddSimulatedBatch}
            onRetryTrackConversion={handleRetryTrackConversion}
            onUpdateTrackMetadata={handleUpdateTrackMetadata}
            onDeleteTrack={handleDeleteTrack}
            onCreatePlaylist={handleCreatePlaylist}
            onDeletePlaylist={handleDeletePlaylist}
            onAddTrackToPlaylist={handleAddTrackToPlaylist}
            onRemoveTrackFromPlaylist={handleRemoveTrackFromPlaylist}
            onReorderPlaylistTracks={handleReorderPlaylistTracks}
            onSendTrackToNowPlaying={handleSendTrackToNowPlaying}
          />
        )}

        {activePage === 'wallpaper' && (
          <WallpaperPage
            savedWallpapers={savedWallpapers}
            activeWallpaperId={activeWallpaperId}
            onSaveWallpaper={handleSaveWallpaper}
            onSelectSavedWallpaper={handleSelectSavedWallpaper}
            onDeleteSavedWallpaper={handleDeleteSavedWallpaper}
            onPushWallpaperToDevice={handlePushWallpaperToDevice}
          />
        )}

        {activePage === 'control' && (
          <DeviceControlPage
            tracks={tracks}
            playlists={playlists}
            playback={playback}
            deviceStatus={deviceStatus}
            activeWallpaper={activeWallpaper}
            commandLogs={commandLogs}
            onPlayPause={handlePlayPause}
            onNextTrack={handleNextTrack}
            onPrevTrack={handlePrevTrack}
            onToggleShuffle={handleToggleShuffle}
            onCycleRepeat={handleCycleRepeat}
            onSeek={handleSeek}
            onVolumeChange={handleVolumeChange}
            onToggleMute={handleToggleMute}
            onSelectTrack={handleSendTrackToNowPlaying}
            onRefreshTelemetry={handleRefreshTelemetry}
          />
        )}
      </main>

      <footer className="border-t border-slate-800/80 py-5 px-3 sm:px-6 text-xs text-slate-500">
        <div className="mx-auto max-w-7xl flex flex-col sm:flex-row flex-wrap items-start sm:items-center justify-between gap-2 sm:gap-4 min-w-0">
          <span className="min-w-0">PocketAudio C3 · DIY ESP32-C3 + ST7789 (LovyanGFX) Companion Web App</span>
          <span className="min-w-0">Audio Target: WAV 44,100 Hz 16-bit PCM Mono · Display Target: 320×240 RGB565 Little-Endian</span>
        </div>
      </footer>
    </div>
  );
}
