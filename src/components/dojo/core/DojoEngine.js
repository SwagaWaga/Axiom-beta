import { useState, useRef } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { calculateNextInterval, evaluateRankPromotion, isWordDue } from '../../../lib/srsMath';
import { determineAdaptiveRoute } from '../../../lib/dojoAdaptiveRouter';
import { filterSessionWords } from '../../../lib/sessionFilters';
// Also attaches cached AI content if available, slotted in by word_id.
const mergeVocabularyWithProfiles = (vocabList, profilesList, aiContentMap = new Map()) => {
    // Create a fast lookup map using BIGINT word_id mapping back to vocabulary.id
    const profileMap = new Map();
    profilesList.forEach(profile => {
        // Ensure type safety matching
        profileMap.set(String(profile.word_id), profile);
    });

    return vocabList.map(vocab => {
        const matchingProfile = profileMap.get(String(vocab.id));

        // Safe fallback for orphaned words that missed the database trigger
        const safeProfile = matchingProfile || {
            recognition_score: 0,
            recall_score: 0,
            spelling_score: 0,
            context_score: 0,
            collocation_score: 0,
            production_score: 0,
            writing_score: 0,
            interval_days: 0,
            ease_factor: 2.5,
            lapse_count: 0,
            total_reviews: 0,
            successful_recalls: 0,
            failed_recalls: 0,
            next_review_at: new Date().toISOString(), // Treat orphaned words as immediately due
            rank: 'Seed'
        };

        return {
            ...vocab,
            ...safeProfile,
            user_vocabulary: vocab,          // Retain original nested object for phase components
            ai_content: aiContentMap.get(String(vocab.id)) || null  // Pre-loaded AI cache (null = not yet generated)
        };
    });
};

// Boss Fight unlock thresholds (no magic numbers)
const BOSS_FIGHT_REQUIRED_COUNT = 12;
const BOSS_FIGHT_RECOGNITION_THRESHOLD = 70;

/**
 * Checks whether the merged word list contains enough high-quality
 * due words to unlock Boss Fight mode.
 *
 * @param {Array} allWords - Fully merged vocabulary+profile objects
 * @returns {{ unlocked: boolean, eligibleCount: number, requiredCount: number, reason: string|null }}
 */
const getBossFightStatus = (allWords) => {
    const required = BOSS_FIGHT_REQUIRED_COUNT;

    // Gate 1: not enough total vocabulary saved
    if (!allWords || allWords.length < required) {
        return { unlocked: false, eligibleCount: 0, requiredCount: required, reason: 'NOT_ENOUGH_WORDS' };
    }

    // Gate 2: unlock readiness is based purely on recognition_score — NOT due status.
    // Cooldown/timer must not block users from knowing they are ready for Boss Fight.
    const eligible = allWords.filter(word =>
        (word.recognition_score || 0) >= BOSS_FIGHT_RECOGNITION_THRESHOLD
    );

    if (eligible.length < required) {
        return {
            unlocked: false,
            eligibleCount: eligible.length,
            requiredCount: required,
            reason: 'RECOGNITION_TOO_LOW'
        };
    }

    return { unlocked: true, eligibleCount: eligible.length, requiredCount: required, reason: null };
};

