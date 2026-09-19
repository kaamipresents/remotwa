// useAudioStore.ts — Zustand store for Windows audio & media state
// Implements windows-audio-remote-spec.md Section 8 (State Snapshot & Events)

import { create } from 'zustand';
import {
  AudioSessionInfo,
  MasterVolumeState,
  SystemStateSnapshot,
  TrackMetadata,
} from '../api/protocol';

interface AudioStoreState {
  masterLevel: number;
  masterMuted: boolean;
  track: TrackMetadata | null;
  sessions: AudioSessionInfo[];
  albumArt: Record<string, string>; // trackId -> base64 JPEG data URI

  // Actions
  setSnapshot: (snapshot: SystemStateSnapshot) => void;
  updateMaster: (level: number, muted: boolean) => void;
  updateTrack: (track: Partial<TrackMetadata>) => void;
  updatePlayState: (playState: 'playing' | 'paused' | 'stopped', position: number) => void;
  updateSessions: (sessions: AudioSessionInfo[]) => void;
  updateSessionVolume: (sessionId: string, level: number, muted: boolean) => void;
  setAlbumArt: (trackId: string, base64Data: string) => void;
}

export const useAudioStore = create<AudioStoreState>((set) => ({
  masterLevel: 0.5,
  masterMuted: false,
  track: null,
  sessions: [],
  albumArt: {},

  setSnapshot: (snapshot) =>
    set({
      masterLevel: snapshot.master.level,
      masterMuted: snapshot.master.muted,
      track: snapshot.track || null,
      sessions: snapshot.sessions || [],
    }),

  updateMaster: (level, muted) =>
    set({
      masterLevel: Math.max(0, Math.min(1, level)),
      masterMuted: muted,
    }),

  updateTrack: (trackUpdates) =>
    set((state) => ({
      track: state.track ? { ...state.track, ...trackUpdates } : (trackUpdates as TrackMetadata),
    })),

  updatePlayState: (playState, position) =>
    set((state) => ({
      track: state.track ? { ...state.track, playState, position } : null,
    })),

  updateSessions: (sessions) => set({ sessions }),

  updateSessionVolume: (sessionId, level, muted) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.sessionId === sessionId
          ? { ...s, level: Math.max(0, Math.min(1, level)), muted }
          : s
      ),
    })),

  setAlbumArt: (trackId, base64Data) =>
    set((state) => ({
      albumArt: { ...state.albumArt, [trackId]: base64Data },
    })),
}));
