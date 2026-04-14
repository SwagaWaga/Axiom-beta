import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';

const FALLBACK_WORDS = ['analyze', 'context', 'significant', 'process', 'structure', 'function', 'environment', 'variable', 'method', 'theory'];

export default function Quiz({ collectedWords, session, onComplete }) {
    const [currentWordIndex, setCurrentWordIndex] = useState(0);
    const [definitions, setDefinitions] = useState({});
    const [loading, setLoading] = useState(true);
    const [earnedXp, setEarnedXp] = useState(0);
    const [quizComplete, setQuizComplete] = useState(false);

    const [feedback, setFeedback] = useState("");
    const [options, setOptions] = useState([]);
    const hasSaved = useRef(false);

    useEffect(() => {
        let isMounted = true;
        async function fetchDefinitions() {
            setLoading(true);
            const defs = {};
            for (const item of collectedWords) {
                try {
                    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${item.word}`);
                    if (res.ok) {
                        const data = await res.json();
                        const def = data[0]?.meanings[0]?.definitions[0]?.definition;
                        defs[item.word] = def || "Definition not found.";
                    } else {
                        defs[item.word] = "Definition not found.";
                    }
                } catch (e) {
                    defs[item.word] = "Error fetching definition.";
                }
            }
            if (!isMounted) return;
            setDefinitions(defs);
            setLoading(false);
        }

        if (collectedWords && collectedWords.length > 0) {
            fetchDefinitions();
        } else {
            setLoading(false);
            setQuizComplete(true);
        }

        return () => isMounted = false;
    }, [collectedWords]);

    useEffect(() => {
        if (loading || quizComplete || currentWordIndex >= collectedWords.length) return;

        const currentWord = collectedWords[currentWordIndex].word;
        // Generate options
        const otherWords = collectedWords.map(w => w.word).filter(w => w !== currentWord);
        const pool = [...otherWords, ...FALLBACK_WORDS].filter(w => w !== currentWord);

        // Shuffle pool
        const shuffledPool = pool.sort(() => 0.5 - Math.random());
        const incorrectOptions = Array.from(new Set(shuffledPool)).slice(0, 3);

        while (incorrectOptions.length < 3) {
            const randomFallback = FALLBACK_WORDS[Math.floor(Math.random() * FALLBACK_WORDS.length)];
            if (!incorrectOptions.includes(randomFallback) && randomFallback !== currentWord) {
                incorrectOptions.push(randomFallback);
            }
        }

        const newOptions = [...incorrectOptions, currentWord].sort(() => 0.5 - Math.random());
        setOptions(newOptions);
    }, [currentWordIndex, loading, quizComplete, collectedWords]);

    // Handle DB save logic
    useEffect(() => {
        if (quizComplete && collectedWords.length > 0 && !hasSaved.current) {
            hasSaved.current = true;
            async function saveProgress() {
                try {
                    let user = session?.user;
                    if (!user) {
                        const { data } = await supabase.auth.getUser();
                        user = data?.user;
                    }
                    if (!user) return;

                    // 1. Increment total XP
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('xp')
                        .eq('id', user.id)
                        .single();

                    const currentXp = profile?.xp || 0;
                    await supabase
                        .from('profiles')
                        .upsert({ id: user.id, xp: currentXp + earnedXp });

                    // 2. Insert to user_vocabulary
                    const payloadData = collectedWords.map(item => ({
                        user_id: user.id,
                        word: item.word,
                        context_sentence: item.context,
                        definition: definitions[item.word] || 'Definition not found',
                        mastery_level: 1,
                        last_practiced: null,
                        next_review_date: new Date().toISOString()
                    }));

                    const { error: upsertError } = await supabase
                        .from('user_vocabulary')
                        .upsert(payloadData, { onConflict: 'user_id, word' });

                    if (upsertError) {
                        console.error("Save failed", upsertError);
                    } else {

                    }
                } catch (e) {
                    console.error("Error saving quiz progress:", e);
                }
            }
            saveProgress();
        }
    }, [quizComplete, earnedXp, collectedWords, definitions, session]);

    const handleAnswer = (selectedWord) => {
        const currentWord = collectedWords[currentWordIndex].word;
        if (selectedWord === currentWord) {
            setEarnedXp(prev => prev + 50);
            setFeedback("✅ Correct! +50 XP");
            setTimeout(() => {
                setFeedback("");
                if (currentWordIndex + 1 < collectedWords.length) {
                    setCurrentWordIndex(prev => prev + 1);
                } else {
                    setQuizComplete(true);
                }
            }, 1000);
        } else {
            setFeedback("❌ Try Again!");
            setTimeout(() => setFeedback(""), 1000);
        }
    };

    if (loading) {
        return (
            <div className="max-w-3xl mx-auto p-6 flex flex-col items-center justify-center min-h-[50vh]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                <p className="text-blue-600 font-bold text-xl animate-pulse">Building your quiz...</p>
            </div>
        );
    }

    if (quizComplete) {
        return (
            <div className="max-w-3xl mx-auto p-6 bg-slate-50 min-h-[70vh] font-sans">
                <div className="bg-white p-10 rounded-3xl shadow-lg text-center border-t-8 border-green-500">
                    <h2 className="text-4xl font-extrabold text-slate-800 mb-6">Training Complete 🏆</h2>
                    <p className="text-2xl text-slate-600 mb-8">You earned a total of <strong className="text-green-600">{earnedXp} XP</strong>!</p>
                    <button
                        onClick={onComplete}
                        className="px-8 py-4 bg-green-600 text-white font-extrabold text-lg rounded-2xl shadow-lg hover:-translate-y-1 hover:shadow-green-500/30 transition-all"
                    >
                        Back to Lobby
                    </button>
                </div>
            </div>
        );
    }

    const currentItem = collectedWords[currentWordIndex];
    // Replace word with blank in context (case-insensitive)
    const regex = new RegExp(`\\b${currentItem.word}\\b`, 'gi');
    const blanks = "_______";
    const blankedSentence = currentItem.context ? currentItem.context.replace(regex, blanks) : "";

    return (
        <div className="max-w-3xl mx-auto p-6 bg-slate-50 min-h-[70vh] font-sans">
            <div className="bg-white p-8 rounded-3xl shadow-lg max-w-2xl mx-auto border border-slate-100">
                <div className="flex justify-between items-center mb-6 text-sm font-bold text-slate-400 uppercase tracking-wider">
                    <span>Word {currentWordIndex + 1} of {collectedWords.length}</span>
                    <span className="text-yellow-600">✨ {earnedXp} XP</span>
                </div>

                <div className="mb-8 p-6 bg-slate-50 rounded-2xl border border-slate-200 shadow-inner">
                    <p className="text-xl leading-relaxed text-slate-700 italic">"{blankedSentence}"</p>
                    {definitions[currentItem.word] && (
                        <div className="mt-6 pt-6 border-t border-slate-200">
                            <span className="text-xs font-bold text-blue-500 uppercase tracking-wider block mb-2">Dictionary Hint</span>
                            <p className="text-slate-600 font-medium">{definitions[currentItem.word]}</p>
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                    {options.map((opt, idx) => (
                        <button
                            key={idx}
                            onClick={() => handleAnswer(opt)}
                            disabled={!!feedback && feedback.includes("Correct")}
                            className="py-4 px-6 text-lg font-bold text-slate-700 bg-white border-2 border-slate-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 transition-all shadow-sm"
                        >
                            {opt}
                        </button>
                    ))}
                </div>

                <div className="h-10 flex justify-center items-center">
                    {feedback && (
                        <span className={`font-bold text-lg px-6 py-2 rounded-xl shadow-sm ${feedback.includes('Correct') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {feedback}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}
