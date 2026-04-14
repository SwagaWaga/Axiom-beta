-- =========================================================================
-- LINGOFLOW: AI CONTENT CACHE FOR DEEP LEARNING
-- Run this in the Supabase SQL Editor.
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.word_ai_content (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    word_id         BIGINT REFERENCES public.user_vocabulary(id) ON DELETE CASCADE,

    -- Cache control
    content_version INT  DEFAULT 1,
    generated_at    TIMESTAMPTZ DEFAULT NOW(),
    is_generating   BOOLEAN DEFAULT false,   -- concurrency lock

    -- Step 1: Context Meaning (multiple choice)
    context_question    TEXT,
    context_options     JSONB,   -- [{text, isCorrect}]
    context_explanation TEXT,    -- shown after wrong answer, max 1 sentence

    -- Step 2: Semantic Precision (multiple choice)
    semantic_question   TEXT,
    semantic_options    JSONB,   -- [{text, isCorrect}]
    semantic_explanation TEXT,

    -- Step 3: Natural Usage (pair comparison)
    usage_natural   TEXT,
    usage_awkward   TEXT,
    usage_explanation TEXT,      -- why the awkward one feels off, 1 sentence

    -- Step 4: Nuance tip shown at Reflection
    nuance_tip      TEXT,        -- max 1 sentence, e.g. "Often used in formal written registers."

    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, word_id)
);

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.word_ai_content ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own AI content"   ON public.word_ai_content;
DROP POLICY IF EXISTS "Users can insert their own AI content" ON public.word_ai_content;
DROP POLICY IF EXISTS "Users can update their own AI content" ON public.word_ai_content;

CREATE POLICY "Users can view their own AI content"
    ON public.word_ai_content FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own AI content"
    ON public.word_ai_content FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own AI content"
    ON public.word_ai_content FOR UPDATE USING (auth.uid() = user_id);

-- ── Auto-update timestamp ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_ai_content_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_ai_content_updated ON public.word_ai_content;
CREATE TRIGGER on_ai_content_updated
  BEFORE UPDATE ON public.word_ai_content
  FOR EACH ROW EXECUTE FUNCTION public.handle_ai_content_updated_at();
