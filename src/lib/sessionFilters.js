/**
 * filterSessionWords
 *
 * Filters the prioritized word list by session mode.
 *
 * Due vs non-due distinction:
 *   - Due words are already sorted first by splitAndPrioritize in the engine.
 *   - Non-due words trail at the back and are treated as practice candidates.
 *   - We pass ALL recognised words to each mode — the engine's _isPractice flag
 *     (set during routing) tells phase components how to apply score multipliers.
 *
 * Mode behaviours:
 *   Quick Review  → recognition < 60 (due *and* non-due, practice multiplier applied to non-due)
 *   Boss Fight    → recognition >= 60 with enough recall or repeat exposure
 *   Deep Training → all words (due full review, non-due reduced practice)
 */
export function filterSessionWords(words, mode) {
    return words.filter(word => {
        const recSc   = word.recognition_score || 0;
        const recall  = word.recall_score      || 0;
        const reviews = word.total_reviews     || 0;

        if (mode === 'Quick Review')    return recSc < 60;
        if (mode === 'Boss Fight Only') return recSc >= 60 && (recall >= 20 || reviews >= 3);
        if (mode === 'Deep Training')   return true; // all words; engine tags non-due as practice
        return true;
    });
}
