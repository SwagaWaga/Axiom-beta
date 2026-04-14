/**
 * 1. WORD MASTERY PROFILES
 * Tracks multi-dimensional SRS data per word.
 */
CREATE TABLE public.word_mastery_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    word_id UUID REFERENCES public.user_vocabulary(id) ON DELETE CASCADE,
    
    -- Memory Layer
    next_review_at TIMESTAMPTZ,
    interval_days NUMERIC DEFAULT 0,
    ease_factor NUMERIC DEFAULT 2.5,
    lapse_count INT DEFAULT 0,
    last_reviewed_at TIMESTAMPTZ,
    
    -- Mastery Dimensions (0-100 scale)
    rank TEXT DEFAULT 'Seed', -- Seed, Scout, Fighter, Strategist, Scholar, Commander, Mastered
    is_mastered BOOLEAN DEFAULT false,
    is_in_rescue BOOLEAN DEFAULT false,
    current_weakness TEXT,
    
    recognition_score INT DEFAULT 0,
    recall_score INT DEFAULT 0,
    spelling_score INT DEFAULT 0,
    context_score INT DEFAULT 0,
    collocation_score INT DEFAULT 0,
    production_score INT DEFAULT 0,
    writing_score INT DEFAULT 0,
    
    -- Insights
    total_reviews INT DEFAULT 0,
    successful_recalls INT DEFAULT 0,
    failed_recalls INT DEFAULT 0,
    last_error_type TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, word_id)
);

/**
 * 2. DOJO SESSIONS
 * Tracks high-level training history and XP.
 */
CREATE TABLE public.dojo_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    session_type TEXT NOT NULL, -- 'Quick Review', 'Deep Training', etc.
    xp_earned INT DEFAULT 0,
    words_reviewed INT DEFAULT 0,
    words_promoted INT DEFAULT 0,
    weak_words_rescued INT DEFAULT 0,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

/**
 * 3. DAILY MISSIONS
 * Tracks user engagement loops.
 */
CREATE TABLE public.daily_missions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    mission_type TEXT, 
    target_amount INT,
    current_amount INT DEFAULT 0,
    is_completed BOOLEAN DEFAULT false,
    UNIQUE(user_id, date, mission_type)
);

/**
 * 4. BACKFILL DATA FOR EXISTING VOCABULARY
 * Automatically creates a mastery profile for any existing user vocabulary
 */
INSERT INTO public.word_mastery_profiles (user_id, word_id, next_review_at, interval_days, ease_factor, rank)
SELECT 
    user_id, 
    id AS word_id, 
    next_review_date AS next_review_at, 
    CASE 
        WHEN mastery_level = 1 THEN 0
        WHEN mastery_level = 2 THEN 3
        WHEN mastery_level = 3 THEN 7
        WHEN mastery_level >= 4 THEN 14
        ELSE 0
    END AS interval_days,
    2.5 AS ease_factor,
    CASE 
        WHEN mastery_level = 1 THEN 'Seed'
        WHEN mastery_level = 2 THEN 'Fighter'
        WHEN mastery_level = 3 THEN 'Scholar'
        WHEN mastery_level >= 4 THEN 'Mastered'
        ELSE 'Seed'
    END AS rank
FROM public.user_vocabulary
ON CONFLICT (user_id, word_id) DO NOTHING;
