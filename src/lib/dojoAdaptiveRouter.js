/**
 * determineAdaptiveRoute
 *
 * Used ONLY for auto-mix sessions (no explicit mode selected).
 * When the user picks Quick Review / Boss Fight / Deep Training explicitly,
 * the engine uses mode-intent routing and does NOT call this function.
 *
 * Thresholds:
 *   recognition < 60  → QUICK_REVIEW   (not yet recognised reliably)
 *   recall < 40       → BOSS_FIGHT     (recognised but not actively recalled)
 *   otherwise         → DEEP_LEARNING  (strong enough for context/usage work)
 */
export function determineAdaptiveRoute(profile) {
    const recSc    = profile.recognition_score || 0;
    const recall   = profile.recall_score      || 0;
    const spelling = profile.spelling_score    || 0;

    console.log('ROUTING:', {
        word: profile.word || (profile.user_vocabulary && profile.user_vocabulary.word) || 'unknown',
        rec: recSc,
        recall: recall,
        spelling: spelling
    });

    if (recSc < 60)  return 'QUICK_REVIEW';
    if (recall < 40) return 'BOSS_FIGHT';

    return 'DEEP_LEARNING';
}
