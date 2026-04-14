// @ts-nocheck
// generate-deep-learning-ai — bulletproof rewrite
// Breadcrumb logs at every step for Supabase Function log tracing.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// CORS headers — included on EVERY response, including errors and OPTIONS
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, accept',
};

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const err = (message: string, status = 400) =>
  new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildPrompt(word: string, pos: string, def: string, ctx: string): string {
  // Trim inputs to keep tokens low
  const shortDef = def.slice(0, 120);
  const shortCtx = ctx ? ctx.slice(0, 160) : 'No context available.';

  return `You are an expert IELTS vocabulary examiner. Your task is to produce CHALLENGING, DISCRIMINATING exercises that force the learner to think carefully.
Word: "${word}" (${pos})
Definition hint: ${shortDef}
Original sentence: "${shortCtx}"

STRICT RULES — violating ANY of these will cause your output to be rejected:
- Do NOT copy or paraphrase the definition hint above.
- Do NOT reuse or closely mirror the original sentence above. The "context.sentence" must be genuinely new.
- Do NOT include the target word "${word}" inside any option.
- All options must be multi-word, concrete phrases (3–12 words each). NEVER use single words or two-word phrases.
- FORBIDDEN abstract nouns in options: concept, idea, nuance, notion, aspect, framework, element, factor, thing, matter, principle, phenomenon, characteristic, quality, property, feature, component, attribute, entity, process, approach, method, mechanism, dynamic, paradigm, dimension. Use CONCRETE, ACTION-ORIENTED language instead.
- The three options inside each block (context.options and semantic.options) must be CLEARLY DISTINCT from each other — no two options may share more than 3 key words.
- Do NOT make the correct answer obvious: the correct option must NOT simply restate the question or echo the sentence wording.
- Distractors must be GENUINELY PLAUSIBLE — wrong in dimension, application, scale, register, or intent — NOT obviously wrong.
- Only ONE correct answer per question.
- Step 2 (semantic) options must test PRECISION of meaning, not basic synonym recognition. Each option must describe a different real-world application or functional nuance.
- Step 3 awkward sentence must be grammatically correct but subtly wrong (wrong collocation, register, or usage pattern — NOT an obviously broken sentence).
- Explanations: exactly 1 short sentence.

Return ONLY valid raw JSON — no markdown fences, no extra text:
{
  "context": {
    "sentence": "A new realistic sentence using ${word} in a formal or neutral context (NOT the original sentence above, genuinely fresh).",
    "question": "Which meaning fits '${word}' in this sentence?",
    "options": ["<correct meaning as a concrete 3-8 word phrase>", "<plausible but wrong: different function, concrete phrase>", "<plausible but wrong: different scale or intent, concrete phrase>"],
    "correctIndex": 0,
    "explanation": "<1 sentence explaining why the correct option fits>"
  },
  "semantic": {
    "question": "Which meaning is closest to the precise formal usage of '${word}'?",
    "options": [
      "<precise correct meaning as a concrete 3-8 word phrase>",
      "<related but wrong: different dimension, concrete phrase — must not resemble option 1>",
      "<related but wrong: different application, concrete phrase — must not resemble option 1 or 2>"
    ],
    "correctIndex": 0,
    "explanation": "<1 sentence explaining the key distinction>"
  },
  "usage": {
    "natural": "<A natural, correct sentence using ${word} in a formal or neutral context.>",
    "awkward": "<A grammatically correct sentence that uses ${word} in a subtly unnatural way — wrong collocation, register mismatch, or usage pattern error — NOT an obviously broken sentence.>",
    "explanation": "<1 sentence explaining why the awkward sentence is incorrect>"
  },
  "nuance_tip": "<One short advanced usage tip about register, tone, or collocation — written concretely, no filler words.>"
}`;
}

// ── Validation ────────────────────────────────────────────────────────────────

/** Returns word-level tokens from a string (lowercase, alpha only). */
function tokenize(s: string): Set<string> {
  return new Set(s.toLowerCase().match(/[a-z]+/g) || []);
}

/** Rough Jaccard-like overlap ratio between two strings. */
function overlapRatio(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  ta.forEach(t => { if (tb.has(t)) shared++; });
  return shared / Math.min(ta.size, tb.size);
}

// Expanded blocklist — forbidden abstract nouns in any option
const ABSTRACT_WORDS = new Set([
  'concept','idea','nuance','notion','aspect','framework','element','factor',
  'thing','matter','principle','phenomenon','characteristic','quality',
  'property','feature','component','attribute','entity','process',
  'approach','method','mechanism','dynamic','paradigm','dimension',
]);