export function useDojoEngine(session) {
    const pendingUpserts = useRef(new Map());
    const [queue, setQueue] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [activePhase, setActivePhase] = useState('WAITING_ROOM');
    const [lockedReason, setLockedReason] = useState(null);
    const [bossFightProgress, setBossFightProgress] = useState({ eligible: 0, required: BOSS_FIGHT_REQUIRED_COUNT });
    const [sessionStats, setSessionStats] = useState({ xp: 0, reviews: 0, promotions: 0, weakRescued: 0 });

    const endSession = async (finalPhase = 'VICTORY', additionalXp = 0, additionalReview = 0) => {
        setActivePhase(finalPhase);

        const payloadArray = Array.from(pendingUpserts.current.values());
        const totalXp = sessionStats.xp + additionalXp;
        const totalReviews = sessionStats.reviews + additionalReview;

        const tasks = [];

        if (payloadArray.length > 0) {
            tasks.push(
                supabase.from('word_mastery_profiles')
                    .upsert(payloadArray, { onConflict: 'user_id,word_id' })
                    .then(({ error }) => {
                        if (error) console.error("Supabase Bulk Upsert Error:", error);
                    })
            );
        }

        if (totalReviews > 0) {
            tasks.push(
                supabase.from('dojo_sessions').insert([{
                    user_id: session.user.id,
                    session_type: 'Regular Session',
                    xp_earned: totalXp,
                    words_reviewed: totalReviews,
                    started_at: new Date().toISOString()
                }]).then(({ error }) => {
                    if (error) console.error("Dojo Session Log Error:", error);
                })
            );
        }

        await Promise.all(tasks);
        pendingUpserts.current.clear();
        if (finalPhase !== 'SUMMARY' && finalPhase !== 'VICTORY') {
            setQueue([]);
        }
    };

    const loadSession = async (modeOrConfig) => {
        setLockedReason(null);
        
        const mode = typeof modeOrConfig === 'string' ? modeOrConfig : modeOrConfig.phase;
        const limit = typeof modeOrConfig === 'string' ? 10 : (modeOrConfig.limit || 10);

        // 1. Fetch raw vocabulary
        const { data: vocabData, error: vocabError } = await supabase
            .from('user_vocabulary')
            .select('*')
            .eq('user_id', session.user.id);

        // Real error isolation (e.g. network failure)
        if (vocabError) {
            console.error("[Dojo] Failed to fetch vocabulary:", vocabError);
            setLockedReason('DATABASE_ERROR');
            return setActivePhase('LOCKED');
        }

        console.log('[Dojo] Loaded vocab:', vocabData ? vocabData.length : 0);

        // UX gate: Truly empty vault
        if (!vocabData || vocabData.length < 5) {
            setLockedReason('NOT_ENOUGH_WORDS');
            return setActivePhase('LOCKED');
        }

        try {
            // 2. Fetch mastery profiles AND cached AI content in parallel (avoids serial latency)
            const [
                { data: profilesData, error: profilesError },
                { data: aiContentData }
            ] = await Promise.all([
                supabase.from('word_mastery_profiles').select('*').eq('user_id', session.user.id),
                supabase.from('word_ai_content').select('*').eq('user_id', session.user.id)
            ]);

            if (profilesError) {
                console.error("[Dojo] Failed to fetch profiles:", profilesError);
                setLockedReason('DATABASE_ERROR');
                return setActivePhase('LOCKED');
            }

            console.log('[Dojo] Loaded profiles:', profilesData ? profilesData.length : 0);
            console.log('[Dojo] Loaded AI cache:', aiContentData ? aiContentData.length : 0);

            // 3. Build an O(1) lookup map for AI content keyed by word_id string
            const aiContentMap = new Map();
            (aiContentData || []).forEach(row => {
                // Only include rows that have actual generated content (not just a lock placeholder)
                if (row.context_options) aiContentMap.set(String(row.word_id), row);
            });

            // 4. Merge vocabulary + mastery profiles + AI content
            const flattenedData = mergeVocabularyWithProfiles(vocabData, profilesData || [], aiContentMap);

            console.log('[Dojo] Merge complete. Total words:', flattenedData.length);

            const now = Date.now();

            // 4. Split into due and non-due, then sort each group by priority
            const splitAndPrioritize = (words, now) => {
                const due = [];
                const notDue = [];

                words.forEach(item => {
                    const parsedDate = Date.parse(item.next_review_at);
                    const dueCheck = isWordDue(item.next_review_at, now, true); // true = emit logs if near miss

                    if (dueCheck) due.push({ ...item, _parsedDate: isNaN(parsedDate) ? 0 : parsedDate });
                    else notDue.push({ ...item, _parsedDate: parsedDate });
                });

                // Due words: most overdue first, then weakest recognition as tiebreaker
                due.sort((a, b) => {
                    const overdueA = now - a._parsedDate;
                    const overdueB = now - b._parsedDate;
                    if (overdueB !== overdueA) return overdueB - overdueA;
                    return (a.recognition_score || 0) - (b.recognition_score || 0);
                });

                // Non-due words: weakest recognition first (optional practice pool)
                notDue.sort((a, b) => (a.recognition_score || 0) - (b.recognition_score || 0));

                return [...due, ...notDue];
            };

            const prioritizedWords = splitAndPrioritize(flattenedData, now);

            // 5. Determine review and practice pools for the selected mode.
            //    - reviewPool: due words that match the mode
            //    - practicePool: non-due words that match the mode (reduced gains, no SRS shift)
            //    Boss Fight is REVIEW-ONLY: active typing recall on non-due words has no pedagogical value.
            const isDueFn = (w) => isWordDue(w.next_review_at, now, false);

            const dueWords = prioritizedWords.filter(isDueFn);
            const notDueWords = prioritizedWords.filter(w => !isDueFn(w));

            const modeFilter = (words) => filterSessionWords(words, mode);

            let reviewPool = modeFilter(dueWords);
            let practicePool = mode === 'Boss Fight Only' ? [] : modeFilter(notDueWords);

            // Restore Practice Mode Fallback in Quick Review:
            // If there are exactly 0 genuinely due words for Quick Review, don't block the user.
            // Guarantee they can train in Practice Mode by pulling from the full On Cooldown pool.
            if (mode === 'Quick Review' && reviewPool.length === 0) {
                practicePool = notDueWords;
            }

            // 5a. Boss Fight unlock gate (score-based, not schedule-based)
            if (mode === 'Boss Fight Only') {
                const bossStatus = getBossFightStatus(prioritizedWords);
                console.log('[Dojo] Boss Fight status:', bossStatus);
                if (!bossStatus.unlocked) {
                    setLockedReason(bossStatus.reason);
                    setBossFightProgress({ eligible: bossStatus.eligibleCount, required: bossStatus.requiredCount });
                    return setActivePhase('LOCKED');
                }
                // Boss Fight needs at least some due words to run a real session
                if (reviewPool.length === 0) {
                    setLockedReason('NO_DUE_WORDS');
                    return setActivePhase('LOCKED');
                }
            }

            // 5b. Lock only when both pools are empty for this mode
            if (reviewPool.length === 0 && practicePool.length === 0) {
                if (mode === 'Deep Training') setLockedReason('RECALL_TOO_LOW');
                else setLockedReason('NO_ELIGIBLE_WORDS');
                return setActivePhase('LOCKED');
            }

            // 5c. Build the final eligible word list: review words first, practice words after
            let modeEligibleWords = [];
            if (mode === 'Boss Fight Only') {
                modeEligibleWords = reviewPool.slice(0, BOSS_FIGHT_REQUIRED_COUNT);
            } else {
                const slicedReviewPool = reviewPool.slice(0, limit);
                const practiceSlotsNeeded = limit - slicedReviewPool.length;
                let slicedPracticePool = [];
                if (practiceSlotsNeeded > 0) {
                    slicedPracticePool = practicePool.slice(0, practiceSlotsNeeded);
                }
                modeEligibleWords = [...slicedReviewPool, ...slicedPracticePool];
            }
            
            console.log(`[Dojo] Mode: ${mode} | Eligible Combined: ${modeEligibleWords.length}`);

            // 6. Route each word to a phase.
            //    When the user explicitly picks a mode, we RESPECT that intent directly
            //    instead of blindly calling the adaptive router (which would ignore the mode).
            const resolvePhase = (word) => {
                if (mode === 'Quick Review') return 'QUICK_REVIEW';
                if (mode === 'Boss Fight Only') return 'BOSS_FIGHT';
                if (mode === 'Deep Training') return 'DEEP_LEARNING';

                // Fallback for future auto-mix sessions: use the adaptive router
                return determineAdaptiveRoute(word);
            };

            const routedWords = modeEligibleWords.map(word => ({
                ...word,
                next_phase: resolvePhase(word),
                // _isPractice signals phase components to apply reduced score gains and skip SRS updates
                _isPractice: !isDueFn(word)
            }));

            console.log('ROUTED:', routedWords.map(w => w.next_phase));

            // 7. Group QUICK_REVIEW into Batch
            const quickReviewWords = routedWords.filter(w => w.next_phase === 'QUICK_REVIEW');
            const advancedWords = routedWords.filter(w => w.next_phase !== 'QUICK_REVIEW');

            const finalQueue = [];

            // Quick Review uses a batch item; all others are individual queue items.
            // Deep Learning / Boss Fight retain their SRS-priority ordering.
            if (quickReviewWords.length > 0) {
                finalQueue.push({
                    type: 'BATCH_QUICK_REVIEW',
                    words: quickReviewWords,
                    next_phase: 'QUICK_REVIEW'
                });
            }

            // Push advanced words in SRS priority order (most urgent due words first)
            advancedWords.forEach(w => {
                finalQueue.push(w); // Main phase (e.g., DEEP_LEARNING, BOSS_FIGHT)
                // Spelling Challenge is now strictly reserved for Quick Review, 
                // so we do not inject it here.
            });

            console.log('[Dojo] Queue built. Items in queue:', finalQueue.length);

            setQueue(finalQueue);
            setCurrentIndex(0);
            setSessionStats({ xp: 0, reviews: 0, promotions: 0, weakRescued: 0 });
            setActivePhase(finalQueue[0]?.next_phase || 'VICTORY');

        } catch (error) {
            console.error('[DojoEngine] Fatal error during phase routing:', error);
            setLockedReason('ROUTING_ERROR');
            setActivePhase('LOCKED');
        }
    };

    const advanceQueue = (nextIndex = currentIndex + 1, currentQ = queue) => {
        if (nextIndex < currentQ.length) {
            setCurrentIndex(nextIndex);
            setActivePhase(currentQ[nextIndex].next_phase);
        } else {
            endSession('VICTORY');
        }
    };

    // Unified SRS Math and Save Logic
    const submitWordReview = async (wordProfile, grade, isPractice, dimensionUpdates = {}, penaltyLoop = false) => {
        // Broadly extract primary key, guarding against missing nested objects
        const wordId = wordProfile?.user_vocabulary?.id || wordProfile?.word_id || wordProfile?.id;

        // 1. Calculate SRS updates
        const skipSRS = isPractice || dimensionUpdates.skipSRS === true;
        const cleanDimensions = { ...dimensionUpdates };
        delete cleanDimensions.skipSRS;

        const newSRS = skipSRS
            ? {
                interval_days: wordProfile.interval_days,
                ease_factor: wordProfile.ease_factor,
                next_review_at: wordProfile.next_review_at,
                last_reviewed_at: new Date().toISOString()
            }
            : calculateNextInterval(wordProfile, grade);

        const mergedProfile = { ...wordProfile, ...cleanDimensions };
        const newRankData = evaluateRankPromotion(mergedProfile);

        // 2. XP & Stats
        let xpGained = 0;
        let isPromotion = false;
        if (newRankData.rank !== wordProfile.rank) { xpGained = skipSRS ? 25 : 50; isPromotion = true; }
        else if (grade === 'Hard') xpGained = skipSRS ? 2 : 5;
        else if (grade === 'Good' || grade === 'Normal') xpGained = skipSRS ? 4 : 10;
        else if (grade === 'Easy') xpGained = skipSRS ? 6 : 15;

        setSessionStats(prev => ({
            ...prev,
            xp: prev.xp + xpGained,
            reviews: prev.reviews + 1,
            promotions: prev.promotions + (isPromotion ? 1 : 0)
        }));

        const payload = {
            user_id: session.user.id,
            word_id: wordId,
            ...newSRS,
            ...cleanDimensions,
            ...newRankData
        };

        if (!wordId) {
            const err = new Error("Missing word_id in submitWordReview payload");
            console.error(err);
            throw err;
        }

        // Format next_review_at strictly to ISO string safely
        try {
            if (payload.next_review_at) {
                payload.next_review_at = new Date(payload.next_review_at).toISOString();
            } else {
                payload.next_review_at = new Date().toISOString();
            }
        } catch (dbDateErr) {
            console.error("Failed to parse next_review_at to ISO:", dbDateErr);
            payload.next_review_at = new Date().toISOString();
        }

        // 3. Bulk Queue (defer network hit until session completion)
        pendingUpserts.current.set(String(wordId), payload);

        // 4. Instant State Invalidation & Queue management
        let isSessionComplete = false;

        setQueue(prevQueue => {
            let nextQ = prevQueue.map(item => {
                if (item.type === 'BATCH_QUICK_REVIEW') {
                    // Force strictly cast structural comparison to guarantee payload drops
                    const remainingWords = item.words.filter(w => String(w.user_vocabulary.id) !== String(wordId));
                    return remainingWords.length > 0 ? { ...item, words: remainingWords } : null;
                }
                if (item.user_vocabulary?.id === wordId) {
                    return null; // drop from queue
                }
                return item;
            }).filter(Boolean);

            if (penaltyLoop) {
                // Re-insert word slightly later
                const updatedWord = {
                    ...wordProfile,
                    is_in_rescue: true,
                    _penaltyAttempts: (wordProfile._penaltyAttempts || 0) + 1
                };
                if (updatedWord._penaltyAttempts <= 2) {
                    const spliceIndex = Math.min(currentIndex + 3, nextQ.length);
                    nextQ.splice(spliceIndex, 0, updatedWord);
                }
            }

            // Immediately manage activePhase within the same state tick
            if (nextQ.length === 0) {
                isSessionComplete = true;
            } else if (currentIndex < nextQ.length) {
                setActivePhase(nextQ[currentIndex].next_phase);
            } else {
                // Should not happen unless currentIndex goes out of bounds
                setCurrentIndex(Math.max(0, nextQ.length - 1));
                setActivePhase(nextQ[Math.max(0, nextQ.length - 1)].next_phase);
            }

            return nextQ;
        });

        if (isSessionComplete) {
            await endSession('SUMMARY', xpGained, 1);
        }
    };

    return { queue, currentIndex, activePhase, setActivePhase, sessionStats, lockedReason, bossFightProgress, loadSession, submitWordReview, advanceQueue, endSession };
}
