export const calculateNextInterval = (currentProfile, grade) => {
    // Basic SRS Logic for MVP
    let newInterval = Number(currentProfile.interval_days) || 0;
    let newEase = Number(currentProfile.ease_factor) || 2.5;
    let lapseCount = Number(currentProfile.lapse_count) || 0;
    
    if (grade === 'Hard' || grade === 'Fail') {
        newInterval = grade === 'Fail' ? 0 : Math.max(1, Math.floor(newInterval * 0.5));
        newEase = Math.max(1.3, newEase - 0.2);
        lapseCount += 1;
    } else if (grade === 'Good') {
        newInterval = newInterval === 0 ? 1 : newInterval === 1 ? 3 : Math.floor(newInterval * newEase);
    } else if (grade === 'Easy') {
        newInterval = newInterval === 0 ? 4 : Math.floor(newInterval * newEase * 1.3);
        newEase += 0.15;
    }

    const now = new Date();
    const nextReview = new Date(now.getTime() + newInterval * 24 * 60 * 60 * 1000);

    return {
        interval_days: newInterval,
        ease_factor: newEase,
        lapse_count: lapseCount,
        next_review_at: nextReview.toISOString(),
        last_reviewed_at: now.toISOString(),
    };
};

export const evaluateRankPromotion = (profile) => {
    // Simplified promotion logic for MVP
    const scores = [
        profile.recognition_score,
        profile.recall_score,
        profile.spelling_score,
        profile.context_score,
        profile.collocation_score,
        profile.production_score,
        profile.writing_score
    ];
    
    // Convert undefined to 0
    const avg = scores.reduce((a, b) => a + (b || 0), 0) / 7;
    
    if (avg >= 90) return { rank: 'Mastered', is_mastered: true };
    if (avg >= 75) return { rank: 'Commander', is_mastered: false };
    if (avg >= 60) return { rank: 'Scholar', is_mastered: false };
    if (avg >= 45) return { rank: 'Strategist', is_mastered: false };
    if (avg >= 30) return { rank: 'Fighter', is_mastered: false };
    if (avg >= 15) return { rank: 'Scout', is_mastered: false };
    return { rank: 'Seed', is_mastered: false };
};
