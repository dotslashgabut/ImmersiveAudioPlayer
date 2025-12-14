import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, 
  Maximize, Minimize, Upload, Music, FileText, Settings, ImageIcon,
  Repeat, Square, Eye, EyeOff
} from './components/Icons';
import { AudioMetadata, LyricLine, TabView, VisualSlide } from './types';
import { formatTime, parseLRC, parseSRT } from './utils/parsers';
import VisualEditor from './components/VisualEditor';

function App() {
  // Refs
  const audioRef = useRef<HTMLAudioElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lyricsContainerRef = useRef<HTMLDivElement>(null);

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
          togglePlay();
          break;
        case 's':
          e.preventDefault();
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
  }, [isPlaying, isLooping, activeTab]); 

  // --- Render Helpers ---

  // Combine manual visibility with mouse idle state
  // BypassAutoHide overrides mouse idle.
  const isHeaderVisible = showInfo && (!isMouseIdle || bypassAutoHide);
  const isFooterVisible = showPlayer && (!isMouseIdle || bypassAutoHide);

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
                       if (audioRef.current) {
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
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                  </div>
                  <span className="text-xs text-zinc-400 font-mono w-10">{formatTime(duration)}</span>
               </div>

               {/* Main Buttons */}
               <div className="flex items-center justify-between">
                  <div className="flex gap-2">
                     <label className="p-2 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white cursor-pointer transition-colors" title="Load Audio">
                        <Music size={18} />
                        <input type="file" accept="audio/*" className="hidden" onChange={handleAudioUpload} />
                     </label>
                     <label className="p-2 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white cursor-pointer transition-colors" title="Load Lyrics (.lrc, .srt)">
                        <FileText size={18} />
                        <input type="file" accept=".lrc,.srt" className="hidden" onChange={handleLyricsUpload} />
                     </label>
                  </div>

                  <div className="flex items-center gap-6">
                     <button 
                       className="text-zinc-400 hover:text-white transition-colors" 
                       onClick={stopPlayback}
                       title="Stop (S)"
                     >
                        <Square size={20} fill="currentColor" />
                     </button>
                     <button className="text-zinc-400 hover:text-white transition-colors" onClick={() => audioRef.current && (audioRef.current.currentTime -= 5)}>
                        <SkipBack size={24} />
                     </button>
                     <button 
                        onClick={togglePlay}
                        className="w-14 h-14 flex items-center justify-center bg-white text-black rounded-full hover:scale-105 transition-transform shadow-lg shadow-purple-500/20"
                     >
                        {isPlaying ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" className="ml-1" />}
                     </button>
                     <button className="text-zinc-400 hover:text-white transition-colors" onClick={() => audioRef.current && (audioRef.current.currentTime += 5)}>
                        <SkipForward size={24} />
                     </button>
                     <button 
                       className={`transition-colors ${isLooping ? 'text-green-400 hover:text-green-300' : 'text-zinc-400 hover:text-white'}`} 
                       onClick={toggleLoop}
                       title="Loop (L)"
                     >
                        <Repeat size={20} />
                     </button>
                  </div>

                  <div className="flex items-center gap-2 w-32 justify-end group">
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
      
    </div>
  );
}

export default App;