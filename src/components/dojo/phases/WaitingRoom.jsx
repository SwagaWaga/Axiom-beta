import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { playClickSound } from '../../../utils/playSound';
import { isWordDue } from '../../../lib/srsMath';

export default function WaitingRoom({ onSelectMode, session }) {
    const [batchSize, setBatchSize] = useState(10);
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
                    // Unified mastery threshold sync perfectly matching Vault Flashcards
                    const isFullyMastered = w.is_mastered || (w.recognition_score || 0) >= 100;
                    
                    if (isFullyMastered) { 
                        mastered++; 
                        return; 
                    }

                    const isDueCheck = isWordDue(w.next_review_at, now, true);

                    if (isDueCheck) playable++;
                    else cooldown++;

                    if ((w.recognition_score || 0) >= 70) {
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
    const hasAnyWords = stats.total > 0;
    const hasDueWords = stats.playable > 0;
    const hasPracticeWords = stats.practiceEligible > 0;
    const canTrain = hasDueWords || hasPracticeWords;
    const canBossFight = hasDueWords; // Boss Fight stays review-only

    const modeLabel = (hasDue, hasPractice) => {
        if (hasDue) return null;           // normal — no badge needed
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
                    <div className="bg-slate-800/40 border border-slate-700/40 hover:bg-slate-800 hover:border-slate-600 hover:-translate-y-1 hover:shadow-lg hover:shadow-slate-900/50 transition-all duration-300 rounded-xl p-4 flex flex-col items-center shadow-inner relative group overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <span className="text-xl mb-1.5 opacity-80 group-hover:scale-110 transition-transform">📚</span>
                        <span className="text-2xl font-black text-slate-300 relative z-10">{stats.total}</span>
                        <span className="text-[10px] text-slate-400 font-bold uppercase mt-1 tracking-wider relative z-10">Total Words</span>
                    </div>
                    <div className="bg-slate-800/40 border border-slate-700/40 hover:bg-slate-800 hover:border-slate-600 hover:-translate-y-1 hover:shadow-lg hover:shadow-slate-900/50 transition-all duration-300 rounded-xl p-4 flex flex-col items-center shadow-inner relative group overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <span className="text-xl mb-1.5 opacity-80 group-hover:scale-110 transition-transform">👑</span>
                        <span className="text-2xl font-black text-emerald-400 relative z-10">{stats.mastered}</span>
                        <span className="text-[10px] text-emerald-500/80 font-bold uppercase mt-1 tracking-wider relative z-10">Mastered</span>
                    </div>
                    <div className="bg-slate-800/40 border border-slate-700/40 hover:bg-slate-800 hover:border-slate-600 hover:-translate-y-1 hover:shadow-lg hover:shadow-slate-900/50 transition-all duration-300 rounded-xl p-4 flex flex-col items-center shadow-inner relative group overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-b from-blue-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <span className="text-xl mb-1.5 opacity-80 group-hover:scale-110 transition-transform">⏳</span>
                        <span className="text-2xl font-black text-blue-400 relative z-10">{stats.cooldown}</span>
                        <span className="text-[10px] text-blue-500/80 font-bold uppercase mt-1 tracking-wider relative z-10">On Cooldown</span>
                    </div>
                    <div className="bg-slate-800/40 border border-orange-500/30 hover:bg-slate-800 hover:border-orange-500/50 hover:-translate-y-1 hover:shadow-lg hover:shadow-orange-900/30 transition-all duration-300 rounded-xl p-4 flex flex-col items-center shadow-[inset_0_2px_15px_rgba(249,115,22,0.1)] relative group overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-b from-orange-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <span className="text-xl mb-1.5 opacity-80 group-hover:scale-110 transition-transform">🎯</span>
                        <span className="text-2xl font-black text-orange-500 relative z-10">{stats.playable}</span>
                        <span className="text-[10px] text-orange-400/80 font-bold uppercase mt-1 tracking-wider relative z-10">Due Today</span>
                    </div>
                </div>

                {/* Contextual hints */}
                {stats.nearPromo > 0 && (
                    <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded-lg text-sm font-medium">
                        🔥 {stats.nearPromo} words near Boss Fight threshold!
                    </div>
                )}
                {!hasDueWords && hasPracticeWords && (
                    <div className="mb-8 p-6 bg-gradient-to-r from-blue-900/20 via-indigo-900/20 to-blue-900/20 border border-indigo-500/30 rounded-2xl shadow-inner relative overflow-hidden group">
                        {/* Animated pulsing background effect */}
                        <div className="absolute inset-0 bg-indigo-500/5 animate-pulse rounded-2xl pointer-events-none"></div>
                        
                        <div className="relative z-10 flex flex-col md:flex-row items-center justify-center gap-4 text-center md:text-left">
                            <span className="text-4xl drop-shadow-lg group-hover:scale-110 transition-transform duration-500">🥋</span>
                            <div className="leading-relaxed">
                                <span className="block font-black text-indigo-300 tracking-widest uppercase text-xs mb-1">Training State: Practice Mode</span>
                                <span className="text-sm font-medium text-slate-300">
                                    No words are due yet. Continuing will yield <span className="text-indigo-200 font-bold">reduced XP</span> and no SRS shifts.
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Batch Size Selector */}
                {canTrain && (
                    <div className="w-full max-w-sm mx-auto flex flex-col mb-8 bg-slate-800/30 border border-slate-700/50 p-5 rounded-3xl shadow-inner relative overflow-hidden group transition-all duration-300 hover:border-indigo-500/30 hover:bg-slate-800/50">
                        {/* Subtle background glow element */}
                        <div className="absolute -top-10 -right-10 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none group-hover:bg-indigo-500/20 transition-colors duration-500"></div>
                        
                        <div className="flex justify-between items-center mb-5 relative z-10">
                            <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                Session Length
                            </label>
                            <span className="text-2xl font-black text-indigo-400 drop-shadow-[0_0_12px_rgba(99,102,241,0.6)]">
                                {batchSize} <span className="text-sm font-bold text-indigo-400/50">Words</span>
                            </span>
                        </div>
                        
                        <div className="relative z-10 px-1">
                            <input
                                type="range"
                                min="4"
                                max="15"
                                value={batchSize}
                                onChange={(e) => { playClickSound(); setBatchSize(Number(e.target.value)); }}
                                className="w-full h-3 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-indigo-500 shadow-inner"
                                style={{
                                    background: `linear-gradient(to right, #6366f1 0%, #4f46e5 ${((batchSize - 4) / 11) * 100}%, #0f172a ${((batchSize - 4) / 11) * 100}%, #0f172a 100%)`
                                }}
                            />
                        </div>
                        
                        <div className="flex justify-between text-[10px] font-black text-slate-500 mt-3 px-2 relative z-10 uppercase tracking-widest">
                            <span>4 (Short)</span>
                            <span>15 (Focus)</span>
                        </div>
                    </div>
                )}

                {/* Mode buttons */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                    {/* Quick Review */}
                    <button
                        disabled={!canTrain}
                        onClick={() => { playClickSound(); onSelectMode({ phase: 'Quick Review', limit: batchSize }); }}
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
                        onClick={() => { playClickSound(); onSelectMode({ phase: 'Deep Training', limit: batchSize }); }}
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
                        onClick={() => { playClickSound(); onSelectMode({ phase: 'Boss Fight Only' }); }}
                        className={`w-full md:col-span-2 py-4 px-6 rounded-xl transition-all text-sm uppercase tracking-widest relative overflow-hidden font-black border ${
                            !canBossFight 
                                ? 'bg-slate-900/60 border-slate-800/80 text-slate-600 cursor-not-allowed shadow-inner'
                                : 'bg-rose-900/20 hover:bg-rose-900/40 border-rose-500/30 hover:border-rose-500/50 text-rose-400 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-rose-900/20'
                        }`}
                    >
                        {/* Progress fill bar in background if disabled but words exist */}
                        {!canBossFight && hasAnyWords && (
                            <div 
                                className="absolute top-0 left-0 h-full bg-slate-800/50 pointer-events-none transition-all duration-1000 ease-out border-r border-slate-700/50" 
                                style={{ width: `${Math.min(100, (stats.bossReady / 12) * 100)}%` }}
                            />
                        )}
                        
                        <div className="relative z-10 flex flex-col items-center justify-center">
                            <span className="flex items-center gap-2 text-lg">
                                {!canBossFight && <span className="text-base">🔒</span>}
                                Boss Fight
                            </span>
                            
                            {!canBossFight && hasAnyWords && (
                                <span className="block text-[10px] text-slate-500 mt-1.5 font-bold normal-case tracking-normal">
                                    Requires 12 recognition-ready due words — Progress: <span className="text-slate-400">{stats.bossReady} / 12</span>
                                </span>
                            )}
                        </div>
                    </button>
                </div>
            </div>
        </div>
    );
}
