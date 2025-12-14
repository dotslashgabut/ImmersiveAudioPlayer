# Immersive Audio Player

A modern, single-page web application that transforms your music listening into a visual experience. Supports synchronized lyrics, custom visual storytelling, and high-quality video export for social media content creation.

## Key Features

### 🎧 Advanced Audio Player
- **Universal Format Support**: Plays standard web audio formats (MP3, WAV, OGG, etc.).
- **Smart Metadata**: Automatically extracts Cover Art, Title, and Artist using `jsmediatags`.
- **Immersive Mode**: UI controls automatically fade out when idle for a distraction-free experience.

### 📝 Synchronized Lyrics
- **Dual Format Support**: Compatible with both `.lrc` (Karaoke style) and `.srt` (Subtitle style) files.
- **Auto-Scroll**: Lyrics scroll automatically in sync with the music.
- **Active Line Highlighting**: Current line is magnified and highlighted for easy reading.

### 🎬 Visual Timeline Editor
- **Create Stories**: Drag and drop images to create a background slideshow synchronized to specific timestamps.
- **Timeline Interface**: Intuitive interface to move, resize, and snap slides to lyrics or audio duration.
- **Zoom Controls**: Zoom in/out of the timeline for precise editing.

### 🎥 Content Creation & Export
Turn your audio and visuals into shareable videos directly in the browser.
- **Resolutions**: 
  - **720p** (HD - Faster render, smaller file size)
  - **1080p** (Full HD - High quality)
- **Aspect Ratios**:
  - **16:9**: Classic Landscape (YouTube, Desktop)
  - **9:16**: Vertical (TikTok, Instagram Reels, YouTube Shorts)
  - **3:4**: Vertical (Instagram Feed, Facebook)
  - **1:1**: Square (Instagram Post, Facebook)
- **Smart Overlays**: Automatically renders a professional metadata overlay (Cover Art + Text).
  - *Landscape*: Top-left alignment.
  - *Portrait (9:16/3:4/1:1)*: Top-center alignment.

## Keyboard Shortcuts

| Key | Function |
| :--- | :--- |
| **Space / K** | Play / Pause |
| **S** | Stop & Reset |
| **L** | Toggle Loop |
| **F** | Toggle Fullscreen |
| **H** | Toggle "Hold UI" (Prevents auto-hide) |
| **T** | Open/Close Timeline Editor |
| **I** | Toggle Info Header |
| **P** | Toggle Player Controls |

## How to Use

1. **Import Audio**: Click the **Music Note** icon to select an audio file from your device.
2. **Import Lyrics**: Click the **File** icon to load a matching `.lrc` or `.srt` file.
3. **Design Visuals**: 
   - Press **T** or click the **Settings** icon.
   - Click "Add Images" to populate the timeline.
   - Drag images to position them; drag the edges to adjust duration.
4. **Export Video**:
   - Select your target resolution (e.g., 1080p) and aspect ratio (e.g., 9:16) in the bottom bar.
   - Click the **Video** icon.
   - *Important*: The audio will play in real-time to capture the video. Keep the tab active until rendering finishes.

## Browser Compatibility

Video export relies on modern browser APIs (`MediaRecorder` and `captureStream`). 
- **Recommended**: Google Chrome, Microsoft Edge, or other Chromium-based browsers.
- **Note**: Firefox and Safari may have varying levels of support for specific video export features.
