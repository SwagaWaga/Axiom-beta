import React from 'react';
import { ACHIEVEMENTS } from '../config/achievements';

export default function AchievementsBoard({ userData }) {
    if (!userData) return null;

    return (
        <div className="bg-white dark:bg-slate-800 rounded-3xl p-8 shadow-sm border border-slate-200 dark:border-slate-700 mb-10 transition-colors">
            <div className="mb-6">
                <h2 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center">
                    <span className="mr-2">🏆</span> Achievements
                </h2>
                <p className="text-slate-500 dark:text-slate-400 font-medium">Unlock badges by growing your vocabulary and maintaining streaks.</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {ACHIEVEMENTS.map(achievement => {
                    const isUnlocked = achievement.condition(userData);

                    return (
                        <div
                            key={achievement.id}
                            className={`flex flex-col items-center justify-center p-5 rounded-2xl border-2 transition-all duration-300 relative overflow-hidden group ${isUnlocked
                                ? 'border-orange-200 bg-orange-50 dark:bg-orange-900/20 dark:border-orange-800 shadow-[0_0_15px_rgba(251,146,60,0.15)] transform hover:-translate-y-1 hover:shadow-[0_0_20px_rgba(251,146,60,0.3)]'
                                : 'border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/50'
                                }`}
                        >
                            <div className="text-4xl mb-3 relative drop-shadow-sm transition-transform duration-300 group-hover:scale-110">
                                {achievement.icon}
                                {!isUnlocked && (
                                    <div className="absolute -bottom-1 -right-1 bg-slate-200 dark:bg-slate-700 rounded-full p-1 shadow-sm flex items-center justify-center">
                                        <span className="text-[10px] leading-none">🔒</span>
                                    </div>
                                )}
                            </div>
                            <h3 className={`font-bold text-center mb-1 text-sm ${isUnlocked ? 'text-orange-700 dark:text-orange-400' : 'text-slate-400 dark:text-slate-500'}`}>
                                {achievement.title}
                            </h3>
                            <p className="text-[10px] text-slate-500 dark:text-slate-500 text-center leading-tight font-medium">
                                {achievement.description}
                            </p>

                            {/* Shine effect for unlocked badges */}
                            {isUnlocked && (
                                <div className="absolute top-0 left-[-100%] w-[50%] h-full bg-gradient-to-r from-transparent via-white/40 dark:via-white/5 to-transparent skew-x-[-20deg] group-hover:left-[200%] transition-all duration-700 ease-in-out"></div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
