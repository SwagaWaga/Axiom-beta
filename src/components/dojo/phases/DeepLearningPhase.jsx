import React, { useState, useEffect } from 'react';
import { playClickSound } from '../../../utils/playSound';
import { fetchDeepLearningContent } from '../../../lib/deepLearningAI';

// ── Constants ────────────────────────────────────────────────────────────────

const PRACTICE_MULTIPLIER = 0.35;
const TOTAL_STEPS = 4;
const STEP_LABELS = ['Context', 'Meaning', 'Usage', 'Reflection'];

// ── Safe static fallback content (always available, no AI needed) ────────────

const getFallbackContent = (payload) => {
    const word = payload?.word || 'this word';
    const ctx = payload?.context_sentence;

    return {
        // Fallback context_question has no embedded sentence — Step 0 will use the article sentence
        context_question: 'Which meaning fits this word in this sentence?',
        context_options: [
            { text: `The action of actively changing or influencing a given situation`, isCorrect: true },
            { text: `A general sense of urgency or pressure in a difficult task`, isCorrect: false },
            { text: `Repeated action without awareness of the outcome`, isCorrect: false },
        ].sort(() => 0.5 - Math.random()),
        context_explanation: `In this context, the word describes a specific action with a clear outcome.`,
        semantic_question: `Which meaning is closest to the precise formal usage of "${word}"?`,
        semantic_options: [
            { text: `Actively directing attention or effort toward a goal`, isCorrect: true },
            { text: `Expressing strong disagreement in a formal setting`, isCorrect: false },
            { text: `Describing a process that repeats without meaningful progress`, isCorrect: false },
        ].sort(() => 0.5 - Math.random()),
        semantic_explanation: `The correct option captures the directed, purposeful quality of the word.`,
        usage_natural: ctx ? `"${ctx}"` : `"The committee sought to ${word} the existing policy framework."`,
        usage_awkward: `"She ${word}d the meeting very hardly to achieve a positive conclusion."`,
        usage_explanation: `The awkward sentence misuses the word's collocation and register.`,
        nuance_tip: `"${word}" is typically paired with formal objects such as policies, strategies, or systems, rather than people or emotions.`,
    };
};

// ── Sub-components ───────────────────────────────────────────────────────────

