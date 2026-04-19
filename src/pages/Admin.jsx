import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { AXIOM_SUBJECTS } from '../lib/constants';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { playClickSound, playQuitSound } from '../utils/playSound';

export default function Admin({ session }) {
    const [adminTab, setAdminTab] = useState('article');
    const [isSandboxActive, setIsSandboxActive] = useState(false);

    // ── Evaluate New Account Sandboxing (24h cooldown) ──
    useEffect(() => {
        if (session?.user?.created_at) {
            const ageMs = new Date() - new Date(session.user.created_at);
            if (ageMs < 24 * 60 * 60 * 1000) {
                setIsSandboxActive(true);
            }
        }
    }, [session]);

    // ── Article state ──
    const [title, setTitle] = useState('');
    const [category, setCategory] = useState(AXIOM_SUBJECTS[0].name);
    const [subSubject, setSubSubject] = useState('');
    const [difficulty, setDifficulty] = useState('Advanced');
    const [content, setContent] = useState('');
    const [bulkVocabContent, setBulkVocabContent] = useState('');
    const [quizContent, setQuizContent] = useState('');
    const [dnaEntries, setDnaEntries] = useState([{ word: "", category: "Lexicon", subject: "", definition: "" }]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [quizQuestions, setQuizQuestions] = useState([]);
    const [statusMessage, setStatusMessage] = useState('');
    const [loadingDefinitions, setLoadingDefinitions] = useState({});
    const [editingArticleId, setEditingArticleId] = useState(null);
    const [articleList, setArticleList] = useState([]);
    const [articleListLoading, setArticleListLoading] = useState(false);
    const [isFetchingNews, setIsFetchingNews] = useState(false);


    // ── Release Notes state ──
    const [rnVersion, setRnVersion] = useState('');
    const [rnDate, setRnDate] = useState('');
    const [rnTitle, setRnTitle] = useState('');
    const [rnType, setRnType] = useState('feature');
    const [rnDetails, setRnDetails] = useState('');
    const [rnSubmitting, setRnSubmitting] = useState(false);
    const [rnStatus, setRnStatus] = useState('');

    const fetchDefinition = async (index) => {
        const entry = dnaEntries[index];
        const word = entry.word.trim();

        if (!word) {
            alert("Please enter a target word first.");
            return;
        }

        if (entry.definition && entry.definition.trim().length > 0) {
            return; // Skip if a definition already exists
        }

        setLoadingDefinitions(prev => ({ ...prev, [index]: true }));

        try {
            const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);

            if (response.ok) {
                const data = await response.json();

                // Safely extract the first meaningful definition
                if (data[0]?.meanings[0]?.definitions[0]?.definition) {
                    const cleanDef = data[0].meanings[0].definitions[0].definition;
                    handleEntryChange(index, "definition", cleanDef);
                }
            } else {
                console.warn(`Definition not found for "${word}" (Status: ${response.status})`);
            }
        } catch (error) {
            console.error("Error fetching dictionary definition:", error);
        } finally {
            setLoadingDefinitions(prev => ({ ...prev, [index]: false }));
        }
    };

    const handleEntryChange = (index, field, value) => {
        const newEntries = [...dnaEntries];
        newEntries[index][field] = value;
        setDnaEntries(newEntries);
    };

    const addEntry = () => {
        setDnaEntries([...dnaEntries, { word: "", category: "Lexicon", subject: "", definition: "" }]);
    };

    const removeEntry = (index) => {
        const newEntries = dnaEntries.filter((_, i) => i !== index);
        setDnaEntries(newEntries);
    };

    // ── Bulk Vocab Parser (pipe-delimited, 8 columns) ──
    const handleBulkParse = () => {
        if (isSandboxActive) {
            alert("⚠️ Account Sandbox Active: Bulk vocabulary imports are restricted for the first 24 hours of account creation to maintain database integrity.");
            return;
        }

        if (!bulkVocabContent.trim()) {
            alert("Please paste the bulk import content first.");
            return;
        }

        const lines = bulkVocabContent.split('\n');
        const parsedWords = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const parts = line.split('|').map(item => item.trim());
            const word = parts[0] || '';
            const category = parts[1] || 'Lexicon';
            const subject = parts[2] || '';
            const definition = parts[3] || '';
            const rawSynonyms = parts[4] || '';
            const rawAntonyms = parts[5] || '';
            const rawCollocations = parts[6] || '';
            const rawFamily = parts[7] || '';

            if (!word) {
                alert(`Syntax error on line ${i + 1}: missing word. Skipping.`);
                continue;
            }

            const synonyms = rawSynonyms ? rawSynonyms.split(',').map(s => s.trim()).filter(Boolean) : [];
            const antonyms = rawAntonyms ? rawAntonyms.split(',').map(a => a.trim()).filter(Boolean) : [];
            const collocations = rawCollocations ? rawCollocations.split(',').map(c => c.trim()).filter(Boolean) : [];
            const wordFamily = rawFamily;

            parsedWords.push({
                word,
                category,
                subject,
                definition,
                word_connections: { synonyms, antonyms, collocations, wordFamily }
            });
        }

        if (parsedWords.length > 0) {
            if (dnaEntries.length === 1 && !dnaEntries[0].word.trim()) {
                setDnaEntries(parsedWords);
            } else {
                setDnaEntries(prev => [...prev, ...parsedWords]);
            }
            setBulkVocabContent('');
        }
    };

    const handleBulkQuizParse = () => {
        if (isSandboxActive) {
            alert("⚠️ Account Sandbox Active: Bulk imports are restricted for the first 24 hours.");
            return;
        }

        if (!quizContent.trim()) {
            alert("Please paste the bulk quiz import content first.");
            return;
        }

        const lines = quizContent.split('\n');
        const parsedQuiz = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const parts = line.split('|').map(p => p.trim());
            // Need exactly 7 segments
            if (parts.length >= 7) {
                const correctOptionNumber = parseInt(parts[5], 10);
                if (correctOptionNumber >= 1 && correctOptionNumber <= 4) {
                    parsedQuiz.push({
                        question: parts[0],
                        options: [parts[1], parts[2], parts[3], parts[4]],
                        // Option array is 0-indexed, but correctOptionNumber is 1-4.
                        // Wait: index 1 was option 1 in the parts array. But options[] has it at index 0.
                        // we can just map the string value using parts[correctOptionNumber] because correct option 1 is at index 1 of parts array.
                        correct_answer: parts[correctOptionNumber],
                        explanation: parts[6]
                    });
                } else {
                    alert(`Syntax error on line ${i + 1}: Correct Option Number must be between 1 and 4. Skipping.`);
                }
            } else {
                alert(`Syntax error on line ${i + 1}: Expected 7 segments but found ${parts.length}. Skipping.`);
            }
        }

        if (parsedQuiz.length > 0) {
            setQuizQuestions(prev => [...prev, ...parsedQuiz]);
            setQuizContent(''); // Clear after successful parse
        }
    };

    const handleQuizChange = (index, field, value) => {
        const newQuiz = [...quizQuestions];
        newQuiz[index][field] = value;
        setQuizQuestions(newQuiz);
    };

    const handleQuizOptionChange = (qIndex, optIndex, value) => {
        const newQuiz = [...quizQuestions];
        newQuiz[qIndex].options[optIndex] = value;
        setQuizQuestions(newQuiz);
    };

    const addQuizQuestion = () => {
        setQuizQuestions([
            ...quizQuestions,
            { question: "", options: ["", "", "", ""], correct_answer: "", explanation: "" }
        ]);
    };

    const removeQuizQuestion = (index) => {
        const newQuiz = quizQuestions.filter((_, i) => i !== index);
        setQuizQuestions(newQuiz);
    };

    const clearArticleForm = useCallback(() => {
        setTitle('');
        setCategory(AXIOM_SUBJECTS[0].name);
        setSubSubject('');
        setDifficulty('Advanced');
        setContent('');
        setQuizContent('');
        setBulkVocabContent('');
        setDnaEntries([{ word: "", category: "Lexicon", subject: "", definition: "" }]);
        setQuizQuestions([]);
        setStatusMessage('');
        setEditingArticleId(null);
    }, []);

    const fetchArticleList = useCallback(async () => {
        setArticleListLoading(true);
        const { data, error } = await supabase
            .from('articles')
            .select('id, title, category, sub_subject, difficulty_level, created_at')
            .order('sub_subject', { ascending: true })
            .order('created_at', { ascending: false });
        if (!error) setArticleList(data ?? []);
        setArticleListLoading(false);
    }, []);

    const handleDeleteArticle = async (articleId) => {
        if (!window.confirm("Are you sure you want to delete this article?")) return;

        if (isSandboxActive) {
            setStatusMessage('❌ Action denied: New accounts are restricted from deleting for 24 hours.');
            return;
        }

        try {
            const { error } = await supabase.from('articles').delete().eq('id', articleId);
            if (error) throw error;

            // Update local state instantly:
            setArticleList(prev => prev.filter(a => a.id !== articleId));
            setStatusMessage('✅ Article deleted successfully!');
        } catch (error) {
            setStatusMessage(`❌ Error deleting article: ${error.message}`);
        }
    };

    const handleFetchLiveNews = async () => {
        if (isSandboxActive) {
            setStatusMessage('❌ Action denied: New accounts are restricted from bulk fetching for 24 hours.');
            return;
        }

        setIsFetchingNews(true);
        setStatusMessage('');

        try {
            const { data, error } = await supabase.functions.invoke('fetch-news', {
                body: { language: 'en' }
            });

            if (error) throw new Error(error.message);
            if (!data?.success) {
                if (data?.error?.includes("Missing GNEWS_API_KEY")) {
                    throw new Error("Setup Required: Please add your GNews API Key to your Supabase Secrets.");
                }
                throw new Error(data?.error || 'Unknown Edge Function Error');
            }
            if (!data.articles || data.articles.length === 0) {
                setStatusMessage('⚠️ No new articles found from GNews right now. Try again later.');
                setIsFetchingNews(false);
                return;
            }

            const inserts = data.articles.map(article => {
                let readingText = article.content;
                if (!readingText || readingText.toLowerCase().includes('paid')) {
                    readingText = article.description;
                }
                if (!readingText) {
                    readingText = article.title;
                }

                return {
                    title: article.title,
                    category: 'News',
                    sub_subject: article.source?.name || 'General',
                    difficulty_level: 'Intermediate',
                    content_data: { segments: [{ id: 1, text: readingText, targetWord: "" }] }
                };
            });

            const { error: insertError } = await supabase.from('articles').insert(inserts);
            if (insertError) throw new Error(insertError.message);

            setStatusMessage(`✅ Successfully fetched and added ${inserts.length} live news articles!`);
            fetchArticleList();
        } catch (err) {
            setStatusMessage(`❌ Fetch failed: ${err.message}`);
        } finally {
            setIsFetchingNews(false);
        }
    };

    useEffect(() => { fetchArticleList(); }, [fetchArticleList]);

    const loadArticleForEdit = async (article) => {
        const { data, error } = await supabase
            .from('articles')
            .select('*')
            .eq('id', article.id)
            .single();
        if (error || !data) { alert('Failed to load article: ' + (error?.message ?? 'unknown')); return; }

        setEditingArticleId(data.id);
        setTitle(data.title ?? '');
        setCategory(data.category ?? 'Science');
        setSubSubject(data.sub_subject ?? '');
        setDifficulty(data.difficulty_level ?? 'Advanced');
        const segments = data.content_data?.segments ?? [];
        setContent(segments.map(s => s.text ?? '').join('\n'));
        setQuizQuestions(data.content_data?.quiz ?? []);
        const dnaMap = data.dna_map ?? {};
        const entries = Object.entries(dnaMap).map(([word, meta]) => ({
            word, category: meta.category ?? 'Lexicon', subject: meta.subject ?? '', definition: meta.definition ?? ''
        }));
        setDnaEntries(entries.length > 0 ? entries : [{ word: "", category: "Lexicon", subject: "", definition: "" }]);
        setStatusMessage('');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (isSandboxActive) {
            setStatusMessage('❌ Action denied: New accounts are restricted from publishing for 24 hours.');
            return;
        }

        setIsSubmitting(true);
        setStatusMessage('');

        try {
            let formattedContent;
            try {
                formattedContent = JSON.parse(content);
            } catch (_) {
                formattedContent = {
                    segments: content.split('\n').filter(p => p.trim()).map(text => ({ text: text.trim() })),
                    quiz: quizQuestions
                };
            }
            if (formattedContent && quizQuestions.length > 0) formattedContent.quiz = quizQuestions;

            const parsedMap = dnaEntries.reduce((acc, current) => {
                const cleanWord = current.word.trim().toLowerCase();
                if (cleanWord) acc[cleanWord] = { category: current.category, subject: current.subject || "", definition: current.definition || "" };
                return acc;
            }, {});

            const payload = { title, category, sub_subject: subSubject.trim() || null, difficulty_level: difficulty, content_data: formattedContent, dna_map: parsedMap };

            let error;
            if (editingArticleId) {
                ({ error } = await supabase.from('articles').update(payload).eq('id', editingArticleId));
            } else {
                ({ error } = await supabase.from('articles').insert([payload]));
            }

            if (error) {
                setStatusMessage('❌ ' + error.message);
            } else {
                setStatusMessage(editingArticleId ? '✅ Article updated successfully!' : '✅ Article published successfully!');
                clearArticleForm();
                fetchArticleList();
            }
        } catch (err) {
            setStatusMessage('❌ ' + (err.message || 'An error occurred.'));
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleReleaseNotesSubmit = async (e) => {
        e.preventDefault();
        setRnSubmitting(true);
        setRnStatus('');

        const detailsArray = rnDetails
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);

        const { error } = await supabase.from('changelog').insert([{
            version: rnVersion.trim(),
            release_date: rnDate,
            title: rnTitle.trim(),
            type: rnType,
            details: detailsArray,
        }]);

        if (error) {
            setRnStatus('❌ ' + error.message);
        } else {
            setRnStatus('✅ Release note published successfully!');
            setRnVersion('');
            setRnDate('');
            setRnTitle('');
            setRnType('feature');
            setRnDetails('');
        }
        setRnSubmitting(false);
    };

    return (
        <div className="w-full max-w-4xl mx-auto my-10 relative">

            {/* ── Sandboxing Alert ── */}
            {isSandboxActive && (
                <div className="bg-amber-900/30 border border-amber-500/50 p-6 rounded-2xl mb-8 flex items-start gap-4 shadow-md text-amber-100 animate-fade-in">
                    <div className="text-2xl mt-0.5">⚠️</div>
                    <div>
                        <h3 className="text-lg font-bold text-amber-400 mb-1">Account Validation Period</h3>
                        <p className="text-sm leading-relaxed text-amber-200/90">
                            Welcome! To protect platform integrity and prevent abuse, new accounts are placed in a temporary sandbox.
                            <strong> High-volume operations such as bulk importing and article publishing are restricted for 24 hours.</strong>
                        </p>
                    </div>
                </div>
            )}

            {/* ── Admin Tab Switcher ── */}
            <div className="flex gap-2 mb-6">
                {[
                    { key: 'article', label: '📄 Upload Article' },
                    { key: 'release', label: '✨ Release Notes' },
                ].map(({ key, label }) => (
                    <button
                        key={key}
                        onClick={() => { playClickSound(); setAdminTab(key); }}
                        className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 border ${adminTab === key
                            ? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-500/20'
                            : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-gray-200 dark:border-slate-700 hover:border-blue-300 hover:text-blue-500'
                            }`}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {/* ── Release Notes Publisher ── */}
            {adminTab === 'release' && (
                <div className="bg-slate-900 border border-slate-700/60 rounded-2xl p-8 shadow-2xl shadow-black/30">
                    <div className="flex items-center gap-3 mb-7">
                        <div className="w-9 h-9 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-lg">✨</div>
                        <div>
                            <h2 className="text-lg font-extrabold text-white tracking-tight">Publish Release Note</h2>
                            <p className="text-xs text-slate-500">Publishes immediately to the What's New panel</p>
                        </div>
                    </div>

                    <form onSubmit={handleReleaseNotesSubmit} className="space-y-5">
                        {/* Row: Version + Date */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Version</label>
                                <input
                                    type="text"
                                    value={rnVersion}
                                    onChange={e => setRnVersion(e.target.value)}
                                    placeholder="e.g. v2.1.0"
                                    required
                                    disabled={rnSubmitting}
                                    className="w-full px-4 py-3 rounded-xl bg-slate-800/80 border border-slate-700/60 text-slate-100 placeholder-slate-500 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Release Date</label>
                                <input
                                    type="date"
                                    value={rnDate}
                                    onChange={e => setRnDate(e.target.value)}
                                    required
                                    disabled={rnSubmitting}
                                    className="w-full px-4 py-3 rounded-xl bg-slate-800/80 border border-slate-700/60 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all [color-scheme:dark]"
                                />
                            </div>
                        </div>

                        {/* Row: Title + Type */}
                        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-5 items-end">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Release Title</label>
                                <input
                                    type="text"
                                    value={rnTitle}
                                    onChange={e => setRnTitle(e.target.value)}
                                    placeholder="e.g. Performance Overhaul"
                                    required
                                    disabled={rnSubmitting}
                                    className="w-full px-4 py-3 rounded-xl bg-slate-800/80 border border-slate-700/60 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Type</label>
                                <select
                                    value={rnType}
                                    onChange={e => setRnType(e.target.value)}
                                    disabled={rnSubmitting}
                                    className="px-4 py-3 rounded-xl bg-slate-800/80 border border-slate-700/60 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all appearance-none cursor-pointer"
                                >
                                    <option value="feature">🟢 Feature</option>
                                    <option value="update">🔵 Update</option>
                                    <option value="fix">🟠 Fix</option>
                                </select>
                            </div>
                        </div>

                        {/* Details */}
                        <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                                Bullet Points
                                <span className="ml-2 normal-case font-normal text-slate-600">— one point per line</span>
                            </label>
                            <textarea
                                value={rnDetails}
                                onChange={e => setRnDetails(e.target.value)}
                                rows={6}
                                required
                                disabled={rnSubmitting}
                                placeholder={`Total brand overhaul — welcome to Axiom.\nNew Quotation Anchor logo with premium dark mode.\nGlassmorphic UI system with consistent tokens.`}
                                className="w-full px-4 py-3 rounded-xl bg-slate-800/80 border border-slate-700/60 text-slate-200 placeholder-slate-600 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all resize-y"
                            />
                        </div>

                        {/* Submit */}
                        <div className="flex flex-col items-end gap-4 pt-2">
                            <button
                                type="submit"
                                onClick={playClickSound}
                                disabled={rnSubmitting}
                                className={`flex items-center gap-2.5 px-7 py-3 rounded-xl font-bold text-white text-sm shadow-lg transition-all duration-200 ${rnSubmitting
                                    ? 'bg-blue-500/50 cursor-not-allowed'
                                    : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 hover:-translate-y-0.5 hover:shadow-blue-500/30'
                                    }`}
                            >
                                {rnSubmitting ? (
                                    <>
                                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                        </svg>
                                        Publishing...
                                    </>
                                ) : (
                                    <>
                                        <span>🚀</span> Publish Release
                                    </>
                                )}
                            </button>

                            {rnStatus && (
                                <div className={`w-full p-4 rounded-xl text-sm font-medium border-l-4 ${rnStatus.startsWith('✅')
                                    ? 'bg-emerald-900/30 text-emerald-400 border-emerald-500'
                                    : 'bg-red-900/30 text-red-400 border-red-500'
                                    }`}>
                                    {rnStatus}
                                </div>
                            )}
                        </div>
                    </form>
                </div>
            )}

            {/* ── Article Tab ── */}
            {adminTab === 'article' && (
                <div className="space-y-6">

                    {/* Edit mode banner */}
                    {editingArticleId && (
                        <div className="flex items-center justify-between px-5 py-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30">
                            <span className="text-sm font-bold text-cyan-400">✏️ Editing — changes will overwrite the existing record</span>
                            <button onClick={() => { playQuitSound(); clearArticleForm(); }} className="text-xs font-bold text-slate-400 hover:text-white px-3 py-1.5 rounded-lg border border-slate-700 hover:border-slate-500 transition-all">✕ Cancel Edit</button>
                        </div>
                    )}

                    {/* Auto-Fetch Live News Section */}
                    {!editingArticleId && (
                        <div className="w-full bg-slate-900 border border-slate-700/60 rounded-2xl p-6 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
                            <div>
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <span className="text-xl">📡</span> Auto-Fetch Live News
                                </h3>
                                <p className="text-sm text-slate-400 mt-1">
                                    Pull the latest trending articles from the global news API directly into the public database.
                                </p>
                            </div>
                            <button
                                onClick={() => { playClickSound(); handleFetchLiveNews(); }}
                                disabled={isFetchingNews || isSubmitting}
                                className={`shrink-0 px-6 py-3 rounded-xl font-bold text-sm shadow-lg transition-all ${isFetchingNews
                                    ? 'bg-blue-500/50 text-white cursor-not-allowed'
                                    : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white hover:-translate-y-0.5 hover:shadow-blue-500/30'
                                    }`}
                            >
                                {isFetchingNews ? (
                                    <span className="flex items-center gap-2">
                                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                        </svg>
                                        Fetching...
                                    </span>
                                ) : "⚡ Fetch Live News"}
                            </button>
                        </div>
                    )}

                    {/* Upload / Edit form */}
                    <div className="w-full bg-slate-900 rounded-2xl p-8 border border-slate-800 relative overflow-hidden shadow-2xl shadow-black/40">
                        <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-cyan-500 to-blue-600" />
                        <h2 className="text-xl font-extrabold text-slate-100 mb-7 flex items-center gap-2.5">
                            <span className="w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-base">{editingArticleId ? '✏️' : '📄'}</span>
                            {editingArticleId ? 'Edit Article' : 'Upload Article'}
                        </h2>

                        <form onSubmit={handleSubmit} className="space-y-5">

                            <div>
                                <label htmlFor="title" className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Title</label>
                                <input
                                    id="title"
                                    type="text"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl bg-slate-800/80 border border-slate-700/60 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                                    placeholder="Article Title"
                                    required
                                    disabled={isSubmitting}
                                />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                <div>
                                    <label htmlFor="category" className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Category</label>
                                    <select
                                        id="category"
                                        value={category}
                                        onChange={(e) => setCategory(e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl bg-slate-800/80 border border-slate-700/60 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all appearance-none cursor-pointer"
                                        disabled={isSubmitting}
                                    >
                                        {AXIOM_SUBJECTS.map(subject => (
                                            <option key={subject.name} value={subject.name}>
                                                {subject.icon} {subject.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="difficulty" className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Difficulty</label>
                                    <select
                                        id="difficulty"
                                        value={difficulty}
                                        onChange={(e) => setDifficulty(e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl bg-slate-800/80 border border-slate-700/60 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all appearance-none cursor-pointer"
                                        disabled={isSubmitting}
                                    >
                                        <option value="Intermediate">Intermediate</option>
                                        <option value="Advanced">Advanced</option>
                                        <option value="IELTS Academic">IELTS Academic</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label htmlFor="subSubject" className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Sub-Subject <span className="font-normal text-slate-600">(optional tag, e.g. Biology, AI, Climate)</span></label>
                                <input
                                    id="subSubject"
                                    type="text"
                                    value={subSubject}
                                    onChange={(e) => setSubSubject(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl bg-slate-800/80 border border-slate-700/60 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                                    placeholder="e.g. Biology, AI, Climate, Culture..."
                                    disabled={isSubmitting}
                                />
                            </div>

                            <div>
                                <label htmlFor="content" className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Content</label>
                                <textarea
                                    id="content"
                                    value={content}
                                    onChange={(e) => setContent(e.target.value)}
                                    rows="12"
                                    className="w-full px-4 py-3 rounded-xl bg-slate-800/80 border border-slate-700/60 text-slate-200 placeholder-slate-600 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all resize-y"
                                    placeholder="Paste the full article content here..."
                                    required
                                    disabled={isSubmitting}
                                ></textarea>
                            </div>

                            {/* Vocabulary DNA Builder Remounted / Removed */}

                            {/* Article Quiz Builder UI */}
                            <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-inner mt-6">
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Article Quiz Builder</label>

                                <div className="mb-6 space-y-4">
                                    <textarea
                                        value={quizContent}
                                        onChange={(e) => setQuizContent(e.target.value)}
                                        rows="4"
                                        className="w-full p-4 border border-slate-700 rounded-xl bg-slate-900 text-slate-200 placeholder-slate-500 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all shadow-sm"
                                        placeholder="Question | Option 1 | Option 2 | Option 3 | Option 4 | Correct Option Number (1-4) | Explanation"
                                        disabled={isSubmitting}
                                    ></textarea>
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            onClick={() => { playClickSound(); handleBulkQuizParse(); }}
                                            disabled={isSubmitting || !quizContent.trim()}
                                            className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold rounded-xl shadow hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm hover:-translate-y-0.5"
                                        >
                                            <span>⚡ Parse Quiz Import</span>
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    {quizQuestions.map((q, qIndex) => (
                                        <div key={qIndex} className="p-4 bg-slate-900 border border-slate-700 rounded-xl shadow-sm relative">
                                            <button
                                                type="button"
                                                onClick={() => removeQuizQuestion(qIndex)}
                                                className="absolute -top-3 -right-3 w-8 h-8 flex items-center justify-center bg-slate-800 text-red-500 hover:bg-red-900/40 hover:text-red-400 border border-slate-700 hover:border-red-700 rounded-full font-bold transition-all shadow-md z-10"
                                                title="Remove Question"
                                                disabled={isSubmitting}
                                            >
                                                ✕
                                            </button>

                                            <div className="space-y-4">
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-400 mb-1 uppercase tracking-wider">Question {qIndex + 1}</label>
                                                    <input
                                                        type="text"
                                                        value={q.question}
                                                        onChange={(e) => handleQuizChange(qIndex, "question", e.target.value)}
                                                        placeholder="Enter the question text"
                                                        className="w-full p-3 border border-slate-600 rounded-xl bg-slate-900 text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 shadow-sm"
                                                        disabled={isSubmitting}
                                                    />
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    {q.options.map((opt, optIndex) => (
                                                        <div key={optIndex} className="flex items-center">
                                                            <span className="w-8 text-center font-bold text-slate-500">{String.fromCharCode(65 + optIndex)}</span>
                                                            <input
                                                                type="text"
                                                                value={opt}
                                                                onChange={(e) => handleQuizOptionChange(qIndex, optIndex, e.target.value)}
                                                                placeholder={`Option ${optIndex + 1}`}
                                                                className="flex-1 p-2.5 border border-slate-600 rounded-lg bg-slate-900 text-slate-100 shadow-sm text-sm"
                                                                disabled={isSubmitting}
                                                            />
                                                        </div>
                                                    ))}
                                                </div>

                                                <div className="flex flex-col md:flex-row gap-4 pt-2">
                                                    <div className="w-full md:w-1/3">
                                                        <label className="block text-xs font-bold text-slate-400 mb-1 uppercase tracking-wider">Correct Answer</label>
                                                        <select
                                                            value={q.correct_answer}
                                                            onChange={(e) => handleQuizChange(qIndex, "correct_answer", e.target.value)}
                                                            className="w-full p-3 border border-slate-600 rounded-xl bg-slate-900 text-slate-100 shadow-sm appearance-none text-sm"
                                                            disabled={isSubmitting}
                                                        >
                                                            <option value="" disabled>Select correct option...</option>
                                                            {q.options.filter(o => o.trim()).map((opt, i) => (
                                                                <option key={i} value={opt}>{opt}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    <div className="w-full md:w-2/3">
                                                        <label className="block text-xs font-bold text-slate-400 mb-1 uppercase tracking-wider">Explanation</label>
                                                        <input
                                                            type="text"
                                                            value={q.explanation}
                                                            onChange={(e) => handleQuizChange(qIndex, "explanation", e.target.value)}
                                                            placeholder="Explanation for the correct answer"
                                                            className="w-full p-3 border border-slate-600 rounded-xl bg-slate-900 text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 shadow-sm text-sm"
                                                            disabled={isSubmitting}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <button
                                    type="button"
                                    onClick={addQuizQuestion}
                                    className="mt-6 px-4 py-2 bg-slate-800 text-emerald-400 hover:bg-slate-700 hover:text-emerald-300 border border-slate-700 hover:border-emerald-700 rounded-lg text-sm font-bold transition-all shadow-sm"
                                    disabled={isSubmitting}
                                >
                                    + Add Question
                                </button>
                            </div>

                            <div className="pt-4 flex flex-col items-end">
                                <button
                                    type="submit"
                                    onClick={playClickSound}
                                    disabled={isSubmitting || isSandboxActive}
                                    className={`px-8 py-3 rounded-xl font-bold text-white shadow-lg transition-all duration-300 transform ${isSubmitting || isSandboxActive
                                        ? 'bg-blue-500/50 cursor-not-allowed scale-100'
                                        : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 hover:-translate-y-0.5 hover:shadow-blue-500/30'
                                        }`}
                                >
                                    {isSubmitting ? (
                                        <span className="flex items-center space-x-2">
                                            <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                            <span>{editingArticleId ? 'Updating...' : 'Publishing...'}</span>
                                        </span>
                                    ) : (
                                        editingArticleId ? 'Update Article' : 'Publish Article'
                                    )}
                                </button>

                                {statusMessage && (
                                    <div className={`mt-6 w-full p-4 rounded-xl border-l-4 font-medium animate-fade-in ${statusMessage.startsWith('✅')
                                        ? 'bg-emerald-900/30 text-emerald-400 border-emerald-500'
                                        : 'bg-red-900/30 text-red-400 border-red-500'
                                        }`}>
                                        {statusMessage}
                                    </div>
                                )}
                            </div>
                        </form>
                    </div>

                    {/* ── Manage Articles List ── */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl shadow-black/30">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
                            <div className="flex items-center gap-2.5">
                                <span className="text-sm">📋</span>
                                <h3 className="text-sm font-extrabold text-slate-100 tracking-tight">Manage Articles</h3>
                                <span className="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-xs font-bold text-slate-400">{articleList.length}</span>
                            </div>
                            <button
                                onClick={fetchArticleList}
                                disabled={articleListLoading}
                                className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-cyan-400 px-3 py-1.5 rounded-lg border border-slate-700/50 hover:border-cyan-500/30 transition-all disabled:opacity-50"
                            >
                                {articleListLoading ? (
                                    <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                                ) : '↻'} Refresh
                            </button>
                        </div>

                        {articleListLoading && articleList.length === 0 ? (
                            <div className="p-6 space-y-3">
                                {[1, 2, 3].map(i => <div key={i} className="h-11 rounded-lg bg-slate-800/60 animate-pulse" />)}
                            </div>
                        ) : articleList.length === 0 ? (
                            <div className="py-12 text-center text-slate-600 text-sm font-semibold">No articles published yet.</div>
                        ) : (
                            <div className="divide-y divide-slate-800/60">
                                {articleList.map((art) => (
                                    <div key={art.id} className={`flex items-center justify-between px-6 py-3.5 hover:bg-slate-800/40 transition-colors ${editingArticleId === art.id ? 'bg-cyan-500/5 border-l-2 border-cyan-500' : ''}`}>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-slate-200 truncate">{art.title}</p>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <span className="text-xs text-slate-500">{art.category}</span>
                                                {art.sub_subject && <><span className="text-slate-700">·</span><span className="text-xs text-slate-500">{art.sub_subject}</span></>}
                                                <span className="text-slate-700">·</span>
                                                <span className="text-xs text-slate-600">{art.difficulty_level}</span>
                                            </div>
                                        </div>
                                        <div className="flex shrink-0">
                                            <button
                                                onClick={() => loadArticleForEdit(art)}
                                                disabled={editingArticleId === art.id}
                                                className="ml-4 flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all bg-slate-800 border-slate-700 text-slate-400 hover:bg-cyan-500/10 hover:border-cyan-500/40 hover:text-cyan-400 disabled:opacity-40 disabled:cursor-default"
                                            >
                                                {editingArticleId === art.id ? 'Editing…' : '✏️ Edit'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); handleDeleteArticle(art.id); }}
                                                className="ml-2 flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all bg-slate-800 border-slate-700 text-slate-400 hover:bg-red-500/10 hover:border-red-500/40 hover:text-red-400"
                                            >
                                                🗑️ Delete
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                </div>
            )}
        </div>
    );
}