/**
 * Validates AI-generated content.
 * Returns false if ANY of these conditions are met:
 *   1. Required fields missing / wrong type
 *   2. correctIndex out of bounds
 *   3. Any option is fewer than 3 words (single-word / two-word answer)
 *   4. Duplicate options (case-insensitive)
 *   5. Any option contains a forbidden abstract filler word
 *   6. Any TWO options within the same block share >55% token overlap (too similar)
 *   7. The correct option overlaps >50% with the question text (obvious answer)
 *   8. Natural and awkward sentences are identical or nearly identical (>85% overlap)
 *   9. AI-generated context.sentence overlaps >60% with the original context sentence
 */
function isValidContent(c: unknown, originalCtx = '', aiSentence = ''): boolean {
  if (!c || typeof c !== 'object') return false;
  const o = c as Record<string, unknown>;

  const checkBlock = (b: unknown, label: string): boolean => {
    if (!b || typeof b !== 'object') return false;
    const bl = b as Record<string, unknown>;
    if (!Array.isArray(bl.options) || bl.options.length < 2) return false;
    if (typeof bl.correctIndex !== 'number') return false;
    if (bl.correctIndex < 0 || bl.correctIndex >= (bl.options as unknown[]).length) return false;
    if (typeof bl.explanation !== 'string') return false;

    const opts = bl.options as string[];

    // 1. Reject options with fewer than 3 words
    for (const opt of opts) {
      if (typeof opt !== 'string' || opt.trim().split(/\s+/).length < 3) {
        console.warn(`VALIDATION [${label}]: option too short — "${opt}"`);
        return false;
      }
    }

    // 2. Reject duplicate options (case-insensitive)
    const normalised = opts.map((o: string) => o.toLowerCase().trim());
    if (new Set(normalised).size !== normalised.length) {
      console.warn(`VALIDATION [${label}]: duplicate options detected`);
      return false;
    }

    // 3. Reject options containing forbidden abstract filler words
    for (const opt of opts) {
      const words = tokenize(opt);
      for (const abs of ABSTRACT_WORDS) {
        if (words.has(abs)) {
          console.warn(`VALIDATION [${label}]: abstract word "${abs}" found in option "${opt}"`);
          return false;
        }
      }
    }

    // 4. Pairwise option similarity — reject if any two options share >55% token overlap
    for (let i = 0; i < opts.length; i++) {
      for (let j = i + 1; j < opts.length; j++) {
        const sim = overlapRatio(opts[i], opts[j]);
        if (sim > 0.55) {
          console.warn(`VALIDATION [${label}]: options[${i}] and options[${j}] too similar (${(sim * 100).toFixed(0)}%) — "${opts[i]}" vs "${opts[j]}"`);
          return false;
        }
      }
    }

    // 5. Obvious-answer detection — correct option must not mirror the question stem
    const questionText = (bl.question as string) || '';
    const correctOpt   = opts[bl.correctIndex as number];
    if (questionText && correctOpt && overlapRatio(correctOpt, questionText) > 0.50) {
      console.warn(`VALIDATION [${label}]: correct answer overlaps too much with question (obvious answer)`);
      return false;
    }

    return true;
  };

  // ── Usage block ──────────────────────────────────────────────────────────────
  const u = o.usage as Record<string, unknown>;
  if (!u || typeof u.natural !== 'string' || typeof u.awkward !== 'string') return false;

  // 6. Natural and awkward must differ meaningfully
  if (u.natural === u.awkward) return false;
  if (overlapRatio(u.natural as string, u.awkward as string) > 0.85) {
    console.warn('VALIDATION [usage]: natural and awkward sentences too similar');
    return false;
  }

  // 7. AI-generated context sentence must not copy original too closely (>60% overlap)
  if (aiSentence && originalCtx) {
    const ctxSim = overlapRatio(aiSentence, originalCtx);
    if (ctxSim > 0.60) {
      console.warn(`VALIDATION [context.sentence]: too similar to original (${(ctxSim * 100).toFixed(0)}%)`);
      return false;
    }
  }

  return checkBlock(o.context, 'context') && checkBlock(o.semantic, 'semantic') && typeof o.nuance_tip === 'string';
}

// ── Normalise AI → flat DB schema ─────────────────────────────────────────────
// The AI sentence is embedded in context_question as:
//   "<AI sentence> — <question text>"
// The frontend splits on " — " to extract both parts.
// Old cached rows without " — " fall back to showing the original article sentence.

