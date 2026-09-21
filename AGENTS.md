# Recordly Release Build Guide

## Prerequisites

- Node.js >= 22, npm >= 10
- Visual Studio 2022 Build Tools with "Desktop development with C++" workload (for native C++ helpers: wgc-capture, cursor-monitor, gpu-export)
- CMake (comes with VS 2022 Build Tools)

## Build Commands

### Full release (CI, signed)

```bash
npm run build:win    # Windows NSIS installer
npm run build:mac    # macOS DMG + ZIP
npm run build:linux  # Linux AppImage
```

Each runs: `build:platform-native-helpers` → `tsc` → `vite build` → `normalize:electron-main-cjs` → `smoke:electron-main-cjs` → `electron-builder`.

### Local build (no code signing)

On Windows without a code signing certificate, signing must be disabled:

```bash
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
npx electron-builder --win --config.win.signAndEditExecutable=false
```

### Portable .exe (no installer)

```bash
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
npx electron-builder --win --config.win.signAndEditExecutable=false --config.win.target=portable
```

### Custom output directory

Use to avoid file-locking conflicts after a failed build:

```bash
npx electron-builder --win --config.directories.output=release2
```

### Build individual native helpers (skips if binary already staged)

```bash
npm run build:native-helpers           # macOS Swift helpers only (skipped on Windows)
npm run build:windows-capture          # wgc-capture.exe
npm run build:windows-gpu-export       # recordly-gpu-export.exe
npm run build:cursor-monitor           # cursor-monitor.exe
npm run build:nvidia-cuda-compositor   # recordly-nvidia-cuda-compositor.exe (requires NVIDIA Video Codec SDK)
npm run build:whisper-runtime          # Whisper CLI binaries
```

## Output

| Target | Path | Type |
|--------|------|------|
| Windows installer | `release/Recordly-windows-x64.exe` | NSIS setup |
| Windows portable | `release/Recordly-windows-x64.exe` | Single-file portable |
| Windows unpacked | `release/win-unpacked/Recordly.exe` | Unpacked app directory |
| macOS | `release/Recordly-{arch}.dmg` + `.zip` | Disk image + updater zip |
| Linux | `release/Recordly-linux-x64.AppImage` | AppImage |

## Known Issues

### File locked after failed build

If `release/win-unpacked/resources/app.asar` is locked by a zombie process, use a different output directory instead:

```bash
npx electron-builder --win --config.directories.output=release2 --config.win.signAndEditExecutable=false
```

### winCodeSign symlink extraction fails on Windows

The `winCodeSign` 7z archive contains macOS `.dylib` symlinks that cannot be extracted on Windows. Always set:

```bash
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
```

And pass `--config.win.signAndEditExecutable=false` to skip signing entirely.

### NVIDIA CUDA compositor

Requires `RECORDLY_NVIDIA_VIDEO_CODEC_SDK_ROOT` or the pre-bundled binary at `electron/native/bin/win32-x64/recordly-nvidia-cuda-compositor.exe`. Without it, the build script falls back to the existing binary.

## Full CI pipeline

See `.github/workflows/release.yml` and `RELEASING.md`. The CI workflow:
1. Validates that the git tag matches `package.json` version
2. Builds signed + notarized macOS artifacts (both x64 and arm64)
3. Builds signed Windows NSIS installer
4. Builds Linux AppImage
5. Publishes to GitHub Releases with auto-update metadata
