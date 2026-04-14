-- 1. Create the Trigger Function
CREATE OR REPLACE FUNCTION public.handle_new_vocabulary() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.word_mastery_profiles (user_id, word_id, next_review_at, interval_days, ease_factor, rank)
  VALUES (NEW.user_id, NEW.id, NOW(), 0, 2.5, 'Seed')
  ON CONFLICT (user_id, word_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Create the Trigger on user_vocabulary
DROP TRIGGER IF EXISTS on_vocabulary_created ON public.user_vocabulary;
CREATE TRIGGER on_vocabulary_created
  AFTER INSERT ON public.user_vocabulary
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_vocabulary();

-- 3. Enable RLS on word_mastery_profiles
ALTER TABLE public.word_mastery_profiles ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS Policies
CREATE POLICY "Users can insert their own mastery profiles" 
  ON public.word_mastery_profiles FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own mastery profiles" 
  ON public.word_mastery_profiles FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own mastery profiles" 
  ON public.word_mastery_profiles FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own mastery profiles" 
  ON public.word_mastery_profiles FOR DELETE 
  USING (auth.uid() = user_id);