function toDbSchema(ai: Record<string, unknown>) {
  const ctx = ai.context  as Record<string, unknown>;
  const sem = ai.semantic as Record<string, unknown>;
  const use = ai.usage    as Record<string, unknown>;
  const toOpts = (opts: string[], ci: number) =>
    opts.map((text, i) => ({ text, isCorrect: i === ci })).sort(() => 0.5 - Math.random());

  // Embed AI-generated sentence into context_question for zero-schema-change storage
  const aiSentence  = (ctx.sentence as string || '').trim();
  const questionText = (ctx.question as string || 'Which meaning fits the word in this sentence?').trim();
  const embeddedQuestion = aiSentence
    ? `${aiSentence} — ${questionText}`
    : questionText;

  return {
    context_question:     embeddedQuestion,
    context_options:      toOpts(ctx.options as string[], ctx.correctIndex as number),
    context_explanation:  ctx.explanation as string,
    semantic_question:    sem.question    as string,
    semantic_options:     toOpts(sem.options as string[], sem.correctIndex as number),
    semantic_explanation: sem.explanation as string,
    usage_natural:        use.natural     as string,
    usage_awkward:        use.awkward     as string,
    usage_explanation:    use.explanation as string,
    nuance_tip:           ai.nuance_tip   as string,
  };
}

// ── Groq call ───────────────────────────────────────────────────────────────

