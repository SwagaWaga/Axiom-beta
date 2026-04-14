/**
 * deepLearningAI.js
 *
 * Frontend service layer for Deep Learning AI content.
 *
 * APPROACH:
 *   The DojoEngine pre-loads word_ai_content from Supabase at session start.
 *   DeepLearningPhase checks match.ai_content first (instant, no network call).
 *   This function is called ONLY when no cached content exists for a word.
 *   It invokes the Edge Function via supabase.functions.invoke() which handles
 *   auth automatically using the active Supabase session.
 *
 * COST CONTROLS:
 *   - Only called on cache miss (match.ai_content === null)
 *   - Never called on every render or answer click
 *   - Never called for words already in the cache
 */

import { supabase } from './supabaseClient';

const POLL_INTERVAL_MS  = 2500;
const MAX_POLL_ATTEMPTS = 6;      // give up after ~15 seconds total

/**
 * Requests AI content for a word from the Edge Function.
 * Uses supabase.functions.invoke() — auth is handled automatically.
 *
 * @param {object} vocab - user_vocabulary row: { id, word, definition, part_of_speech, context_sentence }
 * @returns {{ content: object|null, isFallback: boolean }}
 */
export async function fetchDeepLearningContent(vocab) {
    try {
        const result = await invokeEdgeFunction(vocab);

        if (result.status === 'cached' || result.status === 'generated') {
            return { content: result.content, isFallback: false };
        }

        if (result.status === 'generating') {
            // Another request is in-flight — poll until it resolves
            return pollUntilReady(vocab);
        }

        // 'fallback' or unexpected response
        return { content: null, isFallback: true };

    } catch (err) {
        console.warn('[DeepLearningAI] invoke failed, using fallback:', err);
        return { content: null, isFallback: true };
    }
}

async function invokeEdgeFunction(vocab) {
    const { data, error } = await supabase.functions.invoke('generate-deep-learning-ai', {
        body: {
            word_id:          vocab.id,
            word:             vocab.word,
            definition:       vocab.definition,
            part_of_speech:   vocab.part_of_speech || 'word',
            context_sentence: vocab.context_sentence || '',
        }
    });

    if (error) throw error;
    return data;
}

async function pollUntilReady(vocab) {
    for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
        await sleep(POLL_INTERVAL_MS);
        try {
            const result = await invokeEdgeFunction(vocab);
            if (result.status === 'cached' || result.status === 'generated') {
                return { content: result.content, isFallback: false };
            }
            if (result.status === 'fallback') {
                return { content: null, isFallback: true };
            }
        } catch {
            break;
        }
    }
    return { content: null, isFallback: true };
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
