-- 1. BACKFILL MISSING MAPPING ROWS
-- This targets all old words in user_vocabulary that currently do not have a row in word_mastery_profiles.
-- It inserts a fresh 'Seed' rank and sets next_review_at to NOW() so they immediately show up in the Dojo.

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
