import React, { useState, useEffect } from 'react';
import { playClickSound } from '../../../utils/playSound';

export default function WarmUpScan({ match, onGrade }) {
    const [showAnswer, setShowAnswer] = useState(false);
    const wordPayload = match.user_vocabulary;

    useEffect(() => {
        setShowAnswer(false);
    }, [match]);

    return (
        <div className="max-w-4xl mx-auto p-6 font-sans min-h-[70vh] flex flex-col items-center justify-center">

            <div className="bg-slate-900 border border-slate-800 p-8 sm:p-12 rounded-[2.5rem] shadow-2xl w-full max-w-2xl relative flex flex-col min-h-[400px]">
                <div className="flex-1 flex flex-col justify-center items-center text-center">
                    <span className="text-xs font-black text-blue-500 uppercase tracking-[0.2em] block mb-4">Warm-Up Scan</span>

                    <h2 className="text-4xl sm:text-6xl font-black text-white capitalize tracking-tight break-words mb-8">
                        {wordPayload.word}
                    </h2>

                    {showAnswer ? (
                        <div className="w-full animate-fade-in flex flex-col items-center mt-4">
                            <div className="w-full p-6 bg-slate-800/50 rounded-2xl border border-slate-700/50 text-left mb-8 shadow-inner">
                                <p className="text-xl text-slate-200 leading-relaxed font-medium">
                                    <span className="text-xs font-bold text-slate-500 uppercase block mb-1">Definition</span>
                                    {wordPayload.definition}
                                </p>
                                {wordPayload.context_sentence && (
                                    <p className="mt-4 pt-4 border-t border-slate-700/50 text-slate-400 italic text-lg border-l-4 border-l-blue-500 pl-4">
                                        "{wordPayload.context_sentence}"
                                    </p>
                                )}
                            </div>
                            <button
                                onClick={() => onGrade('Fail', { recognition_score: 0 })}
                                className="w-full block bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-8 rounded-xl transition-all shadow-lg text-lg mt-auto"
                            >
                                Continue
                            </button>
                        </div>
                    ) : (
                        <div className="w-full mt-auto grid grid-cols-2 gap-4">
                            <button
                                onClick={() => { playClickSound(); setShowAnswer(true); }}
                                className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-4 px-6 rounded-xl transition-all border border-slate-700"
                            >
                                Don't Know It
                            </button>
                            <button
                                onClick={() => {
                                    playClickSound();
                                    onGrade('Good', { recognition_score: Math.min(100, (match.recognition_score || 0) + 25) });
                                }}
                                className="bg-gradient-to-r from-blue-600 to-indigo-500 hover:from-blue-500 hover:to-indigo-400 text-white font-bold py-4 px-6 rounded-xl transition-all shadow-lg"
                            >
                                I Know It
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
