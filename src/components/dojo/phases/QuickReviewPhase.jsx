import React, { useState, useEffect } from 'react';
import { playClickSound } from '../../../utils/playSound';
import SpellingChallenge from './SpellingChallenge';

export default function QuickReviewPhase({ batchWords, onWordComplete, onPhaseComplete }) {
    const [pass, setPass] = useState(1);
    const [index, setIndex] = useState(0);
    const [showAnswer, setShowAnswer] = useState(false);
    const [p1Scores, setP1Scores] = useState({});
    const [p2Data, setP2Data] = useState({}); // Stores intermediate data
    const [isSaving, setIsSaving] = useState(false);

    const currentWord = batchWords[index];
    const payload = currentWord?.user_vocabulary;

    const handlePass1 = (knewIt) => {
        playClickSound();
        if (!knewIt && !showAnswer) {
            setShowAnswer(true);
            return;
        }

        const scoreAdjustment = knewIt ? 5 : (showAnswer ? -10 : 0);
        setP1Scores(prev => ({ ...prev, [payload.id]: scoreAdjustment }));

        setShowAnswer(false);
        if (index + 1 < batchWords.length) {
            setIndex(prev => prev + 1);
        } else {
            setPass(2);
            setIndex(0); // Restart at first word for Pass 2 reflection
        }
    };

    const handlePass2 = async (diffGrade) => {
        playClickSound();
        const p2_score = diffGrade === 'Hard' ? 2 : diffGrade === 'Normal' ? 8 : 15;
        const finalRecScore = Math.min(100, Math.max(0, (currentWord.recognition_score || 0) + (p1Scores[payload.id] || 0) + p2_score));

        // Save data for pass 3 instead of firing onWordComplete immediately
        setP2Data(prev => ({
            ...prev,
            [payload.id]: { diffGrade, recognition_score: finalRecScore }
        }));

        if (index + 1 < batchWords.length) {
            setIndex(prev => prev + 1);
        } else {
            setPass(3);
            setIndex(0); // Restart at first word for Pass 3 spelling
        }
    };

    // End-Of-Batch Orchestration
    useEffect(() => {
        if (!currentWord || batchWords.length === 0) {
            const timer = setTimeout(() => {
                if (onPhaseComplete) {
                    onPhaseComplete();
                }
            }, 1000); // 1-second UX delay before triggering phase unmount
            return () => clearTimeout(timer);
        }
    }, [currentWord, batchWords.length, onPhaseComplete]);

    if (!currentWord || batchWords.length === 0) {
        return (
            <div className="max-w-4xl mx-auto p-6 font-sans min-h-[70vh] flex flex-col items-center justify-center">
                <div className="bg-slate-900 border border-slate-800 p-8 sm:p-12 rounded-[2.5rem] shadow-2xl w-full max-w-2xl text-center">
                    <h2 className="text-3xl sm:text-4xl font-black text-indigo-400 capitalize tracking-tight break-words mb-4 animate-pulse">Session Complete</h2>
                    <p className="text-slate-400 font-bold">Synchronizing your performance with the Dojo...</p>
                </div>
            </div>
        );
    }

    if (pass === 3) {
        const currentP2Data = p2Data[payload.id] || { diffGrade: 'Good', recognition_score: currentWord.recognition_score };

        return (
            <SpellingChallenge
                match={currentWord}
                onWordComplete={async (wordPayload, spellGrade, isPractice, spellUpdates, isFail) => {
                    if (isSaving) return;
                    setIsSaving(true);

                    const finalUpdates = {
                        recognition_score: currentP2Data.recognition_score,
                        ...spellUpdates
                    };

                    const readingGrade = currentP2Data.diffGrade || 'Good';
                    const combinedGrade = (readingGrade === 'Hard' || spellGrade === 'Hard') ? 'Hard'
                        : (readingGrade === 'Normal' || spellGrade === 'Normal') ? 'Normal'
                            : 'Easy';

                    try {
                        // Execute the final save using combined grade
                        await onWordComplete(wordPayload, combinedGrade, isPractice, finalUpdates, isFail);
                    } catch (err) {
                        console.error("QuickReview save rejected:", err);
                        throw err;
                    } finally {
                        // The engine will drop the word from batchWords array.
                        // Word at index 0 drops out. New word shifts to index 0 dynamically.
                        setIsSaving(false);
                    }
                }}
            />
        );
    }

    if (pass === 1) {
        return (
            <div className="max-w-4xl mx-auto p-6 font-sans min-h-[70vh] flex flex-col items-center justify-center">
                <div className="bg-slate-900 border border-slate-800 p-8 sm:p-12 rounded-[2.5rem] shadow-2xl w-full max-w-2xl relative flex flex-col min-h-[400px]">
                    <div className="flex-1 flex flex-col justify-center items-center text-center">
                        <span className="text-xs font-black text-blue-500 uppercase tracking-widest block mb-4">Quick Review: Triage (Pass 1)</span>
                        <h2 className="text-4xl sm:text-6xl font-black text-white capitalize tracking-tight break-words mb-8">{payload.word}</h2>

                        {!showAnswer ? (
                            <div className="w-full mt-auto grid grid-cols-3 gap-2">
                                <button onClick={() => handlePass1(false)} className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-4 px-2 rounded-xl transition-all">Don't Know</button>
                                <button onClick={() => { setShowAnswer(true); playClickSound(); }} className="bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold py-4 px-2 rounded-xl transition-all">Not Sure</button>
                                <button onClick={() => handlePass1(true)} className="bg-gradient-to-r from-blue-600 to-indigo-500 hover:from-blue-500 hover:to-indigo-400 text-white font-bold py-4 px-2 rounded-xl transition-all">I Know It</button>
                            </div>
                        ) : (
                            <div className="w-full animate-fade-in flex flex-col items-center mt-4">
                                <div className="w-full p-6 bg-slate-800/50 rounded-2xl border border-slate-700/50 text-left mb-8 shadow-inner">
                                    <p className="text-xl text-slate-200 leading-relaxed font-medium"><span className="text-xs font-bold text-slate-500 uppercase block mb-1">Definition</span>{payload.definition}</p>
                                    {payload.context_sentence && (
                                        <p className="mt-4 pt-4 border-t border-slate-700/50 text-slate-400 italic text-lg border-l-4 border-l-blue-500 pl-4">"{payload.context_sentence}"</p>
                                    )}
                                </div>
                                <button onClick={() => handlePass1(false)} className="w-full block bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-8 rounded-xl transition-all shadow-lg text-lg mt-auto">Continue</button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto p-6 font-sans min-h-[70vh] flex flex-col items-center justify-center">
            <div className="bg-slate-900 border border-slate-800 p-8 sm:p-12 rounded-[2.5rem] shadow-2xl w-full max-w-2xl relative flex flex-col min-h-[400px]">
                <div className="flex-1 flex flex-col justify-center items-center text-center">
                    <span className="text-xs font-black text-orange-500 uppercase tracking-widest block mb-4">Quick Review: Reflection (Pass 2)</span>
                    <h2 className="text-4xl sm:text-6xl font-black text-white capitalize tracking-tight break-words mb-8">{payload.word}</h2>

                    <div className="w-full p-6 bg-slate-800/50 rounded-2xl border border-slate-700/50 text-left mb-8 shadow-inner">
                        <p className="text-xl text-slate-200 leading-relaxed font-medium"><span className="text-xs font-bold text-slate-500 uppercase block mb-1">Definition</span>{payload.definition}</p>
                    </div>

                    <div className={`grid grid-cols-3 gap-3 sm:gap-4 w-full mt-auto transition-opacity ${isSaving ? 'opacity-50 pointer-events-none' : ''}`}>
                        <button onClick={() => handlePass2('Hard')} disabled={isSaving} className="p-4 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-500 font-black">Hard</button>
                        <button onClick={() => handlePass2('Normal')} disabled={isSaving} className="p-4 rounded-xl bg-orange-500/10 hover:bg-orange-500/20 text-orange-500 font-black">Normal</button>
                        <button onClick={() => handlePass2('Easy')} disabled={isSaving} className="p-4 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 font-black">Easy</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
