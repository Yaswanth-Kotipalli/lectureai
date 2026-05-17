export async function runStudyAgent(ingestData: any, analysisData: any, apiKey: string) {
  console.log(`[StudyAgent] Starting parallel study generation using ingest and analysis data...`);

  if (!apiKey) {
    console.log(`[StudyAgent] Error: GEMINI_API_KEY is missing.`);
    return { error: "GEMINI_API_KEY is missing" };
  }

  // Smart Transcript Sampling
  const sampleTranscriptEvenly = (transcript: any[], maxSegments: number = 150): any[] => {
    if (!transcript || transcript.length <= maxSegments) return transcript;

    const sampled: any[] = [];
    const total = transcript.length;

    // Take beginning (Introduction)
    const intro = Math.min(8, Math.floor(total * 0.15));
    for (let i = 0; i < intro; i++) sampled.push(transcript[i]);

    // Take ending (Conclusion)
    const endStart = total - 6;
    for (let i = Math.max(intro, endStart); i < total; i++) sampled.push(transcript[i]);

    // Evenly sample the middle
    const slotsLeft = maxSegments - sampled.length;
    if (slotsLeft > 0) {
      const step = Math.max(1, Math.floor(total / maxSegments));
      for (let i = intro; i < endStart && sampled.length < maxSegments; i += step) {
        sampled.push(transcript[i]);
      }
    }

    return sampled.sort((a, b) => a.offset - b.offset);
  };

  // Smart sampling - keeps beginning, end, and spreads middle
  const limitedSegments = ingestData.transcript
    ? sampleTranscriptEvenly(ingestData.transcript, 150)
    : [];

  const toMMSS = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds) % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const transcriptText = limitedSegments.length > 0
    ? limitedSegments.map((t: any) => `[${toMMSS(t.offset / 1000)}] ${t.text}`).join('\n')
    : "No transcript available";

  const fullTranscript = ingestData.transcript || [];
  const lastSegment = fullTranscript[fullTranscript.length - 1];
  const totalDurationSeconds = lastSegment ? Math.round((lastSegment.offset + (lastSegment.duration || 0)) / 1000) : 0;
  const totalMinutes = Math.round(totalDurationSeconds / 60);
  const durationNote = totalMinutes > 0
    ? `This video is ${totalMinutes} minutes long. Create outline sections spread across the FULL duration.`
    : '';

  const inputPrompt = `${durationNote ? durationNote + '\n\n' : ''}Analysis Data:\n${JSON.stringify(analysisData, null, 2)}\n\nTranscript:\n${transcriptText}`;

  // Call A: Outline and Summary
  const callAPromise = async () => {
    try {
      const systemPromptA = `You are an expert AI tutor helping a college student study for an exam.

The full lecture is ${totalMinutes} minutes long, but you are only given a sampled portion of the transcript.
You MUST create an outline that covers the entire lecture duration intelligently.

Rules:
- Respond ONLY in English. Never output any Arabic or other language.
- Create a detailed outline with AT LEAST 12-18 sections.
- Spread the sections logically across the full ${totalMinutes} minutes.
- Each major concept or topic shift should have its own section.
- Use the provided timestamps accurately. Estimate reasonable timestamps for later sections.

Return ONLY valid JSON matching this schema exactly. No markdown, no explanations, no backticks:
{
  "outline": [
    {
      "title": "string",
      "start_seconds": number,
      "start_display": "MM:SS",
      "subtopics": ["string"]
    }
  ],
  "summary": "string"
}`;

      const maxRetries = 2;
      let lastError: any;

      for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        try {
          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: `${systemPromptA}\n\n${inputPrompt}` }] }],
              generationConfig: { temperature: 0.3 }
            })
          });

          if (!response.ok) throw new Error(`Call A API Error: ${response.statusText}`);

          const data = await response.json();
          const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

          if (!content) throw new Error("Invalid Call A response format");

          return {
            rawText: content,
            parsed: JSON.parse(content.replace(/```json/gi, '').replace(/```/g, '').trim())
          };
        } catch (error: any) {
          lastError = error;
          console.log(`[StudyAgent] Call A attempt ${attempt} failed:`, error.message || error);
          if (attempt <= maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      }
      throw lastError;
    } catch (error: any) {
      console.log("[StudyAgent] Call A all retries exhausted:", error.message || error);
      throw error;
    }
  };

  // Call B: Flashcards and Search Index
  const callBPromise = async () => {
    try {
      const systemPromptB = `You are an expert AI tutor helping a college student study for an exam.

The full lecture is ${totalMinutes} minutes long, but you are only given a sampled portion of the transcript.
Create high-quality study materials that represent the whole lecture.

Rules:
- Respond ONLY in English. Never output any Arabic or other language.
- All timestamps must be realistic and spread across the full duration.
- Make flashcards useful for exam preparation.
- You MUST wrap everything in an object with keys 'flashcards' and 'search_index'. Never return a bare array.

Return ONLY valid JSON matching this schema exactly. No markdown, no explanations, no backticks:
{
  "flashcards": [{"question": "string", "answer": "string", "timestamp_seconds": number, "timestamp_display": "MM:SS"}],
  "search_index": [{"topic": "string", "keywords": ["string"], "timestamp_seconds": number, "timestamp_display": "MM:SS", "excerpt": "string"}]
}`;

      const maxRetries = 2;
      let lastError: any;

      for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        try {
          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: `${systemPromptB}\n\n${inputPrompt}` }] }],
              generationConfig: { temperature: 0.3 }
            })
          });

          if (!response.ok) throw new Error(`Call B API Error: ${response.statusText}`);

          const data = await response.json();
          const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

          if (!content) throw new Error("Invalid Call B response format");

          return {
            rawText: content,
            parsed: JSON.parse(content.replace(/```json/gi, '').replace(/```/g, '').trim())
          };
        } catch (error: any) {
          lastError = error;
          console.log(`[StudyAgent] Call B attempt ${attempt} failed:`, error.message || error);
          if (attempt <= maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      }
      throw lastError;
    } catch (error: any) {
      console.log("[StudyAgent] Call B all retries exhausted:", error.message || error);
      throw error;
    }
  };

  // Call C: Guided Walkthrough
  const walkthroughPromise = async () => {
    try {
      const systemPromptC = `You are an expert study coach. You receive an analyzed lecture transcript. Your job is to create a guided step-by-step walkthrough that helps a student truly master the material.

Return ONLY valid JSON, no markdown, no preamble. Use exactly this structure:

{
  "walkthrough": [
    {
      "step": 1,
      "title": "string",
      "duration_minutes": 5,
      "summary": "2-3 sentence explanation of what this step covers and why it matters",
      "key_timestamp": "MM:SS",
      "timestamp_seconds": 0,
      "what_to_focus_on": "one specific thing to pay attention to",
      "flashcards": [
        {
          "question": "string",
          "answer": "string"
        }
      ]
    }
  ],
  "total_study_time_minutes": 0,
  "recommended_pace": "string"
}

Rules:
- Generate 6-8 steps that cover the entire lecture in logical learning order
- Each step should have 2-3 flashcards testing the most important concept in that step
- duration_minutes should reflect actual content density (not all equal)
- summary must explain WHY this concept matters, not just what it is
- recommended_pace should give a specific actionable tip like 'Take a 5 min break after step 4'
- total_study_time_minutes is the sum of all step duration_minutes`;

      const maxRetries = 0;
      let lastError: any;

      for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        try {
          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: `${systemPromptC}\n\nAnalysis Data:\n${JSON.stringify(analysisData, null, 2)}` }] }],
              generationConfig: { temperature: 0.4 }
            })
          });

          if (!response.ok) throw new Error(`Call C API Error: ${response.statusText}`);

          const data = await response.json();
          const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

          if (!content) throw new Error("Invalid Call C response format");

          return {
            rawText: content,
            parsed: JSON.parse(content.replace(/```json/gi, '').replace(/```/g, '').trim())
          };
        } catch (error: any) {
          lastError = error;
          console.log(`[StudyAgent] Call C attempt ${attempt} failed:`, error.message || error);
          if (attempt <= maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      }
      throw lastError;
    } catch (error: any) {
      console.log("[StudyAgent] Call C all retries exhausted:", error.message || error);
      throw error;
    }
  };

  try {
    console.log('[StudyAgent] Starting 3 parallel Gemini calls...');
    const [resultA, resultB, resultCRaw] = await Promise.allSettled([
      callAPromise(),
      callBPromise(),
      walkthroughPromise()
    ]);

    console.log('[StudyAgent] All settled. C status:', resultCRaw.status);
    if (resultCRaw.status === 'rejected') console.log('[StudyAgent] C rejected:', (resultCRaw as PromiseRejectedResult).reason);

    // A and B are still required — throw if either failed
    if (resultA.status === 'rejected') throw resultA.reason;
    if (resultB.status === 'rejected') throw resultB.reason;

    const rA = (resultA as PromiseFulfilledResult<any>).value;
    const rB = (resultB as PromiseFulfilledResult<any>).value;

    // Walkthrough is optional — degrade gracefully
    const rC = resultCRaw.status === 'fulfilled'
      ? (resultCRaw as PromiseFulfilledResult<any>).value
      : null;

    if (resultCRaw.status === 'rejected') {
      console.log("[StudyAgent] Call C (walkthrough) failed — continuing without it.");
    }

    let walkthroughData = { walkthrough: [] as any[], total_study_time_minutes: 0, recommended_pace: '' };

    if (rC?.parsed) {
      if (Array.isArray(rC.parsed)) {
        // Gemini returned bare array instead of wrapped object
        walkthroughData = { walkthrough: rC.parsed, total_study_time_minutes: 0, recommended_pace: '' };
      } else if (rC.parsed.walkthrough) {
        walkthroughData = rC.parsed;
      }
    } else if (rC?.rawText) {
      // Log so we can see what Gemini actually returned
      console.log('[StudyAgent] Walkthrough raw text:', rC.rawText.slice(0, 500));
    }

    console.log("[StudyAgent] Raw A:", rA.rawText?.substring(0, 200));
    console.log("[StudyAgent] Raw B:", rB.rawText?.substring(0, 200));
    if (rC) console.log("[StudyAgent] Raw C:", rC.rawText?.substring(0, 200));

    console.log(`[StudyAgent] Parallel calls done. Generating notes...`);

    // Derive notes locally
    const notes = {
      overview: rA.parsed.summary,
      key_concepts: analysisData?.concepts?.map((c: any) => ({
        concept: (c.name_english || c.name).replace(/[\u0600-\u06FF]/g, '').trim(),
        explanation: c.definition,
        timestamp_display: c.timestamp_display,
        timestamp_seconds: c.timestamp_seconds
      })) || [],
      exam_tips: analysisData?.topics || []
    };

    console.log('[StudyAgent] Final return - walkthrough steps:', walkthroughData.walkthrough?.length ?? 'MISSING');

    return {
      outline: rA.parsed.outline,
      summary: rA.parsed.summary,
      flashcards: rB.parsed.flashcards,
      search_index: rB.parsed.search_index,
      notes,
      walkthrough: walkthroughData.walkthrough,
      total_study_time_minutes: walkthroughData.total_study_time_minutes,
      recommended_pace: walkthroughData.recommended_pace,
    };
  } catch (error: any) {
    console.log(`[StudyAgent] Error during study generation: ${error.message || error}`);
    return { error: "Study generation failed" };
  }
}