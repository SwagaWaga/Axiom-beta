import React from 'react';
import { useDojoEngine } from '../components/dojo/core/DojoEngine';
import WaitingRoom from '../components/dojo/phases/WaitingRoom';
import QuickReviewPhase from '../components/dojo/phases/QuickReviewPhase';
import BossFight from '../components/dojo/phases/BossFight';
import DeepLearningPhase from '../components/dojo/phases/DeepLearningPhase';
import SpellingChallenge from '../components/dojo/phases/SpellingChallenge';
import UnavailableState from '../components/dojo/shared/UnavailableState';
import VictoryScreen from '../components/dojo/phases/VictoryScreen';
import { playQuitSound } from '../utils/playSound';

const QuitButton = ({ onQuit }) => (
    <div className="absolute top-6 right-6 z-50">
        <button
            onClick={onQuit}
            className="text-slate-500 hover:text-white transition-colors p-2 bg-slate-900 rounded-full border border-slate-800"
            title="Abandon Run"
        >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
        </button>
    </div>
);

const ProgressBar = ({ current, total }) => (
    <div className="max-w-2xl mx-auto pt-6 mb-2 px-6 lg:px-0">
        <div className="flex justify-between items-center mb-2 px-1">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Training Progress</span>
            <span className="text-xs font-bold text-slate-400">{current + 1} / {total}</span>
        </div>
        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
                className="h-full bg-gradient-to-r from-orange-400 to-red-500 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${Math.min(100, ((current + 1) / total) * 100)}%` }}
            />
        </div>
    </div>
);

export default function Dojo({ session }) {
    const engine = useDojoEngine(session);

    const handleQuit = () => {
        playQuitSound();
        engine.setActivePhase('WAITING_ROOM');
    };

    switch (engine.activePhase) {
        case 'WAITING_ROOM':
            return <WaitingRoom onSelectMode={engine.loadSession} session={session} />;

        case 'QUICK_REVIEW': {
            const batchItem = engine.queue.find(i => i.type === 'BATCH_QUICK_REVIEW');
            return (
                <div className="relative">
                    <QuitButton onQuit={handleQuit} />
                    <QuickReviewPhase
                        batchWords={batchItem?.words || []}
                        onBatchComplete={engine.processBatchGrades}
                    />
                </div>
            );
        }

        case 'BOSS_FIGHT':
            return (
                <div className="relative">
                    <QuitButton onQuit={handleQuit} />
                    <ProgressBar current={engine.currentIndex} total={engine.queue.length} />
                    <BossFight match={engine.queue[engine.currentIndex]} onGrade={engine.processSingleGrade} />
                </div>
            );

        case 'DEEP_LEARNING':
            return (
                <div className="relative">
                    <QuitButton onQuit={handleQuit} />
                    <ProgressBar current={engine.currentIndex} total={engine.queue.length} />
                    <DeepLearningPhase
                        match={engine.queue[engine.currentIndex]}
                        onGrade={engine.processSingleGrade}
                        session={session}
                    />
                </div>
            );

        case 'SPELLING_CHALLENGE':
            return (
                <div className="relative">
                    <QuitButton onQuit={handleQuit} />
                    <ProgressBar current={engine.currentIndex} total={engine.queue.length} />
                    <SpellingChallenge 
                        match={engine.queue[engine.currentIndex]} 
                        onGrade={engine.processSingleGrade} 
                    />
                </div>
            );


        case 'LOCKED':
            return (
                <UnavailableState
                    reasonCode={engine.lockedReason}
                    bossFightProgress={engine.bossFightProgress}
                    onAction={(actionText) => {
                        if (actionText === 'Start Quick Review') engine.loadSession('Quick Review');
                        else if (actionText === 'Start Boss Fight') engine.loadSession('Boss Fight Only');
                        else if (actionText === 'Start Deep Training') engine.loadSession('Deep Training');
                        else window.location.href = '/vault';
                    }}
                    onReturn={() => engine.setActivePhase('WAITING_ROOM')}
                />
            );

        case 'VICTORY':
            return <VictoryScreen stats={engine.sessionStats} onReturn={() => engine.setActivePhase('WAITING_ROOM')} />;

        default:
            // Should only appear for <1 render cycle on first mount
            return <div className="p-12 text-center text-slate-300">Loading Dojo...</div>;
    }
}
