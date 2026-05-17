import { processVideoIngestion } from './agents/ingestAgent';
import { runAnalysisAgent } from './agents/analysisAgent';
import { runStudyAgent } from './agents/studyAgent';

export interface Env {
  YOUTUBE_API_KEY: string;
  GEMINI_API_KEY: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Add CORS headers for local testing with Vite frontend
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // Handle CORS preflight requests
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method === "POST" && url.pathname === "/api/health") {
      console.log("[Worker] POST /api/health endpoint called.");
      return new Response(
        JSON.stringify({ status: "ok", agents: ["ingest", "analysis", "study"] }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        }
      );
    }

    if (request.method === "POST" && url.pathname === "/api/ingest") {
      console.log("[Worker] POST /api/ingest endpoint called.");
      try {
        const body = await request.json() as any;

        const pipelinePromise = (async () => {
          // Agent 1: Ingest
          const ingestResult = await processVideoIngestion(body?.url || "");
          if (ingestResult.error || !ingestResult.transcript) {
            return new Response(JSON.stringify(ingestResult), {
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
          }

          // Agent 2: Analysis
          const analysisResult = await runAnalysisAgent(ingestResult, env.GEMINI_API_KEY);

          // Agent 3: Study
          const studyResult = await runStudyAgent(ingestResult, analysisResult, env.GEMINI_API_KEY);

          // Remove the full transcript from the final payload to save bandwidth
          // since we just needed it for Agent 2 and Agent 3
          delete (ingestResult as any).transcript;

          const finalResponse = {
            ingest: ingestResult,
            analysis: analysisResult,
            study: studyResult
          };

          return new Response(JSON.stringify(finalResponse), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        })();

        const timeoutPromise = new Promise<Response>((_, reject) =>
          setTimeout(() => reject(new Error("Request timed out after 55 seconds")), 55000)
        );

        return await Promise.race([pipelinePromise, timeoutPromise]);
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/analyze") {
      console.log("[Worker] POST /api/analyze endpoint called.");
      try {
        const body = await request.json() as any;

        const pipelinePromise = (async () => {
          // Agent 1: Ingest
          const ingestResult = await processVideoIngestion(body?.url || "");
          if (ingestResult.error || !ingestResult.transcript) {
            return new Response(JSON.stringify(ingestResult), {
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
          }

          // Agent 2: Analysis only
          const analysisResult = await runAnalysisAgent(ingestResult, env.GEMINI_API_KEY);

          // Remove full transcript from payload to save bandwidth
          delete (ingestResult as any).transcript;

          const finalResponse = {
            ingest: ingestResult,
            analysis: analysisResult
          };

          return new Response(JSON.stringify(finalResponse), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        })();

        const timeoutPromise = new Promise<Response>((_, reject) =>
          setTimeout(() => reject(new Error("Request timed out after 55 seconds")), 55000)
        );

        return await Promise.race([pipelinePromise, timeoutPromise]);
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/study") {
      console.log("[Worker] POST /api/study endpoint called.");
      try {
        const body = await request.json() as any;
        const { ingestData, analysisData } = body;

        if (!ingestData || !analysisData) {
          return new Response(JSON.stringify({ error: "Request body must include ingestData and analysisData" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        const pipelinePromise = (async () => {
          const studyResult = await runStudyAgent(ingestData, analysisData, env.GEMINI_API_KEY);

          return new Response(JSON.stringify({ study: studyResult }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        })();

        const timeoutPromise = new Promise<Response>((_, reject) =>
          setTimeout(() => reject(new Error("Request timed out after 55 seconds")), 55000)
        );

        return await Promise.race([pipelinePromise, timeoutPromise]);
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }
    if (request.method === "POST" && url.pathname === "/api/translate") {
      try {
        const { studyData, targetLanguage } = await request.json() as any;
        const prompt = `Translate all text values in this JSON to ${targetLanguage}. Keep all JSON keys in English. Keep all numbers and timestamp values unchanged. Return ONLY valid JSON, no markdown.\n\n${JSON.stringify({ outline: studyData.outline, summary: studyData.summary, flashcards: studyData.flashcards, notes: { overview: studyData.notes?.overview, key_concepts: studyData.notes?.key_concepts }, walkthrough: studyData.walkthrough })}`;
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1 } }) });
        const d = await r.json();
        const c = d.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!c) return new Response(JSON.stringify({ error: "Translation failed" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        const translated = JSON.parse(c.replace(/```json/gi, '').replace(/```/g, '').trim());
        return new Response(JSON.stringify({ translated }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }
    // Fallback for any other routes
    console.log(`[Worker] Unhandled route accessed: ${request.method} ${url.pathname}`);
    return new Response("Not found", { status: 404, headers: corsHeaders });
  },
};
