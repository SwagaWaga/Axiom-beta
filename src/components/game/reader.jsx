import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabaseClient';
import SmartReview from './SmartReview';
import ReadingQuiz from './ReadingQuiz';
import { useAccent } from '../../context/AccentContext';
import { playHover, playClickSound } from '../../utils/playSound';

import { GoogleGenerativeAI } from '@google/generative-ai';
import { AXIOM_SUBJECTS } from '../../lib/constants';


export default function Reader({ session }) {
  const { preferredAccent } = useAccent();
  // --- Selection State ---
  const [allArticles, setAllArticles] = useState([]);
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [selectedArticleId, setSelectedArticleId] = useState(null);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState('All');

  // --- Reading State ---
  const [article, setArticle] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [xp, setXp] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [gamePhase, setGamePhase] = useState('reading');
  const [collectedWords, setCollectedWords] = useState([]);

  // Batch extraction state
  const [pendingWords, setPendingWords] = useState([]);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [batchResults, setBatchResults] = useState([]);
  const [savedFromBatch, setSavedFromBatch] = useState([]);

  // 1. Fetch metadata on mount
  useEffect(() => {
    async function fetchMetadata() {
      try {
        setIsLoadingMetadata(true);
        const { data, error } = await supabase
          .from('articles')
          .select('id, title, category, sub_subject, difficulty_level, created_at')
          .order('sub_subject', { ascending: true })
          .order('created_at', { ascending: false });

        if (error) throw error;
        setAllArticles(data || []);
      } catch (err) {
        console.error("Error fetching article metadata:", err);
        setError("Could not load article catalogue.");
      } finally {
        setIsLoadingMetadata(false);
      }
    }
    fetchMetadata();
  }, []);



  // Derived filtered list based on subject
  const currentSubjectArticles = useMemo(() => {
    if (!selectedSubject) return [];
    return allArticles.filter(a => a.category === selectedSubject);
  }, [allArticles, selectedSubject]);

  // 2. Fetch full article when an ID is selected
  useEffect(() => {
    async function fetchFullArticle() {
      if (!selectedArticleId) return;

      try {
        setLoading(true);
        setError(null);

        const { data, error } = await supabase
          .from('articles')
          .select('*')
          .eq('id', selectedArticleId)
          .single();

        if (error) throw error;

        setArticle(data);
        setFeedback("");
        setCollectedWords([]);
        setPendingWords([]);
        setBatchResults([]);
        setSavedFromBatch([]);
        setGamePhase('reading');

        // Fetch user's initial XP
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('xp')
            .eq('id', user.id)
            .single();

          if (profile) setXp(profile.xp || 0);
        }

      } catch (err) {
        console.error('Error fetching full article:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchFullArticle();
  }, [selectedArticleId]);


  const extractSentence = (text, clickedWord) => {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    const match = sentences.find(sentence =>
      sentence.toLowerCase().includes(clickedWord.toLowerCase())
    );
    return match ? match.trim() : text;
  };

  const handleWordClick = (word) => {
    const cleanWord = word.toLowerCase().replace(/[.,!?;:()"'`]/g, "");
    if (!cleanWord) return;

    const isPending = pendingWords.includes(cleanWord);

    if (isPending) {
      setPendingWords(prev => prev.filter(w => w !== cleanWord));
      // Also remove from batchResults if already processed
      setBatchResults(prev => prev.filter(r => r.word !== cleanWord));
      setFeedback(`🗑️ Removed: ${cleanWord}`);
    } else {
      setPendingWords(prev => [...prev, cleanWord]);
      setFeedback(`📌 Bagged: ${cleanWord}`);
    }
    setTimeout(() => setFeedback(""), 1500);
  };

  const handleBatchExtraction = async (fullText) => {
    if (pendingWords.length === 0 || isBatchProcessing) return;

    setIsBatchProcessing(true);
    setBatchResults([]);

    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

      const prompt = `Read the following article text:

${fullText}

Now, provide concise, IELTS-level definitions for the following words based strictly on how they are used in this context: ${pendingWords.join(', ')}. Regardless of how the word appears in the provided text, always extract and return its base dictionary form (lemma) in the base_form field.`;

      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "array",
            items: {
              type: "object",
              properties: {
                word: { type: "string" },
                base_form: {
                  type: "string",
                  description: "The infinitive, singular, or un-conjugated base dictionary form of the word."
                },
                definition: { type: "string" },
                partOfSpeech: { type: "string" },
                category: {
                  type: "string",
                  enum: ["Academic", "Technical", "Advanced", "Informal", "Basic"],
                  description: "You must classify the word into exactly one of these categories based on its register and difficulty."
                },
                connections: {
                  type: "object",
                  properties: {
                    synonyms: { type: "array", items: { type: "string" } },
                    antonyms: { type: "array", items: { type: "string" } },
                    wordFamily: { type: "string" },
                    collocations: { type: "array", items: { type: "string" } }
                  }
                }
              },
              required: ["word", "base_form", "definition", "partOfSpeech", "category", "connections"]
            }
          }
        }
      });
      const raw = result.response.text().trim();
      console.log("RAW AI RESPONSE:", raw);

      // Strip optional markdown code fences or other artifacts just in case
      const cleanText = raw.replace(/```json/gi, '').replace(/```/gi, '').trim();
      let parsedAiData = JSON.parse(cleanText);
      console.log("PARSED DATA:", parsedAiData);

      // Normalize to always be a flat array for batchResults
      let normalizedData = [];
      if (Array.isArray(parsedAiData)) {
        // If the AI returned an array containing an array `[[ {...} ]]`
        if (parsedAiData.length > 0 && Array.isArray(parsedAiData[0])) {
          normalizedData = parsedAiData[0];
        } else {
          normalizedData = parsedAiData;
        }
      } else {
        // If the AI returned a direct object `{...}` instead of an array
        normalizedData = [parsedAiData];
      }
      console.log("NORMALIZED DATA:", normalizedData);

      if (normalizedData.length > 0 && typeof normalizedData[0] === 'object') {
        setBatchResults(normalizedData);
      } else {
        throw new Error("Unexpected response format: Expected an array of objects.");
      }
    } catch (err) {
      console.error("Batch extraction failed:", err);
      setFeedback("❌ Batch extraction failed. Please try again.");
      setTimeout(() => setFeedback(""), 3000);
    } finally {
      setIsBatchProcessing(false);
    }
  };

  const handleSaveWordToVault = async (item) => {
    if (savedFromBatch.includes(item.word)) return;

    const contextString = extractSentence(
      typeof article?.content_data === 'string'
        ? article.content_data
        : article?.content_data?.text
        || (article?.content_data?.segments ? article.content_data.segments.map(seg => seg.text).join('\n\n') : ''),
      item.word
    );

    const dnaData = article?.dna_map?.[item.word.toLowerCase()];
    // Strict assignment from Gemini extraction schema first, then fallback to db
    const fallbackCategory = typeof dnaData === 'string' ? dnaData : (dnaData?.category || "Basic");
    const dnaType = item.category || fallbackCategory;

    setCollectedWords(prev => [
      ...prev.filter(w => w.word !== item.word),
      { word: item.base_form, context: contextString, definition: item.definition, dna_type: dnaType, audio_url: null, word_connections: item.connections || null }
    ]);
    setSavedFromBatch(prev => [...prev, item.word]);

    // Persist to Supabase
    if (session?.user?.id) {
      try {
        const dbPayload = {
          user_id: session.user.id,
          word: item.base_form,
          definition: item.definition,
          part_of_speech: item.partOfSpeech || null,
          mastery_level: 0,
          context: contextString,
          dna_type: dnaType,
          audio_url: null,
          word_connections: item.connections || null
        };

        const { error: dbErr } = await supabase.from('user_vocabulary').upsert(dbPayload, { onConflict: 'user_id,word' });
        if (dbErr) {
          console.error("Supabase Insert Error:", dbErr);
        }
      } catch (dbErr) {
        console.error('Supabase upsert failed unexpectedly:', dbErr);
      }
    }
  };

  const goBackToSubjects = () => {
    setSelectedSubject(null);
  };

  const clearSelection = () => {
    setSelectedArticleId(null);
    setArticle(null);
    setError(null);
    setCollectedWords([]);
    setPendingWords([]);
    setBatchResults([]);
    setSavedFromBatch([]);
    setGamePhase('reading');
  };

  // Auto-trigger batch extraction as soon as the comprehension quiz completes
  useEffect(() => {
    if (gamePhase === 'quiz' && pendingWords.length > 0 && !isBatchProcessing && batchResults.length === 0) {
      const text =
        typeof article?.content_data === 'string'
          ? article.content_data
          : article?.content_data?.text ||
          (article?.content_data?.segments
            ? article.content_data.segments.map(seg => seg.text).join('\n\n')
            : '');
      handleBatchExtraction(text);
    }
  }, [gamePhase]);

  // --- View 0: Initial Loading Metadata ---
  if (isLoadingMetadata) {
    return (
      <div className="p-6 min-h-[70vh] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-blue-600 dark:text-blue-400 font-bold text-xl animate-pulse">Loading catalogue...</p>
        </div>
      </div>
    );
  }

  // --- View 1: Subject Selection (No subject selected yet) ---
  if (!selectedSubject) {
    if (allArticles.length === 0) {
      return (
        <div className="p-6 min-h-[70vh] flex flex-col justify-center">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-8 rounded-2xl text-center shadow-sm">
            <div className="text-4xl mb-4">📭</div>
            <h2 className="text-slate-700 dark:text-white font-extrabold text-2xl mb-2">No Content Available</h2>
            <p className="text-slate-500 dark:text-slate-400 mb-6 text-lg">There are currently no articles in the database.</p>
          </div>
        </div>
      );
    }

    return (
      <div className="p-8 font-sans">
        <div className="w-full">
          <div className="mb-8">
            <h2 className="text-3xl font-black text-text-primary tracking-tight mb-1">Choose a Subject</h2>
            <p className="text-text-muted font-medium">Pick a topic you're curious about to find reading materials.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {AXIOM_SUBJECTS.map((subject) => {
              const articleCount = allArticles.filter(a => a.category === subject.name).length;
              return (
                <button
                  key={subject.name}
                  onClick={() => { playClickSound(); setSelectedSubject(subject.name); }}
                  onMouseEnter={playHover}
                  className="group flex flex-col items-start justify-between min-h-40 h-full p-7 rounded-2xl border transition-all duration-200 ease-in-out cursor-pointer bg-slate-900 border-slate-800 hover:border-slate-700 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/30 active:scale-95 shadow-sm"
                >
                  <div className="w-full text-left flex flex-col h-full">
                    <span className="text-4xl mb-4 block drop-shadow-sm transition-transform duration-300 group-hover:scale-110">{subject.icon}</span>
                    <div className="flex-grow">
                      <span className="font-black text-lg leading-tight block mb-1.5 text-slate-100">{subject.name}</span>
                      <span className={`text-sm font-semibold ${articleCount > 0 ? 'text-cyan-400' : 'text-slate-500'}`}>
                        {articleCount} Article{articleCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (selectedSubject && !selectedArticleId) {
    // Derive available filter tags from real sub_subject values in fetched articles
    const availableFilters = [...new Set(
      currentSubjectArticles
        .map(a => a.sub_subject)
        .filter(s => s && s.trim() !== '')
    )].sort((a, b) => a.localeCompare(b));

    // Filter articles by sub_subject
    const filteredArticles = selectedFilter === 'All'
      ? currentSubjectArticles
      : currentSubjectArticles.filter(art => art.sub_subject === selectedFilter);

    return (
      <div className="p-8 font-sans">
        <button
          onClick={() => { goBackToSubjects(); setSelectedFilter('All'); }}
          className="mb-6 flex items-center text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 font-bold transition-colors bg-slate-100 dark:bg-slate-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-600 hover:border-blue-300 dark:hover:border-blue-800 text-sm group"
        >
          <svg className="w-4 h-4 mr-2 group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          Back to Subjects
        </button>

        <div className="mb-4">
          <h2 className="text-3xl font-black text-text-primary tracking-tight">{selectedSubject}</h2>
          <p className="text-text-muted font-medium mt-1">{currentSubjectArticles.length} article{currentSubjectArticles.length !== 1 ? 's' : ''} available</p>
        </div>

        {/* Filter Bar */}
        {availableFilters.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            <button
              onClick={() => setSelectedFilter('All')}
              className={`px-4 py-1.5 rounded-full text-sm font-bold border transition-all duration-200 active:scale-95 ${selectedFilter === 'All'
                ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-600/30'
                : 'bg-slate-800/80 text-slate-400 border-slate-700/60 hover:bg-slate-700 hover:text-slate-200'
                }`}
            >
              All
            </button>
            {availableFilters.map(tag => (
              <button
                key={tag}
                onClick={() => setSelectedFilter(tag)}
                className={`px-4 py-1.5 rounded-full text-sm font-bold border transition-all duration-200 active:scale-95 ${selectedFilter === tag
                  ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-600/30'
                  : 'bg-slate-800/80 text-slate-400 border-slate-700/60 hover:bg-slate-700 hover:text-slate-200'
                  }`}
              >
                {tag}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-4">
          {filteredArticles.map(art => (
            <button
              key={art.id}
              onClick={() => setSelectedArticleId(art.id)}
              className="group flex flex-col md:flex-row md:items-center justify-between bg-surface p-5 rounded-2xl border border-border hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-lg transition-all duration-200 ease-in-out text-left hover:-translate-y-0.5 active:scale-[0.99]"
            >
              <div>
                <h3 className="text-lg font-black text-text-primary mb-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{art.title}</h3>
                <p className="text-sm text-text-muted font-semibold uppercase tracking-wide">Reading Module</p>
              </div>

              <div className="mt-4 md:mt-0 flex items-center space-x-3">
                <span className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap ${art.difficulty_level === 'Intermediate' ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300' :
                  art.difficulty_level === 'Advanced' ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300' :
                    art.difficulty_level === 'Beginner' ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' :
                      'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                  }`}>
                  {art.difficulty_level || 'General'}
                </span>
                <span className="text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity font-black">→</span>
              </div>
            </button>
          ))}
          {filteredArticles.length === 0 && (
            <div className="py-16 text-center">
              <div className="text-4xl mb-4">🔍</div>
              <p className="text-slate-600 dark:text-slate-400 font-bold text-lg">
                No articles found for <span className="text-blue-500">{selectedFilter}</span> yet.
              </p>
              <button
                onClick={() => setSelectedFilter('All')}
                className="mt-4 px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold text-sm transition-all"
              >
                Show All Articles
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- Loading Article View ---
  if (loading) {
    return (
      <div className="p-6 min-h-[70vh] font-sans flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-blue-600 dark:text-blue-400 font-bold text-xl animate-pulse">Loading mission...</p>
        </div>
      </div>
    );
  }

  if (error || !article) {
    return (
      <div className="p-6 min-h-[70vh] font-sans flex flex-col justify-center">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-8 rounded-2xl text-center shadow-sm">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-red-700 dark:text-red-400 font-extrabold text-2xl mb-2">Mission Unavailable</h2>
          <p className="text-red-600 dark:text-red-300 mb-6 text-lg">{error || "Failed to load article."}</p>
          <button
            onClick={clearSelection}
            className="px-6 py-3 bg-white dark:bg-slate-700 text-red-600 dark:text-red-300 font-bold rounded-xl shadow border border-red-100 dark:border-red-900/40 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  // --- Comprehension Phase View ---
  if (gamePhase === 'comprehension') {
    return (
      <ReadingQuiz
        questions={article?.content_data?.quiz || []}
        article={article}
        onComplete={() => setGamePhase('quiz')} // 'quiz' actually triggers SmartReview
      />
    );
  }

  // --- Smart Review Phase View (with auto-processed vocabulary results beneath) ---
  if (gamePhase === 'quiz') {
    return (
      <div className="font-sans">
        <SmartReview
          collectedWords={collectedWords}
          session={session}
          onComplete={clearSelection}
        />

        {/* Auto-processed vocabulary results */}
        {(isBatchProcessing || batchResults.length > 0) && (
          <div className="max-w-3xl mx-auto px-4 pb-8">
            <div className="mt-6 bg-slate-900 border border-indigo-500/30 rounded-3xl overflow-hidden shadow-2xl shadow-indigo-950/50">
              <div className="p-6 flex items-center gap-3 border-b border-indigo-500/20">
                <span className="text-2xl">⚡</span>
                <div>
                  <h2 className="text-white font-bold text-lg">Vocabulary Results</h2>
                  <p className="text-slate-400 text-sm">{pendingWords.length} word{pendingWords.length !== 1 ? 's' : ''} processed from your reading</p>
                </div>
              </div>

              <div className="p-6">
                {isBatchProcessing ? (
                  <div className="flex items-center gap-3 text-indigo-300 font-semibold">
                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    <span>Processing vocabulary definitions...</span>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-slate-400 text-sm font-semibold uppercase tracking-wider mb-4">AI Definitions — Review & Save</p>
                    {batchResults.map((item) => {
                      const isSaved = savedFromBatch.includes(item.word);
                      return (
                        <div
                          key={item.word}
                          className={`flex items-start justify-between gap-4 p-4 rounded-2xl border transition-all duration-300 ${isSaved
                            ? 'bg-emerald-900/20 border-emerald-700/40'
                            : 'bg-slate-800/60 border-slate-700/50 hover:border-indigo-500/40'
                            }`}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-cyan-300 font-black text-base mb-1">
                              {item.base_form} <span className="text-xs text-slate-500 font-normal uppercase tracking-widest ml-2">from "{item.word}"</span>
                            </p>
                            <p className="text-slate-300 text-sm leading-relaxed">{item.definition}</p>
                          </div>
                          <button
                            onClick={() => handleSaveWordToVault(item)}
                            disabled={isSaved}
                            className={`flex-shrink-0 text-sm font-bold px-4 py-2 rounded-xl transition-all duration-200 ${isSaved
                              ? 'bg-emerald-700/30 text-emerald-400 cursor-default'
                              : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-900/50 active:scale-95'
                              }`}
                          >
                            {isSaved ? '✅ Saved' : '+ Save'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- Reading Phase ---
  const fullArticleText = typeof article?.content_data === 'string'
    ? article.content_data
    : article?.content_data?.text
    || (article?.content_data?.segments ? article.content_data.segments.map(seg => seg.text).join('\n\n') : "No content available.");

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 min-h-[70vh] font-sans">
      {/* HUD */}
      <div className="flex justify-between items-center mb-5 md:mb-8 bg-white dark:bg-slate-800 p-3 md:p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 transition-colors">
        <div className="flex items-center space-x-4">
          <button
            onClick={clearSelection}
            className="text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors flex items-center font-bold text-sm bg-slate-50 dark:bg-slate-700 px-3 py-1.5 rounded-lg border border-slate-100 dark:border-slate-600 hover:border-blue-200 dark:hover:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-900/20"
          >
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Back to Articles
          </button>
        </div>
        <div className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 px-3 md:px-4 py-1.5 md:py-2 rounded-full font-bold shadow-sm transition-all text-sm md:text-lg flex items-center space-x-1.5 md:space-x-2">
          <span>✨</span>
          <span>{xp} XP</span>
        </div>
      </div>

      <div className="mb-4 md:mb-6 flex flex-wrap items-start md:items-center justify-between gap-2">
        <h1 className="text-xl md:text-3xl font-extrabold text-slate-800 dark:text-white tracking-tight">{article.title}</h1>
        <span className="bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider flex-shrink-0">{article.category}</span>
      </div>

      {/* Article Content */}
      <div className="bg-white dark:bg-slate-800 p-4 md:p-8 rounded-2xl md:rounded-3xl shadow-lg mb-6 md:mb-8 border-l-4 border-blue-500 relative transition-colors">
        <div className="text-base md:text-xl text-slate-700 dark:text-slate-200">
          {fullArticleText.split('\n').map((paragraph, pIdx) => {
            if (!paragraph.trim()) return null;

            return (
              <p key={pIdx} className="mb-6 leading-loose block text-left">
                {paragraph.split(/\s+/).map((word, wIdx) => {
                  if (!word) return null;
                  const cleanCheckWord = word.toLowerCase().replace(/[.,!?;:()"'`]/g, "");
                  const isCollected = collectedWords.some(item => item.word === cleanCheckWord);
                  const isPending = pendingWords.includes(cleanCheckWord);

                  return (
                    <span key={`${pIdx}-${wIdx}`}>
                      <button
                        onClick={() => handleWordClick(word)}
                        className={`inline-block py-1 rounded transition-colors ${isCollected
                          ? 'bg-yellow-200 dark:bg-yellow-700/60 text-yellow-900 dark:text-yellow-100 border-b-2 border-yellow-400 dark:border-yellow-600 font-medium px-1'
                          : isPending
                            ? 'bg-yellow-500/40 text-yellow-100 rounded-sm px-1 transition-colors'
                            : 'hover:bg-slate-200 dark:hover:bg-slate-700'
                          }`}
                      >
                        {word}
                      </button>
                      {" "}
                    </span>
                  );
                })}
              </p>
            );
          })}
        </div>
      </div>

      {/* Finish Article Button */}
      <div className="mt-8">
        <button
          onClick={() => setGamePhase('comprehension')}
          className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-extrabold text-lg rounded-2xl shadow-lg hover:-translate-y-1 hover:shadow-blue-500/40 transition-all"
        >
          Finish & Take Quiz 🚀
        </button>
      </div>

      {/* Feedback Animation */}
      <div className="fixed bottom-10 left-1/2 transform -translate-x-1/2 z-50 pointer-events-none">
        {feedback && (
          <div className="bg-slate-800 text-white px-8 py-3 rounded-full shadow-2xl font-bold text-lg animate-fade-in-up border border-slate-700">
            {feedback}
          </div>
        )}
      </div>
    </div>
  );
}