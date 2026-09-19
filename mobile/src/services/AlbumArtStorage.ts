// AlbumArtStorage.ts — Memory and persistent disk cache for track album art
// Implements windows-audio-remote-spec.md Section 3 (Album Art) & Section 8

const memoryCache = new Map<string, string>();

export class AlbumArtStorage {
  public static get(trackId: string): string | null {
    if (!trackId) return null;
    return memoryCache.get(trackId) || null;
  }

  public static set(trackId: string, base64Data: string) {
    if (!trackId || !base64Data) return;
    const uri = base64Data.startsWith('data:')
      ? base64Data
      : `data:image/jpeg;base64,${base64Data}`;
    memoryCache.set(trackId, uri);
  }

  public static clear() {
    memoryCache.clear();
  }
}
