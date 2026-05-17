// Model to use for analysis — swap value here to change provider
// Options: "gemini-2.5-flash" | "claude-3-5-sonnet" | "grok-2"
const AI_MODEL = "gemini-2.5-flash";

export async function runAnalysisAgent(ingestOutput: any, apiKey: string) {
  const chunks: any[] = ingestOutput?.chunks || [];
  const transcript: any[] = ingestOutput?.transcript || [];
  const video_duration_seconds: number = ingestOutput?.video_duration_seconds || 0;

  console.log(
    `[AnalysisAgent] Starting analysis — ${chunks.length} chunks, ${transcript.length} segments, ${video_duration_seconds}s duration`
  );

  if (!apiKey) {
    console.log(`[AnalysisAgent] Error: GEMINI_API_KEY is missing.`);
    return { error: "GEMINI_API_KEY is missing" };
  }

  if (chunks.length === 0) {
    console.log(`[AnalysisAgent] No chunks available from ingest output.`);
    return { error: "No chunks available for analysis" };
  }

  // Build Prompt
  const toMMSS = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds) % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  // Limit to first 40 chunks to stay within context limits
  const limitedChunks = chunks.slice(0, 40);

  const chunkText = limitedChunks
    .map((c: any) =>
      `[Chunk ${c.chunk_index} | ${toMMSS(c.start_time)} - ${toMMSS(c.end_time)}]\n${c.transcript_text}`
    )
    .join('\n\n');

  const systemPrompt = `You are an expert educational content analyzer. You receive a lecture transcript split into time-indexed chunks. Respond ONLY in English. Return ONLY valid JSON, no markdown, no preamble.

IMPORTANT: All timestamps in chunk headers are in SECONDS. Output timestamp_seconds as a plain integer (e.g. 34, not 34.68).

You MUST return exactly this structure — no variations:

{
  "topics": [
    {
      "name": "Topic Name",
      "chunk_indices": [0, 1, 2],
      "importance": "high",
      "summary": "One sentence summary"
    }
  ],
  "concepts": [
    {
      "name": "Concept Name",
      "definition": "Clear definition",
      "first_seen_chunk": 0,
      "timestamp_seconds": 34,
      "timestamp_display": "0:34",
      "related_chunks": [0, 3, 7],
      "importance": "high"
    }
  ],
  "study_plan": {
    "recommended_order": ["Concept 1", "Concept 2"],
    "focus_areas": ["Concept 1"],
    "key_things_to_remember": ["Key point 1", "Key point 2"]
  }
}

Rules:
- topics MUST be objects with name, chunk_indices, importance, summary — NOT plain strings
- Every concept MUST have related_chunks array and importance field
- study_plan is REQUIRED — do not omit it
- Extract 8-12 topics and 10-15 concepts
- chunk_indices must reference actual chunk numbers from the input`;

  const prompt = `${systemPrompt}\n\nHere is the lecture (${limitedChunks.length} chunks):\n\n${chunkText}`;

  try {
    console.log(`[AnalysisAgent] Calling Gemini API (gemini-2.5-flash)...`);
    console.log(`[AnalysisAgent] API Key present: ${!!apiKey}, Key length: ${apiKey?.length}`);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3 }
        })
      }
    );

    if (!response.ok) {
      const err = await response.text();
      console.log(`[AnalysisAgent] Gemini API Error: ${err}`);
      return { error: `Gemini API failed: ${response.status} ${response.statusText}` };
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      console.log(`[AnalysisAgent] Invalid response format from Gemini:`, JSON.stringify(data));
      return { error: "Invalid response from Gemini" };
    }

    const cleanContent = content.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanContent);

    console.log(
      `[AnalysisAgent] Analysis complete — topics: ${parsed.topics?.length}, concepts: ${parsed.concepts?.length}`
    );

    // Post-processing / Enrichment
    const enrichAnalysis = (raw: any, chunks: any[]) => {
      // --- Enrich concepts ---
      const enrichedConcepts = (raw.concepts || []).map((concept: any) => {
        const nameLower = (concept.name || '').toLowerCase();

        // Find all chunks where concept name appears in transcript text
        const matchingChunkIndices: number[] = chunks
          .filter((c: any) => (c.transcript_text || '').toLowerCase().includes(nameLower))
          .map((c: any) => c.chunk_index);

        // first_seen_chunk: lowest matching chunk index, or fall back to chunk nearest timestamp
        let firstSeen: number;
        if (matchingChunkIndices.length > 0) {
          firstSeen = Math.min(...matchingChunkIndices);
        } else {
          const ts = concept.timestamp_seconds || 0;
          const nearest = chunks.reduce((prev: any, curr: any) =>
            Math.abs(curr.start_time - ts) < Math.abs(prev.start_time - ts) ? curr : prev
            , chunks[0]);
          firstSeen = nearest ? nearest.chunk_index : 0;
        }

        // importance based on coverage
        const count = matchingChunkIndices.length;
        const importance = count >= 3 ? 'high' : count === 2 ? 'medium' : 'low';

        return {
          ...concept,
          related_chunks: matchingChunkIndices.length > 0 ? matchingChunkIndices : (concept.related_chunks || []),
          first_seen_chunk: firstSeen,
          importance: concept.importance || importance
        };
      });

      // --- Enrich topics (normalise strings → objects) ---
      const enrichedTopics = (raw.topics || []).map((topic: any) => {
        if (typeof topic === 'string') {
          const nameLower = topic.toLowerCase();
          const matchingIndices: number[] = chunks
            .filter((c: any) => (c.transcript_text || '').toLowerCase().includes(nameLower))
            .map((c: any) => c.chunk_index);
          const count = matchingIndices.length;
          const importance = count >= 3 ? 'high' : count === 2 ? 'medium' : 'low';
          return {
            name: topic,
            chunk_indices: matchingIndices,
            importance,
            summary: topic
          };
        }
        // Already an object — ensure chunk_indices are populated
        const nameLower = (topic.name || '').toLowerCase();
        const matchingIndices: number[] = chunks
          .filter((c: any) => (c.transcript_text || '').toLowerCase().includes(nameLower))
          .map((c: any) => c.chunk_index);
        return {
          ...topic,
          chunk_indices: matchingIndices.length > 0 ? matchingIndices : (topic.chunk_indices || [])
        };
      });

      // --- Build study_plan ---
      const sortedByTime = [...enrichedConcepts].sort(
        (a: any, b: any) => (a.timestamp_seconds || 0) - (b.timestamp_seconds || 0)
      );
      const highConcepts = enrichedConcepts
        .filter((c: any) => c.importance === 'high')
        .map((c: any) => c.name);
      const top5 = [
        ...enrichedConcepts.filter((c: any) => c.importance === 'high'),
        ...enrichedConcepts.filter((c: any) => c.importance === 'medium'),
        ...enrichedConcepts.filter((c: any) => c.importance === 'low')
      ].slice(0, 5).map((c: any) => c.name);

      const study_plan = raw.study_plan || {
        recommended_order: sortedByTime.map((c: any) => c.name),
        focus_areas: highConcepts,
        key_things_to_remember: top5
      };

      return {
        ...raw,
        topics: enrichedTopics,
        concepts: enrichedConcepts,
        study_plan
      };
    };

    const enriched = enrichAnalysis(parsed, chunks);

    console.log(
      `[AnalysisAgent] Enrichment complete — topics: ${enriched.topics?.length}, concepts: ${enriched.concepts?.length}`
    );

    // Merge back chunk and transcript data for downstream agents
    return {
      ...enriched,
      chunks: ingestOutput.chunks,
      transcript: ingestOutput.transcript,
      video_duration_seconds: ingestOutput.video_duration_seconds
    };
  } catch (error: any) {
    console.log(`[AnalysisAgent] Error during analysis: ${error.message || error}`);
    return { error: "Analysis failed" };
  }
}
