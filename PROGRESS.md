# Windows Audio Remote (Remotva) — Implementation Progress

Last updated: 2026-09-19  
Current Stage: **Planning & Architecture Alignment**

---

## Progress Dashboard

```
Overall Progress: [████████████████░░░░] 80% (Milestones 0, 1, 2, 3 & 4 Complete)
```

| Milestone | Description | Status | Progress | Target Completion |
| --- | --- | --- | --- | --- |
| **M0: Planning & Setup** | Spec review, architecture, PLAN.md, PROGRESS.md | 🟢 Completed | 100% | 2026-09-19 |
| **M1: Companion Core** | .NET 8 Tray, Core Audio, GSMTC, WS Server, Test Client | 🟢 Completed | 100% | 2026-09-19 |
| **M2: Android App (Wi-Fi)** | Bare RN, Discovery, Pairing, Player Tab, Reconnect | 🟢 Completed | 100% | 2026-09-19 |
| **M3: Media & Album Art** | Live GSMTC Sync, 300x300 Art Cache, FG Service | 🟢 Completed | 100% | 2026-09-19 |
| **M4: Per-App Mixer** | Core Audio Sessions, Live Session Evts, Mixer Screen | 🟢 Completed | 100% | 2026-09-20 |
| **M5: Bluetooth LE** | WinRT BLE Peripheral, RN BLE Central, Chunking | ⚪ Next Up | 0% | TBD |
| **M6: Packaging & Installer**| Inno Setup, Windows Firewall rule, Release APK | ⚪ Pending | 0% | TBD |

---

## Detailed Task Breakdown & Checklist

### Milestone 0: Planning & Environment
- [x] Read and analyze `windows-audio-remote-spec.md`
- [x] Verify local development toolchains (.NET 8, Node.js, Android SDK/ADB)
- [x] Create comprehensive `PLAN.md`
- [x] Create progress tracking dashboard `PROGRESS.md`
- [x] Generate formal implementation plan artifact for user review

---

### Milestone 1: Windows Companion Core (No Phone Involved)
*Target: Verify end-to-end audio & media control via Node.js WebSocket test client.*
- [x] Initialize .NET 8 Windows project (`net8.0-windows10.0.19041.0`)
  - [x] Configure project file and package references (`NAudio 2.2.1`, `QRCoder 1.8.0`, `System.Threading.Channels`)
  - [x] Implement single-instance mutex check (`Global\RemotvaCompanion_SingleInstance_Mutex`)
- [x] Core Audio Volume & Mute (`Audio/AudioController.cs`)
  - [x] Implement `IAudioEndpointVolume` wrapper for default playback device
  - [x] Register `AudioEndpointVolumeCallback` for system volume change events
  - [x] Implement `GetMasterVolume`, `SetMasterVolume`, `SetMute`, `AdjustVolume`
- [x] WinRT Media Transport (`Media/MediaController.cs`)
  - [x] Initialize `GlobalSystemMediaTransportControlsSessionManager`
  - [x] Register handlers for `PlaybackInfoChanged` and `MediaPropertiesChanged`
  - [x] Implement Play, Pause, Toggle, Next, Previous transport commands
  - [x] Implement SHA256 trackId generation and metadata extraction
- [x] Album Art Processor (`Media/AlbumArtCache.cs`)
  - [x] Fetch thumbnail stream from GSMTC
  - [x] Resize to 300×300 (and 96×96), compress to JPEG (quality 80)
  - [x] In-memory caching and base64 retrieval
- [x] Threading & Serialized Event Queue (`Utils/SerializedChannel.cs`)
  - [x] Setup `System.Threading.Channels.Channel<AudioEvent>`
  - [x] Consumer thread updating cached state and broadcasting to sockets
- [x] Security & Pairing Subsystem (`Security/PairingManager.cs` & `TokenStore.cs`)
  - [x] 6-digit PIN generator with 120s TTL and 3-attempt limit
  - [x] Cryptographic 32-byte token generator and persistent local store (`%APPDATA%\Remotva\tokens.json`)
  - [x] Handshake timer (5-second timeout for unauthenticated sockets)
- [x] WebSocket Server (`Transports/WsHost.cs`)
  - [x] Non-elevated LAN WebSocket server on port 8377 (`TcpListener` + `WebSocket.CreateFromStream`)
  - [x] JSON protocol message serializer/deserializer (`cmd`, `res`, `evt`)
  - [x] Broadcast dispatcher to active authenticated clients
