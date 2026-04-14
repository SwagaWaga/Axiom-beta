import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { playClickSound } from '../../../utils/playSound';

export default function WaitingRoom({ onSelectMode, session }) {
    const [stats, setStats] = useState({
        total: 0,
        mastered: 0,
        cooldown: 0,
        playable: 0,          // due words
        practiceEligible: 0,  // non-due words available for practice
        nearPromo: 0,
        bossReady: 0,         // words with recognition >= 70 (Boss Fight unlock counter)
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchStats() {
            if (!session?.user?.id) return;
            const { data } = await supabase
                .from('word_mastery_profiles')
                .select('rank, is_mastered, next_review_at, recognition_score, recall_score')
                .eq('user_id', session.user.id);

            if (data) {
                const now = Date.now();
                let mastered = 0, cooldown = 0, playable = 0, nearPromo = 0, bossReady = 0;

                data.forEach(w => {
                    if (w.is_mastered) { mastered++; return; }

                    const parsedDate = Date.parse(w.next_review_at);
                    const isDue = !w.next_review_at || isNaN(parsedDate) || parsedDate <= now;

                    if (isDue) playable++;
                    else cooldown++;

                    if ((w.recognition_score || 0) >= 70 && !w.is_mastered) {
                        nearPromo++;
                        bossReady++;
                    }
                });

                // words available for practice = non-due but still unmastered
                const practiceEligible = cooldown;

                setStats({ total: data.length, mastered, cooldown, playable, practiceEligible, nearPromo, bossReady });
            }
            setLoading(false);
        }
        fetchStats();
    }, [session]);

    if (loading) return <div className="p-8 text-center text-white">Loading Dojo Stats...</div>;

    // Mode availability rules:
    //   Quick Review   → enabled if any words known (due OR practice)
    //   Deep Learning  → enabled if any words known (due OR practice)
    //   Deep Training  → enabled if any words known (due OR practice)
    //   Boss Fight     → enabled only if due words exist (review-only mode)
    const hasAnyWords       = stats.total > 0;
    const hasDueWords       = stats.playable > 0;
    const hasPracticeWords  = stats.practiceEligible > 0;
    const canTrain          = hasDueWords || hasPracticeWords;
    const canBossFight      = hasDueWords; // Boss Fight stays review-only

    const modeLabel = (hasDue, hasPractice) => {
        if (hasDue)      return null;           // normal — no badge needed
        if (hasPractice) return '✦ Practice';  // no due words, will run as practice
        return null;
    };

    return (
        <div className="max-w-4xl mx-auto p-6 flex flex-col items-center justify-center min-h-[70vh]">
            <div className="bg-slate-900/80 backdrop-blur-xl p-10 md:p-12 rounded-3xl text-center shadow-2xl border border-slate-800 w-full max-w-2xl">
                <span className="text-6xl mb-6 block">⛩️</span>
                <h2 className="text-3xl font-black text-white tracking-tight mb-8">Mastery Dojo</h2>

                {/* Stats row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full mb-8">
                    <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4 flex flex-col items-center">
                        <span className="text-2xl font-black text-slate-300">{stats.total}</span>
                        <span className="text-[10px] text-slate-500 font-bold uppercase mt-1">Total Words</span>
                    </div>
                    <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4 flex flex-col items-center">
                        <span className="text-2xl font-black text-emerald-400">{stats.mastered}</span>
                        <span className="text-[10px] text-slate-500 font-bold uppercase mt-1">Mastered</span>
                    </div>
                    <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4 flex flex-col items-center">
                        <span className="text-2xl font-black text-blue-400">{stats.cooldown}</span>
                        <span className="text-[10px] text-slate-500 font-bold uppercase mt-1">On Cooldown</span>
                    </div>
                    <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4 flex flex-col items-center shadow-[0_0_15px_rgba(249,115,22,0.2)]">
                        <span className="text-2xl font-black text-orange-500">{stats.playable}</span>
                        <span className="text-[10px] text-orange-400/80 font-bold uppercase mt-1">Due Today</span>
                    </div>
                </div>

                {/* Contextual hints */}
                {stats.nearPromo > 0 && (
                    <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded-lg text-sm font-medium">
                        🔥 {stats.nearPromo} words near Boss Fight threshold!
                    </div>
                )}
                {!hasDueWords && hasPracticeWords && (
                    <div className="mb-6 p-3 bg-sky-500/10 border border-sky-500/20 text-sky-300 rounded-lg text-sm font-medium">
                        ✦ No words due yet — training will run in <strong>Practice Mode</strong> (reduced score gains, no SRS shift).
                    </div>
                )}

                {/* Mode buttons */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                    {/* Quick Review */}
                    <button
                        disabled={!canTrain}
                        onClick={() => { playClickSound(); onSelectMode('Quick Review'); }}
                        className="w-full bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 disabled:opacity-40 disabled:grayscale text-white font-bold py-4 px-6 rounded-xl transition-all shadow-lg text-lg relative"
                    >
                        Quick Review
                        {modeLabel(hasDueWords, hasPracticeWords) && (
                            <span className="absolute top-1.5 right-3 text-[10px] text-white/60 font-black uppercase tracking-widest">
                                {modeLabel(hasDueWords, hasPracticeWords)}
                            </span>
                        )}
                    </button>

                    {/* Deep Learning */}
                    <button
                        disabled={!canTrain}
                        onClick={() => { playClickSound(); onSelectMode('Deep Training'); }}
                        className="w-full bg-gradient-to-r from-emerald-700 to-teal-600 hover:from-emerald-600 hover:to-teal-500 disabled:opacity-40 disabled:grayscale text-white font-bold py-4 px-6 rounded-xl transition-all shadow-lg text-lg relative"
                    >
                        Deep Learning
                        {modeLabel(hasDueWords, hasPracticeWords) && (
                            <span className="absolute top-1.5 right-3 text-[10px] text-white/60 font-black uppercase tracking-widest">
                                {modeLabel(hasDueWords, hasPracticeWords)}
                            </span>
                        )}
                    </button>

                    {/* Boss Fight — review-only, needs due words */}
                    <button
                        disabled={!canBossFight}
                        onClick={() => { playClickSound(); onSelectMode('Boss Fight Only'); }}
                        className="w-full md:col-span-2 bg-rose-900/30 hover:bg-rose-900/50 disabled:opacity-40 disabled:grayscale border border-rose-500/30 text-rose-300 font-bold py-4 px-6 rounded-xl transition-all text-sm uppercase tracking-wider relative"
                    >
                        Boss Fight
                        {!canBossFight && hasAnyWords && (
                            <span className="block text-[10px] text-rose-400/60 mt-0.5 font-normal normal-case tracking-normal">
                                Requires due words — {stats.bossReady} / 12 recognition ready
                            </span>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
