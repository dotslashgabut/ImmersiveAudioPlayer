# Immersive Audio Player

A minimalist, single-page web application designed for an immersive listening experience. It supports various audio formats, synchronized lyrics, and features a built-in visual editor to create custom slideshows synchronized with your music.

## Features

- **Audio Playback**: Supports common audio formats (MP3, WAV, OGG, etc.).
- **Metadata Parsing**: Automatically extracts Album Art, Title, and Artist from audio files using `jsmediatags`.
- **Synchronized Lyrics**: 
  - Support for `.lrc` (LRC) and `.srt` (SubRip) lyric files.
  - Auto-scrolling and active line highlighting.
- **Visual Editor (Timeline)**:
  - Create time-synced background slideshows.
  - Add multiple images.
  - Drag-and-drop interface to move slides along the timeline.
  - Resize slide duration by dragging edges.
  - Snapping logic for precise alignment.
- **Immersive Interface**:
  - **Auto-Hide UI**: Controls fade away when the mouse is idle.
  - **Fullscreen Mode**: Distraction-free listening.
  - **Hold Mode**: Option to keep controls visible ("Eye" icon).

## Keyboard Shortcuts

| Key | Action |
| :--- | :--- |
| **Space** / **k** | Play / Pause |
| **s** | Stop (Pause and reset to 0:00) |
| **l** | Toggle Loop / Repeat |
| **f** | Toggle Fullscreen |
| **h** | Toggle "Hold" Mode (Bypass auto-hide to keep UI visible) |
| **t** | Toggle Timeline / Visual Editor |
| **i** | Toggle Top Info Bar visibility |
| **p** | Toggle Bottom Player visibility |

## Usage

1. **Load Audio**: Click the Music icon in the bottom control bar to select an audio file.
2. **Load Lyrics**: Click the File icon next to the music icon to load an `.lrc` or `.srt` file.
3. **Edit Visuals**: 
   - Press **T** or click the Settings gear icon to open the Timeline.
   - Click "Add Images" to upload background visuals.
   - Use the timeline to arrange when images appear during the song.