- [x] System Tray App & UI (`AppContext.cs`, `UI/PairingForm.cs`, `UI/SettingsForm.cs`)
  - [x] Tray NotifyIcon with context menu (Status, Pair, Settings, Exit)
  - [x] Pairing dialog rendering PIN and QR code (using QRCoder)
  - [x] Settings dialog with paired device listing and token revocation
- [x] Verification Test Harness (`tools/test-client.js`)
  - [x] Script testing: ping, unauthenticated reject (`ERR_AUTH`), invalid PIN rejection, active PIN pairing, token persistence, authenticated hello, `getState`, `setVolume`, `volumeChanged` event assertion, `setMute`, `adjustVolume`, `getSessions`, and volume restoration.

---

### Milestone 2: Android App Foundation & Wi-Fi Client
*Target: Pair phone via QR code and control master volume and playback over Wi-Fi.*
- [x] React Native bare workflow project setup (`mobile/`)
  - [x] TypeScript configuration, navigation setup (`BottomTabs` + `NativeStack`)
  - [x] Android bare project structure (`AndroidManifest.xml`, `MainActivity.kt`, `MainApplication.kt`)
  - [x] Install client dependencies (`zustand`, React Navigation)
- [x] mDNS Discovery (`src/api/discovery/mdns.ts`)
  - [x] ZeroConf browser for `_pcaudio._tcp`
  - [x] Parse TXT records (`name`, `ver`, `id`)
  - [x] Manual IP fallback entry and persistent device store
- [x] Protocol Client & WebSocket Transport (`src/api/protocol.ts` & `WsTransport.ts`)
  - [x] Protocol envelope encoding/decoding and request-reply matching table
  - [x] Exponential backoff reconnection (500ms to 10s)
  - [x] ConnectionService coordinator managing lifecycle
- [x] UI Screens & Components
  - [x] `DevicesScreen`: Discovered & saved PCs, connection status, manual IP entry
  - [x] `PairingScreen`: 6-digit PIN input with instant validation and status feedback
  - [x] `PlayerScreen`: Master volume slider, mute button, track card, transport controls
  - [x] `MixerScreen`: Per-app session list with individual volume sliders and mute toggles
  - [x] `SettingsScreen`: Connection settings, forget PC, transport preference
- [x] Slider Throttling & Optimistic Updates (`src/hooks/useThrottledSlider.ts`)
  - [x] 50ms throttle on drag, always send on release
  - [x] 300ms inbound suppression window to eliminate slider jitter
- [x] Reconnection UX & Dimmed Overlay (`src/components/ConnectionBanner.tsx`)
  - [x] Retain last known state with dimmed UI and status banner during reconnect attempts

---

### Milestone 3: Now Playing & Album Art Integration
*Target: Real-time track syncing, album art caching, lockscreen/notification controls.*
- [x] GSMTC Event Pipeline integration and validation with Spotify, Chrome, VLC
- [x] On-demand album art fetcher and memory/disk cache on mobile (`AlbumArtStorage.ts`)
- [x] Android Foreground Service (`services/ForegroundService.ts`, `RemotvaMediaService.kt`)
  - [x] Persistent notification with current track, artist, play/pause action
  - [x] Keep-alive background socket protection against Android Doze mode
- [x] Physical volume button handling (`useVolumeKeys.ts` and `adjustVolume` hook)

---

### Milestone 4: Per-App Audio Mixer
*Target: Per-session volume control and real-time app audio session tracking.*
- [x] Core Audio Session Manager on Windows (`Audio/SessionManager.cs`)
  - [x] Enumerate `IAudioSessionControl2` and extract process info (`PID`, `Name`, `Volume`, `Muted`, `Active`)
  - [x] Track session creation and termination via `IAudioSessionNotification.OnSessionCreated`
  - [x] Handle real-time per-session volume and state changes via `IAudioSessionEventsHandler`
- [x] Protocol handler for `getSessions`, `setSessionVolume`, `setSessionMute`
- [x] Android Mixer Screen (`src/screens/MixerScreen.tsx`)
  - [x] List displaying session rows (app badges, process name, PID, volume slider, mute button)
  - [x] Dynamic live updates on `sessionsChanged` and `sessionVolumeChanged`

---

### Milestone 5: Bluetooth Low Energy (BLE) Transport
*Target: Seamless audio remote control without Wi-Fi over BLE GATT.*
- [x] Windows WinRT BLE Peripheral (`Transports/BleHost.cs`)
  - [x] `GattServiceProvider` setup with custom Remotva Service UUID
  - [x] Command (Write), Event (Notify), Control (Read) characteristics
  - [x] Bluetooth hardware capability detection and graceful non-blocking fallback
