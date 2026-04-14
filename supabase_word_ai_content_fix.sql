-- =========================================================================
-- FIX: word_ai_content — run this in the Supabase SQL Editor
-- =========================================================================

-- Step 1: Drop the table entirely and recreate it with the correct schema.
-- This is safe — the table was empty (no AI content was ever successfully written).
DROP TABLE IF EXISTS public.word_ai_content;

-- Step 2: Recreate with word_id explicitly as BIGINT to match user_vocabulary.id
CREATE TABLE public.word_ai_content (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    word_id         BIGINT NOT NULL REFERENCES public.user_vocabulary(id) ON DELETE CASCADE,

    -- Cache control
    content_version INT  DEFAULT 1,
    generated_at    TIMESTAMPTZ DEFAULT NOW(),
    is_generating   BOOLEAN DEFAULT false,

    -- Step 1: Context Meaning
    context_question    TEXT,
    context_options     JSONB,      -- [{text, isCorrect}]
    context_explanation TEXT,

    -- Step 2: Semantic Precision
    semantic_question   TEXT,
    semantic_options    JSONB,      -- [{text, isCorrect}]
    semantic_explanation TEXT,

    -- Step 3: Natural Usage
    usage_natural       TEXT,
    usage_awkward       TEXT,
    usage_explanation   TEXT,

    -- Step 4: Nuance tip
    nuance_tip          TEXT,

    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, word_id)
);

-- Step 3: RLS — users can read their own rows (writes done server-side via service role)
ALTER TABLE public.word_ai_content ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own AI content"   ON public.word_ai_content;
DROP POLICY IF EXISTS "Users can insert their own AI content" ON public.word_ai_content;
DROP POLICY IF EXISTS "Users can update their own AI content" ON public.word_ai_content;

-- READ: frontend can load cached content for its own words
CREATE POLICY "Users can view their own AI content"
    ON public.word_ai_content FOR SELECT
    USING (auth.uid() = user_id);

-- NOTE: INSERT and UPDATE are intentionally NOT granted to anon/authenticated roles.
-- The Edge Function uses SUPABASE_SERVICE_ROLE_KEY which bypasses RLS entirely.
-- This prevents users from writing arbitrary AI content rows directly.

-- Step 4: Auto-update timestamp trigger
CREATE OR REPLACE FUNCTION public.set_ai_content_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_ai_content_updated ON public.word_ai_content;
CREATE TRIGGER on_ai_content_updated
  BEFORE UPDATE ON public.word_ai_content
  FOR EACH ROW EXECUTE FUNCTION public.set_ai_content_updated_at();
