import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import AchievementsBoard from '../components/AchievementsBoard';
import { useAccent } from '../context/AccentContext';
import { playClickSound, playQuitSound } from '../utils/playSound';
import { VocabularyWord } from '../types/database';
import { Flashcard } from '../components/Flashcard';

export default function Vault({ session, dailyStreak = 0 }: { session: any, dailyStreak?: number }) {
    const { preferredAccent } = useAccent();
    const [vaultWords, setVaultWords] = useState<VocabularyWord[]>([]);
    const [selectedWord, setSelectedWord] = useState<VocabularyWord | null>(null);
    const [loading, setLoading] = useState(true);
    const [powerScore, setPowerScore] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [editingWord, setEditingWord] = useState<VocabularyWord | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const audioRef = useRef(null);

    // Pause audio when leaving the Dictionary
    useEffect(() => {
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.currentTime = 0;
            }
        };
    }, []);

    // Helper for clean TTS execution
    const triggerTTS = (text, lang) => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang;

        // Ensure browser has loaded voice options and pick the best regional match
        const voices = window.speechSynthesis.getVoices();
        const voice = voices.find(v => v.lang === lang) || voices.find(v => v.lang.startsWith(lang));
        if (voice) {
            utterance.voice = voice;
        }

        window.speechSynthesis.speak(utterance);
    };

    const handlePlayAudio = async (wordText) => {
        window.speechSynthesis.cancel();
        // Ensure we read the exact key saved by the Navbar
        const currentAccent = localStorage.getItem('accent') || 'US';
        const accentMap = { 'US': 'us', 'UK': 'uk', 'AU': 'au' };
        const ttsLangMap = { 'US': 'en-US', 'UK': 'en-GB', 'AU': 'en-AU' };
        try {
            const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${wordText}`);
            const data = await res.json();
            const phonetics = data[0]?.phonetics || [];
            // Look ONLY for the exact requested accent
            const targetAudio = phonetics.find(p => p.audio && p.audio.includes(`-${accentMap[currentAccent]}.mp3`))?.audio;

            if (targetAudio) {
                // Play the exact human match
                if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
                audioRef.current = new Audio(targetAudio);
                audioRef.current.play().catch(e => console.error("Audio error:", e));
            } else {
                // Force the robot to use the requested accent
                triggerTTS(wordText, ttsLangMap[currentAccent]);
            }
        } catch (error) {
            // If API completely fails, still use the correct robot accent
            triggerTTS(wordText, ttsLangMap[currentAccent]);
        }
    };

    useEffect(() => {
        async function fetchVocabulary() {
            if (!session?.user?.id) {
                setLoading(false);
                return;
            }

            try {
                setLoading(true);
                const { data, error } = await supabase
                    .from('user_vocabulary')
                    .select('*, word_mastery_profiles(*)')
                    .eq('user_id', session.user.id)
                    .order('last_practiced', { ascending: false });

                if (error) throw error;

                setVaultWords(data || []);

                // Calculate power score based on mastery level
                let totalScore = 0;
                (data || []).forEach(wordObj => {
                    const level = wordObj.mastery_level || 1;
                    if (level === 1) totalScore += 1;
                    else if (level === 2) totalScore += 3;
                    else if (level === 3) totalScore += 5;
                    else if (level >= 4) totalScore += 10;
                });
                setPowerScore(totalScore);

            } catch (err) {
                console.error("Error fetching vocabulary vault:", err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }

        fetchVocabulary();
    }, [session]);

    const getEvolutionStage = (level = 1) => {
        if (level === 1) return { emoji: '🌱', title: 'Seed', color: 'bg-green-100 text-green-800 border-green-200' };
        if (level === 2) return { emoji: '🌿', title: 'Growing', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
        if (level === 3) return { emoji: '🌳', title: 'Strong', color: 'bg-teal-100 text-teal-800 border-teal-200' };
        if (level >= 4) return { emoji: '🔥', title: 'Mastered', color: 'bg-orange-100 text-orange-800 border-orange-200' };
        return { emoji: '🌱', title: 'Seed', color: 'bg-green-100 text-green-800 border-green-200' };
    };

    const calculateAcademicRank = (academicCount) => {
        if (academicCount < 25) return { title: "Initiate", current: academicCount, next: 25, barColor: "bg-gray-400", textColor: "text-gray-600" };
        if (academicCount < 75) return { title: "Novice Scholar", current: academicCount, next: 75, barColor: "bg-amber-600", textColor: "text-amber-700" };
        if (academicCount < 150) return { title: "Undergraduate", current: academicCount, next: 150, barColor: "bg-slate-400", textColor: "text-slate-600" };
        if (academicCount < 300) return { title: "Graduate Researcher", current: academicCount, next: 300, barColor: "bg-yellow-400", textColor: "text-yellow-600" };
        if (academicCount < 500) return { title: "Doctoral Candidate", current: academicCount, next: 500, barColor: "bg-emerald-500", textColor: "text-emerald-600" };
        if (academicCount < 750) return { title: "Tenured Professor", current: academicCount, next: 750, barColor: "bg-blue-500", textColor: "text-blue-600" };
        if (academicCount < 1000) return { title: "Department Head", current: academicCount, next: 1000, barColor: "bg-purple-500", textColor: "text-purple-600" };
        return {
            title: "Academic Laureate",
            current: academicCount,
            next: "MAX",
            barColor: "bg-gradient-to-r from-red-500 via-yellow-500 to-purple-500 bg-[length:200%_auto] animate-pulse",
            textColor: "text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-purple-500"
        };
    };

    const calculateDNAStats = (words) => {
        const stats = {
            Academic: 0,
            Technical: 0,
            Informal: 0,
            Advanced: 0,
            Basic: 0
        };

        words.forEach(word => {
            const dna = word.dna_type || 'Basic';
            if (stats[dna] !== undefined) {
                stats[dna]++;
            } else {
                stats.Basic++;
            }
        });

        return stats;
    };

    if (loading) {
        return (
            <div className="max-w-6xl mx-auto p-6 flex items-center justify-center min-h-[50vh]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="max-w-6xl mx-auto p-6 text-center">
                <div className="bg-red-50 text-red-700 p-6 rounded-2xl border border-red-200">
                    <h2 className="text-xl font-bold mb-2">Failed to load Dictionary</h2>
                    <p>{error}</p>
                </div>
            </div>
        );
    }

    const filteredWords = vaultWords.filter(wordObj =>
        wordObj.word.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (wordObj.definition || '').toLowerCase().includes(searchQuery.toLowerCase())
    );

    const dnaStats = calculateDNAStats(vaultWords);
    // Bind rank progress to the entire Vault's size, fixing the 16/25 desync
    const currentRank = calculateAcademicRank(vaultWords.length);
    // Handle "MAX" state
    const rankProgressPercentage = currentRank.next === "MAX"
        ? 100
        : (currentRank.current / (currentRank.next as number)) * 100;

    const dnaCategories = [
        { key: 'Academic', color: 'bg-blue-500', bg: 'bg-blue-100', icon: '🎓' },
        { key: 'Technical', color: 'bg-purple-500', bg: 'bg-purple-100', icon: '⚙️' },
        { key: 'Advanced', color: 'bg-red-500', bg: 'bg-red-100', icon: '🔥' },
        { key: 'Informal', color: 'bg-yellow-400', bg: 'bg-yellow-100', icon: '🗣️' },
        { key: 'Basic', color: 'bg-green-500', bg: 'bg-green-100', icon: '🌱' },
    ];

    const handleSaveChanges = async (e) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            const { error: updateError } = await supabase
                .from('user_vocabulary')
                .update({
                    word: editingWord.word,
                    definition: editingWord.definition,
                    dna_type: editingWord.dna_type || 'Basic'
                })
                .match({ id: editingWord.id });

            if (updateError) throw updateError;

            setVaultWords(prev => prev.map(w => w.id === editingWord.id ? editingWord : w));
            setEditingWord(null);
        } catch (err) {
            console.error("Error updating word:", err);
            alert("Failed to update word details.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteWord = async (wordId) => {
        const confirmDelete = window.confirm("Are you sure you want to delete this word from your Vault? This cannot be undone.");
        if (!confirmDelete) return;

        try {
            // Optimistic UI update
            setVaultWords(prev => prev.filter(word => word.id !== wordId));

            const { error: deleteError } = await supabase
                .from('user_vocabulary')
                .delete()
                .eq('id', wordId);

            if (deleteError) {
                throw deleteError;
            }
        } catch (err) {
            console.error("Error deleting word:", err);
            alert("Failed to delete word. Refreshing your vault.");
            // Revert optimistic delete if it fails
            const { data } = await supabase
                .from('user_vocabulary')
                .select('*')
                .eq('user_id', session.user.id)
                .order('last_practiced', { ascending: false });
            if (data) setVaultWords(data);
        }
    };

    return (
        <div className="max-w-6xl mx-auto p-4 md:p-6 font-sans">
            {/* Minimalist Gamified Header */}
            <div className="bg-slate-900/50 border-b border-slate-800 p-6 md:p-8 mb-6 md:mb-8 rounded-2xl md:rounded-3xl shadow-sm">
                <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
                    <div className="flex-1 min-w-0">
                        <h1 className="text-3xl md:text-5xl font-extrabold mb-2 tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400 drop-shadow-sm">Vault</h1>
                        <p className="text-slate-400 text-sm md:text-base font-medium mb-6">Watch your vocabulary grow and evolve over time.</p>

                        {/* Minimalist Rank Progress */}
                        <div className="w-full max-w-lg">
                            <div className="flex justify-between items-end mb-2">
                                <h2 className="font-bold text-sm md:text-base flex items-center text-slate-300">
                                    <span className="mr-2">🎓</span>
                                    <span>{currentRank.title}</span>
                                </h2>
                                <span className="text-slate-500 font-bold text-xs md:text-sm">
                                    <span className="text-indigo-400">{currentRank.current}</span> / {currentRank.next === "MAX" ? '∞' : currentRank.next} Words
                                </span>
                            </div>
                            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden border border-slate-700/50">
                                <div
                                    className={`h-full rounded-full transition-all duration-1000 ease-out shadow-[0_0_8px_rgba(99,102,241,0.4)] ${currentRank.barColor}`}
                                    style={{ width: `${rankProgressPercentage}%` }}
                                ></div>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 bg-slate-800/40 border border-slate-700/50 px-6 py-4 rounded-2xl text-center shadow-inner mt-4 lg:mt-0">
                        <div className="text-left">
                            <span className="block text-slate-500 text-[10px] font-black uppercase tracking-widest mb-0.5">Vocabulary Power</span>
                            <span className="text-4xl md:text-5xl font-black text-white drop-shadow-md">⚡ {powerScore}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Achievements Board */}
            <AchievementsBoard userData={{
                totalWords: vaultWords.length,
                dnaCounts: dnaStats,
                streak: dailyStreak
            }} />

            {/* Vocabulary DNA Map */}
            {vaultWords.length > 0 && (
                <div className="bg-white dark:bg-slate-800 rounded-3xl p-8 shadow-sm border border-slate-200 dark:border-slate-700 mb-10 transition-colors">
                    <div className="mb-6 flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center">
                                <span className="mr-2">🧬</span> Vocabulary DNA Map
                            </h2>
                            <p className="text-slate-500 dark:text-slate-400 font-medium">Your linguistic profile based on collected words.</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                        {dnaCategories.map(cat => {
                            const count = dnaStats[cat.key];
                            const percentage = vaultWords.length > 0 ? (count / vaultWords.length) * 100 : 0;

                            return (
                                <div key={cat.key} className="flex flex-col">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="font-bold text-slate-700 dark:text-slate-300 text-sm flex items-center">
                                            <span className="mr-1">{cat.icon}</span> {cat.key}
                                        </span>
                                        <span className="text-slate-500 dark:text-slate-400 text-xs font-bold bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">{count}</span>
                                    </div>
                                    <div className={`w-full h-3 rounded-full ${cat.bg} overflow-hidden`}>
                                        <div
                                            className={`h-full ${cat.color} rounded-full transition-all duration-1000 ease-out`}
                                            style={{ width: `${percentage}%` }}
                                        ></div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {vaultWords.length === 0 ? (
                <div className="bg-white dark:bg-slate-800 p-12 rounded-3xl text-center shadow-lg border border-slate-100 dark:border-slate-700 transition-colors">
                    <span className="text-6xl mb-6 block">📭</span>
                    <h3 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">Your Vault is Empty</h3>
                    <p className="text-slate-500 dark:text-slate-400 text-lg max-w-md mx-auto">Play a reading mission and collect words to see them grow here in your dictionary.</p>
                </div>
            ) : (
                <>
                    {/* Search Bar */}
                    <div className="mb-6 px-6 relative max-w-md">
                        <div className="absolute inset-y-0 left-6 pl-3 flex items-center pointer-events-none">
                            <svg className="h-5 w-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </div>
                        <input
                            type="text"
                            className="block w-full pl-10 pr-3 py-2.5 border border-slate-700 rounded-lg bg-slate-800/50 text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 text-sm transition-colors"
                            placeholder="Search vocabulary..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 p-6">
                        {filteredWords.length === 0 && (
                            <div className="col-span-full py-12 text-center text-slate-500">
                                No words found matching &ldquo;{searchQuery}&rdquo;.
                            </div>
                        )}
                        {filteredWords.map((wordObj) => {
                            const profile = Array.isArray(wordObj.word_mastery_profiles) ? wordObj.word_mastery_profiles[0] : wordObj.word_mastery_profiles;
                            // Calculate a clean 0-100 mastery percentage based on recognition score
                            const progress = Math.min(100, Math.max(0, profile?.recognition_score || 0));
                            
                            return (
                                <div
                                    key={wordObj.id || wordObj.word}
                                    onClick={() => { playClickSound(); setSelectedWord(wordObj); }}
                                    className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-5 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-800/80 transition-all hover:-translate-y-1 group relative overflow-hidden"
                                >
                                    <h3 className="text-2xl font-bold text-indigo-400 group-hover:text-indigo-300 transition-colors truncate max-w-full px-2">{wordObj.word}</h3>
                                    <span className="text-[10px] text-slate-500 mt-1 mb-4 uppercase tracking-widest opacity-80 group-hover:opacity-100 transition-opacity">Tap to Review</span>
                                    
                                    <div className="w-full mt-auto pt-3 border-t border-slate-700/50">
                                        <div className="flex justify-between items-center mb-1.5">
                                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Mastery Progress</span>
                                            <span className={`text-[10px] font-bold ${progress >= 100 ? 'text-amber-400' : progress >= 70 ? 'text-emerald-400' : 'text-indigo-400'}`}>
                                                {progress}%
                                            </span>
                                        </div>
                                        <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden border border-slate-800/80">
                                            <div 
                                                className={`h-full rounded-full transition-all duration-1000 ease-out shadow-sm ${progress >= 100 ? 'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.6)]' : progress >= 70 ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]'}`}
                                                style={{ width: `${progress}%` }} 
                                            />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}

            {/* Flip-to-Center Modal */}
            {selectedWord && (
                <div 
                    className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-slate-950/80 backdrop-blur-sm"
                    onClick={() => { playQuitSound(); setSelectedWord(null); }}
                >
                    <div 
                        className="w-full h-[100dvh] sm:h-[70vh] sm:max-w-2xl sm:rounded-2xl relative animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300 overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <Flashcard 
                            wordObj={selectedWord} 
                            preferredAccent={preferredAccent}
                            onEdit={(word) => { playClickSound(); setEditingWord(word); setSelectedWord(null); }}
                            onPlayAudio={handlePlayAudio}
                            onDelete={(id) => { playQuitSound(); handleDeleteWord(id); setSelectedWord(null); }}
                            onClose={() => { playQuitSound(); setSelectedWord(null); }}
                        />
                    </div>
                </div>
            )}

            {/* Edit Word Modal */}
            {editingWord && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl border border-slate-200 dark:border-slate-700 transform transition-all">
                        <h3 className="text-2xl font-bold mb-6 text-slate-800 dark:text-white flex items-center gap-2">
                            <span>✏️</span> Edit Word
                        </h3>
                        <form onSubmit={handleSaveChanges} className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Word</label>
                                <input
                                    type="text"
                                    required
                                    value={editingWord.word}
                                    onChange={(e) => setEditingWord({ ...editingWord, word: e.target.value })}
                                    className="w-full p-4 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500 shadow-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Definition</label>
                                <textarea
                                    required
                                    rows={4}
                                    value={editingWord.definition || ''}
                                    onChange={(e) => setEditingWord({ ...editingWord, definition: e.target.value })}
                                    className="w-full p-4 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500 shadow-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">DNA Category</label>
                                <select
                                    value={editingWord.dna_type || 'Basic'}
                                    onChange={(e) => setEditingWord({ ...editingWord, dna_type: e.target.value })}
                                    className="w-full p-4 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500 shadow-sm appearance-none"
                                >
                                    {dnaCategories.map(c => (
                                        <option key={c.key} value={c.key}>{c.key}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex gap-4 justify-end pt-6 mt-6 border-t border-slate-100 dark:border-slate-700">
                                <button
                                    type="button"
                                    onClick={() => { playQuitSound(); setEditingWord(null); }}
                                    disabled={isSaving}
                                    className="px-6 py-3 rounded-xl font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    onClick={playClickSound}
                                    disabled={isSaving}
                                    className="px-6 py-3 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-lg flex items-center gap-2 transition-all disabled:opacity-50 hover:-translate-y-0.5"
                                >
                                    {isSaving ? "Saving..." : "Save Changes"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
