import React, { useState, useRef, useEffect, useCallback } from 'react';
import { VisualSlide, LyricLine } from '../types';
import { Plus, X, ImageIcon, GripHorizontal, ZoomIn, ZoomOut, Trash2, Volume2, VolumeX, Undo2, Redo2, Copy, Clipboard, Scissors, Film } from './Icons';
import { formatTime } from '../utils/parsers';

interface VisualEditorProps {
  slides: VisualSlide[];
  setSlides: React.Dispatch<React.SetStateAction<VisualSlide[]>>;
  currentTime: number;
  duration: number;
  lyrics: LyricLine[];
  onSeek: (time: number) => void;
  onClose: () => void;
}

// Dynamic ruler interval based on zoom level
const getRulerInterval = (pxPerSec: number): number => {
  // Higher zoom = smaller intervals for more detail
  if (pxPerSec >= 150) return 0.5;   // Very high zoom: 0.5s intervals
  if (pxPerSec >= 100) return 1;     // High zoom: 1s intervals
  if (pxPerSec >= 60) return 2;      // Medium-high zoom: 2s intervals
  if (pxPerSec >= 40) return 5;      // Medium zoom: 5s intervals
  if (pxPerSec >= 25) return 10;     // Low zoom: 10s intervals
  return 15;                          // Very low zoom: 15s intervals
};

// Format time for ruler with precision based on interval
const formatRulerTime = (seconds: number, interval: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;

  // Show decimal for sub-second intervals
  if (interval < 1) {
    return `${mins}:${secs.toFixed(1).padStart(4, '0')}`;
  }

  return `${mins}:${Math.floor(secs).toString().padStart(2, '0')}`;
};
const SNAP_THRESHOLD_PX = 10; // Pixels to snap
const MAX_HISTORY_SIZE = 50; // Maximum number of undo steps

const getMediaDuration = (file: File): Promise<number> => {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const element = document.createElement(file.type.startsWith('audio/') ? 'audio' : 'video');
    element.preload = 'metadata';
    element.onloadedmetadata = () => {
      resolve(element.duration);
      URL.revokeObjectURL(objectUrl);
    };
    element.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(0);
    };
    element.src = objectUrl;
  });
};

