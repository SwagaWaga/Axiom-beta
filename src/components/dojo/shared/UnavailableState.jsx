import React from 'react';
import { playClickSound } from '../../../utils/playSound';

const REASON_MESSAGES = {
    'NOT_ENOUGH_WORDS': {
        title: "Vault is Empty",
        message: "You need to save more words from articles before you can enter the Dojo.",
        action: "Go to Reader",
        gradient: "from-slate-700 to-slate-900",
        icon: "📚"
    },
    'NO_DUE_WORDS': {
        title: "Training Complete",
        message: "You have no words due for review right now. Your memory is fully refreshed!",
        action: "Return to Vault",
        gradient: "from-teal-600 to-emerald-800",
        icon: "🌿"
    },
    'RECOGNITION_TOO_LOW': {
        title: "Boss Fight Locked",
        message: "Your words aren't ready for active recall yet. Build a stronger foundation in Quick Review first.",
        action: "Start Quick Review",
        gradient: "from-orange-600 to-red-800",
        icon: "🔒"
    },
    'RECALL_TOO_LOW': {
        title: "Deep Training Locked",
        message: "You need more words with strong active recall before diving into deep contextual learning.",
        action: "Start Boss Fight",
        gradient: "from-indigo-600 to-purple-800",
        icon: "🧠"
    },
    'NO_ELIGIBLE_WORDS': {
        title: "No Eligible Words",
        message: "None of your due words match the requirements for this specific training mode right now.",
        action: "Start Deep Training",
        gradient: "from-slate-600 to-slate-800",
        icon: "⚖️"
    }
};

export default function UnavailableState({ reasonCode, onAction, onReturn, bossFightProgress }) {
    const content = REASON_MESSAGES[reasonCode] || REASON_MESSAGES['NO_ELIGIBLE_WORDS'];

    // Show progress bar only for Boss Fight recognition lock
    const showProgress = reasonCode === 'RECOGNITION_TOO_LOW' && bossFightProgress;
    const progressPct = showProgress
        ? Math.min(100, Math.round((bossFightProgress.eligible / bossFightProgress.required) * 100))
        : 0;

    return (
        <div className="max-w-4xl mx-auto p-6 font-sans min-h-[70vh] flex flex-col items-center justify-center">
            <div className={`bg-gradient-to-br ${content.gradient} border border-slate-700 p-8 sm:p-12 rounded-[2.5rem] shadow-2xl w-full max-w-lg relative flex flex-col min-h-[350px] items-center text-center text-white overflow-hidden`}>
                <div className="text-6xl mb-6 opacity-90 animate-bounce-slow">
                    {content.icon}
                </div>
                
                <h2 className="text-3xl font-black tracking-tight mb-4">
                    {content.title}
                </h2>
                
                <p className="text-lg text-white/80 font-medium leading-relaxed mb-6">
                    {content.message}
                </p>

                {showProgress && (
                    <div className="w-full mb-6">
                        <div className="flex justify-between text-sm font-bold mb-2 text-white/70">
                            <span>Words ready for recall</span>
                            <span>{bossFightProgress.eligible} / {bossFightProgress.required}</span>
                        </div>
                        <div className="w-full h-2.5 bg-black/30 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-white/70 rounded-full transition-all duration-500"
                                style={{ width: `${progressPct}%` }}
                            />
                        </div>
                    </div>
                )}

                <div className="w-full flex flex-col gap-3 mt-auto">
                    <button 
                        onClick={() => { playClickSound(); onAction(content.action); }}
                        className="w-full bg-white text-slate-900 hover:bg-slate-100 font-bold py-4 px-6 rounded-xl transition-all shadow-lg active:scale-[0.98]"
                    >
                        {content.action}
                    </button>
                    
                    <button 
                        onClick={() => { playClickSound(); onReturn(); }}
                        className="w-full bg-black/20 hover:bg-black/40 text-white font-bold py-4 px-6 rounded-xl transition-all active:scale-[0.98]"
                    >
                        Return to Dashboard
                    </button>
                </div>
            </div>
        </div>
    );
}




