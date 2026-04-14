import React from 'react';
import { playQuitSound } from '../../../utils/playSound';

export default function VictoryScreen({ stats, onReturn }) {
    return (
        <div className="max-w-4xl mx-auto p-6 min-h-[70vh] flex items-center justify-center">
            <div className="bg-slate-900 p-12 rounded-3xl text-center shadow-2xl shadow-indigo-900/40 border border-slate-700 w-full max-w-md transform transition-all hover:scale-[1.01]">
                <span className="text-6xl mb-6 block text-center animate-pulse drop-shadow-[0_0_15px_rgba(56,189,248,0.5)]">✨</span>
                <h2 className="text-3xl font-black text-white mb-2 tracking-tight">Session Complete</h2>
                <p className="text-slate-400 font-medium text-sm mb-8">Neural mapping optimized.</p>

                <div className="grid grid-cols-2 gap-4 mb-8">
                    <div className="bg-indigo-900/30 rounded-xl p-4 border border-indigo-500/20">
                        <span className="block text-3xl font-black text-indigo-400">{stats.xp}</span>
                        <span className="text-[10px] text-indigo-300/70 font-bold uppercase tracking-wider">XP Gained</span>
                    </div>
                    <div className="bg-emerald-900/30 rounded-xl p-4 border border-emerald-500/20">
                        <span className="block text-3xl font-black text-emerald-400">{stats.promotions}</span>
                        <span className="text-[10px] text-emerald-300/70 font-bold uppercase tracking-wider">Promoted</span>
                    </div>
                    <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                        <span className="block text-2xl font-black text-white">{stats.reviews}</span>
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Reviewed</span>
                    </div>
                    <div className="bg-amber-900/30 rounded-xl p-4 border border-amber-500/20">
                        <span className="block text-2xl font-black text-amber-400">{stats.weakRescued}</span>
                        <span className="text-[10px] text-amber-300/70 font-bold uppercase tracking-wider">Rescued</span>
                    </div>
                </div>

                <div className="space-y-4">
                    <button
                        onClick={() => window.location.reload()}
                        className="px-8 py-4 w-full bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-lg rounded-2xl shadow-lg shadow-indigo-900/50 transition-all hover:-translate-y-1"
                    >
                        Train Again
                    </button>
                    <button
                        onClick={() => { playQuitSound(); onReturn(); }}
                        className="px-8 py-4 w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-lg rounded-2xl border border-slate-700 transition-all"
                    >
                        Return to Library
                    </button>
                </div>
            </div>
        </div>
    );
}