const VisualEditor: React.FC<VisualEditorProps> = ({ slides, setSlides, currentTime, duration, lyrics, onSeek, onClose }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [pxPerSec, setPxPerSec] = useState(40); // Default zoom level

  // --- Undo/Redo History ---
  const [history, setHistory] = useState<VisualSlide[][]>([slides]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);
  const isUndoRedoAction = useRef<boolean>(false);

  // Sync history when slides change externally
  useEffect(() => {
    if (isUndoRedoAction.current) {
      isUndoRedoAction.current = false;
      return;
    }
    const currentHistoryState = history[historyIndex];
    if (JSON.stringify(currentHistoryState) !== JSON.stringify(slides)) {
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(slides);
      if (newHistory.length > MAX_HISTORY_SIZE) {
        newHistory.shift();
        setHistory(newHistory);
      } else {
        setHistory(newHistory);
        setHistoryIndex(historyIndex + 1);
      }
    }
  }, [slides, history, historyIndex]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      isUndoRedoAction.current = true;
      setSlides(history[newIndex]);
    }
  }, [setSlides, history, historyIndex]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      isUndoRedoAction.current = true;
      setSlides(history[newIndex]);
    }
  }, [setSlides, history, historyIndex]);

  const maxSlideEnd = Math.max(0, ...slides.map(s => s.endTime));
  const timelineDuration = Math.max(duration, 60, maxSlideEnd);
  const totalWidth = timelineDuration * pxPerSec;

  const [selectedSlideIds, setSelectedSlideIds] = useState<string[]>([]);
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [clipboard, setClipboard] = useState<VisualSlide[]>([]);

  const handleCopy = useCallback(() => {
    if (selectedSlideIds.length === 0) return;
    const selectedSlides = slides.filter(s => selectedSlideIds.includes(s.id));
    setClipboard(selectedSlides);
  }, [selectedSlideIds, slides]);

  const handleCut = useCallback(() => {
    if (selectedSlideIds.length === 0) return;
    const selectedSlides = slides.filter(s => selectedSlideIds.includes(s.id));
    setClipboard(selectedSlides);
    setSlides(prev => prev.filter(s => !selectedSlideIds.includes(s.id)));
    setSelectedSlideIds([]);
  }, [selectedSlideIds, slides, setSlides]);

  const slidesRef = useRef(slides);
  const pxPerSecRef = useRef(pxPerSec);

  useEffect(() => {
    slidesRef.current = slides;
    pxPerSecRef.current = pxPerSec;
  }, [slides, pxPerSec]);

  const handlePaste = useCallback(() => {
    if (clipboard.length === 0) return;

    const minStartTime = Math.min(...clipboard.map(s => s.startTime));
    const offset = currentTime - minStartTime;

    const newSlides: VisualSlide[] = clipboard.map(s => ({
      ...s,
      id: Math.random().toString(36).substr(2, 9),
      startTime: s.startTime + offset,
      endTime: s.endTime + offset
    }));

    setSlides(prev => [...prev, ...newSlides].sort((a, b) => a.startTime - b.startTime));
    setSelectedSlideIds(newSlides.map(s => s.id));
  }, [clipboard, currentTime, setSlides]);

  const [activeDrag, setActiveDrag] = useState<{
    id: string;
    type: 'move' | 'resize-start' | 'resize-end';
    startX: number;
    initialStart: number;
    initialEnd: number;
    initialMap: Record<string, { start: number, end: number }>;
  } | null>(null);

  const [isScrubbing, setIsScrubbing] = useState(false);
  const [selectionBox, setSelectionBox] = useState<{ x: number, y: number, w: number, h: number } | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files: File[] = Array.from(e.target.files);
      const isAllImages = files.every(f => f.type.startsWith('image/'));

      const newSlides: VisualSlide[] = [];

      if (isAllImages) {
        const fileCount = files.length;
        const startTime = currentTime;
        const remainingDuration = Math.max(0, duration - startTime);
        const calculatedDuration = remainingDuration / fileCount;
        const durationPerImage = Math.max(3, calculatedDuration);

        files.forEach((file, index) => {
          const url = URL.createObjectURL(file);
          const start = startTime + (index * durationPerImage);
          const end = start + durationPerImage;

          newSlides.push({
            id: Math.random().toString(36).substr(2, 9),
            url,
            type: 'image',
            startTime: start,
            endTime: end,
            name: file.name
          });
        });
      } else {
        let currentStart = currentTime;

        for (const file of files) {
          const isVideo = file.type.startsWith('video/');
          const isImage = file.type.startsWith('image/');
          const isAudio = file.type.startsWith('audio/');
          
          if (!isVideo && !isImage && !isAudio) continue;

          const type = isImage ? 'image' : (isVideo ? 'video' : 'audio');
          let itemDuration = 5;

          if (type !== 'image') {
            const d = await getMediaDuration(file);
            if (d > 0) itemDuration = d;
          }

          const url = URL.createObjectURL(file);
          newSlides.push({
            id: Math.random().toString(36).substr(2, 9),
            url,
            type,
            startTime: currentStart,
            endTime: currentStart + itemDuration,
            name: file.name,
            volume: type === 'audio' || type === 'video' ? 1 : undefined
          });

          currentStart += itemDuration;
        }
      }

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
    // Confirmation removed for seamless experience
    setSlides([]);
  };

  const handleMouseDown = (e: React.MouseEvent, id: string, type: 'move' | 'resize-start' | 'resize-end') => {
    e.stopPropagation();
    e.preventDefault();
    editorRef.current?.focus();

    if (e.shiftKey && lastSelectedId) {
      const anchorIndex = slides.findIndex(s => s.id === lastSelectedId);
      const clickedIndex = slides.findIndex(s => s.id === id);

      if (anchorIndex !== -1 && clickedIndex !== -1) {
        const startIdx = Math.min(anchorIndex, clickedIndex);
        const endIdx = Math.max(anchorIndex, clickedIndex);
        const rangeIds = slides.slice(startIdx, endIdx + 1).map(s => s.id);
        setSelectedSlideIds(prev => {
          const combined = new Set([...prev, ...rangeIds]);
          return Array.from(combined);
        });
      }
    } else if (e.ctrlKey || e.metaKey) {
      setSelectedSlideIds(prev => {
        if (prev.includes(id)) return prev.filter(sid => sid !== id);
        return [...prev, id];
      });
      setLastSelectedId(id);
    } else if (selectedSlideIds.includes(id)) {
      setLastSelectedId(id);
    } else {
      setSelectedSlideIds([id]);
      setLastSelectedId(id);
    }

    const slide = slides.find(s => s.id === id);
    if (!slide) return;

    const isAlreadySelected = selectedSlideIds.includes(id);
    const isModifier = e.ctrlKey || e.metaKey || e.shiftKey;
    let dragSet: string[] = [];

    if (!isModifier && !isAlreadySelected) {
      dragSet = [id];
    } else if (isModifier) {
      dragSet = [id];
      if ((e.ctrlKey || e.metaKey) && !isAlreadySelected) {
        dragSet = [...selectedSlideIds, id];
      }
      else if ((e.ctrlKey || e.metaKey) && isAlreadySelected) {
        dragSet = selectedSlideIds.filter(sid => sid !== id);
        if (dragSet.length === 0) return;
      }
    } else {
      dragSet = selectedSlideIds;
    }

    const initialMap: Record<string, { start: number, end: number }> = {};
    slides.forEach(s => {
      if (dragSet.includes(s.id)) {
        initialMap[s.id] = { start: s.startTime, end: s.endTime };
      }
    });

    if (!initialMap[id]) {
      initialMap[id] = { start: slide.startTime, end: slide.endTime };
    }

    setActiveDrag({
      id,
      type,
      startX: e.clientX,
      initialStart: slide.startTime,
      initialEnd: slide.endTime,
      initialMap
    });

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleRulerMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    editorRef.current?.focus();
    setSelectedSlideIds([]);
    setIsScrubbing(true);
    updateScrubPosition(e.clientX);
    window.addEventListener('mousemove', handleScrubMouseMove);
    window.addEventListener('mouseup', handleScrubMouseUp);
  };

  const handleTrackMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    editorRef.current?.focus();
    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const trackRect = trackRef.current?.getBoundingClientRect();
    if (!trackRect) return;
    const startX = startClientX - trackRect.left;
    const startY = startClientY - trackRect.top;
    let isDragSelect = false;

    const handleTrackMouseMove = (ev: MouseEvent) => {
      const dist = Math.sqrt(Math.pow(ev.clientX - startClientX, 2) + Math.pow(ev.clientY - startClientY, 2));
      if (!isDragSelect && dist > 5) isDragSelect = true;
      if (isDragSelect && trackRef.current) {
        const currentRect = trackRef.current.getBoundingClientRect();
        const currentX = ev.clientX - currentRect.left;
        const currentY = ev.clientY - currentRect.top;
        const boxX = Math.min(startX, currentX);
        const boxY = Math.min(startY, currentY);
        const boxW = Math.abs(currentX - startX);
        const boxH = Math.abs(currentY - startY);
        setSelectionBox({ x: boxX, y: boxY, w: boxW, h: boxH });

        const newSelectedIds: string[] = [];
        const currentSlides = slidesRef.current;
        const currentPxPerSec = pxPerSecRef.current;
        const boxRight = boxX + boxW;
        const boxBottom = boxY + boxH;

        currentSlides.forEach(slide => {
          const slideLeft = slide.startTime * currentPxPerSec;
          const slideRight = slide.endTime * currentPxPerSec;
          let slideTop = 0, slideBottom = 0;
          if (slide.type === 'audio') { slideTop = 160; slideBottom = 192; }
          else { slideTop = 32; slideBottom = 96; }
          const overlapsX = (boxX < slideRight) && (boxRight > slideLeft);
          const overlapsY = (boxY < slideBottom) && (boxBottom > slideTop);
          if (overlapsX && overlapsY) newSelectedIds.push(slide.id);
        });
        setSelectedSlideIds(newSelectedIds);
      }
    };

    const handleTrackMouseUp = (ev: MouseEvent) => {
      if (!isDragSelect) {
        setSelectedSlideIds([]);
        updateScrubPosition(ev.clientX);
      }
      setSelectionBox(null);
      window.removeEventListener('mousemove', handleTrackMouseMove);
      window.removeEventListener('mouseup', handleTrackMouseUp);
    };

    window.addEventListener('mousemove', handleTrackMouseMove);
    window.addEventListener('mouseup', handleTrackMouseUp);
  };

  const updateScrubPosition = (clientX: number) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const offsetX = clientX - rect.left;
    let time = Math.max(0, Math.min(offsetX / pxPerSec, timelineDuration));
    time = getSnapTime(time);
    onSeek(time);
  };

  const handleScrubMouseMove = (e: MouseEvent) => updateScrubPosition(e.clientX);
  const handleScrubMouseUp = () => {
    setIsScrubbing(false);
    window.removeEventListener('mousemove', handleScrubMouseMove);
    window.removeEventListener('mouseup', handleScrubMouseUp);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo(); return; }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); handleRedo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === 'c') { e.preventDefault(); handleCopy(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === 'x') { e.preventDefault(); handleCut(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === 'v') { e.preventDefault(); handlePaste(); return; }

    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedSlideIds.length > 0) {
      e.preventDefault();
      setSlides(prev => prev.filter(s => !selectedSlideIds.includes(s.id)));
      setSelectedSlideIds([]);
    }

    if (selectedSlideIds.length > 0 && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      e.stopPropagation();
      const delta = e.key === 'ArrowRight' ? 0.01 : -0.01;
      const firstSelected = slides.find(s => s.id === selectedSlideIds[0]);
      if (firstSelected) onSeek(Math.max(0, firstSelected.startTime + delta));
      setSlides(prev => {
        const updated = prev.map(s => {
          if (selectedSlideIds.includes(s.id)) {
            const durationLen = s.endTime - s.startTime;
            let newStart = Math.max(0, s.startTime + delta);
            return { ...s, startTime: newStart, endTime: newStart + durationLen };
          }
          return s;
        });
        return updated.sort((a, b) => a.startTime - b.startTime);
      });
    }
  };

  const getSnapTime = (proposedTime: number, ignoreIds: string[] = []): number => {
    const snapThresholdSec = SNAP_THRESHOLD_PX / pxPerSec;
    const snapPoints = [0, duration, currentTime];
    const rulerInterval = getRulerInterval(pxPerSec);
    snapPoints.push(Math.round(proposedTime / rulerInterval) * rulerInterval);
    slides.forEach(s => {
      if (!ignoreIds.includes(s.id)) { snapPoints.push(s.startTime); snapPoints.push(s.endTime); }
    });
    lyrics.forEach(line => snapPoints.push(line.time));
    let closest = proposedTime;
    let minDiff = snapThresholdSec;
    for (const point of snapPoints) {
      const diff = Math.abs(point - proposedTime);
      if (diff < minDiff) { minDiff = diff; closest = point; }
    }
    return closest;
  };

  const handleMouseMove = (e: MouseEvent) => {
    setActiveDrag(prev => {
      if (!prev) return null;
      const deltaSec = (e.clientX - prev.startX) / pxPerSec;
      setSlides(currentSlides => {
        if (prev.type === 'move') {
          const movingIds = Object.keys(prev.initialMap);
          const allInits = Object.values(prev.initialMap) as { start: number, end: number }[];
          const groupInitStart = Math.min(...allInits.map(i => i.start));
          const draggedInit = prev.initialMap[prev.id];
          const snapPoints = [0, duration, currentTime];
          const rulerInterval = getRulerInterval(pxPerSec);
          slides.forEach(s => { if (!movingIds.includes(s.id)) { snapPoints.push(s.startTime); snapPoints.push(s.endTime); } });
          lyrics.forEach(line => snapPoints.push(line.time));

          let bestDelta = deltaSec, minSnapDist = SNAP_THRESHOLD_PX / pxPerSec, foundSnap = false;
          const candidates = [draggedInit.start, draggedInit.end, groupInitStart, Math.max(...allInits.map(i => i.end))];
          for (const cand of candidates) {
            const proposedVal = cand + deltaSec;
            for (const point of snapPoints) {
              const dist = Math.abs(point - proposedVal);
              if (dist < minSnapDist) { minSnapDist = dist; bestDelta = point - cand; foundSnap = true; }
            }
            const gridDist = Math.abs(Math.round(proposedVal / rulerInterval) * rulerInterval - proposedVal);
            if (gridDist < minSnapDist) { minSnapDist = gridDist; bestDelta = Math.round(proposedVal / rulerInterval) * rulerInterval - cand; foundSnap = true; }
          }
          let effectiveDelta = foundSnap ? bestDelta : deltaSec;
          if (groupInitStart + effectiveDelta < 0) effectiveDelta = -groupInitStart;
          return currentSlides.map(s => {
            const init = prev.initialMap[s.id];
            if (init) {
              const d = init.end - init.start;
              return { ...s, startTime: init.start + effectiveDelta, endTime: init.start + effectiveDelta + d };
            }
            return s;
          });
        } else if (prev.type === 'resize-start') {
          let newStart = getSnapTime(prev.initialStart + deltaSec, [prev.id]);
          newStart = Math.max(0, Math.min(newStart, prev.initialEnd - 0.5));
          return currentSlides.map(s => s.id === prev.id ? { ...s, startTime: newStart } : s);
        } else {
          let newEnd = getSnapTime(prev.initialEnd + deltaSec, [prev.id]);
          newEnd = Math.max(prev.initialStart + 0.5, newEnd);
          return currentSlides.map(s => s.id === prev.id ? { ...s, endTime: newEnd } : s);
        }
      });
      return prev;
    });
  };

  const handleMouseUp = (e: MouseEvent) => {
    if (activeDrag && activeDrag.type === 'move' && Math.abs(e.clientX - activeDrag.startX) < 5) {
      if (!e.ctrlKey && !e.metaKey && !e.shiftKey) setSelectedSlideIds([activeDrag.id]);
    }
    setActiveDrag(null);
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
    setSlides(prev => [...prev].sort((a, b) => a.startTime - b.startTime));
  };

  return (
    <div
      ref={editorRef}
      className="w-full max-w-[100vw] h-64 flex flex-col bg-zinc-900/95 backdrop-blur-md border-t border-white/10 z-20 shadow-xl overflow-hidden outline-none"
      tabIndex={0}
      onMouseDown={(e) => e.currentTarget.focus()}
      onKeyDown={handleKeyDown}
    >
      <div className="p-2 border-b border-white/10 flex items-center justify-between bg-zinc-900 z-30 shrink-0 h-12">
        <div className="flex items-center gap-4 shrink-0">
          <h2 className="text-sm font-bold flex items-center gap-2 text-zinc-300 whitespace-nowrap">
            <Film size={16} className="text-purple-400" /> Timeline
          </h2>
          <div className="w-px h-4 bg-zinc-700"></div>
          <div className="flex items-center gap-1">
            <button onClick={() => setPxPerSec(prev => Math.max(10, prev - 10))} className="p-1 hover:bg-zinc-700 rounded text-zinc-400 hover:text-white"><ZoomOut size={14} /></button>
            <div className="text-[10px] text-zinc-500 font-mono min-w-[50px] text-center">{pxPerSec}px/s</div>
            <button onClick={() => setPxPerSec(prev => Math.min(200, prev + 10))} className="p-1 hover:bg-zinc-700 rounded text-zinc-400 hover:text-white"><ZoomIn size={14} /></button>
          </div>
          <div className="w-px h-4 bg-zinc-700"></div>
          <div className="flex items-center gap-1">
            <button onClick={handleUndo} disabled={!canUndo} className="p-1 hover:bg-zinc-700 rounded text-zinc-400 hover:text-white disabled:opacity-30"><Undo2 size={14} /></button>
            <button onClick={handleRedo} disabled={!canRedo} className="p-1 hover:bg-zinc-700 rounded text-zinc-400 hover:text-white disabled:opacity-30"><Redo2 size={14} /></button>
          </div>
          <div className="w-px h-4 bg-zinc-700"></div>
          <div className="flex items-center gap-1">
            <button onClick={handleCopy} disabled={selectedSlideIds.length === 0} className="p-1 hover:bg-zinc-700 rounded text-zinc-400 hover:text-white disabled:opacity-30"><Copy size={14} /></button>
            <button onClick={handleCut} disabled={selectedSlideIds.length === 0} className="p-1 hover:bg-zinc-700 rounded text-zinc-400 hover:text-white disabled:opacity-30"><Scissors size={14} /></button>
            <button onClick={handlePaste} disabled={clipboard.length === 0} className="p-1 hover:bg-zinc-700 rounded text-zinc-400 hover:text-white disabled:opacity-30"><Clipboard size={14} /></button>
          </div>
          <div className="w-px h-4 bg-zinc-700"></div>
          <div className="flex items-center gap-2">
            <button onClick={() => setSelectedSlideIds(slides.length > 0 && selectedSlideIds.length === slides.length ? [] : slides.map(s => s.id))} className="px-2 py-0.5 text-[10px] bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-zinc-300">Select All</button>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={handleClearAll} className="p-1 hover:bg-red-900/50 text-zinc-500 hover:text-red-200 rounded transition-colors"><Trash2 size={14} /></button>
          <label className="flex items-center gap-2 px-3 py-1 bg-purple-600 hover:bg-purple-500 rounded text-xs font-medium cursor-pointer transition-colors text-white whitespace-nowrap">
            <Plus size={14} /> Import Media
            <input type="file" className="hidden" accept="image/*,audio/*,video/*" multiple onChange={handleFileUpload} />
          </label>
          <div className="w-px h-4 bg-zinc-700 mx-1 self-center"></div>
          <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="p-1 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded transition-colors"><X size={14} /></button>
        </div>
      </div>
      <div ref={containerRef} onWheel={(e) => { if (containerRef.current) containerRef.current.scrollLeft += e.deltaY; }} className="flex-1 overflow-x-auto overflow-y-hidden relative bg-zinc-950 scroll-smooth custom-scrollbar cursor-default">
        <div ref={trackRef} className="relative h-full" style={{ width: `${totalWidth}px`, minWidth: '100%' }} onMouseDown={handleTrackMouseDown}>
          {selectionBox && <div className="absolute border border-purple-500 bg-purple-500/20 z-50 pointer-events-none" style={{ left: selectionBox.x, top: selectionBox.y, width: selectionBox.w, height: selectionBox.h }} />}
          <div className="absolute top-0 left-0 right-0 h-6 border-b border-white/10 bg-zinc-900/50 select-none cursor-pointer z-40" onMouseDown={handleRulerMouseDown}>
            {(() => {
              const interval = getRulerInterval(pxPerSec);
              return Array.from({ length: Math.ceil(totalWidth / (pxPerSec * interval)) }).map((_, i) => {
                const sec = i * interval;
                if (sec > timelineDuration) return null;
                return <div key={i} className="absolute bottom-0 border-l border-white/20 text-[9px] text-zinc-500 font-mono pl-1 pb-0.5 pointer-events-none" style={{ left: sec * pxPerSec, width: interval * pxPerSec }}>{formatRulerTime(sec, interval)}</div>;
              });
            })()}
          </div>
          <div className="absolute top-6 bottom-0 left-0 right-0 pointer-events-none">
            {(() => {
              const interval = getRulerInterval(pxPerSec);
              return Array.from({ length: Math.ceil(totalWidth / (pxPerSec * interval)) }).map((_, i) => <div key={i} className="absolute h-full border-l border-white/5" style={{ left: i * interval * pxPerSec }}></div>);
            })()}
            {duration > 0 && <div className="absolute top-0 bottom-0 border-l-2 border-red-900/50 flex flex-col justify-end z-0" style={{ left: duration * pxPerSec }}><span className="text-[9px] text-red-900/50 bg-black/50 px-1 whitespace-nowrap">End</span></div>}
          </div>
          <div className="absolute top-0 bottom-0 border-l-2 border-red-500 z-50 cursor-ew-resize group" style={{ left: 0, transform: `translateX(${currentTime * pxPerSec}px)` }} onMouseDown={handleRulerMouseDown}><div className="absolute top-6 -ml-2.5 bg-red-500 text-white text-[9px] px-1 rounded font-mono shadow-md z-30 group-hover:scale-110 transition-transform">{formatTime(currentTime)}</div></div>
          <div className="absolute top-8 h-16 left-0 right-0 border-b border-white/5 bg-zinc-900/20">
            {slides.filter(s => s.type !== 'audio').map(slide => (
              <div key={slide.id} style={{ left: slide.startTime * pxPerSec, width: Math.max(10, (slide.endTime - slide.startTime) * pxPerSec) }} className={`absolute top-1 bottom-1 rounded-md overflow-hidden group bg-zinc-800 border shadow-sm select-none cursor-move ${(activeDrag?.id === slide.id || selectedSlideIds.includes(slide.id)) ? 'border-purple-400 z-30 shadow-xl opacity-90' : 'border-zinc-600 hover:border-zinc-400 z-10'} ${selectedSlideIds.includes(slide.id) ? 'ring-2 ring-blue-500/70 ring-offset-zinc-950' : ''}`} onMouseDown={(e) => handleMouseDown(e, slide.id, 'move')}>
                {slide.type === 'video' ? (
                  <video src={slide.url} className="w-full h-full object-cover opacity-60 pointer-events-none" draggable={false} />
                ) : (
                  <img src={slide.url} className="w-full h-full object-cover opacity-60 pointer-events-none" draggable={false} alt={slide.name} />
                )}
                <div className="absolute inset-0 p-1 pointer-events-none flex flex-col justify-end">
                  <div className="flex items-center gap-1">
                    {slide.type === 'video' && <Film size={10} className="text-purple-300" />}
                    <span className="text-[10px] font-bold drop-shadow-md truncate text-zinc-200 bg-black/30 px-1 rounded w-max max-w-full">{slide.name}</span>
                  </div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); removeSlide(slide.id); }} className="absolute top-1 right-4 p-0.5 bg-black/60 hover:bg-red-500 rounded text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer z-30"><X size={10} /></button>
                <div className="absolute top-0 bottom-0 left-0 w-3 cursor-w-resize flex items-center justify-center bg-black/20 hover:bg-purple-500/80 transition-colors z-20" onMouseDown={(e) => handleMouseDown(e, slide.id, 'resize-start')}><GripHorizontal size={10} className="text-white/70 rotate-90" /></div>
                <div className="absolute top-0 bottom-0 right-0 w-3 cursor-e-resize flex items-center justify-center bg-black/20 hover:bg-purple-500/80 transition-colors z-20" onMouseDown={(e) => handleMouseDown(e, slide.id, 'resize-end')}><GripHorizontal size={10} className="text-white/70 rotate-90" /></div>
              </div>
            ))}
          </div>
          <div className="absolute top-28 h-10 left-0 right-0 overflow-hidden">
            {lyrics.map((line, idx) => <div key={idx} className="absolute top-1 bottom-1 text-[10px] text-zinc-400 truncate hover:text-white transition-colors hover:bg-zinc-800/50 rounded px-2 cursor-pointer border-l border-zinc-700 flex items-center whitespace-nowrap" style={{ left: line.time * pxPerSec }} onClick={(e) => { e.stopPropagation(); onSeek(line.time); }}><span className="mr-1 text-zinc-600 font-mono text-[9px]">{formatTime(line.time)}</span>{line.text}</div>)}
          </div>
          <div className="absolute top-40 h-8 left-0 right-0 border-t border-white/5 bg-zinc-900/40">
            {slides.filter(s => s.type === 'audio').map(slide => (
              <div key={slide.id} style={{ left: slide.startTime * pxPerSec, width: Math.max(10, (slide.endTime - slide.startTime) * pxPerSec) }} className={`absolute top-1 bottom-1 rounded-md overflow-hidden group bg-emerald-900/50 border shadow-sm select-none cursor-move ${(activeDrag?.id === slide.id || selectedSlideIds.includes(slide.id)) ? 'border-emerald-400 z-30 shadow-xl opacity-90' : 'border-emerald-700/50 hover:border-emerald-500 z-10'} ${selectedSlideIds.includes(slide.id) ? 'ring-2 ring-blue-500/70 ring-offset-zinc-950' : ''}`} onMouseDown={(e) => handleMouseDown(e, slide.id, 'move')}>
                <div className="absolute inset-0 flex items-center justify-center opacity-30"><Volume2 size={16} className="text-emerald-200" /></div>
                <div className="absolute inset-0 p-1 pointer-events-none flex flex-col justify-center"><span className="text-[9px] font-bold drop-shadow-md truncate text-emerald-100 px-1">{slide.name}</span></div>
                <button onClick={(e) => { e.stopPropagation(); setSlides(prev => prev.map(s => s.id === slide.id ? { ...s, isMuted: !s.isMuted } : s)); }} className="absolute top-1 right-10 p-0.5 bg-black/60 hover:bg-emerald-600 rounded text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer z-40">{slide.isMuted === true ? <VolumeX size={10} /> : <Volume2 size={10} />}</button>
                <button onClick={(e) => { e.stopPropagation(); removeSlide(slide.id); }} className="absolute top-1 right-3 p-0.5 bg-black/60 hover:bg-red-500 rounded text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer z-40"><X size={10} /></button>
                <div className="absolute top-0 bottom-0 left-0 w-2 cursor-w-resize flex items-center justify-center hover:bg-emerald-500/50 transition-colors z-20" onMouseDown={(e) => handleMouseDown(e, slide.id, 'resize-start')}></div>
                <div className="absolute top-0 bottom-0 right-0 w-2 cursor-e-resize flex items-center justify-center hover:bg-emerald-500/50 transition-colors z-20" onMouseDown={(e) => handleMouseDown(e, slide.id, 'resize-end')}></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VisualEditor;