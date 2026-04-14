import { useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { calculateNextInterval, evaluateRankPromotion } from '../../../lib/srsMath';
import { determineAdaptiveRoute } from '../../../lib/dojoAdaptiveRouter';
import { filterSessionWords } from '../../../lib/sessionFilters';

// Helper to reliably merge vocabulary with its mastery profile (or a safe default)
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
    const [queue, setQueue] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [activePhase, setActivePhase] = useState('WAITING_ROOM');
    const [lockedReason, setLockedReason] = useState(null);
    const [bossFightProgress, setBossFightProgress] = useState({ eligible: 0, required: BOSS_FIGHT_REQUIRED_COUNT });
    const [sessionStats, setSessionStats] = useState({ xp: 0, reviews: 0, promotions: 0, weakRescued: 0 });

    const loadSession = async (mode) => {
        setLockedReason(null);
        
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
                const isDue = !item.next_review_at || isNaN(parsedDate) || parsedDate <= now;
                if (isDue) due.push({ ...item, _parsedDate: isNaN(parsedDate) ? 0 : parsedDate });
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
        const isDue = (w) => {
            const p = Date.parse(w.next_review_at);
            return !w.next_review_at || isNaN(p) || p <= now;
        };

        const dueWords    = prioritizedWords.filter(isDue);
        const notDueWords = prioritizedWords.filter(w => !isDue(w));

        const modeFilter = (words) => filterSessionWords(words, mode);

        const reviewPool   = modeFilter(dueWords);
        const practicePool = mode === 'Boss Fight Only' ? [] : modeFilter(notDueWords);

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
        const modeEligibleWords = [...reviewPool, ...practicePool];
        console.log(`[Dojo] Mode: ${mode} | Review: ${reviewPool.length} | Practice: ${practicePool.length}`);

        // 6. Route each word to a phase.
        //    When the user explicitly picks a mode, we RESPECT that intent directly
        //    instead of blindly calling the adaptive router (which would ignore the mode).
        const resolvePhase = (word) => {
            if (mode === 'Quick Review')    return 'QUICK_REVIEW';
            if (mode === 'Boss Fight Only') return 'BOSS_FIGHT';
            
            const adaptivePhase = determineAdaptiveRoute(word);
            if (mode === 'Deep Training') {
                console.log('PHASE:', adaptivePhase);
                return adaptivePhase;
            }
            // Fallback for future auto-mix sessions: use the adaptive router
            return adaptivePhase;
        };

        const routedWords = modeEligibleWords.map(word => ({
            ...word,
            next_phase: resolvePhase(word),
            // _isPractice signals phase components to apply reduced score gains and skip SRS updates
            _isPractice: !isDue(word)
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
            // Inject SPELLING_CHALLENGE for each Quick Review word
            quickReviewWords.forEach(w => {
                finalQueue.push({ ...w, next_phase: 'SPELLING_CHALLENGE' });
            });
        }
        
        // Push advanced words in SRS priority order (most urgent due words first)
        advancedWords.forEach(w => {
            finalQueue.push(w); // Main phase
            finalQueue.push({ ...w, next_phase: 'SPELLING_CHALLENGE' }); // Secondary phase
        });
        
        console.log('[Dojo] Queue built. Items in queue:', finalQueue.length);

        setQueue(finalQueue);
        setCurrentIndex(0);
        setSessionStats({ xp: 0, reviews: 0, promotions: 0, weakRescued: 0 });
        setActivePhase(finalQueue[0]?.next_phase || 'VICTORY');
    };

    const advanceQueue = (nextIndex = currentIndex + 1, currentQ = queue) => {
        if (nextIndex < currentQ.length) {
            setCurrentIndex(nextIndex);
            setActivePhase(currentQ[nextIndex].next_phase);
        } else {
            setActivePhase('VICTORY');
            supabase.from('dojo_sessions').insert([{
                user_id: session.user.id,
                session_type: 'Regular Session',
                xp_earned: sessionStats.xp,
                words_reviewed: sessionStats.reviews,
                started_at: new Date().toISOString()
            }]);
        }
    };

    const processBatchGrades = async (batchResults) => {
        let totalXp = 0;
        let totalPromo = 0;
        const upsertPayloads = [];

        batchResults.forEach(res => {
            const skipSRS = res.originalWord._isPractice === true;
            const gradeLetter = res.grade === 'Hard' ? 'Hard' : res.grade === 'Normal' ? 'Good' : 'Easy';
            
            const newSRS = skipSRS
                ? {
                    interval_days: res.originalWord.interval_days,
                    ease_factor: res.originalWord.ease_factor,
                    next_review_at: res.originalWord.next_review_at,
                    last_reviewed_at: new Date().toISOString()
                }
                : calculateNextInterval(res.originalWord, gradeLetter);

            const mergedProfile = { ...res.originalWord, ...res.dimensionUpdates };
            const newRankData = evaluateRankPromotion(mergedProfile);
            
            if (newRankData.rank !== res.originalWord.rank) totalPromo++;
            if (res.grade === 'Hard') totalXp += skipSRS ? 2 : 5;
            else if (res.grade === 'Normal') totalXp += skipSRS ? 4 : 10;
            else if (res.grade === 'Easy') totalXp += skipSRS ? 6 : 15;

            upsertPayloads.push({
                user_id: session.user.id,
                word_id: res.originalWord.user_vocabulary.id,
                ...newSRS,
                ...res.dimensionUpdates,
                ...newRankData
            });
        });

        setSessionStats(prev => ({
            ...prev,
            xp: prev.xp + totalXp,
            reviews: prev.reviews + batchResults.length,
            promotions: prev.promotions + totalPromo
        }));

        const { error } = await supabase.from('word_mastery_profiles').upsert(upsertPayloads, { onConflict: 'user_id,word_id' });
        if (error) console.error('[DojoEngine] Batch upsert error:', error);
        
        advanceQueue();
    };

    const processSingleGrade = async (grade, dimensionUpdates = {}, penaltyLoop = false) => {
        const currentProfile = queue[currentIndex];

        // Practice mode: component passes skipSRS=true for non-due Deep Learning words.
        // We preserve the existing SRS schedule to avoid resetting a healthy interval.
        const skipSRS = dimensionUpdates.skipSRS === true;
        const cleanDimensions = { ...dimensionUpdates };
        delete cleanDimensions.skipSRS;

        const newSRS = skipSRS
            ? {
                // Keep existing interval and next_review_at — only update last_reviewed_at
                interval_days: currentProfile.interval_days,
                ease_factor: currentProfile.ease_factor,
                next_review_at: currentProfile.next_review_at,
                last_reviewed_at: new Date().toISOString()
            }
            : calculateNextInterval(currentProfile, grade);
        
        const mergedProfile = { ...currentProfile, ...cleanDimensions };
        const newRankData = evaluateRankPromotion(mergedProfile);
        
        let xpGained = 0;
        let isPromotion = false;
        if (newRankData.rank !== currentProfile.rank) { xpGained = skipSRS ? 25 : 50; isPromotion = true; }
        else if (grade === 'Hard') xpGained = skipSRS ? 2 : 5;
        else if (grade === 'Good') xpGained = skipSRS ? 4 : 10;
        else if (grade === 'Easy') xpGained = skipSRS ? 6 : 15;

        setSessionStats(prev => ({
            ...prev,
            xp: prev.xp + xpGained,
            reviews: prev.reviews + 1,
            promotions: prev.promotions + (isPromotion ? 1 : 0)
        }));

        const { error } = await supabase.from('word_mastery_profiles').upsert({
            user_id: session.user.id,
            word_id: currentProfile.user_vocabulary.id,
            ...newSRS,
            ...cleanDimensions,
            ...newRankData
        }, { onConflict: 'user_id,word_id' });
        if (error) console.error('[DojoEngine] Single grade upsert error:', error);

        let nextQ = queue;
        if (penaltyLoop) {
            currentProfile.is_in_rescue = true;
            currentProfile._penaltyAttempts = (currentProfile._penaltyAttempts || 0) + 1;
            
            if (currentProfile._penaltyAttempts <= 2) {
                nextQ = [...queue];
                const insertPos = Math.min(currentIndex + 3, nextQ.length);
                nextQ.splice(insertPos, 0, { ...currentProfile });
                setQueue(nextQ);
            }
        }

        advanceQueue(currentIndex + 1, nextQ);
    };

    return { queue, currentIndex, activePhase, setActivePhase, sessionStats, lockedReason, bossFightProgress, loadSession, processBatchGrades, processSingleGrade };
}
