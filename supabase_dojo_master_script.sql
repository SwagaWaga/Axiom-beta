/**
 * MASTER SCRIPT: LINGOFLOW DOJO V2
 * This script completely sets up the new Mastery Dojo architecture.
 * It creates the required tables, triggers, RLS policies, and backfills existing vocabulary.
 */

-- =========================================================================
-- 1. CREATE TABLES
-- =========================================================================

/**
 * WORD MASTERY PROFILES
 * Tracks multi-dimensional SRS data per word.
 * Fix: word_id is now BIGINT to correctly link with user_vocabulary.
 */
CREATE TABLE IF NOT EXISTS public.word_mastery_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    word_id BIGINT REFERENCES public.user_vocabulary(id) ON DELETE CASCADE,
    
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
 * DOJO SESSIONS
 * Tracks high-level training history and XP.
 */
CREATE TABLE IF NOT EXISTS public.dojo_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    session_type TEXT NOT NULL, 
    xp_earned INT DEFAULT 0,
    words_reviewed INT DEFAULT 0,
    words_promoted INT DEFAULT 0,
    weak_words_rescued INT DEFAULT 0,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

/**
 * DAILY MISSIONS
 * Tracks user engagement loops.
 */
CREATE TABLE IF NOT EXISTS public.daily_missions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    mission_type TEXT, 
    target_amount INT,
    current_amount INT DEFAULT 0,
    is_completed BOOLEAN DEFAULT false,
    UNIQUE(user_id, date, mission_type)
);

-- =========================================================================
-- 2. CREATE AUTO-INSERT TRIGGER
-- =========================================================================

CREATE OR REPLACE FUNCTION public.handle_new_vocabulary() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.word_mastery_profiles (user_id, word_id, next_review_at, interval_days, ease_factor, rank)
  VALUES (NEW.user_id, NEW.id, NOW(), 0, 2.5, 'Seed')
  ON CONFLICT (user_id, word_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_vocabulary_created ON public.user_vocabulary;
CREATE TRIGGER on_vocabulary_created
  AFTER INSERT ON public.user_vocabulary
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_vocabulary();

-- =========================================================================
-- 3. ENABLE ROW LEVEL SECURITY (RLS)
-- =========================================================================

ALTER TABLE public.word_mastery_profiles ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN 
  -- Safely create policies
  DROP POLICY IF EXISTS "Users can insert their own mastery profiles" ON public.word_mastery_profiles;
  CREATE POLICY "Users can insert their own mastery profiles" 
    ON public.word_mastery_profiles FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

  DROP POLICY IF EXISTS "Users can view their own mastery profiles" ON public.word_mastery_profiles;
  CREATE POLICY "Users can view their own mastery profiles" 
    ON public.word_mastery_profiles FOR SELECT 
    USING (auth.uid() = user_id);

  DROP POLICY IF EXISTS "Users can update their own mastery profiles" ON public.word_mastery_profiles;
  CREATE POLICY "Users can update their own mastery profiles" 
    ON public.word_mastery_profiles FOR UPDATE 
    USING (auth.uid() = user_id);

  DROP POLICY IF EXISTS "Users can delete their own mastery profiles" ON public.word_mastery_profiles;
  CREATE POLICY "Users can delete their own mastery profiles" 
    ON public.word_mastery_profiles FOR DELETE 
    USING (auth.uid() = user_id);
END $$;

-- =========================================================================
-- 4. BACKFILL MISSING MAPPING ROWS
-- =========================================================================

INSERT INTO public.word_mastery_profiles (user_id, word_id, next_review_at, interval_days, ease_factor, rank)
SELECT 
    v.user_id, 
    v.id AS word_id,
    NOW() AS next_review_at,
    0 AS interval_days,
    2.5 AS ease_factor,
    'Seed' AS rank
FROM public.user_vocabulary v
LEFT JOIN public.word_mastery_profiles p ON v.id = p.word_id
WHERE p.word_id IS NULL;
