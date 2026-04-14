import React, { useState, useRef, useEffect } from 'react';
import { playClickSound } from '../../../utils/playSound';

// Simple Levenshtein distance
const getLevenshteinDistance = (a, b) => {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix = [];
    let i, j;
    for (i = 0; i <= b.length; i++) matrix[i] = [i];
    for (j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (i = 1; i <= b.length; i++) {
        for (j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1));
            }
        }
    }
    return matrix[b.length][a.length];
};

export default function BossFight({ match, onGrade }) {
    const [input, setInput] = useState('');
    const [feedback, setFeedback] = useState(null); // 'correct', 'typo', 'wrong'
    const inputRef = useRef(null);

    const payload = match.user_vocabulary;
    const targetWord = payload.word.toLowerCase().trim();

    useEffect(() => {
        if (inputRef.current) inputRef.current.focus();
    }, []);

    const handleSubmit = (e) => {
        e.preventDefault();
        playClickSound();

        const answer = input.toLowerCase().trim();
        const dist = getLevenshteinDistance(answer, targetWord);

        let finalGrade = 'Fail';
        let recL = match.recall_score || 0;
        let spl = match.spelling_score || 0;
        let recg = match.recognition_score || 0;

        if (dist === 0) {
            setFeedback('correct');
            finalGrade = 'Easy';
            recL += 15; spl += 5; recg += 5;
        } else if (dist <= 2 && answer.length > 3) {
            setFeedback('typo');
            finalGrade = 'Hard'; // Advance interval but mark hard
            recL += 10; spl -= 10;
        } else {
            setFeedback('wrong');
            finalGrade = 'Fail';
            recL -= 15; spl -= 5; recg -= 5;
        }

        setTimeout(() => {
            onGrade(finalGrade, {
                recall_score: Math.min(100, Math.max(0, recL)),
                spelling_score: Math.min(100, Math.max(0, spl)),
                recognition_score: Math.min(100, Math.max(0, recg))
            }, finalGrade === 'Fail');
        }, 1500);
    };

    return (
        <div className="max-w-4xl mx-auto p-6 font-sans min-h-[70vh] flex flex-col items-center justify-center">
            <div className={`bg-slate-900 border-2 p-8 sm:p-12 rounded-[2.5rem] shadow-2xl w-full max-w-2xl relative flex flex-col min-h-[400px] transition-colors duration-300 ${feedback === 'correct' ? 'border-emerald-500' : feedback === 'typo' ? 'border-orange-500' : feedback === 'wrong' ? 'border-red-500' : 'border-slate-800'}`}>
                <div className="flex-1 flex flex-col items-center text-center">
                    <span className="text-xs font-black text-rose-500 uppercase tracking-widest block mb-4">Boss Fight: Active Recall</span>
                    
                    <div className="w-full p-8 bg-slate-800/80 rounded-2xl mb-12 shadow-inner border border-slate-700">
                        <p className="text-2xl text-slate-200 font-medium italic">"{payload.definition}"</p>
                    </div>

                    <form onSubmit={handleSubmit} className="w-full mt-auto">
                        <input
                            ref={inputRef}
                            type="text"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            disabled={!!feedback}
                            className={`w-full bg-slate-950 text-white text-3xl font-black text-center py-6 px-4 rounded-xl border-2 shadow-inner focus:outline-none transition-all ${feedback === 'correct' ? 'border-emerald-500 text-emerald-400' : feedback === 'typo' ? 'border-orange-500 text-orange-400' : feedback === 'wrong' ? 'border-red-500 text-red-400 text-line-through' : 'border-slate-700 focus:border-rose-500 focus:ring-4 focus:ring-rose-500/20'}`}
                            placeholder="Type the word..."
                            autoComplete="off"
                        />
                        
                        {feedback && (
                            <div className="mt-6 animate-fade-in text-xl font-bold">
                                {feedback === 'correct' && <span className="text-emerald-500">Perfect Execution!</span>}
                                {feedback === 'typo' && <span className="text-orange-500">Close! It's spelled: {payload.word}</span>}
                                {feedback === 'wrong' && <span className="text-red-500">Memory Failed. Answer: {payload.word}</span>}
                            </div>
                        )}
                    </form>
                </div>
            </div>
        </div>
    );
}