- [x] MessagePack serialization and 3-byte chunking protocol (`BleChunker.cs` & `BleChunker.ts`, `BleCodec.cs` & `BleCodec.ts`)
- [x] BLE Bandwidth Adaptations (active-only sessions, 96x96 art cap, 8KB `ERR_TOO_LARGE` guard)
- [x] Android BLE Central (`src/api/transports/BleTransport.ts`)
  - [x] `react-native-ble-plx` integration and Android 12+ runtime permissions (`BlePermissions.ts`)
  - [x] Chunk reassembly, MTU negotiation, and transmission
- [x] Transport Manager & Auto-Fallback (`services/TransportManager.ts` & `SettingsScreen.tsx`)
  - [x] Auto mode: Wi-Fi (saved IP / mDNS) with 3s timeout → fallback to BLE GATT
  - [x] User-selectable pinned transport preference (Auto, Wi-Fi Only, BLE Only)

---

### Milestone 6: Packaging, Installer & Hardening
*Target: One-click Windows installer and production-ready Android APK.*
- [ ] Windows Firewall automation script & startup network profile check
- [ ] Inno Setup script for Companion (.NET 8 runtime check, startup registry key)
- [ ] Android release build, Proguard rules, signed APK generation
- [ ] End-to-end release validation across Windows 10/11 and Android devices

---

## Verification & Test Log

| Date | Milestone | Test Description | Result | Notes |
| --- | --- | --- | --- | --- |
| 2026-09-19 | M0 | Environment check (.NET 8, Node.js, Android tools) | Passed | .NET 8.0.100, Node v22.17.0, ADB present |
| 2026-09-19 | M0 | Architecture Plan & Spec Alignment | Complete | `PLAN.md` and `PROGRESS.md` created |
| 2026-09-19 | M1 | Automated WebSocket test suite (`tools/test-client.js`) | Passed (10/10) | Verified: ping, ERR_AUTH on unauth, invalid PIN lockout check, 6-digit PIN pairing, 32-byte token auth, getState snapshot, setVolume, volumeChanged event broadcast, setMute, adjustVolume, getSessions enumeration, volume cleanup. |
| 2026-09-19 | M2 | Mobile Client Integration & Throttling (`tools/test-mobile-logic.js`) | Passed (7/7) | Verified: active PIN pairing exchange, authenticated hello, state snapshot parsing, 50ms slider drag throttling verification (10 fast ticks filtered down to 3 wire sends), and master volume restoration. |
| 2026-09-20 | M3 | GSMTC Media & Album Art Pipeline (`tools/test-media-art.js`) | Passed (7/7) | Verified: real media snapshot ("O Sahib" by "Adnan Dhool", playing, hasArt), GSMTC transport controls (toggle, next, previous), on-demand 300x300 JPEG 80% album art retrieval (14 KB), and client-side art caching. |
| 2026-09-20 | M4 | Per-App Audio Mixer & Session Control (`tools/test-mixer.js`) | Passed (6/6) | Verified: live session enumeration (FxSound, msedge, chrome, Todo), process metadata extraction, per-session volume control, per-session mute toggle, real-time `sessionVolumeChanged` event broadcasting, and state restoration. |
| 2026-09-20 | M5 | BLE GATT Transport, Chunking & Fallback (`tools/test-ble.js`) | Passed (9/9) | Verified: 3-byte chunk framing, 1000-byte split across MTU 185, out-of-order reassembly, 5s partial timeout drop, MessagePack integer key codec, JSON fallback, BLE active-only session filtering, 96x96 art cap + 8KB ERR_TOO_LARGE check, and simulated end-to-end command/response roundtrip. |

---

## Changelog
- **2026-09-20**: Implemented and verified **Milestone 5: Bluetooth Low Energy (BLE) Transport**:
  - Implemented WinRT `GattServiceProvider` companion peripheral (`BleHost.cs`) with custom Remotva Service UUID (`18377000-7c1a-4d9f-9f3a-7140e4f20837`), Command (Write), Event (Notify), and Control (Read) characteristics.
  - Implemented 3-byte chunking protocol (`BleChunker.cs`, `BleChunker.ts`) with header `[messageId, chunkIndex, chunkCount]`, MTU fragmentation, and 5-second partial message timeout drop.
  - Implemented compact MessagePack serialization with integer key mappings (`BleCodec.cs`, `BleCodec.ts`) with transparent UTF-8 JSON fallback.
  - Enforced BLE bandwidth adaptations: active-only audio session filtering for `getSessions`, 96×96 album art downscaling cap, and 8KB `ERR_TOO_LARGE` guard.
  - Built mobile `BleTransport.ts` with `react-native-ble-plx`, Android 12+ runtime permission handler (`BlePermissions.ts`), and `TransportManager.ts` auto-fallback orchestrator (Wi-Fi first with 3s timeout → fallback to BLE).
  - Updated mobile `SettingsScreen.tsx` with 3-way transport selector ('Auto', 'Wi-Fi Only', 'BLE Only') and active transport indicator.
  - Verified with 9/9 automated tests passing via `tools/test-ble.js`.
