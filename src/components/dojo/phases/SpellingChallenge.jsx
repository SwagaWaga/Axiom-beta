import React, { useState, useEffect, useRef } from 'react';
import { playClickSound } from '../../../utils/playSound';

// Simple Levenshtein distance for typo detection
function getEditDistance(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix = [];
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

export default function SpellingChallenge({ match, onGrade }) {
    const [inputVal, setInputVal] = useState('');
    const [revealed, setRevealed] = useState(false);
    const [resultType, setResultType] = useState(null);
    
    const inputRef = useRef(null);
    const payload = match.user_vocabulary;
    const targetWord = payload.word.toLowerCase().trim();

    useEffect(() => {
        setInputVal('');
        setRevealed(false);
        setResultType(null);
        // Slight delay to ensure render completes before focus
        setTimeout(() => {
            if (inputRef.current) inputRef.current.focus();
        }, 50);
    }, [match]);

    const getMaskedHint = (word) => {
        const len = word.length;
        if (len <= 3) return word.substring(0, 1) + "_".repeat(len - 1);
        if (len <= 5) return word.substring(0, 2) + "_".repeat(len - 2);
        return word.substring(0, 3) + "_".repeat(len - 3);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!inputVal.trim() && !revealed) return; // Prevent empty submit
        if (revealed) {
            handleContinue();
            return;
        }

        playClickSound();

        const answer = inputVal.toLowerCase().trim();
        let currentStatus = '';

        if (answer === targetWord) {
            currentStatus = 'correct';
        } else {
            const distance = getEditDistance(answer, targetWord);
            const maxTypo = targetWord.length <= 5 ? 1 : 2;
            
            if (distance <= maxTypo) {
                currentStatus = 'typo';
            } else {
                currentStatus = 'wrong';
            }
        }

        setResultType(currentStatus);
        setRevealed(true);
    };

    const handleContinue = () => {
        playClickSound();
        const currentSpellingScore = match.spelling_score || 0;
        
        if (resultType === 'correct') {
            onGrade('Easy', { spelling_score: Math.min(100, currentSpellingScore + 15), skipSRS: true });
        } else if (resultType === 'typo') {
            onGrade('Hard', { spelling_score: Math.min(100, currentSpellingScore + 5), skipSRS: true });
        } else {
            onGrade('Hard', { spelling_score: Math.max(0, currentSpellingScore - 5), skipSRS: true }, true);
        }
    };

    const renderDiff = (typed, correct) => {
        const result = [];
        for (let i = 0; i < Math.max(typed.length, correct.length); i++) {
            const tChar = typed[i] || '';
            const cChar = correct[i] || '';
            if (tChar === cChar) {
                result.push(<span key={i} className="text-white">{cChar}</span>);
            } else {
                result.push(<span key={i} className="text-red-400 line-through mr-1">{tChar}</span>);
                if (cChar) {
                    result.push(<span key={`c${i}`} className="text-emerald-400">{cChar}</span>);
                }
            }
        }
        return result;
    };

    return (
        <div className="max-w-4xl mx-auto p-6 font-sans min-h-[70vh] flex flex-col items-center justify-center">
            <div className="bg-slate-900 border border-slate-800 p-8 sm:p-12 rounded-[2.5rem] shadow-2xl w-full max-w-2xl relative flex flex-col min-h-[400px]">
                <div className="flex-1 flex flex-col justify-center items-center text-center">
                    
                    <span className="text-xs font-black text-indigo-500 uppercase tracking-widest block mb-4">Spelling Challenge</span>
                    
                    <div className="text-4xl sm:text-6xl font-black text-slate-500 tracking-tight break-words mb-8 tracking-[0.3em]">
                        {getMaskedHint(targetWord)}
                    </div>
                    
                    {/* Clue Panel */}
                    <div className="w-full p-6 bg-slate-800/50 rounded-2xl border border-slate-700/50 text-left mb-8 shadow-inner">
                        <p className="text-xl text-slate-200 leading-relaxed font-medium">
                            <span className="text-xs font-bold text-slate-500 uppercase block mb-1">Definition</span>
                            {payload.definition}
                        </p>
                        {payload.context_sentence && (
                            <p className="mt-4 pt-4 border-t border-slate-700/50 text-slate-400 italic text-lg border-l-4 border-l-indigo-500 pl-4">"{payload.context_sentence.replace(new RegExp(targetWord, 'gi'), '_____')}"</p>
                        )}
                    </div>

                    {!revealed ? (
                        <form onSubmit={handleSubmit} className="w-full flex gap-2">
                            <input
                                ref={inputRef}
                                type="text"
                                value={inputVal}
                                onChange={(e) => setInputVal(e.target.value)}
                                className="flex-1 bg-slate-800 text-white text-2xl font-bold py-4 px-6 rounded-xl border border-slate-700 focus:outline-none focus:border-indigo-500 transition-colors"
                                placeholder="Type the word..."
                                autoComplete="off"
                                spellCheck="false"
                            />
                            <button 
                                type="submit" 
                                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 px-8 rounded-xl transition-all shadow-lg"
                            >
                                Submit
                            </button>
                        </form>
                    ) : (
                        <div className="w-full animate-fade-in flex flex-col items-center">
                            <div className="mb-6 w-full p-6 rounded-2xl border bg-slate-800/50 text-center">
                                {resultType === 'correct' && (
                                    <div className="text-emerald-500 font-bold text-2xl mb-2">Perfect +15</div>
                                )}
                                {resultType === 'typo' && (
                                    <div className="text-orange-500 font-bold text-2xl mb-2">Close Typo +5</div>
                                )}
                                {resultType === 'wrong' && (
                                    <div className="text-red-500 font-bold text-2xl mb-2">Incorrect -5</div>
                                )}

                                {resultType !== 'correct' && (
                                    <div className="text-xl mt-4">
                                        <div className="text-slate-400 text-sm font-bold uppercase mb-1">Correction</div>
                                        <div className="font-mono text-2xl">{renderDiff(inputVal.toLowerCase().trim(), targetWord)}</div>
                                    </div>
                                )}
                                {resultType === 'correct' && (
                                     <div className="font-mono text-2xl text-emerald-400">
                                         {targetWord}
                                     </div>
                                )}
                            </div>
                            
                            <button 
                                onClick={handleContinue} 
                                autoFocus
                                className="w-full block bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-8 rounded-xl transition-all shadow-lg text-lg"
                            >
                                Continue
                            </button>
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
}