async function callGroq(prompt: string): Promise<unknown | null> {
  const apiKey = Deno.env.get('GROQ_API_KEY_DOJO');
  if (!apiKey) throw new Error("Missing GROQ_API_KEY_DOJO");

  try {
    const res = await fetch(
      `https://api.groq.com/openai/v1/chat/completions`,
      {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: "You are a linguistic AI. You must respond ONLY with valid, raw JSON. Do not wrap it in markdown blocks." },
            { role: "user", content: prompt }
          ],
          response_format: { type: "json_object" },
          temperature: 0.7
        })
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error("Groq API Error:", errText);
      return null;
    }

    const data = await res.json();
    let rawText = data.choices[0].message.content;
    rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsedJson = JSON.parse(rawText);
    
    console.log('BREADCRUMB 3e: Groq JSON parsed OK');
    return parsedJson;
  } catch (e) {
    console.error(`BREADCRUMB 3f: Groq threw:`, String(e));
    return null;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  console.log('BREADCRUMB 1: Request received, method=', req.method);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ── Environment check ────────────────────────────────────────────────────
    const supabaseUrl  = Deno.env.get('SUPABASE_URL');
    const serviceKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey      = Deno.env.get('SUPABASE_ANON_KEY');

    console.log('BREADCRUMB 2a: env SUPABASE_URL present=', !!supabaseUrl);
    console.log('BREADCRUMB 2b: env SERVICE_ROLE_KEY present=', !!serviceKey);
    console.log('BREADCRUMB 2c: env ANON_KEY present=', !!anonKey);

    if (!supabaseUrl || !serviceKey) {
      return err('Server misconfiguration: missing Supabase env vars', 500);
    }

    // ── Auth ─────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    console.log('BREADCRUMB 2d: Authorization header present=', !!authHeader);
    if (!authHeader) return err('Unauthorized — missing Authorization header', 401);

    // Verify JWT using anon client (never use service role for auth verification)
    const userClient = createClient(supabaseUrl, anonKey || serviceKey);
    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await userClient.auth.getUser(jwt);

    console.log('BREADCRUMB 2e: auth.getUser ok=', !authError, 'user=', user?.id ?? 'null');
    if (authError || !user) return err('Unauthorized — invalid JWT', 401);

    // All DB reads and writes use service role to bypass RLS
    const db = createClient(supabaseUrl, serviceKey);

    // ── Parse body ───────────────────────────────────────────────────────────
    let body: Record<string, unknown>;
    try {
      body = await req.json();
      console.log('BREADCRUMB 2f: body parsed, keys=', Object.keys(body).join(','));
    } catch (parseErr) {
      console.error('BREADCRUMB 2g: req.json() failed:', String(parseErr));
      return err('Invalid or empty JSON body', 400);
    }

    const { word_id, word, definition, part_of_speech, context_sentence } = body;

    if (!word_id || !word || !definition) {
      console.error('BREADCRUMB 2h: missing fields word_id=', word_id, 'word=', word, 'def=', !!definition);
      return err('Missing required fields: word_id, word, definition', 400);
    }

    const wordIdNum = Number(word_id);
    if (isNaN(wordIdNum)) return err(`Invalid word_id: "${word_id}"`, 400);

    console.log(`BREADCRUMB 2i: word_id=${wordIdNum} word="${word}"`);

    // ── Cache check ──────────────────────────────────────────────────────────
    console.log('BREADCRUMB 2j: checking cache in word_ai_content');
    const { data: cached, error: cacheErr } = await db
      .from('word_ai_content')
      .select('*')
      .eq('user_id', user.id)
      .eq('word_id', wordIdNum)
      .maybeSingle();

    if (cacheErr) {
      console.error('BREADCRUMB 2k: cache lookup error:', cacheErr.message, '| code:', cacheErr.code);
      // If the table doesn't exist, code = '42P01' (undefined_table)
    }

    if (cached && !cached.is_generating && cached.context_options) {
      console.log('BREADCRUMB 2l: cache HIT — returning cached content');
      return ok({ status: 'cached', content: cached });
    }

    if (cached?.is_generating) {
      console.log('BREADCRUMB 2m: already generating — returning pending');
      return ok({ status: 'generating' });
    }

    // ── Acquire lock ─────────────────────────────────────────────────────────
    console.log('BREADCRUMB 2n: acquiring is_generating lock');
    const { error: lockErr } = await db
      .from('word_ai_content')
      .upsert(
        { user_id: user.id, word_id: wordIdNum, is_generating: true },
        { onConflict: 'user_id,word_id' }
      );

    if (lockErr) {
      console.error('BREADCRUMB 2o: LOCK UPSERT FAILED:', lockErr.message, '| code:', lockErr.code, '| hint:', lockErr.hint, '| details:', lockErr.details);
      return err(`DB lock failed: ${lockErr.message}`, 500);
    }

    console.log('BREADCRUMB 2p: lock acquired, calling Groq');

    // ── Groq ──────────────────────────────────────────────────────────────────
    const wordStr = String(word);
    const posStr  = String(part_of_speech || 'word');
    const defStr  = String(definition);
    const ctxStr  = String(context_sentence || '');

    const prompt = buildPrompt(wordStr, posStr, defStr, ctxStr);

    const unlock = async () => {
      await db.from('word_ai_content').upsert(
        { user_id: user.id, word_id: wordIdNum, is_generating: false },
        { onConflict: 'user_id,word_id' }
      );
    };

    // Extract AI-generated sentence from raw response for similarity check
    const getAiSentence = (raw: unknown): string => {
      try {
        const ctx = (raw as Record<string, unknown>).context as Record<string, unknown>;
        return (ctx?.sentence as string) || '';
      } catch { return ''; }
    };

    let aiRaw = await callGroq(prompt);

    // ── One-shot retry if null or validation fails ────────────────────────────
    if (!aiRaw || !isValidContent(aiRaw, ctxStr, getAiSentence(aiRaw))) {
      console.warn('BREADCRUMB 3g: First Groq attempt failed validation — retrying once');
      aiRaw = await callGroq(prompt);
    }

    if (!aiRaw) {
      console.error('BREADCRUMB 4a: Groq returned null after retry — releasing lock, returning fallback');
      await unlock();
      return ok({ status: 'fallback', reason: 'groq_returned_null' });
    }

    if (!isValidContent(aiRaw, ctxStr, getAiSentence(aiRaw))) {
      console.error('BREADCRUMB 4b: AI schema invalid after retry — raw:', JSON.stringify(aiRaw).slice(0, 400));
      await unlock();
      return ok({ status: 'fallback', reason: 'invalid_ai_schema' });
    }

    // ── Store ────────────────────────────────────────────────────────────────
    console.log('BREADCRUMB 4c: AI content valid, writing to word_ai_content');
    const dbPayload = {
      user_id:       user.id,
      word_id:       wordIdNum,
      is_generating: false,
      generated_at:  new Date().toISOString(),
      ...toDbSchema(aiRaw as Record<string, unknown>),
    };

    const { error: storeErr } = await db
      .from('word_ai_content')
      .upsert(dbPayload, { onConflict: 'user_id,word_id' });

    if (storeErr) {
      console.error('BREADCRUMB 4d: STORE UPSERT FAILED:', storeErr.message, '| code:', storeErr.code, '| hint:', storeErr.hint);
      // Return generated content anyway — frontend still gets working exercises
      return ok({ status: 'generated', content: dbPayload });
    }

    console.log('BREADCRUMB 4e: SUCCESS — content stored and returned');
    return ok({ status: 'generated', content: dbPayload });

  } catch (e) {
    // Top-level catch — CORS headers included so browser shows real error
    const msg = e instanceof Error ? e.message : String(e);
    console.error('BREADCRUMB FATAL: unhandled exception:', msg);
    return err(msg, 500);
  }
});