- **2026-09-20**: Implemented and verified **Milestone 4: Per-App Audio Mixer**:
  - Enhanced Windows companion `SessionManager.cs` to bind `IAudioSessionEventsHandler` to each active Windows audio session, tracking real-time volume, mute state, and process details.
  - Implemented dynamic session creation and termination tracking via `IAudioSessionNotification.OnSessionCreated`, broadcasting `sessionsChanged` events.
  - Full support for `getSessions`, `setSessionVolume`, and `setSessionMute` commands with error resilience against exited processes.
  - Mobile `MixerScreen` with app badges, process names, volume sliders, and mute buttons with live real-time sync.
  - Verified per-app controls and event broadcasts with live audio apps via `tools/test-mixer.js`.
- **2026-09-20**: Implemented and verified **Milestone 3: Now Playing & Album Art Integration**:
  - Live WinRT GSMTC integration tracking media state across players (Spotify, Chrome, VLC) with event-driven notifications (`MediaPropertiesChanged`, `PlaybackInfoChanged`).
  - On-demand album art pipeline resizing GSMTC thumbnail stream to 300×300 JPEG (80% quality) and caching by SHA256 track hash.
  - Client-side on-demand fetching and local disk/memory cache (`AlbumArtStorage.ts`).
  - Built Android Native Foreground Service (`RemotvaMediaService.kt`, `RemotvaMediaModule.kt`, `RemotvaPackage.kt`) with media playback controls on the notification and lockscreen to prevent Android Doze socket termination.
  - Verified transport commands (`toggle`, `next`, `previous`) and live album art fetching via `tools/test-media-art.js`.
- **2026-09-19**: Implemented and verified **Milestone 2: Android App Foundation & Wi-Fi Client**:
  - Scaffolding React Native bare workflow project (`mobile/`) with TypeScript, bottom tabs (`Player`, `Mixer`, `Settings`), and modal stack navigation (`Devices`, `Pairing`).
  - Implemented `ProtocolClient` and `WsTransport` with exponential backoff reconnection (500ms to 10s).
  - Implemented `useThrottledSlider` custom hook enforcing 50ms outbound rate limiting and 300ms inbound suppression window to prevent thumb jitter.
  - Implemented `ConnectionService` singleton coordinating transport lifecycle, automatic handshake, state sync, and on-demand album art fetch.
  - Implemented UI screens: `PlayerScreen` (now playing card, transport buttons, master slider, mute toggle), `MixerScreen` (per-app volume sliders and mutes), `DevicesScreen` (mDNS scanner + manual IP fallback), `PairingScreen` (PIN input and validation), and `SettingsScreen`.
  - Configured Android bare native structure (`AndroidManifest.xml` with network/mDNS permissions, `MainActivity.kt`, `MainApplication.kt`).
  - Tested mobile client logic against live companion via `tools/test-mobile-logic.js` (all checks passed).
- **2026-09-19**: Implemented and verified **Milestone 1: Windows Companion Core**:
  - Built .NET 8 (`net8.0-windows10.0.19041.0`) WinForms system tray companion with single-instance mutex.
  - Implemented Core Audio master volume & mute control via NAudio with `OnVolumeNotification` callback.
  - Implemented WinRT GSMTC media transport controls and album art JPEG encoder/cache.
  - Implemented single-reader `System.Threading.Channels` queue to marshal COM & WinRT callbacks.
  - Built pairing manager with 6-digit PIN (120s TTL, 3 attempts), 32-byte cryptographic tokens, and persistent store with token revocation.
  - Built non-elevated LAN WebSocket server on port 8377 using `TcpListener` and `WebSocket.CreateFromStream`.
  - Created tray NotifyIcon, PairingForm with QR code and countdown, and SettingsForm.
  - Created automated Node.js test harness `tools/test-client.js`; passed all 10 verification tests end-to-end.
- **2026-09-19**: Created master `PLAN.md` and `PROGRESS.md` outlining the 6 milestone architecture, security model, and implementation phases based on `windows-audio-remote-spec.md`.