const StepDots = ({ current }) => (
    <div className="flex gap-2 mb-6">
        {STEP_LABELS.map((_, i) => (
            <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i < current ? 'w-8 bg-emerald-500' :
                i === current ? 'w-8 bg-emerald-400 animate-pulse' :
                    'w-4 bg-slate-700'
                }`} />
        ))}
    </div>
);

const ModeBadge = ({ isPractice }) => (
    <div className={`text-xs font-black uppercase tracking-widest px-4 py-1.5 rounded-full border ${isPractice
        ? 'text-sky-400 border-sky-500/40 bg-sky-500/10'
        : 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10'
        }`}>
        {isPractice ? '✦ Practice Mode — Reduced Gains' : '✦ Review Mode — Full Score Update'}
    </div>
);

/** Shown inline after an answer — disappears when the user taps Continue */
const ExplanationToast = ({ text, isCorrect }) => text ? (
    <div className={`mt-6 p-5 border shadow-inner rounded-xl text-sm leading-relaxed ${isCorrect === false
        ? 'bg-amber-950/40 border-amber-500/40 text-amber-200'
        : 'bg-indigo-950/40 border-indigo-500/40 text-indigo-200'
        }`}>
        <div className="font-black mb-2 uppercase tracking-widest text-[10px] opacity-70">
            {isCorrect === false ? 'Incorrect — Insight' : 'Correct — Insight'}
        </div>
        💡 {text}
    </div>
) : null;

/** Splits a sentence on the target word and highlights it */
const HighlightedSentence = ({ sentence, word }) => {
    if (!sentence || !word) return <p className="text-slate-400 italic text-sm text-center">No original sentence available.</p>;
    const parts = sentence.split(new RegExp(`(\\b${word}\\b)`, 'gi'));
    return (
        <p className="text-lg text-slate-200 leading-relaxed italic">
            "{parts.map((part, i) =>
                part.toLowerCase() === word.toLowerCase()
                    ? <mark key={i} className="bg-emerald-500/25 text-emerald-300 not-italic px-1 rounded font-bold">{part}</mark>
                    : part
            )}"
        </p>
    );
};

// ── Loading skeleton ─────────────────────────────────────────────────────────

const LoadingState = ({ word }) => (
    <div className="max-w-4xl mx-auto px-4 py-6 font-sans min-h-[80vh] flex flex-col items-center justify-center gap-4">
        <div className="text-xs font-black text-emerald-500 uppercase tracking-widest animate-pulse">
            Preparing Deep Learning for "{word}"...
        </div>
        <div className="bg-slate-900 border border-slate-800 p-8 rounded-[2.5rem] shadow-2xl w-full max-w-2xl flex flex-col items-center gap-6 min-h-[300px] justify-center">
            <StepDots current={0} />
            <div className="flex gap-2">
                {[0, 1, 2].map(i => (
                    <div key={i}
                        className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-bounce"
                        style={{ animationDelay: `${i * 0.15}s` }}
                    />
                ))}
            </div>
            <p className="text-slate-500 text-sm">Generating context exercises...</p>
        </div>
    </div>
);

// ── Randomise usage pair order once on render (prevent position bias) ─────────
const shuffleUsagePair = (natural, awkward) =>
    Math.random() > 0.5
        ? [{ text: natural, isNatural: true }, { text: awkward, isNatural: false }]
        : [{ text: awkward, isNatural: false }, { text: natural, isNatural: true }];

// ── Main component ───────────────────────────────────────────────────────────

export default function DeepLearningPhase({ match, onWordComplete, session }) {
    const [step, setStep] = useState(0);
    const [stepScores, setStepScores] = useState([]);
    const [content, setContent] = useState(null); // null = not loaded yet
    const [isFallback, setIsFallback] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [explanation, setExplanation] = useState(null);
    const [answered, setAnswered] = useState(false);
    const [isCorrectLast, setIsCorrectLast] = useState(null);
    const [usagePairOrder, setUsagePairOrder] = useState(null);

    // `match` contains: { ...masteryProfile, user_vocabulary: vocabRow, _isPractice, next_phase }
    // All vocab fields are on match.user_vocabulary
    const payload = match?.user_vocabulary || match; // fallback: treat match itself as payload if no nesting
    const isPractice = match?._isPractice === true;
    const wordId = payload?.id;

    // ── Load AI content: pre-loaded cache first, Edge Function on miss ───────
    useEffect(() => {
        setStep(0);
        setStepScores([]);
        setExplanation(null);
        setAnswered(false);
        setUsagePairOrder(null);

        // Fast path: engine pre-loaded this word's AI content at session start
        if (match?.ai_content) {
            setContent(match.ai_content);
            setIsFallback(false);
            setIsLoading(false);
            setUsagePairOrder(Math.random() > 0.5 ? 'natural_first' : 'awkward_first');
            return; // ← no network call needed
        }

        // Slow path: no cache found — invoke Edge Function to generate and cache
        setContent(null);
        setIsLoading(true);
        setIsFallback(false);

        let cancelled = false;

        (async () => {
            try {
                if (payload?.word && payload?.definition) {
                    // fetchDeepLearningContent uses supabase.functions.invoke() internally
                    const result = await fetchDeepLearningContent(payload);
                    if (cancelled) return;
                    if (result?.content) {
                        setContent(result.content);
                        setIsFallback(false);
                    } else {
                        setContent(getFallbackContent(payload));
                        setIsFallback(true);
                    }
                } else {
                    setContent(getFallbackContent(payload));
                    setIsFallback(true);
                }
            } catch (err) {
                if (cancelled) return;
                console.warn('[DeepLearning] content fetch error, using fallback:', err);
                setContent(getFallbackContent(payload));
                setIsFallback(true);
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                    setUsagePairOrder(Math.random() > 0.5 ? 'natural_first' : 'awkward_first');
                }
            }
        })();

        return () => { cancelled = true; };
    }, [wordId, match?.ai_content]); // re-run if word changes OR cache is newly populated

    // ── Step advancement ──────────────────────────────────────────────────────

    const advanceWith = (points, explanationText, wasCorrect) => {
        playClickSound();
        setStepScores(prev => [...prev, points]);

        // ALWAYS show explanation and wait for explicit Continue tap
        // (Enforces reading AI feedback to discourage guessing)
        setExplanation(explanationText);
        setIsCorrectLast(wasCorrect);
        setAnswered(true);
    };

    const continueAfterExplanation = () => {
        playClickSound();
        setExplanation(null);
        setIsCorrectLast(null);
        setAnswered(false);
        setStep(prev => prev + 1);
    };

    const handleComplete = (selfRating) => {
        playClickSound();
        const reflectionPoints = selfRating === 2 ? 5 : selfRating === 1 ? 3 : 0;
        const allScores = [...stepScores, reflectionPoints];
        const totalGain = allScores.reduce((a, b) => a + b, 0);
        const netGain = isPractice ? Math.round(totalGain * PRACTICE_MULTIPLIER) : totalGain;
        const newCtx = Math.min(100, Math.max(0, (match.context_score || 0) + netGain));
        const grade = selfRating >= 1 ? 'Good' : 'Hard';
        onWordComplete(match, grade, isPractice, { context_score: newCtx });
    };

    // ── Render: loading ───────────────────────────────────────────────────────

    if (isLoading) return <LoadingState word={payload?.word || '...'} />;

    // ── Render: guard against missing content (should never happen) ───────────
    if (!content) {
        const fb = getFallbackContent(payload);
        setContent(fb);
        setIsFallback(true);
        return null; // re-render on next tick
    }

    // Resolve usage pair order (locked-in on first load)
    const usagePair = content.usage_natural && content.usage_awkward
        ? (usagePairOrder === 'natural_first'
            ? [{ text: content.usage_natural, isNatural: true }, { text: content.usage_awkward, isNatural: false }]
            : [{ text: content.usage_awkward, isNatural: false }, { text: content.usage_natural, isNatural: true }])
        : [];

    // ── Render: 4-step drill ──────────────────────────────────────────────────

    return (
        <div className="max-w-4xl mx-auto px-4 py-6 font-sans min-h-[80vh] flex flex-col items-center justify-center gap-4">

            {/* Top badges */}
            <div className="flex items-center gap-3 flex-wrap justify-center">
                <ModeBadge isPractice={isPractice} />
                {isFallback && (
                    <span className="text-[10px] text-amber-500 font-black uppercase tracking-widest border border-amber-500/50 bg-amber-500/10 px-3 py-1.5 rounded-full">
                        Offline Mode
                    </span>
                )}
            </div>

            <div className="bg-slate-900 border border-slate-800 p-8 sm:p-10 rounded-[2.5rem] shadow-2xl w-full max-w-2xl flex flex-col min-h-[520px]">

                {/* Header: step indicator + word */}
                <div className="flex flex-col items-center text-center mb-2">
                    <StepDots current={step} />
                    <span className="text-xs font-black text-emerald-500 uppercase tracking-widest block mb-3">
                        Deep Learning · {STEP_LABELS[step] ?? 'Complete'}
                    </span>
                    <h2 className="text-4xl sm:text-5xl font-black text-white capitalize tracking-tight break-words">
                        {payload?.word}
                    </h2>
                </div>

                <div className="flex-1 flex flex-col justify-center mt-6">

                    {/* ────────────────────────────────────────────────────── */}
                    {/* STEP 0 — Context Meaning                              */}
                    {/* ────────────────────────────────────────────────────── */}
                    {step === 0 && (() => {
                        // New prompt embeds the AI sentence as:
                        //   "<AI sentence> — <question text>"
                        // Old cached rows won't have ' — ' so we fall back to article sentence.
                        const SEPARATOR = ' \u2014 ';
                        const hasEmbedded = content.context_question?.includes(SEPARATOR);
                        const [displaySentence, questionLabel] = hasEmbedded
                            ? content.context_question.split(SEPARATOR)
                            : [null, content.context_question];

                        // Show AI sentence if new format; otherwise fall back to article sentence
                        const sentenceToShow = displaySentence || payload?.context_sentence;

                        return (
                            <div className="flex flex-col gap-5">
                                <p className="text-slate-400 text-sm font-semibold uppercase tracking-wider text-center">
                                    {questionLabel}
                                </p>

                                {/* AI-generated (or original fallback) sentence with word highlighted */}
                                <div className="p-5 bg-slate-800/60 rounded-2xl border border-slate-700/50 shadow-inner">
                                    <HighlightedSentence sentence={sentenceToShow} word={payload?.word} />
                                </div>

                                {/* Multiple-choice answers */}
                                {(content.context_options || []).map((opt, i) => (
                                    <button key={i}
                                        disabled={answered}
                                        onClick={() => advanceWith(
                                            opt.isCorrect ? 15 : -10,
                                            content.context_explanation,
                                            opt.isCorrect
                                        )}
                                        className={`w-full text-left p-5 rounded-2xl border transition-all text-base font-medium ${answered
                                            ? opt.isCorrect ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200' : 'border-slate-800 bg-slate-800/30 text-slate-500 opacity-40'
                                            : 'border-slate-700 bg-slate-800/60 hover:border-indigo-400 hover:bg-indigo-500/10 text-slate-200'
                                            }`}
                                    >
                                        {opt.text}
                                    </button>
                                ))}

                                <ExplanationToast text={explanation} isCorrect={isCorrectLast} />
                                {answered && (
                                    <button onClick={continueAfterExplanation}
                                        className="w-full mt-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-xl transition-all shadow-[0_0_20px_rgba(99,102,241,0.2)]">
                                        Continue →
                                    </button>
                                )}
                            </div>
                        );
                    })()}

                    {/* ────────────────────────────────────────────────────── */}
                    {/* STEP 1 — Semantic Precision                           */}
                    {/* ────────────────────────────────────────────────────── */}
                    {step === 1 && (
                        <div className="flex flex-col gap-4">
                            <p className="text-slate-400 text-sm font-semibold uppercase tracking-wider text-center">
                                {content.semantic_question}
                            </p>

                            {(content.semantic_options || []).map((opt, i) => (
                                <button key={i}
                                    disabled={answered}
                                    onClick={() => advanceWith(
                                        opt.isCorrect ? 15 : -10,
                                        content.semantic_explanation,
                                        opt.isCorrect
                                    )}
                                    className={`w-full text-left p-5 rounded-2xl border transition-all text-base font-medium ${answered
                                        ? opt.isCorrect ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200' : 'border-slate-800 bg-slate-800/30 text-slate-500 opacity-40'
                                        : 'border-slate-700 bg-slate-800/60 hover:border-indigo-400 hover:bg-indigo-500/10 text-slate-200'
                                        }`}
                                >
                                    {opt.text}
                                </button>
                            ))}

                            <ExplanationToast text={explanation} isCorrect={isCorrectLast} />
                            {answered && (
                                <button onClick={continueAfterExplanation}
                                    className="w-full mt-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-xl transition-all shadow-[0_0_20px_rgba(99,102,241,0.2)]">
                                    Continue →
                                </button>
                            )}
                        </div>
                    )}

                    {/* ────────────────────────────────────────────────────── */}
                    {/* STEP 2 — Natural Usage                                */}
                    {/* ────────────────────────────────────────────────────── */}
                    {step === 2 && (
                        <div className="flex flex-col gap-5">
                            <p className="text-slate-400 text-sm font-semibold uppercase tracking-wider text-center">
                                Which sentence uses <span className="text-emerald-400 font-bold">"{payload?.word}"</span> more naturally?
                            </p>

                            {usagePair.map((item, i) => (
                                <button key={i}
                                    disabled={answered}
                                    onClick={() => advanceWith(
                                        item.isNatural ? 15 : -10,
                                        content.usage_explanation,
                                        item.isNatural
                                    )}
                                    className={`w-full text-left p-5 rounded-2xl border transition-all text-base font-medium leading-relaxed ${answered
                                        ? item.isNatural ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200' : 'border-slate-800 bg-slate-800/30 text-slate-500 opacity-40'
                                        : 'border-slate-700 bg-slate-800/60 hover:border-indigo-400 hover:bg-indigo-500/10 text-slate-200'
                                        }`}
                                >
                                    {item.text}
                                </button>
                            ))}

                            <ExplanationToast text={explanation} isCorrect={isCorrectLast} />
                            {answered && (
                                <button onClick={continueAfterExplanation}
                                    className="w-full mt-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-xl transition-all shadow-[0_0_20px_rgba(99,102,241,0.2)]">
                                    Continue →
                                </button>
                            )}
                        </div>
                    )}

                    {/* ────────────────────────────────────────────────────── */}
                    {/* STEP 3 — Reflection                                   */}
                    {/* ────────────────────────────────────────────────────── */}
                    {step === 3 && (
                        <div className="flex flex-col gap-4">
                            {/* Definition completely removed. Showing nuance tip. */}
                            <div className="p-6 bg-slate-800/50 rounded-2xl border border-slate-700/50 shadow-inner">
                                <p className="text-sm text-indigo-400 uppercase font-black tracking-widest mb-3 text-center">Cognitive Analysis</p>
                                {content.nuance_tip ? (
                                    <p className="text-slate-200 text-lg leading-relaxed text-center italic">
                                        "{content.nuance_tip}"
                                    </p>
                                ) : (
                                    <p className="text-slate-400 text-sm text-center">Training validated.</p>
                                )}
                            </div>

                            <p className="text-slate-400 text-sm font-semibold uppercase tracking-wider text-center mt-2">
                                Final readiness check:
                            </p>

                            <button onClick={() => handleComplete(2)}
                                className="w-full p-4 rounded-xl bg-slate-800/60 border border-slate-700 hover:border-emerald-500 hover:text-emerald-300 text-slate-200 font-bold transition-all active:scale-[0.98]">
                                💬 I could use it in writing (+5)
                            </button>
                            <button onClick={() => handleComplete(1)}
                                className="w-full p-4 rounded-xl bg-slate-800/60 border border-slate-700 hover:border-emerald-500 hover:text-emerald-300 text-slate-200 font-bold transition-all active:scale-[0.98]">
                                ✓ I understand it (+3)
                            </button>
                            <button onClick={() => handleComplete(0)}
                                className="w-full p-4 rounded-xl bg-slate-800/60 border border-slate-700 hover:border-amber-500 hover:bg-amber-500/10 text-slate-300 font-bold transition-all active:scale-[0.98]">
                                ⟳ Still confusing (+0)
                            </button>
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
}
