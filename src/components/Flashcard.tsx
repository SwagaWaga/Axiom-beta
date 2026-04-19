import React, { useState } from 'react';
import { VocabularyWord } from '../types/database';

interface FlashcardProps {
  wordObj: VocabularyWord;
  preferredAccent?: string;
  onEdit?: (word: VocabularyWord) => void;
  onPlayAudio?: (wordText: string) => void;
  onDelete?: (wordId: string | undefined) => void;
  onClose?: () => void;
}

export const Flashcard: React.FC<FlashcardProps> = ({
  wordObj,
  preferredAccent,
  onEdit,
  onPlayAudio,
  onDelete,
  onClose
}) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const [isFlipping, setIsFlipping] = useState(false);

  const handleFlip = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isFlipping) return;
    setIsFlipping(true);
    setIsFlipped(prev => !prev);
    setTimeout(() => setIsFlipping(false), 500); // Matches duration-500
  };

  // Extract the profile from the deeply joined fetch logic or fallback securely
  const profile = Array.isArray(wordObj.word_mastery_profiles) 
    ? wordObj.word_mastery_profiles[0] 
    : (wordObj.word_mastery_profiles || {});
    
  const recognitionScore = profile?.recognition_score || 0;
  const isFullyMastered = profile?.is_mastered || recognitionScore >= 100;

  // Determine if the word has passed the early learning stages to reveal collocations
  const isAdvancedPhase = recognitionScore >= 50;

  const getMasteryBadge = (score: number, isMastered: boolean) => {
    if (isMastered || score >= 100) return { icon: '👑', label: 'Mastered', color: 'text-amber-400 border-amber-500/50 bg-amber-500/10 px-3 py-1 rounded-full text-xs font-black' };
    if (score >= 70) return { icon: '🌳', label: 'Sapling', color: 'text-emerald-400 border-emerald-500/50 bg-emerald-500/10 px-3 py-1 rounded-full text-xs font-bold' };
    if (score >= 40) return { icon: '🌿', label: 'Sprout', color: 'text-teal-400 border-teal-500/50 bg-teal-500/10 px-3 py-1 rounded-full text-xs font-bold' };
    if (score >= 15) return { icon: '🌱', label: 'Seedling', color: 'text-green-400 border-green-500/30 bg-green-500/10 px-3 py-1 rounded-full text-xs font-bold' };
    return { icon: '🥚', label: 'Unseen', color: 'text-slate-400 border-slate-600/50 bg-slate-700/50 px-3 py-1 rounded-full text-xs font-bold' };
  };
  
  const growth = getMasteryBadge(recognitionScore, isFullyMastered);

  return (
    <div
      className="w-full h-[75vh] sm:h-auto sm:min-h-[500px] flex flex-col overflow-hidden relative [perspective:1000px]"
    >
      {/* Inner card wrapper handling the 3D flip */}
      <div
        className={`w-full h-full relative flex-1 [transform-style:preserve-3d] transition-transform duration-500 ease-out ${isFlipped ? '[transform:rotateY(180deg)]' : ''
          }`}
      >
        {/* ── FRONT FACE ── */}
        <div className="absolute inset-0 w-full h-full bg-slate-900 rounded-none sm:rounded-2xl shadow-lg border-0 sm:border border-slate-700 [backface-visibility:hidden] flex flex-col overflow-hidden">

          {/* Top bar: accent badge + utility icons */}
          <div className="flex items-center justify-between px-5 pt-5 pb-2 shrink-0">
            {wordObj.dna_type ? (
              <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest rounded-full bg-slate-700/60 text-slate-300 border border-slate-600/50">
                {wordObj.dna_type}
              </span>
            ) : <span />}

            <div className="flex items-center gap-2">
              {preferredAccent && (
                <span className="flex items-center justify-center shrink-0 px-1.5 py-0.5 bg-slate-700/80 text-slate-300 text-[9px] font-bold uppercase tracking-wider rounded">
                  {preferredAccent}
                </span>
              )}
              {onClose && (
                <button
                  onClick={onClose}
                  className="min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-400 hover:text-white bg-slate-700/50 hover:bg-slate-600 rounded-xl transition-colors text-sm font-bold"
                  title="Close"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-8 sm:py-8 pb-28 flex flex-col items-center justify-center w-full">
            <h2 className="w-full min-w-0 text-3xl sm:text-5xl font-extrabold text-white capitalize break-words hyphens-auto text-center leading-tight">
              {wordObj.word}
            </h2>

            {/* Dynamic Growth Indicator Badge */}
            <div className="inline-flex items-center justify-center gap-1.5 mt-4 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-slate-800/60 border border-slate-700/50 text-slate-400 shadow-sm" title={`Mastery Level: ${wordObj.mastery_level || 1}`}>
              <span className={growth.color}>{growth.icon}</span>
              <span>{growth.label}</span>
            </div>

            <p className="mt-4 text-xs text-slate-500 font-medium tracking-widest uppercase opacity-70">
              Tap to see definition
            </p>
          </div>

          {/* ── Sticky Footer (Front) ── */}
          <div className="flex-shrink-0 w-full p-4 bg-slate-900 border-t border-slate-700 flex justify-center gap-4 z-10 sm:rounded-b-2xl">
            {onPlayAudio && (
              <button
                onClick={() => onPlayAudio(wordObj.word)}
                className="min-h-[48px] px-6 py-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 hover:text-white transition-all flex items-center gap-2 font-semibold text-sm active:scale-95"
                title="Play Pronunciation"
              >
                🔊 <span className="hidden sm:inline">Listen</span>
              </button>
            )}
            <button
              onClick={handleFlip}
              disabled={isFlipping}
              className="min-h-[48px] px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-all flex items-center gap-2 font-semibold text-sm active:scale-95 shadow-lg shadow-indigo-900/40 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:active:scale-100"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Flip Card
            </button>
            {onEdit && (
              <button
                onClick={() => onEdit(wordObj)}
                className="min-h-[48px] px-4 py-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 hover:text-white transition-all flex items-center gap-2 font-semibold text-sm active:scale-95"
                title="Edit Word"
              >
                ✏️
              </button>
            )}
            {onDelete && (
              <button
                onClick={() => onDelete(wordObj.id)}
                className="min-h-[48px] px-4 py-3 rounded-xl bg-slate-700 hover:bg-rose-700 text-slate-400 hover:text-white transition-all flex items-center gap-2 font-semibold text-sm active:scale-95"
                title="Delete Word"
              >
                🗑️
              </button>
            )}
          </div>
        </div>

        {/* ── BACK FACE ── */}
        <div className="absolute inset-0 w-full h-full bg-slate-900 rounded-none sm:rounded-2xl shadow-lg border-0 sm:border border-slate-700 [backface-visibility:hidden] [transform:rotateY(180deg)] flex flex-col overflow-hidden">

          {/* Top bar */}
          <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-2 shrink-0">
            {/* Word + POS — min-w-0 lets this shrink so it never pushes the right side off-screen */}
            <div className="flex flex-col min-w-0 flex-1">
              <h3 className="text-3xl sm:text-5xl font-extrabold text-white capitalize break-words hyphens-auto leading-tight">{wordObj.word}</h3>
              {wordObj.part_of_speech && (
                <span className="mt-1 self-start text-xs font-bold uppercase tracking-widest text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-md">
                  {wordObj.part_of_speech}
                </span>
              )}
            </div>
            {/* Controls — flex-shrink-0 guarantees they're never crushed */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {wordObj.dna_type && (
                <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest rounded-full bg-slate-700/60 text-slate-300 border border-slate-600/50">
                  {wordObj.dna_type}
                </span>
              )}
              {onClose && (
                <button
                  onClick={onClose}
                  className="min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-400 hover:text-white bg-slate-700/50 hover:bg-slate-600 rounded-xl transition-colors text-sm font-bold"
                  title="Close"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-8">
            {/* Definition */}
            <p className="text-base text-slate-300 font-medium leading-relaxed p-3 sm:p-5 mb-0 pt-2">
              {wordObj.definition}
            </p>

            {/* Context sentence */}
            {wordObj.context && (
              <p className="text-sm italic text-slate-500 mt-4 sm:mt-8 p-3 sm:p-5 border-l-2 border-slate-600">
                "{wordObj.context}"
              </p>
            )}

            {/* Memory Hooks */}
            {wordObj.word_connections && (
              <div className="mt-4 sm:mt-8 pt-4 sm:pt-6 border-t border-slate-700/50 flex flex-col gap-3 sm:gap-6">
                <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-0 -mb-1 sm:-mb-3">Memory Hooks</p>

                {wordObj.word_connections.synonyms?.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1.5 font-bold">Synonyms</p>
                    <div className="flex flex-wrap gap-1.5">
                      {wordObj.word_connections.synonyms.map((s, i) => (
                        <span key={i} className="px-2.5 py-1 text-xs font-medium rounded-md bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">{s}</span>
                      ))}
                    </div>
                  </div>
                )}

                {wordObj.word_connections.antonyms?.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1.5 font-bold">Antonyms</p>
                    <div className="flex flex-wrap gap-1.5">
                      {wordObj.word_connections.antonyms.map((a, i) => (
                        <span key={i} className="px-2.5 py-1 text-xs font-medium rounded-md bg-rose-500/10 text-rose-300 border border-rose-500/20">{a}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* SPOILER LOCK: Only renders if isAdvancedPhase is true */}
                {isAdvancedPhase && wordObj.word_connections?.collocations && wordObj.word_connections.collocations.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1.5 font-bold">Collocations</p>
                    <div className="flex flex-wrap gap-1.5">
                      {wordObj.word_connections.collocations.map((collocation, idx) => (
                        <span key={idx} className="px-2.5 py-1 text-xs font-medium rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/20 break-words">
                          {collocation}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {wordObj.word_connections.wordFamily && (
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1.5 font-bold">Word Family</p>
                    <div className="border-l-2 border-indigo-500/50 pl-3 py-1">
                      <p className="text-sm text-slate-400 italic">{wordObj.word_connections.wordFamily}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Sticky Footer (Back) ── */}
          <div className="flex-shrink-0 w-full p-4 bg-slate-900 border-t border-slate-700 flex justify-center gap-4 z-10 sm:rounded-b-2xl">
            {onPlayAudio && (
              <button
                onClick={() => onPlayAudio(wordObj.word)}
                className="min-h-[48px] px-6 py-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 hover:text-white transition-all flex items-center gap-2 font-semibold text-sm active:scale-95"
                title="Play Pronunciation"
              >
                🔊 <span className="hidden sm:inline">Listen</span>
              </button>
            )}
            <button
              onClick={handleFlip}
              disabled={isFlipping}
              className="min-h-[48px] px-6 py-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 hover:text-white transition-all flex items-center gap-2 font-semibold text-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:active:scale-100"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Flip Back
            </button>
            {onEdit && (
              <button
                onClick={() => onEdit(wordObj)}
                className="min-h-[48px] px-4 py-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 hover:text-white transition-all flex items-center gap-2 font-semibold text-sm active:scale-95"
                title="Edit Word"
              >
                ✏️
              </button>
            )}
            {onDelete && (
              <button
                onClick={() => onDelete(wordObj.id)}
                className="min-h-[48px] px-4 py-3 rounded-xl bg-slate-700 hover:bg-rose-700 text-slate-400 hover:text-white transition-all flex items-center gap-2 font-semibold text-sm active:scale-95"
                title="Delete Word"
              >
                🗑️
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
