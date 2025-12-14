import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, 
  Maximize, Minimize, Upload, Music, FileText, Settings, ImageIcon,
  Repeat, Square, Eye, EyeOff, Video, Download
} from './components/Icons';
import { AudioMetadata, LyricLine, TabView, VisualSlide } from './types';
import { formatTime, parseLRC, parseSRT } from './utils/parsers';
import VisualEditor from './components/VisualEditor';

function App() {
  // Refs
  const audioRef = useRef<HTMLAudioElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lyricsContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // State: Media & Data
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<AudioMetadata>({
    title: 'No Audio Loaded',
    artist: 'Select a file',
    coverUrl: null,
  });
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [visualSlides, setVisualSlides] = useState<VisualSlide[]>([]);

  // State: Playback
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  
  // State: UI
  const [activeTab, setActiveTab] = useState<TabView>(TabView.PLAYER);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMouseIdle, setIsMouseIdle] = useState(false);
  const [bypassAutoHide, setBypassAutoHide] = useState(false);
  const [controlsTimeout, setControlsTimeout] = useState<number | null>(null);

  // State: Video Export
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16' | '3:4'>('16:9');
  const [resolution, setResolution] = useState<'720p' | '1080p'>('1080p');

  // Derived dimensions
  const getCanvasDimensions = () => {
    const is1080p = resolution === '1080p';
    
    switch (aspectRatio) {
      case '9:16':
        return is1080p ? { w: 1080, h: 1920 } : { w: 720, h: 1280 };
      case '3:4':
        return is1080p ? { w: 1080, h: 1440 } : { w: 720, h: 960 };
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
    s => currentTime >= s.startTime && currentTime < s.endTime
  );
  
  const currentLyricIndex = lyrics.findIndex((line, index) => {
    const nextLine = lyrics[index + 1];
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

      // jsmediatags parsing
      if ((window as any).jsmediatags) {
        (window as any).jsmediatags.read(file, {
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
      }

      // Reset play state
      setIsPlaying(false);
      setCurrentTime(0);
      if (audioRef.current) {
        audioRef.current.load();
      }
    }
  };

  const handleMetadataUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
     const file = e.target.files?.[0];
     if (file) {
       const url = URL.createObjectURL(file);
       setMetadata(prev => ({ ...prev, coverUrl: url }));
     }
  };

  const handleLyricsUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const text = await file.text();
      const ext = file.name.split('.').pop()?.toLowerCase();
      let parsedLyrics: LyricLine[] = [];
      
      if (ext === 'lrc') {
        parsedLyrics = parseLRC(text);
      } else if (ext === 'srt') {
        parsedLyrics = parseSRT(text);
      }
      setLyrics(parsedLyrics);
    }
  };

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const stopPlayback = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
      setCurrentTime(0);
    }
  };

  const toggleLoop = () => {
    setIsLooping(!isLooping);
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
  
  const drawCanvasFrame = (
    ctx: CanvasRenderingContext2D, 
    width: number, 
    height: number,
    time: number,
    images: Map<string, HTMLImageElement>
  ) => {
    // Standard web font stack to match Tailwind
    const fontFamily = 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
    const isPortrait = width < height;

    // Scale Factor: All sizing logic is based on 1080p. 
    // If 720p, we scale everything down by ~0.66
    // 1080p long edge = 1920, 720p long edge = 1280. 1280/1920 = 0.666
    const scale = resolution === '1080p' ? 1 : (1280 / 1920);

    // Clear
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    // 1. Draw Background
    const currentSlide = visualSlides.find(s => time >= s.startTime && time < s.endTime);
    if (currentSlide) {
      const img = images.get(currentSlide.id);
      if (img) {
        // Draw image "cover" style
        const imgScale = Math.max(width / img.width, height / img.height);
        const x = (width / 2) - (img.width / 2) * imgScale;
        const y = (height / 2) - (img.height / 2) * imgScale;
        ctx.drawImage(img, x, y, img.width * imgScale, img.height * imgScale);
      }
    } else if (metadata.coverUrl) {
       const img = images.get('cover');
       if (img) {
          const imgScale = Math.max(width / img.width, height / img.height);
          const x = (width / 2) - (img.width / 2) * imgScale;
          const y = (height / 2) - (img.height / 2) * imgScale;
          ctx.drawImage(img, x, y, img.width * imgScale, img.height * imgScale);
       }
    }

    // Overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'; // Darken bg
    if (currentSlide) ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(0, 0, width, height);

    // 2. Draw Lyrics
    const activeIdx = lyrics.findIndex((line, index) => {
      const nextLine = lyrics[index + 1];
      return time >= line.time && (!nextLine || time < nextLine.time);
    });

    // Layout config (Scaled)
    const baseFontSize = (isPortrait ? 50 : 60) * scale;
    const secondaryFontSize = (isPortrait ? 25 : 30) * scale;
    const lineSpacing = (isPortrait ? 80 : 100) * scale;

    if (activeIdx !== -1) {
       ctx.textAlign = 'center';
       ctx.textBaseline = 'middle';
       const centerY = height / 2;
       
       // Draw surrounding lines
       for (let i = -2; i <= 2; i++) {
         const idx = activeIdx + i;
         if (idx >= 0 && idx < lyrics.length) {
            const line = lyrics[idx];
            const isCurrent = i === 0;
            
            // Style
            ctx.font = isCurrent ? `bold ${baseFontSize}px ${fontFamily}` : `${secondaryFontSize}px ${fontFamily}`;
            ctx.fillStyle = isCurrent ? '#ffffff' : 'rgba(255, 255, 255, 0.5)';
            
            // Shadow for active
            if (isCurrent) {
               ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
               ctx.shadowBlur = 10 * scale;
               ctx.shadowOffsetX = 0;
               ctx.shadowOffsetY = 2 * scale;
            } else {
               ctx.shadowColor = 'transparent';
            }

            const yPos = centerY + (i * lineSpacing); 
            
            // Text measurement for basic wrapping prevention (clipping)
            const maxWidth = width * 0.9;
            ctx.fillText(line.text, width / 2, yPos, maxWidth);
         }
       }
       // Reset Shadow
       ctx.shadowColor = 'transparent';
    } else {
       // Draw Song Title if no lyrics (Center Screen Placeholder)
       if (lyrics.length === 0) {
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = `bold ${baseFontSize}px ${fontFamily}`;
          ctx.fillStyle = '#ffffff';
          ctx.shadowColor = 'rgba(0,0,0,0.8)';
          ctx.shadowBlur = 10 * scale;
          ctx.fillText(metadata.title, width / 2, height / 2 - (40 * scale));
          
          ctx.font = `${secondaryFontSize}px ${fontFamily}`;
          ctx.fillStyle = '#cccccc';
          ctx.fillText(metadata.artist, width / 2, height / 2 + (40 * scale));
          ctx.shadowColor = 'transparent';
       }
    }

    // 3. Draw Metadata Overlay
    const margin = 40 * scale;
    const thumbSize = (isPortrait ? 150 : 100) * scale; // Slightly larger thumb in portrait
    const textOffset = 25 * scale;
    const coverImg = metadata.coverUrl ? images.get('cover') : null;
    const r = 12 * scale; // Radius

    if (isPortrait) {
      // --- PORTRAIT LAYOUT (9:16 and 3:4): Top Center, slightly down ---
      // Position Y at 3x margin to give breathing room from top edge
      const startY = margin * 3;
      const centerX = width / 2;
      
      // 1. Draw Image (Centered)
      const imgX = centerX - (thumbSize / 2);
      const imgY = startY;

      ctx.save();
      // Rounded Clip
      ctx.beginPath();
      ctx.roundRect(imgX, imgY, thumbSize, thumbSize, r);
      ctx.clip();

      if (coverImg) {
        ctx.drawImage(coverImg, imgX, imgY, thumbSize, thumbSize);
      } else {
        ctx.fillStyle = '#27272a';
        ctx.fillRect(imgX, imgY, thumbSize, thumbSize);
      }
      ctx.restore();

      // Border
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(imgX, imgY, thumbSize, thumbSize, r);
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 2 * scale;
      ctx.stroke();
      ctx.restore();

      // 2. Draw Text (Centered Below Image)
      ctx.textAlign = 'center';
      
      // Title
      ctx.textBaseline = 'top';
      ctx.font = `bold ${36 * scale}px ${fontFamily}`;
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 4 * scale;
      ctx.shadowOffsetY = 1 * scale;
      const titleY = imgY + thumbSize + textOffset;
      ctx.fillText(metadata.title, centerX, titleY);

      // Artist
      ctx.font = `${24 * scale}px ${fontFamily}`;
      ctx.fillStyle = '#d4d4d8';
      ctx.shadowBlur = 2 * scale;
      const artistY = titleY + (40 * scale); // spacing based on prev font size
      ctx.fillText(metadata.artist, centerX, artistY);
      
      ctx.shadowColor = 'transparent';

    } else {
      // --- LANDSCAPE LAYOUT (16:9): Top Left ---
      const x = margin;
      const y = margin;
      
      ctx.save();
      // Rounded Clip
      ctx.beginPath();
      ctx.roundRect(x, y, thumbSize, thumbSize, r);
      ctx.clip();

      if (coverImg) {
        ctx.drawImage(coverImg, x, y, thumbSize, thumbSize);
      } else {
        ctx.fillStyle = '#27272a';
        ctx.fillRect(x, y, thumbSize, thumbSize);
      }
      ctx.restore();

      // Border
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x, y, thumbSize, thumbSize, r);
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 2 * scale;
      ctx.stroke();
      ctx.restore();

      // Text Info (Right of Cover)
      const textX = margin + thumbSize + textOffset;
      const textCenterY = margin + (thumbSize / 2);

      ctx.textAlign = 'left';
      
      // Title
      ctx.textBaseline = 'bottom';
      ctx.font = `bold ${32 * scale}px ${fontFamily}`;
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 4 * scale;
      ctx.shadowOffsetY = 1 * scale;
      ctx.fillText(metadata.title, textX, textCenterY - (4 * scale));

      // Artist
      ctx.textBaseline = 'top';
      ctx.font = `${20 * scale}px ${fontFamily}`;
      ctx.fillStyle = '#d4d4d8';
      ctx.shadowBlur = 2 * scale;
      ctx.fillText(metadata.artist, textX, textCenterY + (4 * scale));
      
      ctx.shadowColor = 'transparent';
    }
  };

  const handleExportVideo = async () => {
    if (!audioSrc || !audioRef.current || !canvasRef.current) return;
    
    // Confirm
    if (!window.confirm(`Start rendering ${aspectRatio} (${resolution}) video? This will play the song from start to finish. Please do not switch tabs.`)) return;

    setIsRendering(true);
    setRenderProgress(0);
    
    // Stop and Reset
    stopPlayback();
    
    // 1. Preload Images
    const imageMap = new Map<string, HTMLImageElement>();
    const loadPromises: Promise<void>[] = [];
    
    // Helper
    const loadImg = (id: string, url: string) => {
       return new Promise<void>((resolve) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => {
             imageMap.set(id, img);
             resolve();
          };
          img.onerror = () => resolve(); // Ignore errors
          img.src = url;
       });
    };

    visualSlides.forEach(s => loadPromises.push(loadImg(s.id, s.url)));
    if (metadata.coverUrl) loadPromises.push(loadImg('cover', metadata.coverUrl));
    
    await Promise.all(loadPromises);

    // 2. Setup Recording
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const stream = canvas.captureStream(30); // 30 FPS
    
    // Add Audio Track
    const audioEl = audioRef.current;
    // Note: captureStream might require vendor prefix or specific browser support
    // Fallback: simple error if not supported
    let audioStream: MediaStream | null = null;
    
    try {
        // @ts-ignore
        if (audioEl.captureStream) audioStream = audioEl.captureStream();
        // @ts-ignore
        else if (audioEl.mozCaptureStream) audioStream = audioEl.mozCaptureStream();
        else throw new Error("Audio capture not supported");
    } catch (e) {
        alert("Your browser does not support audio capture for recording.");
        setIsRendering(false);
        return;
    }

    if (audioStream) {
       stream.addTrack(audioStream.getAudioTracks()[0]);
    }

    const mimeType = MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : 'video/webm';
    // Adjust bitrate based on resolution (8Mbps for 1080p, 4Mbps for 720p)
    const bitrate = resolution === '1080p' ? 8000000 : 4000000;
    const mediaRecorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitrate }); 
    
    const chunks: Blob[] = [];
    mediaRecorder.ondataavailable = (e) => {
       if (e.data.size > 0) chunks.push(e.data);
    };
    
    mediaRecorder.onstop = () => {
       const blob = new Blob(chunks, { type: mimeType });
       const url = URL.createObjectURL(blob);
       const a = document.createElement('a');
       a.href = url;
       a.download = `${metadata.title || 'video'}_${aspectRatio.replace(':','-')}_${resolution}.${mimeType === 'video/mp4' ? 'mp4' : 'webm'}`;
       document.body.appendChild(a);
       a.click();
       document.body.removeChild(a);
       URL.revokeObjectURL(url);
       setIsRendering(false);
    };

    // 3. Start Loop
    mediaRecorder.start();
    audioEl.play();
    setIsPlaying(true); // Sync UI state

    const renderLoop = () => {
       if (audioEl.paused || audioEl.ended) {
          // If ended naturally
          if (audioEl.ended && mediaRecorder.state === 'recording') {
             mediaRecorder.stop();
             setIsPlaying(false);
          }
          return;
       }
       
       if (ctx) {
          drawCanvasFrame(ctx, canvas.width, canvas.height, audioEl.currentTime, imageMap);
       }
       
       if (mediaRecorder.state === 'recording') {
          requestAnimationFrame(renderLoop);
       }
    };
    
    renderLoop();
  };

  // Scroll active lyric into view
  useEffect(() => {
    if (currentLyricIndex !== -1 && lyricsContainerRef.current) {
      const activeEl = lyricsContainerRef.current.children[currentLyricIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentLyricIndex]);

  // Handle idle mouse to hide controls
  const handleMouseMove = () => {
    setIsMouseIdle(false);
    if (controlsTimeout) clearTimeout(controlsTimeout);
    
    // Auto-hide after 3s of inactivity
    const timeout = setTimeout(() => {
       setIsMouseIdle(true);
    }, 3000);
    setControlsTimeout(timeout);
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch(e.key.toLowerCase()) {
        case ' ':
        case 'k':
          e.preventDefault();
          if (isRendering) return; // Disable play toggle during render
          togglePlay();
          break;
        case 's':
          e.preventDefault();
          if (isRendering) return;
          stopPlayback();
          break;
        case 'l':
          e.preventDefault();
          toggleLoop();
          break;
        case 'h':
          e.preventDefault();
          setBypassAutoHide(prev => !prev);
          break;
        case 'f':
          toggleFullscreen();
          break;
        case 'i': // Toggle Info (Top)
          setShowInfo(prev => !prev);
          break;
        case 'p': // Toggle Player (Bottom)
          setShowPlayer(prev => !prev);
          break;
        case 't': // Toggle Timeline (Editor)
          setActiveTab(prev => prev === TabView.PLAYER ? TabView.EDITOR : TabView.PLAYER);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, isLooping, activeTab, isRendering]); 

  // --- Render Helpers ---

  // Combine manual visibility with mouse idle state
  // BypassAutoHide overrides mouse idle.
  const isHeaderVisible = showInfo && (!isMouseIdle || bypassAutoHide) && !isRendering;
  const isFooterVisible = showPlayer && (!isMouseIdle || bypassAutoHide) && !isRendering;

  const backgroundStyle = activeSlide 
    ? { backgroundImage: `url(${activeSlide.url})` }
    : metadata.coverUrl 
      ? { backgroundImage: `url(${metadata.coverUrl})` }
      : undefined;

  return (
    <div 
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className={`relative w-full h-screen bg-black overflow-hidden flex font-sans select-none ${isMouseIdle && !bypassAutoHide ? 'cursor-none' : ''}`}
    >
      <audio 
        ref={audioRef}
        src={audioSrc || undefined}
        loop={isLooping}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => {
            if (!isLooping) setIsPlaying(false);
        }}
        crossOrigin="anonymous"
      />

      {/* Hidden Rendering Canvas */}
      <canvas 
         ref={canvasRef}
         width={canvasWidth}
         height={canvasHeight}
         className="absolute top-0 left-0 hidden pointer-events-none opacity-0"
      />

      {/* --- Visual Layer --- */}
      <div 
        className="absolute inset-0 bg-cover bg-center transition-all duration-700 ease-in-out"
        style={backgroundStyle}
      >
        <div className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-700 ${activeSlide ? 'bg-black/20 backdrop-blur-none' : ''}`}></div>
        {!activeSlide && !metadata.coverUrl && (
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-900 via-purple-900 to-black opacity-80"></div>
        )}
      </div>

      {/* --- Main Content Area --- */}
      <div className={`relative z-10 flex-1 flex flex-col transition-all duration-500 ${activeTab === TabView.EDITOR ? 'mr-0 md:mr-96' : ''}`}>
        
        {/* Top Bar (Song Info) */}
        <div className={`p-6 flex justify-between items-start transition-opacity duration-300 ${isHeaderVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <div className="flex gap-4">
             <div className="flex gap-4 items-center">
                <div className="relative group w-16 h-16 rounded-md overflow-hidden bg-zinc-800 shadow-lg border border-white/10 shrink-0">
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
                   <h1 className="text-xl font-bold text-white drop-shadow-md line-clamp-1">{metadata.title}</h1>
                   <div className="flex items-center gap-2">
                    <p className="text-zinc-300 text-sm drop-shadow-md">{metadata.artist}</p>
                   </div>
                </div>
             </div>
          </div>

          <div className="flex gap-2">
             <button 
                onClick={() => setBypassAutoHide(!bypassAutoHide)}
                className={`p-2 rounded-full transition-colors ${bypassAutoHide ? 'bg-purple-600/50 text-white' : 'bg-black/30 text-zinc-300 hover:bg-white/10'}`}
                title="Bypass Auto-hide (H)"
             >
                {bypassAutoHide ? <Eye size={20} /> : <EyeOff size={20} />}
             </button>
             <button 
                onClick={() => setActiveTab(activeTab === TabView.PLAYER ? TabView.EDITOR : TabView.PLAYER)}
                className={`p-2 rounded-full transition-colors ${activeTab === TabView.EDITOR ? 'bg-purple-600 text-white' : 'bg-black/30 text-zinc-300 hover:bg-white/10'}`}
                title="Toggle Timeline (T)"
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

        {/* Center Stage: Lyrics */}
        <div className="flex-1 flex items-center justify-center overflow-hidden relative">
          {lyrics.length > 0 ? (
            <div 
              ref={lyricsContainerRef}
              className="w-full max-w-5xl h-[60vh] overflow-y-auto no-scrollbar px-6 text-center space-y-6 mask-linear-fade"
              style={{ maskImage: 'linear-gradient(to bottom, transparent, black 10%, black 90%, transparent)' }}
            >
               <div className="h-[25vh]"></div>
               {lyrics.map((line, idx) => (
                 <p 
                    key={idx} 
                    className={`transition-all duration-500 cursor-pointer ${
                      idx === currentLyricIndex 
                        ? 'text-3xl md:text-5xl font-bold text-white scale-105 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]' 
                        : 'text-xl md:text-2xl text-zinc-500/60 hover:text-zinc-300 drop-shadow-sm'
                    }`}
                    onClick={() => {
                       if (audioRef.current && !isRendering) {
                         audioRef.current.currentTime = line.time;
                         setCurrentTime(line.time);
                       }
                    }}
                 >
                   {line.text}
                 </p>
               ))}
               <div className="h-[25vh]"></div>
            </div>
          ) : (
             <div className="text-center text-zinc-400/50 select-none pointer-events-none">
                {!activeSlide && (
                  <div className="flex flex-col items-center gap-4 animate-pulse">
                    <Music size={64} className="opacity-20" />
                    <p>Load audio & lyrics to start</p>
                    <p className="text-xs opacity-50">Shortcuts: Space (Play), S (Stop), L (Loop), H (Hold UI)</p>
                  </div>
                )}
             </div>
          )}
        </div>

        {/* Bottom Controls (Player) */}
        <div className={`bg-gradient-to-t from-black via-black/80 to-transparent p-6 pb-8 transition-opacity duration-300 ${isFooterVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
            <div className="max-w-4xl mx-auto space-y-4">
               {/* Progress Bar */}
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
               </div>

               {/* Main Buttons */}
               <div className="flex items-center justify-between">
                  <div className="flex gap-2">
                     <label className="p-2 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white cursor-pointer transition-colors" title="Load Audio">
                        <Music size={18} />
                        <input type="file" accept="audio/*" className="hidden" onChange={handleAudioUpload} disabled={isRendering} />
                     </label>
                     <label className="p-2 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white cursor-pointer transition-colors" title="Load Lyrics (.lrc, .srt)">
                        <FileText size={18} />
                        <input type="file" accept=".lrc,.srt" className="hidden" onChange={handleLyricsUpload} disabled={isRendering} />
                     </label>
                  </div>

                  <div className="flex items-center gap-6">
                     <button 
                       className="text-zinc-400 hover:text-white transition-colors disabled:opacity-50" 
                       onClick={stopPlayback}
                       title="Stop (S)"
                       disabled={isRendering}
                     >
                        <Square size={20} fill="currentColor" />
                     </button>
                     <button className="text-zinc-400 hover:text-white transition-colors disabled:opacity-50" disabled={isRendering} onClick={() => audioRef.current && (audioRef.current.currentTime -= 5)}>
                        <SkipBack size={24} />
                     </button>
                     <button 
                        onClick={togglePlay}
                        disabled={isRendering}
                        className="w-14 h-14 flex items-center justify-center bg-white text-black rounded-full hover:scale-105 transition-transform shadow-lg shadow-purple-500/20 disabled:opacity-50 disabled:hover:scale-100"
                     >
                        {isPlaying ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" className="ml-1" />}
                     </button>
                     <button className="text-zinc-400 hover:text-white transition-colors disabled:opacity-50" disabled={isRendering} onClick={() => audioRef.current && (audioRef.current.currentTime += 5)}>
                        <SkipForward size={24} />
                     </button>
                     <button 
                       className={`transition-colors disabled:opacity-50 ${isLooping ? 'text-green-400 hover:text-green-300' : 'text-zinc-400 hover:text-white'}`} 
                       onClick={toggleLoop}
                       title="Loop (L)"
                       disabled={isRendering}
                     >
                        <Repeat size={20} />
                     </button>
                  </div>

                  <div className="flex items-center gap-2 w-auto justify-end group">
                     {/* Resolution Toggle */}
                     <button 
                        onClick={() => setResolution(prev => prev === '1080p' ? '720p' : '1080p')}
                        className="text-[10px] font-mono text-zinc-500 hover:text-zinc-300 border border-zinc-700 rounded px-1 h-6 transition-colors disabled:opacity-30"
                        title="Toggle Resolution (720p / 1080p)"
                        disabled={isRendering}
                     >
                        {resolution}
                     </button>
                     {/* Aspect Ratio Toggle */}
                     <button 
                        onClick={() => setAspectRatio(prev => {
                           if (prev === '16:9') return '9:16';
                           if (prev === '9:16') return '3:4';
                           return '16:9';
                        })}
                        className="text-[10px] font-mono text-zinc-500 hover:text-zinc-300 border border-zinc-700 rounded px-1 h-6 transition-colors disabled:opacity-30"
                        title="Toggle Aspect Ratio (16:9 / 9:16 / 3:4)"
                        disabled={isRendering}
                     >
                        {aspectRatio}
                     </button>
                     {/* Export Button */}
                     <button 
                        onClick={handleExportVideo}
                        disabled={isRendering || !audioSrc}
                        className="text-zinc-400 hover:text-purple-400 transition-colors disabled:opacity-30 mr-2"
                        title="Export as Video"
                     >
                        <Video size={20} />
                     </button>

                     <button onClick={() => setIsMuted(!isMuted)} className="text-zinc-400 hover:text-white">
                        {isMuted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
                     </button>
                     <div className="w-20 h-1 bg-zinc-700 rounded-full relative overflow-hidden">
                        <div 
                           className="absolute top-0 left-0 h-full bg-zinc-300"
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
            </div>
        </div>
      </div>

      {/* --- Sidebar Editor --- */}
      {activeTab === TabView.EDITOR && (
         <div className="absolute right-0 top-0 bottom-0 z-20 transition-transform duration-300 animate-slide-in">
            <VisualEditor 
              slides={visualSlides} 
              setSlides={setVisualSlides} 
              currentTime={currentTime} 
              duration={duration || 60}
              lyrics={lyrics}
            />
         </div>
      )}

      {/* Rendering Overlay */}
      {isRendering && (
         <div className="absolute inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-8 text-center space-y-6">
            <div className="animate-bounce">
              <Video size={48} className="text-purple-500" />
            </div>
            <h2 className="text-2xl font-bold text-white">Rendering Video ({aspectRatio} {resolution})</h2>
            <p className="text-zinc-400 max-w-md">The song is playing to capture the video. Please do not close the tab or switch windows.</p>
            
            <div className="w-full max-w-md h-2 bg-zinc-800 rounded-full overflow-hidden">
               <div 
                 className="h-full bg-purple-500 transition-all duration-300 ease-linear"
                 style={{ width: `${renderProgress}%` }}
               ></div>
            </div>
            <p className="text-sm font-mono text-zinc-500">{Math.round(renderProgress)}%</p>
         </div>
      )}
      
    </div>
  );
}

export default App;