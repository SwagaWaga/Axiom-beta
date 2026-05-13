import React, { useEffect } from 'react';
import { VocabularyWord } from '../../types/database';

interface WordModalProps {
  word: VocabularyWord;
  onClose: () => void;
  isLoading?: boolean;
}

export const WordModal: React.FC<WordModalProps> = ({ word, onClose, isLoading }) => {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // Unmount trap: alert if unmounting while loading
  useEffect(() => {
    return () => {
      if (isLoading) {
        alert('Component unmounted while loading!');
      }
    };
  }, [isLoading]);

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
      onClick={() => { if (!isLoading) onClose(); }} 
    >
      <div 
        className="bg-slate-800 border border-slate-700 shadow-2xl rounded-2xl p-6 w-full max-w-lg relative animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()} 
      >
        <button 
          onClick={() => { if (!isLoading) onClose(); }}
          className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 bg-slate-800/50 hover:bg-slate-700 p-2 rounded-full"
        >
          ✕
        </button>
        
        <h2 className="text-3xl font-bold text-indigo-400 mb-2 capitalize">{word.word}</h2>
        <p className="text-slate-300 mb-6">{word.definition}</p>
        
        {word.word_connections && (
          <div className="space-y-4 pt-4 border-t border-slate-700/50">
            {word.word_connections.synonyms && word.word_connections.synonyms.length > 0 && (
              <div>
                <span className="text-[10px] uppercase tracking-widest text-slate-500 mb-2 font-bold block">Synonyms</span>
                <div className="flex flex-wrap gap-1.5">
                  {word.word_connections.synonyms.map((syn, idx) => (
                    <span key={idx} className="px-2.5 py-1 text-xs font-medium rounded-md bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                      {syn}
                    </span>
                  ))}
                </div>
              </div>
            )}
            
            {word.word_connections.antonyms && word.word_connections.antonyms.length > 0 && (
              <div>
                <span className="text-[10px] uppercase tracking-widest text-slate-500 mb-2 font-bold block">Antonyms</span>
                <div className="flex flex-wrap gap-1.5">
                  {word.word_connections.antonyms.map((ant, idx) => (
                    <span key={idx} className="px-2.5 py-1 text-xs font-medium rounded-md bg-rose-500/10 text-rose-300 border border-rose-500/20">
                      {ant}
                    </span>
                  ))}
                </div>
              </div>
            )}
            
            {word.word_connections.collocations && word.word_connections.collocations.length > 0 && (
              <div>
                <span className="text-[10px] uppercase tracking-widest text-slate-500 mb-2 font-bold block">Collocations</span>
                <div className="flex flex-wrap gap-1.5">
                  {word.word_connections.collocations.map((col, idx) => (
                    <span key={idx} className="px-2.5 py-1 text-xs font-medium rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/20">
                      {col}
                    </span>
                  ))}
                </div>
              </div>
            )}
            
            {word.word_connections.wordFamily && (
              <div>
                <span className="text-[10px] uppercase tracking-widest text-slate-500 mb-2 font-bold block">Word Family</span>
                <p className="border-l-2 border-indigo-500/50 pl-3 py-1 mt-1 text-sm text-slate-400 italic">
                  {word.word_connections.wordFamily}
                </p>
              </div>
            )}
          </div>
        )}

        {word.last_practiced && (
            <div className="mt-4 pt-4 border-t border-slate-700/50">
                <span className="text-[10px] uppercase tracking-widest text-slate-500 mb-1 font-bold flex items-center">
                    <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    Last Practiced
                </span>
                <span className="text-slate-500 dark:text-slate-400 text-sm">{new Date(word.last_practiced).toLocaleDateString()}</span>
            </div>
        )}
      </div>
    </div>
  );
};
