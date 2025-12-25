import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
  Maximize, Minimize, Upload, Music, FileText, Settings, ImageIcon,
  Repeat, Repeat1, Square, Eye, EyeOff, Video, Download, Film, Type, X, ListMusic, Rewind, FastForward,
  ChevronUp, ChevronDown
} from './components/Icons';
import { AudioMetadata, LyricLine, TabView, VisualSlide, VideoPreset, PlaylistItem, RenderConfig } from './types';
import { formatTime, parseLRC, parseSRT } from './utils/parsers';
import VisualEditor from './components/VisualEditor';
import PlaylistEditor from './components/PlaylistEditor';
import RenderSettings from './components/RenderSettings';
import { drawCanvasFrame } from './utils/canvasRenderer';
import { loadGoogleFonts } from './utils/fonts';


function App() {
  // Refs
  const audioRef = useRef<HTMLAudioElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lyricsContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const abortRenderRef = useRef(false);
  const exportVideoRef = useRef<() => void>(() => { });

  // Load fonts
  useEffect(() => {
    loadGoogleFonts();
  }, []);

  // State: Media & Data
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [audioElementKey, setAudioElementKey] = useState(0);
  const [metadata, setMetadata] = useState<AudioMetadata>({
    title: 'No Audio Loaded',
    artist: 'Select a file',
    coverUrl: null,
  });
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [visualSlides, setVisualSlides] = useState<VisualSlide[]>([]);
  const [lyricOffset, setLyricOffset] = useState(0);

  // State: Playback
  const [isPlaying, setIsPlaying] = useState(false);
  const [repeatMode, setRepeatMode] = useState<'off' | 'all' | 'one'>('off');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  // State: UI
  const [activeTab, setActiveTab] = useState<TabView>(TabView.PLAYER);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMouseIdle, setIsMouseIdle] = useState(false);
  const [bypassAutoHide, setBypassAutoHide] = useState(false);



  // State: Video Export
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16' | '3:4' | '1:1' | '1:2' | '2:1' | '2:3' | '3:2' | '20:9' | '21:9' | '4:5' | '4:3'>('16:9');
  const [resolution, setResolution] = useState<'720p' | '1080p'>('1080p');
  const [preset, setPreset] = useState<VideoPreset>('default');
  const [customFontName, setCustomFontName] = useState<string | null>(null);
  const [renderCodec, setRenderCodec] = useState<string>('auto');
  const [renderFps, setRenderFps] = useState<number>(30);
  const [renderQuality, setRenderQuality] = useState<'low' | 'med' | 'high'>('med');

  const [showRenderSettings, setShowRenderSettings] = useState(false);
  const [renderConfig, setRenderConfig] = useState<RenderConfig>({
    backgroundSource: 'custom',
    backgroundColor: '#581c87',
    backgroundGradient: 'linear-gradient(to bottom right, #312e81, #581c87, #000000)',
    renderMode: 'current',
    textAlign: 'center',
    contentPosition: 'center',
    fontFamily: 'sans-serif',
    fontSizeScale: 1.0,
    fontColor: '#ffffff',
    textEffect: 'shadow',
    textAnimation: 'none',
    transitionEffect: 'none',
    lyricDisplayMode: 'all',
    fontWeight: 'bold',
    fontStyle: 'normal',
    textDecoration: 'none',
    showTitle: true,
    showArtist: true,
    showCover: true,
    showIntro: true,
    showLyrics: true,
    infoPosition: 'top-left',
    infoStyle: 'classic',
    infoMarginScale: 1.0,
    backgroundBlurStrength: 0,
    introMode: 'auto',
    introText: '',
    textCase: 'none',
  });

  const isBlurEnabled = renderConfig.backgroundBlurStrength > 0;

  const supportedCodecs = useMemo(() => {
    const candidates = [
      { label: 'VP9 (WebM)', value: 'video/webm; codecs=vp9,opus' },
      { label: 'H.264 (MP4)', value: 'video/mp4; codecs="avc1.4D401E, mp4a.40.2"' },
      { label: 'AV1 (MP4)', value: 'video/mp4; codecs="av01.0.05M.08"' },
      { label: 'AV1 (WebM)', value: 'video/webm; codecs=av1' },
      { label: 'H.264 High (MP4)', value: 'video/mp4; codecs="avc1.64001E, mp4a.40.2"' },
    ];
    return candidates.filter(c => MediaRecorder.isTypeSupported(c.value));
  }, []);

  const [playlist, setPlaylist] = useState<PlaylistItem[]>([]);
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number>(-1);
  const [isPlaylistMode, setIsPlaylistMode] = useState(false);

  // Derived dimensions
  const getCanvasDimensions = () => {
    const is1080p = resolution === '1080p';

    switch (aspectRatio) {
      case '9:16':
        return is1080p ? { w: 1080, h: 1920 } : { w: 720, h: 1280 };
      case '3:4':
        return is1080p ? { w: 1080, h: 1440 } : { w: 720, h: 960 };
      case '4:3':
        return is1080p ? { w: 1440, h: 1080 } : { w: 960, h: 720 };
      case '1:1':
        return is1080p ? { w: 1080, h: 1080 } : { w: 720, h: 720 };
      case '1:2':
        return is1080p ? { w: 2160, h: 4320 } : { w: 720, h: 1440 }; // Adjusted for 1:2
      case '2:1':
        return is1080p ? { w: 2160, h: 1080 } : { w: 1440, h: 720 };
      case '2:3':
        return is1080p ? { w: 1080, h: 1620 } : { w: 720, h: 1080 };
      case '3:2':
        return is1080p ? { w: 1620, h: 1080 } : { w: 1080, h: 720 };
      case '4:5':
        return is1080p ? { w: 1080, h: 1350 } : { w: 720, h: 900 };
      case '20:9':
        return is1080p ? { w: 2400, h: 1080 } : { w: 1600, h: 720 };
      case '21:9':
        return is1080p ? { w: 2560, h: 1080 } : { w: 1720, h: 720 };
      case '16:9':
      default:
        return is1080p ? { w: 1920, h: 1080 } : { w: 1280, h: 720 };
    }
  };


  const { w: canvasWidth, h: canvasHeight } = getCanvasDimensions();

  // Visibility Toggles (Shortcuts)
  const [showInfo, setShowInfo] = useState(true);
  const [showPlayer, setShowPlayer] = useState(true);

  // Derived State
  const activeSlide = visualSlides.find(
    s => s.type !== 'audio' && currentTime >= s.startTime && currentTime < s.endTime
  );

  const activeAudioSlides = visualSlides.filter(
    s => s.type === 'audio' && currentTime >= s.startTime && currentTime < s.endTime
  );

  // Adjusted lyrics based on offset
  const adjustedLyrics = useMemo(() => {
    if (lyricOffset === 0) return lyrics;
    return lyrics.map(l => ({
      ...l,
      time: l.time + lyricOffset,
      endTime: l.endTime !== undefined ? l.endTime + lyricOffset : undefined
    }));
  }, [lyrics, lyricOffset]);

  const currentLyricIndex = adjustedLyrics.findIndex((line, index) => {
    if (line.endTime !== undefined) {
      return currentTime >= line.time && currentTime < line.endTime;
    }
    const nextLine = adjustedLyrics[index + 1];
    return currentTime >= line.time && (!nextLine || currentTime < nextLine.time);
  });

  // --- Handlers ---

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setAudioSrc(url);

      // Initial Fallback Metadata
      const fallbackMeta = {
        title: file.name.replace(/\.[^/.]+$/, ""),
        artist: 'Unknown Artist',
        coverUrl: null,
      };
      setMetadata(fallbackMeta);

      // Use global window.jsmediatags loaded from CDN
      const jsmediatags = (window as any).jsmediatags;
      if (jsmediatags) {
        jsmediatags.read(file, {
          onSuccess: (tag: any) => {
            const { title, artist, picture } = tag.tags;
            let coverUrl = null;
            if (picture) {
              const { data, format } = picture;
              let base64String = "";
              for (let i = 0; i < data.length; i++) {
                base64String += String.fromCharCode(data[i]);
              }
              coverUrl = `data:${format};base64,${window.btoa(base64String)}`;
            }

            setMetadata({
              title: title || fallbackMeta.title,
              artist: artist || fallbackMeta.artist,
              coverUrl: coverUrl || null
            });
          },
          onError: (error: any) => {
            console.log('Error reading tags:', error);
          }
        });
      } else {
        console.warn("jsmediatags not found on window object");
      }

      // Reset play state
      setLyricOffset(0);
      setIsPlaying(false);
      setCurrentTime(0);
      if (audioRef.current) {
        audioRef.current.load();
      }
    }
    // Allow re-upload
    e.target.value = '';
  };

  const handleMetadataUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type.startsWith('video/')) {
        alert("Video upload is no longer supported.");
        return;
      }
      const url = URL.createObjectURL(file);
      setMetadata(prev => ({ ...prev, coverUrl: url, backgroundType: 'image' }));
    }
    // Allow re-upload
    e.target.value = '';
  };


  const handleLyricsUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const text = await file.text();
        const ext = file.name.split('.').pop()?.toLowerCase();
        let parsedLyrics: LyricLine[] = [];

        if (ext === 'lrc') {
          parsedLyrics = parseLRC(text);
        } else if (ext === 'srt') {
          parsedLyrics = parseSRT(text);
        }
        setLyrics(parsedLyrics);
      } catch (err) {
        console.error("Failed to parse lyrics:", err);
      }
    }
    // Allow re-upload
    e.target.value = '';
  };

  const handleFontUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!window.FontFace || !document.fonts) {
        return;
      }
      try {
        const url = URL.createObjectURL(file);
        const fontName = 'CustomFont';
        const font = new FontFace(fontName, `url(${url})`);
        await font.load();
        document.fonts.add(font);
        setCustomFontName(fontName);
      } catch (err) {
        console.error("Failed to load font:", err);
      }
    }
    // Allow re-upload
    e.target.value = '';
  };

  const playTrack = useCallback(async (index: number) => {
    if (index < 0 || index >= playlist.length) return;
    const track = playlist[index];

    // Load Audio
    const url = URL.createObjectURL(track.audioFile);
    setAudioSrc(url);

    // Metadata - use cover art from track if available
    setMetadata({
      title: track.metadata.title,
      artist: track.metadata.artist,
      coverUrl: track.metadata.coverUrl || null,
      backgroundType: 'image'
    });

    // Reset Lyrics
    setLyrics([]);

    // Load Lyrics
    if (track.parsedLyrics && track.parsedLyrics.length > 0) {
      setLyrics(track.parsedLyrics);
    } else if (track.lyricFile) {
      try {
        const text = await track.lyricFile.text();
        const ext = track.lyricFile.name.split('.').pop()?.toLowerCase();
        if (ext === 'lrc') setLyrics(parseLRC(text));
        else if (ext === 'srt') setLyrics(parseSRT(text));
      } catch (e) {
        console.error("Failed to load lyrics", e);
      }
    }

    setLyricOffset(0);
    setCurrentTrackIndex(index);
    // Auto-play after state update
    setTimeout(() => {
      if (audioRef.current) {
        audioRef.current.play().catch(e => console.log("Autoplay failed", e));
        setIsPlaying(true);
      }
    }, 100);
  }, [playlist]);

  const playNextSong = useCallback(() => {
    if (playlist.length === 0) return;
    const nextIndex = (currentTrackIndex + 1) % playlist.length;
    playTrack(nextIndex);
  }, [playlist, currentTrackIndex, playTrack]);

  const playPreviousSong = useCallback(() => {
    if (playlist.length === 0) return;
    const prevIndex = (currentTrackIndex - 1 + playlist.length) % playlist.length;
    playTrack(prevIndex);
  }, [playlist, currentTrackIndex, playTrack]);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        // If no audio source is loaded but we have a playlist, start the first track
        if (!audioSrc && playlist.length > 0) {
          playTrack(0);
        } else {
          audioRef.current.play().catch(console.error);
          setIsPlaying(true);
        }
      }
    }
  };

  const stopPlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
      setCurrentTime(0);
    }
  }, []);

  const toggleRepeat = () => {
    setRepeatMode(prev => {
      if (prev === 'off') return 'all';
      if (prev === 'all') return 'one';
      return 'off';
    });
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      if (isRendering) {
        setRenderProgress((audioRef.current.currentTime / duration) * 100);
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVol = parseFloat(e.target.value);
    setVolume(newVol);
    if (audioRef.current) {
      audioRef.current.volume = newVol;
    }
    setIsMuted(newVol === 0);
  };

  // --- Video Export Logic ---

  const handleExportVideo = async () => {
    if (!audioRef.current || !canvasRef.current) return;

    // Determine Render Scope
    const isPlaylistRender = renderConfig.renderMode === 'playlist' && playlist.length > 0;
    const queue: {
      audioSrc: string;
      lyrics: LyricLine[];
      metadata: AudioMetadata;
      duration?: number;
      isFileSource?: boolean;
    }[] = [];

    if (isPlaylistRender) {
      // Build Queue from Playlist
      for (const item of playlist) {
        // Prepare lyrics
        let trackLyrics: LyricLine[] = [];
        if (item.parsedLyrics && item.parsedLyrics.length > 0) {
          trackLyrics = item.parsedLyrics;
        } else if (item.lyricFile) {
          try {
            const text = await item.lyricFile.text();
            const ext = item.lyricFile.name.split('.').pop()?.toLowerCase();
            if (ext === 'lrc') trackLyrics = parseLRC(text);
            else if (ext === 'srt') trackLyrics = parseSRT(text);
          } catch (e) {
            console.error("Failed to parse lyrics for playlist item", e);
          }
        }

        // Prepare Audio URL
        const url = URL.createObjectURL(item.audioFile);

        queue.push({
          audioSrc: url,
          lyrics: trackLyrics,
          metadata: item.metadata,
          isFileSource: true // Mark to revoke later
        });
      }
    } else {
      // Single Track (Current)
      if (!audioSrc) return;
      queue.push({
        audioSrc: audioSrc,
        lyrics: adjustedLyrics, // Use currently adjusted lyrics (with offset)
        metadata: metadata,
        isFileSource: false
      });
    }

    if (queue.length === 0) return;

    // Set rendering state immediately without confirmation dialog
    setIsRendering(true);
    setRenderProgress(0);
    abortRenderRef.current = false;
    setShowRenderSettings(false);

    // Stop and Reset
    stopPlayback();
    setRepeatMode('off');

    // Stop auto-hide immediately and bypass it during render
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    setIsMouseIdle(false);
    setBypassAutoHide(true);



    const audioEl = audioRef.current;
    const currentPreset = preset;

    // 1. Preload Images & Videos (Global Resources)
    const imageMap = new Map<string, HTMLImageElement>();
    const videoMap = new Map<string, HTMLVideoElement>();
    const audioMap = new Map<string, HTMLAudioElement>();
    const loadPromises: Promise<void>[] = [];

    // Helper Loaders
    const loadImg = (id: string, url: string) => {
      return new Promise<void>((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => { imageMap.set(id, img); resolve(); };
        img.onerror = () => resolve();
        img.src = url;
      });
    };

    const loadVid = (id: string, url: string) => {
      return new Promise<void>((resolve) => {
        const vid = document.createElement('video');
        vid.crossOrigin = "anonymous";
        vid.muted = true;
        vid.playsInline = true;
        vid.preload = "auto";
        let resolved = false;
        const safeResolve = () => { if (!resolved) { resolved = true; videoMap.set(id, vid); resolve(); } };
        vid.oncanplay = () => { if (!resolved) { vid.currentTime = 0.001; } };
        vid.onseeked = () => safeResolve();
        vid.onerror = () => { console.warn("Failed to load video:", url); safeResolve(); };
        setTimeout(() => safeResolve(), 5000);
        vid.src = url;
        vid.load();
      });
    };

    const loadAudio = (id: string, url: string) => {
      return new Promise<void>((resolve) => {
        const aud = document.createElement('audio');
        aud.crossOrigin = "anonymous";
        aud.onloadedmetadata = () => { audioMap.set(id, aud); resolve(); };
        aud.onerror = () => resolve();
        aud.src = url;
      });
    };

    // Preload Visual Slides (Global)
    visualSlides.forEach(s => {
      if (s.type === 'video') loadPromises.push(loadVid(s.id, s.url));
      else if (s.type === 'audio') loadPromises.push(loadAudio(s.id, s.url));
      else loadPromises.push(loadImg(s.id, s.url));
    });

    try {
      await Promise.all(loadPromises);
    } catch (e) {
      console.error("Asset preloading failed", e);
    }

    if (abortRenderRef.current) {
      setIsRendering(false);
      if (isPlaylistRender) queue.forEach(q => q.isFileSource && URL.revokeObjectURL(q.audioSrc));
      return;
    }

    // 3. Setup Audio Mixing & Recording
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setIsRendering(false);
      return;
    }

    const canvasStream = canvas.captureStream(renderFps);
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const mixerDest = audioContext.createMediaStreamDestination();

    // Connect Source to Mixer
    const source = audioContext.createMediaElementSource(audioEl);
    source.connect(mixerDest);

    // Connect Preloads
    videoMap.forEach((vidElement) => {
      const src = audioContext.createMediaElementSource(vidElement);
      src.connect(mixerDest);
    });
    audioMap.forEach((audElement) => {
      const src = audioContext.createMediaElementSource(audElement);
      src.connect(mixerDest);
    });

    const combinedStream = new MediaStream([...canvasStream.getVideoTracks(), ...mixerDest.stream.getAudioTracks()]);

    // Setup MediaRecorder
    const getPreferredMimeType = () => {
      if (renderCodec !== 'auto' && MediaRecorder.isTypeSupported(renderCodec)) return renderCodec;
      const types = [
        'video/webm; codecs=vp9,opus', 'video/webm; codecs=vp9', 'video/webm; codecs=av1',
        'video/mp4; codecs="av01.0.05M.08"', 'video/mp4; codecs="avc1.4D401E, mp4a.40.2"',
        'video/mp4; codecs="avc1.64001E, mp4a.40.2"', 'video/mp4', 'video/webm'
      ];
      for (const t of types) { if (MediaRecorder.isTypeSupported(t)) return t; }
      return 'video/webm';
    };

    const mimeType = getPreferredMimeType();
    const baseBitrate = resolution === '1080p' ? 8000000 : 4000000;
    const fpsMultiplier = renderFps > 30 ? 1.5 : 1.0;
    const qualityMultiplier = renderQuality === 'high' ? 1.5 : renderQuality === 'low' ? 0.5 : 1.0;
    const bitrate = baseBitrate * fpsMultiplier * qualityMultiplier;

    const mediaRecorder = new MediaRecorder(combinedStream, { mimeType, videoBitsPerSecond: bitrate });
    mediaRecorderRef.current = mediaRecorder;

    const chunks: Blob[] = [];
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      if (!abortRenderRef.current) {
        const blob = new Blob(chunks, { type: mimeType });
        const downloadBlob = (blobToDownload: Blob) => {
          const url = URL.createObjectURL(blobToDownload);
          const a = document.createElement('a');
          a.href = url;
          const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
          const filename = isPlaylistRender
            ? `Playlist_${queue.length}_Songs_${aspectRatio.replace(':', '-')}.${ext}`
            : `${queue[0].metadata.title || 'video'}_${aspectRatio.replace(':', '-')}.${ext}`;

          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        };

        downloadBlob(blob);
      }

      // Cleanup
      audioContext.close();
      setIsRendering(false);
      setAudioElementKey(prev => prev + 1);
      if (isPlaylistRender) queue.forEach(q => q.isFileSource && URL.revokeObjectURL(q.audioSrc));
    };

    // --- RENDER ORCHESTRATION ---
    let queueIndex = 0;
    let currentRenderLyrics: LyricLine[] = [];
    let currentRenderMetadata: AudioMetadata = metadata;
    let currentRenderDuration = 0;

    let lastRenderTime = 0;
    const renderInterval = 1000 / renderFps;

    const renderFrameLoop = (now: number) => {
      if (abortRenderRef.current) return;

      if (mediaRecorder.state === 'recording' || mediaRecorder.state === 'paused') {
        requestAnimationFrame(renderFrameLoop);
      }

      const elapsed = now - lastRenderTime;
      if (elapsed < renderInterval) return;
      lastRenderTime = now - (elapsed % renderInterval);

      const t = audioEl.currentTime;

      if (currentRenderDuration > 0) {
        setRenderProgress(((t / currentRenderDuration) * 100));
      }

      // Sync Backgrounds/Videos
      videoMap.forEach((v, id) => {
        if (id === 'background') {
          const vidDuration = v.duration || 1;
          const targetTime = t % vidDuration;
          if (Math.abs(v.currentTime - targetTime) > 0.1) v.currentTime = targetTime;
          if (v.paused) v.play().catch(() => { });
        } else {
          const s = visualSlides.find(sl => sl.id === id);
          if (s) {
            if (t >= s.startTime && t < s.endTime) {
              const rel = t - s.startTime;
              if (Math.abs(v.currentTime - rel) > 0.5) v.currentTime = rel;
              const shouldMute = s.isMuted !== false;
              if (v.muted !== shouldMute) v.muted = shouldMute;
              if (v.paused) v.play().catch(() => { });
            } else {
              if (!v.paused) v.pause();
              if (!v.muted) v.muted = true;
            }
          }
        }
      });

      // Sync Audio Slides
      audioMap.forEach((a, id) => {
        const s = visualSlides.find(sl => sl.id === id);
        if (s) {
          if (t >= s.startTime && t < s.endTime) {
            const rel = t - s.startTime;
            if (Math.abs(a.currentTime - rel) > 0.2) a.currentTime = rel;
            const shouldMute = s.isMuted === true;
            if (a.muted !== shouldMute) a.muted = shouldMute;
            if (a.paused) a.play().catch(() => { });
          } else {
            if (!a.paused) a.pause();
            if (!a.muted) a.muted = true;
          }
        }
      });

      if (ctx) {
        drawCanvasFrame(
          ctx,
          canvas.width,
          canvas.height,
          t,
          currentRenderLyrics,
          currentRenderMetadata,
          visualSlides,
          imageMap,
          videoMap,
          currentPreset,
          customFontName,
          renderConfig.fontSizeScale,
          renderConfig.backgroundBlurStrength > 0,
          currentRenderDuration,
          renderConfig,
          renderConfig.renderMode === 'current' || (queueIndex === queue.length - 1),
          renderConfig.renderMode === 'current' || (queueIndex === 0)
        );
      }
    };


    const processNextTrack = async () => {
      if (abortRenderRef.current) {
        if (mediaRecorder.state !== 'inactive') mediaRecorder.stop();
        return;
      }

      if (queueIndex >= queue.length) {
        await new Promise(r => setTimeout(r, 500));
        mediaRecorder.stop();
        return;
      }

      const track = queue[queueIndex];

      if (mediaRecorder.state === 'recording') {
        mediaRecorder.pause();
      }

      // 1. Update State
      currentRenderLyrics = track.lyrics;
      currentRenderMetadata = track.metadata;
      currentRenderDuration = 0;

      // 2. Load Cover Art into imageMap
      if (track.metadata.coverUrl) {
        if (track.metadata.backgroundType === 'video') {
          // Video background support removed
        } else {
          await loadImg('cover', track.metadata.coverUrl);
        }
      }

      // 3. Load Audio
      audioEl.pause();
      audioEl.src = track.audioSrc;
      audioEl.load();

      // Wait for ready
      await new Promise<void>((resolve) => {
        const onCanPlay = () => {
          audioEl.removeEventListener('canplay', onCanPlay);
          resolve();
        };
        audioEl.addEventListener('canplay', onCanPlay);
        if (audioEl.readyState >= 3) onCanPlay();
      });

      currentRenderDuration = audioEl.duration;

      // 4. Play and Record
      if (mediaRecorder.state === 'inactive') {
        if (audioContext.state === 'suspended') await audioContext.resume();
        mediaRecorder.start();
        requestAnimationFrame(renderFrameLoop);
      } else if (mediaRecorder.state === 'paused') {
        mediaRecorder.resume();
      }
      await audioEl.play();

      // Wait for end
      await new Promise<void>((resolve) => {
        const onEnded = () => {
          audioEl.removeEventListener('ended', onEnded);
          resolve();
        };
        audioEl.addEventListener('ended', onEnded);
      });

      // 5. Next
      queueIndex++;
      processNextTrack();
    };


    // Start Processing Queue
    await processNextTrack();
  };

  // Keep export function ref up to date for shortcuts
  useEffect(() => {
    exportVideoRef.current = handleExportVideo;
  });



  const handleAbortRender = useCallback(() => {
    abortRenderRef.current = true;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    } else {
      setIsRendering(false);
    }
    stopPlayback();
  }, [stopPlayback]);

  // Scroll active lyric into view
  const scrollToActiveLyric = useCallback(() => {
    if (currentLyricIndex !== -1 && lyricsContainerRef.current) {
      const activeEl = lyricsContainerRef.current.querySelector('[data-lyric-active="true"]') as HTMLElement;
      if (activeEl) {
        const container = lyricsContainerRef.current;
        if (activeEl.offsetHeight === 0) return;

        const elOffsetTop = activeEl.offsetTop;
        const elHeight = activeEl.offsetHeight;
        const containerHeight = container.clientHeight;

        let positionRatio = 0.5;
        if (renderConfig.contentPosition === 'top') positionRatio = 0.25;
        if (renderConfig.contentPosition === 'bottom') positionRatio = 0.75;

        const targetScrollTop = elOffsetTop - (containerHeight * positionRatio) + (elHeight / 2);

        container.scrollTo({
          top: targetScrollTop,
          behavior: 'smooth'
        });
      }
    }
  }, [currentLyricIndex, preset, renderConfig.contentPosition]);

  // Trigger scroll on lyric change
  useEffect(() => {
    scrollToActiveLyric();
  }, [scrollToActiveLyric]);

  // Re-scroll after visibility changes (wait for CSS transition to complete)
  useEffect(() => {
    const timer = setTimeout(() => {
      scrollToActiveLyric();
    }, 550);
    return () => clearTimeout(timer);
  }, [isMouseIdle, bypassAutoHide, showInfo, showPlayer, activeTab, isPlaylistMode, scrollToActiveLyric]);

  const controlsTimeoutRef = useRef<number | null>(null);

  // Helper to reset idle timer
  const resetIdleTimer = useCallback(() => {
    setIsMouseIdle(false);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }

    if (!isRendering) {
      const timeout = window.setTimeout(() => {
        setIsMouseIdle(true);
      }, 3000);

      controlsTimeoutRef.current = timeout;
    }
  }, [isRendering]);

  // Handle idle mouse to hide controls
  const handleMouseMove = () => {
    resetIdleTimer();
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const ignoredKeysForIdle = [' ', 'k', 's', 't', 'l', 'r', 'f', 'h', 'm', 'j', 'd', 'e', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'meta', 'control', 'shift', 'alt', 'printscreen', 'fn', '+', '-', '='];

      if (!ignoredKeysForIdle.includes(key)) {
        resetIdleTimer();
      }

      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (isRendering) {
        if (key === 'escape') {
          handleAbortRender();
        }
        return;
      }

      switch (e.key.toLowerCase()) {
        case ' ':
        case 'k':
          e.preventDefault();
          togglePlay();
          break;
        case 's':
          e.preventDefault();
          stopPlayback();
          break;
        case 'n':
          e.preventDefault();
          playNextSong();
          break;
        case 'b':
          e.preventDefault();
          playPreviousSong();
          break;
        case 'r':
          e.preventDefault();
          toggleRepeat();
          break;
        case 'l':
          e.preventDefault();
          const newMode = !isPlaylistMode;
          setIsPlaylistMode(newMode);
          if (newMode) setActiveTab(TabView.PLAYER);
          break;
        case 'h':
          e.preventDefault();
          setBypassAutoHide(prev => !prev);
          break;
        case 'f':
          toggleFullscreen();
          break;
        case 'i':
          setShowInfo(prev => !prev);
          break;
        case 'p':
          setShowPlayer(prev => !prev);
          break;
        case 'd':
          e.preventDefault();
          setShowRenderSettings(prev => !prev);
          break;
        case 't':
          if (isPlaylistMode) {
            setIsPlaylistMode(false);
            setActiveTab(TabView.EDITOR);
          } else {
            setActiveTab(prev => prev === TabView.PLAYER ? TabView.EDITOR : TabView.PLAYER);
          }
          break;
        case 'm':
          e.preventDefault();
          setIsMuted(prev => !prev);
          break;
        case 'j':
          e.preventDefault();
          const presets: VideoPreset[] = [
            'default', 'large', 'classic', 'large_upper', 'monospace',
            'big_center', 'metal', 'kids', 'sad', 'romantic', 'tech',
            'gothic', 'testing', 'testing_up', 'slideshow', 'just_video', 'subtitle', 'none'
          ];
          setPreset(prev => {
            const idx = presets.indexOf(prev);
            const nextIdx = (idx + 1) % presets.length;
            return presets[nextIdx];
          });
          break;
        case 'arrowleft':
          e.preventDefault();
          if (audioRef.current) {
            const newTime = Math.max(0, audioRef.current.currentTime - 5);
            audioRef.current.currentTime = newTime;
            setCurrentTime(newTime);
          }
          break;
        case 'arrowright':
          e.preventDefault();
          if (audioRef.current) {
            const newTime = Math.min(duration, audioRef.current.currentTime + 5);
            audioRef.current.currentTime = newTime;
            setCurrentTime(newTime);
          }
          break;
        case 'arrowup':
          e.preventDefault();
          if (lyricsContainerRef.current) {
            lyricsContainerRef.current.scrollBy({ top: -100, behavior: 'smooth' });
          }
          break;
        case 'arrowdown':
          e.preventDefault();
          if (lyricsContainerRef.current) {
            lyricsContainerRef.current.scrollBy({ top: 100, behavior: 'smooth' });
          }
          break;
        case '+':
        case '=':
          e.preventDefault();
          setRenderConfig(prev => ({ ...prev, fontSizeScale: Math.min(prev.fontSizeScale + 0.1, 3.0) }));
          break;
        case '-':
          e.preventDefault();
          setRenderConfig(prev => ({ ...prev, fontSizeScale: Math.max(prev.fontSizeScale - 0.1, 0.1) }));
          break;
        case 'e':
          if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
            e.preventDefault();
            exportVideoRef.current();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, repeatMode, activeTab, isRendering, resetIdleTimer, handleAbortRender, isPlaylistMode, playNextSong, playPreviousSong]);

  // Smooth Playback Animation Loop (Throttled to ~30fps)
  useEffect(() => {
    let animationFrameId: number;
    let lastFrameTime = 0;
    const fpsInterval = 1000 / 30;

    const animate = (now: number) => {
      if (audioRef.current && !audioRef.current.paused && isPlaying) {
        animationFrameId = requestAnimationFrame(animate);

        const elapsed = now - lastFrameTime;

        if (elapsed > fpsInterval) {
          lastFrameTime = now - (elapsed % fpsInterval);
          setCurrentTime(audioRef.current.currentTime);
        }
      }
    };

    if (isPlaying && !isRendering) {
      animationFrameId = requestAnimationFrame(animate);
    }

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isPlaying, isRendering]);

  // Combine manual visibility with mouse idle state
  const isHeaderVisible = showInfo && (!isMouseIdle || bypassAutoHide) && !isRendering;
  const isFooterVisible = showPlayer && (!isMouseIdle || bypassAutoHide) && !isRendering;

  const activeVideoRef = useRef<HTMLVideoElement>(null);


  useEffect(() => {
    // 1. Active Slide Video
    if (activeSlide?.type === 'video' && activeVideoRef.current) {
      const vid = activeVideoRef.current;

      if (isRendering) {
        if (!vid.paused) vid.pause();
      } else {
        const relTime = currentTime - activeSlide.startTime;
        if (Math.abs(vid.currentTime - relTime) > 0.1) {
          vid.currentTime = relTime;
        }
        const shouldMute = activeSlide.isMuted !== false;
        if (vid.muted !== shouldMute) vid.muted = shouldMute;
        const targetVolume = activeSlide.volume !== undefined ? activeSlide.volume : 1;
        if (Math.abs(vid.volume - targetVolume) > 0.01) vid.volume = targetVolume;
        if (isPlaying && vid.paused) {
          vid.play().catch(() => { });
        } else if (!isPlaying && !vid.paused) {
          vid.pause();
        }
      }
    }



    activeAudioSlides.forEach(s => {
      const aud = document.getElementById(`audio-preview-${s.id}`) as HTMLAudioElement;
      if (aud) {
        const relTime = currentTime - s.startTime;
        if (Math.abs(aud.currentTime - relTime) > 0.2) aud.currentTime = relTime;
        const shouldMute = s.isMuted === true;
        if (aud.muted !== shouldMute) aud.muted = shouldMute;
        const targetVol = s.volume !== undefined ? s.volume : 1;
        if (Math.abs(aud.volume - targetVol) > 0.01) aud.volume = targetVol;
        if (isPlaying && aud.paused) aud.play().catch(() => { });
        else if (!isPlaying && !aud.paused) aud.pause();
      }
    });

  }, [currentTime, isPlaying, activeSlide, metadata, activeAudioSlides]);

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onTouchStart={handleMouseMove}
      className={`relative w-full h-[100dvh] bg-black overflow-hidden flex font-sans select-none ${isMouseIdle && !bypassAutoHide ? 'cursor-none' : ''}`}
    >
      <audio
        key={audioElementKey}
        ref={audioRef}
        src={audioSrc || undefined}
        loop={repeatMode === 'one'}
        muted={isMuted}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => {
          if (isRendering) return;
          if (repeatMode !== 'one') {
            if (isPlaylistMode && playlist.length > 0) {
              if (repeatMode === 'all') {
                playNextSong();
              } else {
                if (currentTrackIndex < playlist.length - 1) {
                  playNextSong();
                } else {
                  setIsPlaying(false);
                }
              }
            } else {
              if (repeatMode === 'all') {
                if (audioRef.current) {
                  audioRef.current.currentTime = 0;
                  audioRef.current.play();
                }
              } else {
                setIsPlaying(false);
              }
            }
          }
        }}
        crossOrigin="anonymous"
      />

      {activeAudioSlides.map(s => (
        <audio
          key={s.id}
          id={`audio-preview-${s.id}`}
          src={s.url}
          className="hidden"
          playsInline
        />
      ))}

      {/* Rendering Canvas - keep slightly visible if hardware acceleration issue, otherwise hidden */}
      <canvas
        ref={canvasRef}
        width={canvasWidth}
        height={canvasHeight}
        className={`absolute top-0 left-0 pointer-events-none opacity-0 ${isRendering ? 'block' : 'hidden'}`}
      />

      <div className="absolute inset-0 bg-black overflow-hidden pointer-events-none">
        {renderConfig.backgroundSource === 'color' && (
          <div className="absolute inset-0" style={{ backgroundColor: renderConfig.backgroundColor }} />
        )}
        {renderConfig.backgroundSource === 'gradient' && (
          <div className="absolute inset-0" style={{ background: renderConfig.backgroundGradient }} />
        )}
        {renderConfig.backgroundSource === 'smart-gradient' && (
          <div className="absolute inset-0"
            style={{
              background: (() => {
                const hex = renderConfig.backgroundColor || '#312e81';
                const r = parseInt(hex.slice(1, 3), 16);
                const g = parseInt(hex.slice(3, 5), 16);
                const b = parseInt(hex.slice(5, 7), 16);
                const color = `${r},${g},${b}`;
                const darker = `${Math.floor(r * 0.6)},${Math.floor(g * 0.6)},${Math.floor(b * 0.6)}`;
                return `linear-gradient(to bottom right, rgb(${color}), rgb(${darker}) 50%, #000000)`;
              })()
            }}
          />
        )}
        {(renderConfig.backgroundSource === 'timeline' || renderConfig.backgroundSource === 'custom') && metadata.coverUrl && (
          <div
            className={`absolute inset-0 bg-cover bg-center transition-all duration-700 ease-in-out ${renderConfig.backgroundSource === 'custom' || !activeSlide ? 'opacity-60' : 'opacity-0'}`}
            style={{ backgroundImage: `url(${metadata.coverUrl})` }}
          />
        )}

        {!metadata.coverUrl && !activeSlide && (renderConfig.backgroundSource === 'timeline' || renderConfig.backgroundSource === 'custom') && (
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-900 via-purple-900 to-black opacity-80"></div>
        )}

        <div className={`absolute inset-0 transition-opacity duration-500 ${activeSlide && renderConfig.backgroundSource === 'timeline' ? 'opacity-100' : 'opacity-0'}`}>
          {activeSlide && renderConfig.backgroundSource === 'timeline' && (
            activeSlide.type === 'video' ? (
              <video
                key={activeSlide.id}
                ref={activeVideoRef}
                src={activeSlide.url}
                className="w-full h-full object-cover"
                muted={activeSlide.isMuted !== false}
                playsInline
              />
            ) : (
              <div
                className="w-full h-full bg-cover bg-center"
                style={{ backgroundImage: `url(${activeSlide.url})` }}
              />
            )
          )}
        </div>

        <div
          className="absolute inset-0 bg-black/30 transition-all duration-700"
          style={{
            backdropFilter: (renderConfig.backgroundBlurStrength > 0) ? `blur(${renderConfig.backgroundBlurStrength}px)` : (isBlurEnabled ? 'blur(12px)' : 'none'),
            backgroundColor: (renderConfig.backgroundBlurStrength > 0 || isBlurEnabled) ? 'rgba(0,0,0,0.4)' : undefined
          }}
        ></div>
      </div>

      <div className="relative z-10 flex-1 flex flex-col transition-all duration-500">

        <div className={`transition-all duration-500 ease-in-out overflow-hidden ${isHeaderVisible ? 'max-h-80 md:max-h-40 opacity-100' : 'max-h-0 opacity-0'}`}>
          <div className="p-4 md:p-6 flex flex-col md:flex-row justify-between items-start gap-4 md:gap-0">
            <div className="flex gap-4">
              <div className="flex gap-4 items-center">
                <div className={`relative group w-16 h-16 rounded-md overflow-hidden bg-zinc-800 shadow-lg border border-white/10 shrink-0 transition-opacity duration-300 ${!renderConfig.showCover ? 'opacity-0 scale-75 pointer-events-none w-0 h-0 -ml-4' : 'opacity-100 scale-100'}`}>
                  {metadata.coverUrl ? (
                    <img src={metadata.coverUrl} alt="Cover" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-500">
                      <Music size={24} />
                    </div>
                  )}
                  <label className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                    <Upload size={20} className="text-white" />
                    <input type="file" accept="image/*" className="hidden" onChange={handleMetadataUpload} />
                  </label>
                </div>
                <div>
                  <h1 className={`text-xl font-bold text-white drop-shadow-md line-clamp-1 transition-opacity duration-300 ${!renderConfig.showTitle ? 'opacity-0' : 'opacity-100'}`}>{metadata.title}</h1>
                  <div className={`flex items-center gap-2 transition-opacity duration-300 ${!renderConfig.showArtist ? 'opacity-0' : 'opacity-100'}`}>
                    <p className="text-zinc-300 text-sm drop-shadow-md">{metadata.artist}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">

              <button
                onClick={() => setBypassAutoHide(!bypassAutoHide)}
                className={`p-2 rounded-full transition-colors ${bypassAutoHide ? 'bg-purple-600/50 text-white' : 'bg-black/30 text-zinc-300 hover:bg-white/10'}`}
                title="Bypass Auto-hide (H)"
              >
                {bypassAutoHide ? <Eye size={20} /> : <EyeOff size={20} />}
              </button>
              <button
                onClick={() => {
                  const newMode = !isPlaylistMode;
                  setIsPlaylistMode(newMode);
                  if (newMode) setActiveTab(TabView.PLAYER);
                }}
                className={`p-2 rounded-full transition-colors ${isPlaylistMode ? 'bg-orange-600 text-white' : 'bg-black/30 text-zinc-300 hover:bg-white/10'}`}
                title="Toggle Playlist (L)"
              >
                <ListMusic size={20} />
              </button>
              <button
                onClick={() => {
                  if (isPlaylistMode) setIsPlaylistMode(false);
                  setActiveTab(activeTab === TabView.PLAYER ? TabView.EDITOR : TabView.PLAYER);
                }}
                className={`p-2 rounded-full transition-colors ${activeTab === TabView.EDITOR && !isPlaylistMode ? 'bg-purple-600 text-white' : 'bg-black/30 text-zinc-300 hover:bg-white/10'}`}
                title="Toggle Timeline (T)"
              >
                <Film size={20} />
              </button>
              <button
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setShowRenderSettings(!showRenderSettings);
                }}
                className={`p-2 rounded-full transition-colors ${showRenderSettings ? 'bg-purple-600 text-white' : 'bg-black/30 text-zinc-300 hover:bg-white/10'}`}
                title="Render Settings"
              >
                <Settings size={20} />
              </button>
              <button
                onClick={toggleFullscreen}
                className="p-2 rounded-full bg-black/30 text-zinc-300 hover:bg-white/10 transition-colors"
                title="Fullscreen (F)"
              >
                {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
              </button>
            </div>
          </div>
        </div>

        <div className={`flex-1 flex justify-center overflow-hidden relative ${renderConfig.contentPosition === 'top' ? 'items-start pt-[10vh]' : renderConfig.contentPosition === 'bottom' ? 'items-end pb-[10vh]' : 'items-center'}`}>
          {lyrics.length > 0 ? (
            <div
              ref={lyricsContainerRef}
              className={`w-full max-w-5xl max-h-full overflow-y-auto no-scrollbar px-4 md:px-6 space-y-4 md:space-y-6 transition-all duration-500 lyrics-root ${renderConfig.textAlign === 'left' ? 'text-left' : renderConfig.textAlign === 'right' ? 'text-right' : 'text-center'
                } ${!renderConfig.showLyrics ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
              style={{
                maskImage: (isHeaderVisible || isFooterVisible)
                  ? 'linear-gradient(to bottom, transparent, black 10%, black 90%, transparent)'
                  : 'none'
              }}
            >
              <style>{`
                .lyrics-root .text-lg { font-size: calc(1.125rem * ${renderConfig.fontSizeScale}); line-height: calc(1.75rem * ${renderConfig.fontSizeScale}); }
                .lyrics-root .text-xl { font-size: calc(1.25rem * ${renderConfig.fontSizeScale}); line-height: calc(1.75rem * ${renderConfig.fontSizeScale}); }
                .lyrics-root .text-2xl { font-size: calc(1.5rem * ${renderConfig.fontSizeScale}); line-height: calc(2rem * ${renderConfig.fontSizeScale}); }
                .lyrics-root .text-3xl { font-size: calc(1.875rem * ${renderConfig.fontSizeScale}); line-height: calc(2.25rem * ${renderConfig.fontSizeScale}); }
                .lyrics-root .text-4xl { font-size: calc(2.25rem * ${renderConfig.fontSizeScale}); line-height: calc(2.5rem * ${renderConfig.fontSizeScale}); }
                .lyrics-root .text-5xl { font-size: calc(3rem * ${renderConfig.fontSizeScale}); }
                .lyrics-root .text-6xl { font-size: calc(3.75rem * ${renderConfig.fontSizeScale}); }
                .lyrics-root .text-7xl { font-size: calc(4.5rem * ${renderConfig.fontSizeScale}); }
                .lyrics-root .text-8xl { font-size: calc(6rem * ${renderConfig.fontSizeScale}); }
              `}</style>
              <div className={`transition-all duration-500 ${renderConfig.contentPosition === 'center' ? ((activeTab === TabView.EDITOR || isPlaylistMode) ? 'h-[25vh]' : (!isHeaderVisible && !isFooterVisible) ? 'h-[50vh]' : 'h-[40vh]') : 'h-0'}`}></div>
              {adjustedLyrics.map((line, idx) => {
                const isActive = idx === currentLyricIndex;
                const isEditor = activeTab === TabView.EDITOR || isPlaylistMode;
                const isPortraitPreview = ['9:16', '3:4', '1:1', '1:2', '2:3'].includes(aspectRatio);
                const transEffect = renderConfig.transitionEffect;

                // Filter based on Display Mode
                const diff = idx - currentLyricIndex;
                let shouldShow = true;
                if (renderConfig.lyricDisplayMode === 'active-only') shouldShow = (diff === 0);
                else if (renderConfig.lyricDisplayMode === 'next-only') shouldShow = (diff === 0 || diff === 1);
                else if (renderConfig.lyricDisplayMode === 'previous-next') shouldShow = (diff >= -1 && diff <= 1);

                if (!shouldShow) return null;

                let containerClass = 'transition-[color,background-color,border-color,text-decoration-color,fill,stroke,opacity,box-shadow,transform,filter,backdrop-filter,text-shadow] duration-500 cursor-pointer whitespace-pre-wrap ';

                if (isActive) {
                  if (transEffect === 'slide') containerClass += 'translate-y-0 opacity-100 ';
                  else if (transEffect === 'zoom') containerClass += 'scale-100 opacity-100 ';
                  else if (transEffect === 'float') containerClass += 'translate-y-0 opacity-100 ';
                  else if (transEffect === 'blur') containerClass += 'blur-0 opacity-100 ';
                  else if (transEffect === 'fade') containerClass += 'opacity-100 ';
                  else if (transEffect === 'drop') containerClass += 'trans-drop-enter opacity-100 ';
                  else if (transEffect === 'lightspeed') containerClass += 'trans-lightspeed-enter opacity-100 ';
                  else if (transEffect === 'roll') containerClass += 'trans-roll-enter opacity-100 ';
                  else if (transEffect === 'elastic') containerClass += 'trans-elastic-enter opacity-100 ';
                  else if (transEffect === 'flip') containerClass += 'trans-flip-enter opacity-100 ';
                  else if (transEffect === 'rotate-in') containerClass += 'trans-rotate-in-enter opacity-100 ';
                  else if (transEffect === 'spiral') containerClass += 'trans-spiral-enter opacity-100 ';
                  else if (transEffect === 'shatter') containerClass += 'trans-shatter-enter opacity-100 ';
                  else containerClass += 'opacity-100 ';
                } else {
                  if (transEffect === 'slide') containerClass += 'translate-y-4 opacity-0 ';
                  else if (transEffect === 'zoom') containerClass += 'scale-75 opacity-0 ';
                  else if (transEffect === 'float') containerClass += 'translate-y-8 opacity-0 ';
                  else if (transEffect === 'blur') containerClass += 'blur-md opacity-0 ';
                  else if (transEffect === 'fade') containerClass += 'opacity-50 ';
                  else if (transEffect === 'drop') containerClass += 'trans-drop-exit opacity-0 ';
                  else if (transEffect === 'roll') containerClass += 'trans-roll-exit opacity-0 ';
                  else containerClass += 'opacity-0 ';
                  if (transEffect === 'none') containerClass = containerClass.replace('opacity-0', 'opacity-50');
                }

                let activeClass = '';
                let inactiveClass = '';
                if (preset === 'large' || preset === 'large_upper') {
                  const portraitActive = isEditor ? 'text-4xl' : 'text-6xl';
                  const landscapeActive = isEditor ? 'text-6xl' : 'text-8xl';
                  const activeSize = isPortraitPreview ? portraitActive : landscapeActive;
                  const inactiveSize = isPortraitPreview ? (isEditor ? 'text-xl' : 'text-2xl') : (isEditor ? 'text-2xl' : 'text-3xl');
                  activeClass = `${activeSize} font-black text-white ${preset === 'large_upper' ? 'uppercase' : ''} tracking-tight text-left pl-4`;
                  inactiveClass = `${inactiveSize} text-zinc-600/40 hover:text-zinc-400 text-left pl-4`;
                } else if (preset === 'subtitle') {
                  const activeSize = isPortraitPreview ? (isEditor ? 'text-2xl' : 'text-3xl') : (isEditor ? 'text-3xl' : 'text-4xl');
                  activeClass = `${activeSize} text-white tracking-wide text-center`;
                  inactiveClass = 'hidden';
                  let bottomClass = 'bottom-16';
                  if (isEditor && isFooterVisible) bottomClass = 'bottom-[480px]';
                  else if (isEditor) bottomClass = 'bottom-[320px]';
                  else if (isFooterVisible) bottomClass = 'bottom-40';
                  containerClass += `fixed ${bottomClass} left-1/2 -translate-x-1/2 w-full max-w-4xl px-4 `;
                } else {
                  const activeSize = isPortraitPreview ? (isEditor ? 'text-2xl' : 'text-3xl') : (isEditor ? 'text-3xl' : 'text-5xl');
                  const inactiveSize = isPortraitPreview ? (isEditor ? 'text-lg' : 'text-xl') : (isEditor ? 'text-xl' : 'text-2xl');
                  activeClass = `${activeSize} font-bold text-white scale-105 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]`;
                  inactiveClass = `${inactiveSize} text-zinc-500/60 hover:text-zinc-300 drop-shadow-sm`;
                }

                let textEffectStyles: React.CSSProperties = {
                  color: (preset === 'custom') ? renderConfig.fontColor : undefined,
                  fontWeight: (preset === 'custom') ? renderConfig.fontWeight : undefined,
                  fontFamily: customFontName ? `"${customFontName}", sans-serif` : (renderConfig.fontFamily !== 'sans-serif' ? renderConfig.fontFamily : undefined),
                };

                let textContent = line.text;
                if (isActive && renderConfig.textAnimation === 'typewriter') {
                  textContent = textContent.substring(0, Math.max(0, Math.floor((currentTime - line.time) * 35)));
                }

                return (
                  <p
                    key={idx}
                    data-lyric-active={isActive ? "true" : "false"}
                    className={`${containerClass} ${isActive ? activeClass : inactiveClass} ${isActive && renderConfig.textAnimation !== 'none' && renderConfig.textAnimation !== 'typewriter' ? `text-anim-${renderConfig.textAnimation}` : ''}`}
                    style={textEffectStyles}
                    onClick={() => {
                      if (audioRef.current && !isRendering) {
                        audioRef.current.currentTime = line.time;
                        setCurrentTime(line.time);
                      }
                    }}
                  >
                    {textContent}
                  </p>
                );
              })}
              <div className={`transition-all duration-500 ${renderConfig.contentPosition === 'center' ? ((activeTab === TabView.EDITOR || isPlaylistMode) ? 'h-[25vh]' : (!isHeaderVisible && !isFooterVisible) ? 'h-[50vh]' : 'h-[40vh]') : 'h-0'}`}></div>
            </div>
          ) : (
            <div className="text-center text-zinc-400/50 select-none pointer-events-none">
              {!activeSlide && preset !== 'none' && (
                <div className="flex flex-col items-center gap-4 animate-pulse">
                  <Music size={64} className="opacity-20" />
                  <p>Load audio & lyrics to start</p>
                  <p className="text-xs opacity-50">Shortcuts: Space (Play), S (Stop), R (Repeat), H (Hold UI)</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className={`transition-all duration-500 ease-in-out overflow-hidden ${isFooterVisible ? 'max-h-60 opacity-100 translate-y-0' : 'max-h-0 opacity-0 translate-y-4'}`}>
          <div className="bg-gradient-to-t from-black/60 via-black/30 to-transparent p-4 pb-6 lg:p-6 lg:pb-8">
            <div className="w-full max-w-full px-4 lg:px-10 mx-auto space-y-4">
              <div className="flex items-center gap-3 group">
                <span className="text-xs text-zinc-400 font-mono w-10 text-right">{formatTime(currentTime)}</span>
                <div className="flex-1 h-1 bg-zinc-700/50 rounded-full relative cursor-pointer group-hover:h-2 transition-all">
                  <div
                    className="absolute top-0 left-0 h-full bg-purple-500 rounded-full"
                    style={{ width: `${(currentTime / duration) * 100}%` }}
                  ></div>
                  <input
                    type="range"
                    min="0"
                    max={duration || 0}
                    value={currentTime}
                    onChange={handleSeek}
                    disabled={isRendering}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-wait"
                  />
                </div>
                <span className="text-xs text-zinc-400 font-mono w-10">{formatTime(duration)}</span>

                <div className="flex items-center gap-2 pl-4">
                  <button onClick={() => setIsMuted(!isMuted)} className="text-zinc-400 hover:text-white">
                    {isMuted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
                  </button>
                  <div className="w-24 h-1 bg-zinc-700/50 rounded-full relative overflow-hidden group/vol">
                    <div
                      className="absolute top-0 left-0 h-full bg-zinc-300 group-hover/vol:bg-purple-400 transition-colors"
                      style={{ width: `${isMuted ? 0 : volume * 100}%` }}
                    ></div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={isMuted ? 0 : volume}
                      onChange={handleVolumeChange}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap lg:grid lg:grid-cols-[1fr_auto_1fr] items-center justify-center gap-2 lg:gap-x-6">
                <div className="flex gap-1.5 justify-center lg:justify-start flex-wrap order-2 lg:order-none w-auto lg:w-full">
                  <label className="p-2 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white cursor-pointer transition-colors" title="Load Audio">
                    <Music size={18} />
                    <input type="file" accept="audio/*" className="hidden" onChange={handleAudioUpload} disabled={isRendering} />
                  </label>
                  <div className="flex items-center gap-0.5">
                    <label className={`p-2 rounded-lg hover:bg-white/10 cursor-pointer transition-colors ${lyrics.length > 0 ? 'text-purple-400' : 'text-zinc-400 hover:text-white'}`} title="Load Lyrics (.lrc, .srt)">
                      <FileText size={18} />
                      <input type="file" accept=".lrc,.srt" className="hidden" onChange={handleLyricsUpload} disabled={isRendering} />
                    </label>
                    {lyrics.length > 0 && (
                      <button
                        onClick={() => setLyrics([])}
                        className="p-1 rounded-full text-zinc-500 hover:text-red-400 hover:bg-white/5 transition-colors"
                        title="Clear Lyrics"
                        disabled={isRendering}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1 bg-zinc-800/50 rounded-lg px-2 py-1 h-9">
                    <span className="text-xs text-zinc-300 w-12 text-center font-mono select-none border-r border-white/10 pr-2 mr-0.5">
                      {lyricOffset > 0 ? '+' : ''}{lyricOffset.toFixed(1)}s
                    </span>
                    <div className="flex flex-col -my-1 h-full justify-center">
                      <button
                        onClick={() => setLyricOffset(prev => parseFloat((prev + 0.1).toFixed(1)))}
                        className="text-zinc-400 hover:text-white flex items-center justify-center h-3.5 w-4 hover:bg-white/10 rounded-sm transition-colors"
                        title="Increase Lyric Offset (+0.1s)"
                        disabled={isRendering}
                      >
                        <ChevronUp size={12} />
                      </button>
                      <button
                        onClick={() => setLyricOffset(prev => parseFloat((prev - 0.1).toFixed(1)))}
                        className="text-zinc-400 hover:text-white flex items-center justify-center h-3.5 w-4 hover:bg-white/10 rounded-sm transition-colors"
                        title="Decrease Lyric Offset (-0.1s)"
                        disabled={isRendering}
                      >
                        <ChevronDown size={12} />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-0.5">
                    <label className={`p-2 rounded-lg hover:bg-white/10 cursor-pointer transition-colors ${customFontName ? 'text-purple-400' : 'text-zinc-400 hover:text-white'}`} title={customFontName ? `Custom Font: ${customFontName}` : "Load Custom Font (.ttf, .otf, .woff)"}>
                      <Type size={18} />
                      <input type="file" accept=".ttf,.otf,.woff,.woff2" className="hidden" onChange={handleFontUpload} disabled={isRendering} />
                    </label>
                    {customFontName && (
                      <button
                        onClick={() => setCustomFontName(null)}
                        className="p-1 rounded-full text-zinc-500 hover:text-red-400 hover:bg-white/5 transition-colors"
                        title="Reset Default Font"
                        disabled={isRendering}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1 bg-zinc-800/50 rounded-lg px-2 py-1 h-9">
                    <span className="text-xs text-zinc-300 w-10 text-center font-mono select-none border-r border-white/10 pr-2 mr-0.5">
                      {Math.round(renderConfig.fontSizeScale * 100)}%
                    </span>
                    <div className="flex flex-col -my-1 h-full justify-center">
                      <button
                        onClick={() => setRenderConfig(prev => ({ ...prev, fontSizeScale: Math.min(prev.fontSizeScale + 0.1, 3.0) }))}
                        className="text-zinc-400 hover:text-white flex items-center justify-center h-3.5 w-4 hover:bg-white/10 rounded-sm transition-colors"
                        title="Increase Font Size"
                        disabled={isRendering}
                      >
                        <ChevronUp size={12} />
                      </button>
                      <button
                        onClick={() => setRenderConfig(prev => ({ ...prev, fontSizeScale: Math.max(prev.fontSizeScale - 0.1, 0.1) }))}
                        className="text-zinc-400 hover:text-white flex items-center justify-center h-3.5 w-4 hover:bg-white/10 rounded-sm transition-colors"
                        title="Decrease Font Size"
                        disabled={isRendering}
                      >
                        <ChevronDown size={12} />
                      </button>
                    </div>
                  </div>

                  <div className="relative group">
                    <select
                      value={preset}
                      onChange={(e) => setPreset(e.target.value as any)}
                      className="appearance-none bg-zinc-800/50 border border-white/5 text-zinc-300 text-xs rounded-lg px-3 pr-8 h-9 w-24 focus:outline-none focus:border-purple-500 cursor-pointer"
                      disabled={isRendering}
                      title="Select Visual Preset"
                    >
                      <option value="custom" className="bg-zinc-900 font-bold text-purple-400">Custom ✨</option>
                      <option value="default" className="bg-zinc-900">Default</option>
                      <option value="large" className="bg-zinc-900">Big Text</option>
                      <option value="large_upper" className="bg-zinc-900">Big Text (UP)</option>
                      <option value="big_center" className="bg-zinc-900">Big Center</option>
                      <option value="metal" className="bg-zinc-900">Metal</option>
                      <option value="kids" className="bg-zinc-900">Kids</option>
                      <option value="sad" className="bg-zinc-900">Sad</option>
                      <option value="romantic" className="bg-zinc-900">Romantic</option>
                      <option value="tech" className="bg-zinc-900">Tech</option>
                      <option value="gothic" className="bg-zinc-900">Gothic</option>
                      <option value="classic" className="bg-zinc-900">Classic Serif</option>
                      <option value="monospace" className="bg-zinc-900">Monospace</option>
                      <option value="testing_up" className="bg-zinc-900">Testing (UP)</option>
                      <option value="testing" className="bg-zinc-900">Testing</option>
                      <option value="one_line_up" className="bg-zinc-900">One Line (UP)</option>
                      <option value="one_line" className="bg-zinc-900">One Line</option>
                      <option value="slideshow" className="bg-zinc-900">Slideshow</option>
                      <option value="just_video" className="bg-zinc-900">Just Video</option>
                      <option value="subtitle" className="bg-zinc-900">Subtitle</option>
                      <option value="none" className="bg-zinc-900">None</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-1 text-zinc-500">
                      <svg className="fill-current h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" /></svg>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 lg:gap-6 justify-center order-1 lg:order-none w-full lg:w-auto mb-2 lg:mb-0">
                  <button
                    className="text-zinc-400 hover:text-white transition-colors disabled:opacity-50"
                    onClick={stopPlayback}
                    title="Stop (S)"
                    disabled={isRendering}
                  >
                    <Square size={20} fill="currentColor" />
                  </button>
                  <button className="text-zinc-400 hover:text-white transition-colors disabled:opacity-50" disabled={isRendering || playlist.length === 0} onClick={playPreviousSong} title="Previous Song">
                    <SkipBack size={26} />
                  </button>
                  <button className="text-zinc-400 hover:text-white transition-colors disabled:opacity-50" disabled={isRendering} onClick={() => audioRef.current && (audioRef.current.currentTime -= 5)} title="Rewind 5s">
                    <Rewind size={22} />
                  </button>
                  <button
                    onClick={togglePlay}
                    disabled={isRendering}
                    className="w-16 h-16 flex items-center justify-center bg-white text-black rounded-full hover:scale-105 transition-transform shadow-lg shadow-purple-500/20 disabled:opacity-50 disabled:hover:scale-100"
                  >
                    {isPlaying ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" className="ml-1" />}
                  </button>
                  <button className="text-zinc-400 hover:text-white transition-colors disabled:opacity-50" disabled={isRendering} onClick={() => audioRef.current && (audioRef.current.currentTime += 5)} title="Fast Forward 5s">
                    <FastForward size={22} />
                  </button>
                  <button className="text-zinc-400 hover:text-white transition-colors disabled:opacity-50" disabled={isRendering || playlist.length === 0} onClick={playNextSong} title="Next Song">
                    <SkipForward size={26} />
                  </button>
                  <button
                    className={`transition-colors disabled:opacity-50 ${repeatMode !== 'off' ? 'text-green-400 hover:text-green-300' : 'text-zinc-400 hover:text-white'}`}
                    onClick={toggleRepeat}
                    title={`Repeat: ${repeatMode === 'off' ? 'Off' : repeatMode === 'all' ? 'All' : 'One'} (R)`}
                    disabled={isRendering}
                  >
                    {repeatMode === 'one' ? <Repeat1 size={22} /> : <Repeat size={22} />}
                  </button>
                </div>

                <div className="flex items-center gap-1.5 justify-center lg:justify-end group flex-wrap order-3 lg:order-none w-auto lg:w-full">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setRenderConfig(prev => ({ ...prev, backgroundBlurStrength: prev.backgroundBlurStrength > 0 ? 0 : 12 }))}
                      className={`bg-zinc-800/50 border border-white/5 text-[10px] font-mono rounded-lg px-2 h-9 transition-colors disabled:opacity-30 ${isBlurEnabled ? 'text-purple-400 border-purple-500/50' : 'text-zinc-300 hover:text-white'}`}
                      title={`Background Blur: ${isBlurEnabled ? 'On' : 'Off'}`}
                      disabled={isRendering}
                    >
                      {isBlurEnabled ? 'BLUR' : 'SHARP'}
                    </button>
                    <button
                      onClick={() => setResolution(prev => prev === '1080p' ? '720p' : '1080p')}
                      className="bg-zinc-800/50 border border-white/5 text-[10px] font-mono text-zinc-300 hover:text-white rounded-lg px-2 h-9 transition-colors disabled:opacity-30"
                      title="Toggle Resolution (720p / 1080p)"
                      disabled={isRendering}
                    >
                      {resolution}
                    </button>
                    <button
                      onClick={() => setAspectRatio(prev => {
                        if (prev === '16:9') return '9:16';
                        if (prev === '9:16') return '3:4';
                        if (prev === '3:4') return '1:1';
                        if (prev === '1:1') return '1:2';
                        if (prev === '1:2') return '2:1';
                        if (prev === '2:1') return '2:3';
                        if (prev === '2:3') return '3:2';
                        return '16:9';
                      })}
                      className="bg-zinc-800/50 border border-white/5 text-[10px] font-mono text-zinc-300 hover:text-white rounded-lg px-2 h-9 transition-colors disabled:opacity-30"
                      title="Toggle Aspect Ratio"
                      disabled={isRendering}
                    >
                      {aspectRatio}
                    </button>
                  </div>
                  <div className="relative group">
                    <select
                      value={renderCodec}
                      onChange={(e) => setRenderCodec(e.target.value)}
                      className="appearance-none bg-zinc-800/50 border border-white/5 text-zinc-300 text-xs rounded-lg px-3 pr-8 w-32 h-9 focus:outline-none focus:border-purple-500 cursor-pointer"
                      disabled={isRendering}
                      title="Select Video Codec"
                    >
                      <option value="auto" className="bg-zinc-900">Auto Select (Best)</option>
                      {supportedCodecs.map(c => (
                        <option key={c.value} value={c.value} className="bg-zinc-900">{c.label}</option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-1 text-zinc-500">
                      <svg className="fill-current h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" /></svg>
                    </div>
                  </div>

                  <div className="relative group">
                    <select
                      value={renderQuality}
                      onChange={(e) => setRenderQuality(e.target.value as any)}
                      className="appearance-none bg-zinc-800/50 border border-white/5 text-zinc-300 text-xs rounded-lg px-3 pr-8 w-20 h-9 focus:outline-none focus:border-purple-500 cursor-pointer"
                      disabled={isRendering}
                      title="Select Quality (Bitrate)"
                    >
                      <option value="low" className="bg-zinc-900">Low</option>
                      <option value="med" className="bg-zinc-900">Med</option>
                      <option value="high" className="bg-zinc-900">High</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-1 text-zinc-500">
                      <svg className="fill-current h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" /></svg>
                    </div>
                  </div>

                  <button
                    onClick={handleExportVideo}
                    disabled={isRendering || !audioSrc}
                    className="p-2 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white cursor-pointer transition-colors"
                    title="Export as Video"
                  >
                    <Video size={18} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        {isPlaylistMode ? (
          <div className="animate-slide-up border-t border-white/10 z-30 shrink-0 w-full max-w-[100vw] overflow-hidden">
            <PlaylistEditor
              playlist={playlist}
              setPlaylist={setPlaylist}
              currentTrackIndex={currentTrackIndex}
              setCurrentTrackIndex={setCurrentTrackIndex}
              onPlayTrack={playTrack}
              currentTime={currentTime}
              onSeek={(time) => {
                if (audioRef.current && !isRendering) {
                  audioRef.current.currentTime = time;
                  setCurrentTime(time);
                }
              }}
              onClearPlaylist={() => {
                stopPlayback();
                setAudioSrc(null);
                setLyrics([]);
                setCurrentTrackIndex(-1);
                setMetadata({ title: 'No Audio Loaded', artist: 'Select a file', coverUrl: null, backgroundType: 'image' });
              }}
              onClose={() => setIsPlaylistMode(false)}
            />
          </div>
        ) : (
          activeTab === TabView.EDITOR && (
            <div className="animate-slide-up border-t border-white/10 z-30 shrink-0 w-full max-w-[100vw] overflow-hidden">
              <VisualEditor
                slides={visualSlides}
                setSlides={setVisualSlides}
                currentTime={currentTime}
                duration={duration || 60}
                lyrics={lyrics}
                onSeek={(time) => {
                  if (audioRef.current && !isRendering) {
                    audioRef.current.currentTime = time;
                    setCurrentTime(time);
                  }
                }}
                onClose={() => setActiveTab(TabView.PLAYER)}
              />
            </div>
          )
        )}

      </div>

      {isRendering && (
        <div className="fixed inset-0 z-[60] bg-black/90 flex flex-col items-center justify-center p-8 text-center space-y-6">
          <div className="animate-bounce">
            <Video size={48} className="text-purple-500" />
          </div>
          <h2 className="text-2xl font-bold text-white">Rendering Video ({aspectRatio} {resolution})</h2>
          <p className="text-zinc-400 max-w-md">
            Rendering in real-time using Canvas 2D engine.<br />
            The audio will play during capture.<br />
            Please keep this tab active for best performance.
          </p>

          <div className="w-full max-w-md h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-purple-500 transition-all duration-300 ease-linear"
              style={{ width: `${renderProgress}%` }}
            ></div>
          </div>
          <p className="text-sm font-mono text-zinc-500">{Math.round(renderProgress)}%</p>

          <button
            onClick={handleAbortRender}
            className="mt-4 px-6 py-2 bg-red-500/20 text-red-400 hover:bg-red-500/30 hover:text-red-300 rounded-full transition-colors flex items-center gap-2 border border-red-500/50"
          >
            <Square size={16} fill="currentColor" />
            Abort Rendering
          </button>
        </div>
      )}

      {showRenderSettings && (
        <RenderSettings
          config={renderConfig}
          setConfig={setRenderConfig}
          preset={preset}
          setPreset={setPreset}
          onClose={() => setShowRenderSettings(false)}
          isPlaylistMode={isPlaylistMode}
          hasPlaylist={playlist.length > 0}
          onRender={handleExportVideo}
          customFontName={customFontName}
          onFontUpload={handleFontUpload}
          onClearCustomFont={() => setCustomFontName(null)}
          resolution={resolution}
          setResolution={setResolution}
          aspectRatio={aspectRatio}
          setAspectRatio={setAspectRatio}
          renderCodec={renderCodec}
          setRenderCodec={setRenderCodec}
          supportedCodecs={supportedCodecs}
          renderQuality={renderQuality}
          setRenderQuality={setRenderQuality}
          renderFps={renderFps}
          setRenderFps={setRenderFps}
        />
      )}
    </div >
  );
}

export default App;
