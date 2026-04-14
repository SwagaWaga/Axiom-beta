import React, { useState, useEffect } from 'react';
import { playClickSound } from '../../../utils/playSound';

export default function RevealReflect({ match, onGrade }) {
    const [isRevealed, setIsRevealed] = useState(false);
    const [showAnswer, setShowAnswer] = useState(false);
    const wordPayload = match.user_vocabulary;

    useEffect(() => {
        setIsRevealed(false);
        setShowAnswer(false);
    }, [match]);

    return (
        <div className="max-w-4xl mx-auto p-6 font-sans min-h-[70vh] flex flex-col items-center justify-center">
            <div className="bg-slate-900 border border-slate-800 p-8 sm:p-12 rounded-[2.5rem] shadow-2xl w-full max-w-2xl relative flex flex-col min-h-[400px]">
                <div className="flex-1 flex flex-col justify-center items-center text-center">
                    <span className="text-xs font-black text-orange-500 uppercase tracking-[0.2em] block mb-4">Reveal & Reflect</span>
                    
                    <h2 className="text-4xl sm:text-6xl font-black text-white capitalize tracking-tight break-words mb-8">
                        {wordPayload.word}
                    </h2>

                    {!isRevealed ? (
                        <div className="w-full mt-auto">
                            <button
                                onClick={() => { playClickSound(); setIsRevealed(true); }}
                                className="w-full sm:w-2/3 mx-auto block bg-slate-800 hover:bg-slate-700 text-white font-bold py-4 px-8 rounded-xl transition-all shadow-lg border border-slate-700 text-lg"
                            >
                                Reveal Answer
                            </button>
                        </div>
                    ) : (
                        <div className="w-full animate-fade-in flex flex-col items-center mt-4">
                            {/* Definition Area */}
                            <div className="w-full p-6 bg-slate-800/50 rounded-2xl border border-slate-700/50 text-left mb-8 shadow-inner">
                                {wordPayload.category && (
                                    <span className="inline-block px-3 py-1 mb-3 text-[10px] font-bold text-slate-400 bg-slate-800 rounded-full uppercase tracking-wider">
                                        {wordPayload.category}
                                    </span>
                                )}
                                <p className="text-xl text-slate-200 leading-relaxed font-medium">
                                    <span className="text-xs font-bold text-slate-500 uppercase block mb-1">Definition</span>
                                    {wordPayload.definition}
                                </p>
                                
                                {wordPayload.context_sentence && (
                                    <p className="mt-4 pt-4 border-t border-slate-700/50 text-slate-400 italic text-lg border-l-4 border-l-indigo-500 pl-4">
                                        "{wordPayload.context_sentence}"
                                    </p>
                                )}
                            </div>

                            {/* Grading Buttons */}
                            {!showAnswer ? (
                                <div className="grid grid-cols-3 gap-3 sm:gap-4 w-full mt-auto">
                                    <button
                                        onClick={() => setShowAnswer(true)}
                                        className="flex flex-col items-center justify-center p-4 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 transition-colors group"
                                    >
                                        <span className="font-black text-red-500 text-lg mb-1 group-hover:scale-110 transition-transform">Hard</span>
                                        <span className="text-[10px] text-red-400/70 font-bold uppercase tracking-wider">Soon</span>
                                    </button>
                                    
                                    <button
                                        onClick={() => onGrade('Good', { recognition_score: Math.min(100, (match.recognition_score || 0) + 20) })}
                                        className="flex flex-col items-center justify-center p-4 rounded-xl bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 transition-colors group"
                                    >
                                        <span className="font-black text-orange-500 text-lg mb-1 group-hover:scale-110 transition-transform">Good</span>
                                        <span className="text-[10px] text-orange-400/70 font-bold uppercase tracking-wider">Later</span>
                                    </button>

                                    <button
                                        onClick={() => onGrade('Easy', { recognition_score: Math.min(100, (match.recognition_score || 0) + 40) })}
                                        className="flex flex-col items-center justify-center p-4 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 transition-colors group"
                                    >
                                        <span className="font-black text-emerald-500 text-lg mb-1 group-hover:scale-110 transition-transform">Easy</span>
                                        <span className="text-[10px] text-emerald-400/70 font-bold uppercase tracking-wider">Far</span>
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => onGrade('Hard', { recognition_score: Math.min(100, (match.recognition_score || 0) + 10) })}
                                    className="w-full block bg-red-600 hover:bg-red-700 text-white font-bold py-4 px-8 rounded-xl transition-all shadow-lg text-lg mt-auto"
                                >
                                    Continue
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
