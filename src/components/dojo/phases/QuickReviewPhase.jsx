import React, { useState, useEffect } from 'react';
import { playClickSound } from '../../../utils/playSound';

export default function QuickReviewPhase({ batchWords, onBatchComplete }) {
    const [pass, setPass] = useState(1);
    const [index, setIndex] = useState(0);
    const [showAnswer, setShowAnswer] = useState(false);
    const [results, setResults] = useState([]);

    const currentWord = batchWords[index];
    const payload = currentWord.user_vocabulary;

    useEffect(() => {
        setPass(1);
        setIndex(0);
        setShowAnswer(false);
        setResults([]);
    }, [batchWords]);

    const handlePass1 = (knewIt) => {
        playClickSound();
        if (!knewIt && !showAnswer) {
            setShowAnswer(true);
            return;
        }

        const scoreAdjustment = knewIt ? 5 : (showAnswer ? -10 : 0); // Not Sure = 0 roughly if we had a button, but let's just stick to requirements: "I know it" (+5), "Don't know it" (-10). Wait, requirements had 3 buttons.
        setResults(prev => {
            const newRes = [...prev];
            newRes[index] = { ...currentWord, p1_score: scoreAdjustment };
            return newRes;
        });

        setShowAnswer(false);
        if (index + 1 < batchWords.length) {
            setIndex(prev => prev + 1);
        } else {
            setPass(2);
            setIndex(0);
        }
    };

    const handlePass2 = (diffGrade) => {
        playClickSound();
        const p2_score = diffGrade === 'Hard' ? 2 : diffGrade === 'Normal' ? 8 : 15;
        
        setResults(prev => {
            const newRes = [...prev];
            const wordRes = newRes[index];
            const finalRecScore = Math.min(100, Math.max(0, (wordRes.recognition_score || 0) + wordRes.p1_score + p2_score));
            
            newRes[index] = {
                originalWord: currentWord,
                grade: diffGrade,
                dimensionUpdates: { recognition_score: finalRecScore }
            };
            return newRes;
        });

        if (index + 1 < batchWords.length) {
            setIndex(prev => prev + 1);
        } else {
            onBatchComplete(results.map((r, i) => i === index ? {
                originalWord: currentWord,
                grade: diffGrade,
                dimensionUpdates: { recognition_score: Math.min(100, Math.max(0, (currentWord.recognition_score || 0) + results[index].p1_score + p2_score)) }
            } : r));
        }
    };

    if (!currentWord) return null;

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

                    <div className="grid grid-cols-3 gap-3 sm:gap-4 w-full mt-auto">
                        <button onClick={() => handlePass2('Hard')} className="p-4 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-500 font-black">Hard</button>
                        <button onClick={() => handlePass2('Normal')} className="p-4 rounded-xl bg-orange-500/10 hover:bg-orange-500/20 text-orange-500 font-black">Normal</button>
                        <button onClick={() => handlePass2('Easy')} className="p-4 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 font-black">Easy</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
