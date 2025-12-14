import React, { useState, useRef } from 'react';
import { VisualSlide, LyricLine } from '../types';
import { Plus, X, ImageIcon, GripHorizontal, ZoomIn, ZoomOut, Trash2 } from './Icons';
import { formatTime } from '../utils/parsers';

interface VisualEditorProps {
  slides: VisualSlide[];
  setSlides: React.Dispatch<React.SetStateAction<VisualSlide[]>>;
  currentTime: number;
  duration: number;
  lyrics: LyricLine[];
}

const RULER_INTERVAL = 5; // Seconds between ruler marks
const SNAP_THRESHOLD_PX = 10; // Pixels to snap

const VisualEditor: React.FC<VisualEditorProps> = ({ slides, setSlides, currentTime, duration, lyrics }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pxPerSec, setPxPerSec] = useState(40); // Default zoom level
  
  // Total height restricted to audio duration (if available)
  // Ensure at least enough space for the current time marker if it's somehow past duration (rare)
  // or a default 60s if no audio.
  const timelineDuration = Math.max(duration, 60);
  const totalHeight = timelineDuration * pxPerSec;

  // Interaction State
  const [activeDrag, setActiveDrag] = useState<{
    id: string;
    type: 'move' | 'resize';
    startY: number;
    initialStart: number;
    initialEnd: number;
  } | null>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newSlides: VisualSlide[] = [];
      let offsetTime = currentTime;
      // If currentTime is past duration, reset to 0 or end - 5
      if (offsetTime >= duration && duration > 0) offsetTime = Math.max(0, duration - 5);
      
      const defaultDuration = 5;

      Array.from(e.target.files).forEach((item) => {
        const file = item as File;
        const url = URL.createObjectURL(file);
        
        // Ensure we don't go past duration
        let start = offsetTime;
        let end = offsetTime + defaultDuration;
        
        if (duration > 0 && end > duration) {
           end = duration;
           start = Math.max(0, end - defaultDuration);
        }

        newSlides.push({
          id: Math.random().toString(36).substr(2, 9),
          url,
          startTime: start,
          endTime: end,
          name: file.name
        });
        
        // Stack subsequent images, but check bounds
        offsetTime = end; 
      });
      
      setSlides(prev => [...prev, ...newSlides].sort((a, b) => a.startTime - b.startTime));
      e.target.value = '';
    }
  };

  const removeSlide = (id: string) => {
    setSlides(prev => prev.filter(s => s.id !== id));
  };

  const handleClearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (slides.length === 0) return;
    if (window.confirm("Are you sure you want to remove all visual slides?")) {
      setSlides([]);
    }
  };

  const handleMouseDown = (e: React.MouseEvent, id: string, type: 'move' | 'resize') => {
    e.stopPropagation();
    const slide = slides.find(s => s.id === id);
    if (!slide) return;

    setActiveDrag({
      id,
      type,
      startY: e.clientY,
      initialStart: slide.startTime,
      initialEnd: slide.endTime
    });

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Snapping Utility
  const getSnapTime = (proposedTime: number, ignoreId: string): number => {
    const snapThresholdSec = SNAP_THRESHOLD_PX / pxPerSec;
    
    // Snap points: 0, duration, and Start/End of ALL other slides
    const snapPoints = [0, duration];
    slides.forEach(s => {
      if (s.id !== ignoreId) {
        snapPoints.push(s.startTime);
        snapPoints.push(s.endTime);
      }
    });

    let closest = proposedTime;
    let minDiff = snapThresholdSec;

    for (const point of snapPoints) {
      const diff = Math.abs(point - proposedTime);
      if (diff < minDiff) {
        minDiff = diff;
        closest = point;
      }
    }
    return closest;
  };

  const handleMouseMove = (e: MouseEvent) => {
    setActiveDrag(prev => {
      if (!prev) return null;
      
      const deltaPx = e.clientY - prev.startY;
      const deltaSec = deltaPx / pxPerSec;
      
      setSlides(currentSlides => currentSlides.map(s => {
        if (s.id !== prev.id) return s;

        if (prev.type === 'move') {
          const durationLen = prev.initialEnd - prev.initialStart;
          let newStart = prev.initialStart + deltaSec;
          
          // Apply snapping to Start Time
          newStart = getSnapTime(newStart, prev.id);
          
          // Clamp to boundaries [0, duration - len]
          newStart = Math.max(0, Math.min(newStart, duration - durationLen));
          
          // Also check if End Time snaps (secondary snap check)
          // If start didn't snap, maybe end will?
          // (Simple implementation: just snap start, but check boundaries)
          
          return {
            ...s,
            startTime: newStart,
            endTime: newStart + durationLen
          };
        } else {
          // Resize (only changes end time)
          let newEnd = prev.initialEnd + deltaSec;
          
          // Snap End Time
          newEnd = getSnapTime(newEnd, prev.id);
          
          // Clamp: must be > start and <= duration
          newEnd = Math.max(s.startTime + 0.5, Math.min(newEnd, duration));
          
          return {
            ...s,
            endTime: newEnd
          };
        }
      }));

      return prev;
    });
  };

  const handleMouseUp = () => {
    setActiveDrag(null);
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
    setSlides(prev => [...prev].sort((a, b) => a.startTime - b.startTime));
  };

  const handleZoomIn = () => setPxPerSec(prev => Math.min(200, prev + 10));
  const handleZoomOut = () => setPxPerSec(prev => Math.max(10, prev - 10));

  return (
    <div className="h-full flex flex-col bg-zinc-900/95 backdrop-blur-md border-l border-white/10 w-full md:w-96 z-20">
      
      {/* Header */}
      <div className="p-4 border-b border-white/10 flex flex-col gap-3 bg-zinc-900 z-30">
        <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold flex items-center gap-2">
            <ImageIcon size={20} className="text-purple-400" /> 
            Timeline
            </h2>
            <div className="flex items-center gap-1">
                <button onClick={handleZoomOut} className="p-1.5 hover:bg-zinc-700 rounded text-zinc-400 hover:text-white" title="Zoom Out">
                    <ZoomOut size={16} />
                </button>
                <button onClick={handleZoomIn} className="p-1.5 hover:bg-zinc-700 rounded text-zinc-400 hover:text-white" title="Zoom In">
                    <ZoomIn size={16} />
                </button>
            </div>
        </div>
        
        <div className="flex gap-2">
          <label className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-purple-600 hover:bg-purple-500 rounded text-sm font-medium cursor-pointer transition-colors">
            <Plus size={16} /> Add Images
            <input type="file" className="hidden" accept="image/*" multiple onChange={handleImageUpload} />
          </label>
          <button 
            onClick={handleClearAll}
            className="px-3 py-2 bg-zinc-800 hover:bg-red-900/50 text-zinc-300 hover:text-red-200 rounded transition-colors"
            title="Clear All Slides"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Timeline Container */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-y-auto relative bg-zinc-950 scroll-smooth"
      >
        <div className="relative" style={{ height: `${totalHeight}px`, minHeight: '100%' }}>
          
          {/* 1. Ruler (Left Column) */}
          <div className="absolute left-0 top-0 bottom-0 w-12 border-r border-white/10 bg-zinc-900/50 select-none z-10 pointer-events-none">
            {Array.from({ length: Math.ceil(totalHeight / (pxPerSec * RULER_INTERVAL)) }).map((_, i) => {
              const seconds = i * RULER_INTERVAL;
              if (seconds > timelineDuration) return null;
              return (
                <div 
                  key={i} 
                  className="absolute w-full border-t border-white/10 text-[10px] text-zinc-500 font-mono text-right pr-1.5 pt-0.5" 
                  style={{ top: seconds * pxPerSec, height: RULER_INTERVAL * pxPerSec }}
                >
                  {formatTime(seconds)}
                </div>
              );
            })}
          </div>

          {/* 2. Grid Lines (Horizontal) */}
          <div className="absolute left-12 right-0 top-0 bottom-0 pointer-events-none">
             {Array.from({ length: Math.ceil(totalHeight / (pxPerSec * RULER_INTERVAL)) }).map((_, i) => (
                <div 
                   key={i} 
                   className="absolute w-full border-t border-white/5" 
                   style={{ top: i * RULER_INTERVAL * pxPerSec }}
                ></div>
             ))}
             {/* End of Audio Line */}
             {duration > 0 && (
               <div 
                 className="absolute left-0 right-0 border-b-2 border-red-900/50 flex justify-center z-0"
                 style={{ top: duration * pxPerSec }}
               >
                 <span className="text-[10px] text-red-900/50 bg-black/50 px-1 -mt-2">End</span>
               </div>
             )}
          </div>

          {/* 3. Playhead (Current Time Indicator) */}
          <div 
            className="absolute left-12 right-0 border-t-2 border-red-500 z-10 pointer-events-none transition-transform duration-100 ease-linear"
            style={{ 
              top: 0,
              transform: `translateY(${currentTime * pxPerSec}px)` 
            }}
          >
             <div className="absolute right-0 -mt-2.5 bg-red-500 text-white text-[10px] px-1 rounded font-mono shadow-md">
                {formatTime(currentTime)}
             </div>
          </div>

          {/* 4. Slides Track (Fixed Width) */}
          <div className="absolute left-14 w-32 top-0 bottom-0 border-r border-white/5">
             {slides.map(slide => (
                <div 
                   key={slide.id}
                   style={{ 
                      top: slide.startTime * pxPerSec, 
                      height: Math.max(20, (slide.endTime - slide.startTime) * pxPerSec) 
                   }}
                   className={`absolute left-0 right-1 rounded-md overflow-hidden group bg-zinc-800 border shadow-sm select-none
                     ${activeDrag?.id === slide.id ? 'border-purple-400 z-20 shadow-xl opacity-90' : 'border-zinc-600 hover:border-zinc-400 z-0'}
                   `}
                   onMouseDown={(e) => handleMouseDown(e, slide.id, 'move')}
                >
                   {/* Background Image Preview */}
                   <img src={slide.url} className="w-full h-full object-cover opacity-50 pointer-events-none" draggable={false} alt={slide.name} />
                   
                   {/* Info Overlay */}
                   <div className="absolute inset-0 p-2 pointer-events-none flex flex-col justify-between">
                      <span className="text-xs font-bold drop-shadow-md truncate text-zinc-200">{slide.name}</span>
                      <span className="text-[10px] text-zinc-400">{(slide.endTime - slide.startTime).toFixed(1)}s</span>
                   </div>
                   
                   {/* Delete Button */}
                   <button 
                      onClick={(e) => { e.stopPropagation(); removeSlide(slide.id); }} 
                      className="absolute top-1 right-1 p-1 bg-black/60 hover:bg-red-500 rounded text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                   >
                      <X size={12} />
                   </button>
                   
                   {/* Resize Handle */}
                   <div 
                      className="absolute bottom-0 left-0 right-0 h-3 cursor-s-resize flex items-center justify-center bg-black/40 hover:bg-purple-500 transition-colors"
                      onMouseDown={(e) => handleMouseDown(e, slide.id, 'resize')}
                   >
                      <GripHorizontal size={12} className="text-white/70" />
                   </div>
                </div>
             ))}
          </div>

          {/* 5. Lyrics Track (Remaining Right) */}
          <div className="absolute left-48 right-0 top-0 bottom-0 pointer-events-none">
             {lyrics.map((line, idx) => (
                <div 
                   key={idx}
                   className="absolute left-2 right-2 text-[11px] text-zinc-400 truncate hover:text-white transition-colors hover:bg-zinc-800/50 rounded px-1 cursor-default pointer-events-auto flex items-center"
                   style={{ top: line.time * pxPerSec, height: 20 }}
                   title={`${formatTime(line.time)} - ${line.text}`}
                >
                   <span className="mr-2 text-zinc-600 font-mono text-[9px]">{formatTime(line.time)}</span>
                   {line.text}
                </div>
             ))}
          </div>

        </div>
      </div>
      
      {/* Help Footer */}
      <div className="p-2 text-center text-xs text-zinc-500 bg-zinc-900 border-t border-white/5 flex justify-between px-4">
         <span>Scale: {pxPerSec}px/s</span>
         <span>Drag to move • Resize</span>
      </div>
    </div>
  );
};

export default VisualEditor;