# Immersive Audio Player

![App Screenshot](screenshot.jpg)

A minimalist, single-page audio player designed for content creators and music enthusiasts. It combines robust audio playback with a powerful visual editor, allowing you to create lyric videos and immersive listening experiences directly in the browser.

## Features

### 🎵 Advanced Audio Player
- Supports major audio formats (MP3, WAV, FLAC, OGG, M4A).
- Reads metadata (ID3 tags) and cover art using `jsmediatags`.
- Playlist management with shuffle and repeat modes.

### 📝 Lyrics & Synchronization
- **Format Support**: Native support for `.lrc` and `.srt` lyric files.
- **AI Transcription**: Integrated **Google Gemini API** to automatically transcribe audio and generate synchronized lyrics with high precision.
- **Lyric Editor**: Adjust offsets and manage lyric lines.

### 🎨 Visual & Video Editor
- **Timeline Editor**: Drag-and-drop visual slide editor. Add images and videos synchronized to specific timestamps.
- **Customization**:
  - Dynamic backgrounds (Gradients, Blur, Custom Images).
  - **Text Effects**: Neon, Glitch, 3D, Fire, and more.
  - **Animations**: Kinetic typography animations (Bounce, Typewriter, Wave).
  - **Fonts**: Curated list of Google Fonts + Custom Font upload support.

### 🎬 Video Export
- **Client-Side Rendering**: Export your composition as `MP4` or `WebM` directly from the browser using the Canvas API and MediaStream Recording API.
- **Presets**: Pre-configured video styles (Subtitle, Lo-fi, Kinetic, etc.).
- **Resolutions**: Support for 720p, 1080p, and various aspect ratios (16:9, 9:16 for TikTok/Reels, 1:1 for Instagram).

## Getting Started

### Prerequisites
- Node.js (v18+)
- A Google Gemini API Key (for AI transcription features)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/immersive-audio-player.git
   cd immersive-audio-player
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure Environment:
   Create a `.env` file in the root directory:
   ```env
   API_KEY=your_gemini_api_key_here
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

## Usage Controls

| Key | Action |
| :--- | :--- |
| **Space** | Play / Pause |
| **F** | Toggle Fullscreen |
| **T** | Toggle Timeline/Editor View |
| **L** | Toggle Playlist |
| **D** | Open Render Settings |
| **M** | Mute |
| **H** | Toggle UI Auto-Hide |
| **Arrows** | Seek +/- 5s |

## Technologies

- **Core**: React 19, TypeScript, Vite
- **Styling**: Tailwind CSS
- **AI**: Google GenAI SDK (`gemini-2.5-flash`, `gemini-3-flash`)
- **Media**: JSMediatags, Web Audio API
- **Icons**: Lucide React

## License

MIT
