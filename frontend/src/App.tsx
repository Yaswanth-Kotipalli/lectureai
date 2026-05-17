import { useState, useRef } from "react";
import {
  FileText, Brain, Sparkles, Check, Loader2,
  ChevronLeft, ChevronRight, Search as SearchIcon,
  Play, AlertCircle
} from "lucide-react";

export default function LectureAI() {
  type Stage = "idle" | "loading" | "results" | "error";
  const [stage, setStage] = useState<Stage>("idle");
  const [url, setUrl] = useState("");
  const [step, setStep] = useState(0);
  const [tab, setTab] = useState<"outline" | "summary" | "flashcards" | "notes" | "search" | "walkthrough">("outline");
  const [seekTo, setSeekTo] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [videoId, setVideoId] = useState("");
  const [studyData, setStudyData] = useState<any>(null);
  const [language, setLanguage] = useState("English");
  const [translating, setTranslating] = useState(false);
  const [activeData, setActiveData] = useState<any>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handleAnalyze = async () => {
    if (!url.trim()) return;
    setStage("loading");
    setStep(0);
    setErrorMessage("");
    setLanguage("English");
    setActiveData(null);
    try {
      const res1 = await fetch("https://lecture-ai-worker.lectureaiapp.workers.dev/api/analyze", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data1 = await res1.json();
      if (!res1.ok || data1.error || data1.ingest?.error) {
        throw new Error(data1.error || data1.ingest?.error || "Failed to analyze lecture");
      }
      setStep(2);
      const res2 = await fetch("https://lecture-ai-worker.lectureaiapp.workers.dev/api/study", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingestData: data1.ingest, analysisData: data1.analysis }),
      });
      const data2 = await res2.json();
      if (!res2.ok || data2.error) throw new Error(data2.error || "Failed to generate study materials.");
      if (!data2.study) throw new Error("Failed to generate study materials.");
      setVideoId(data1.ingest.video_id);
      setStudyData(data2.study);
      setActiveData(data2.study);
      setStep(3);
      setTimeout(() => setStage("results"), 600);
    } catch (err: any) {
      setErrorMessage(err.message || "An unexpected error occurred");
      setStage("error");
    }
  };

  const seek = (s: number) => {
    setSeekTo(s);
    if (iframeRef.current) {
      iframeRef.current.src = `https://www.youtube.com/embed/${videoId}?start=${s}&autoplay=1&rel=0`;
    }
  };

  const handleLanguage = async (lang: string) => {
    setLanguage(lang);
    if (lang === "English") { setActiveData(studyData); return; }
    setTranslating(true);
    try {
      const res = await fetch("https://lecture-ai-worker.lectureaiapp.workers.dev/api/translate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studyData, targetLanguage: lang })
      });
      const data = await res.json();
      if (data.translated) setActiveData({ ...studyData, ...data.translated });
    } catch (e) { console.error(e); }
    setTranslating(false);
  };

  return (
    <main style={{ minHeight: "100vh", background: "#0a0a0a", color: "#fafafa", fontFamily: "system-ui,sans-serif" }}>
      <header style={{ padding: "24px 40px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ height: 28, width: 28, borderRadius: 8, background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)", display: "grid", placeItems: "center" }}>
            <Sparkles size={14} color="#a78bfa" />
          </div>
          <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.02em" }}>LectureAI</span>
        </div>
      </header>

      <section style={{ padding: "40px 40px 64px", maxWidth: 640, margin: "0 auto" }}>
        <h1 style={{ fontSize: "clamp(2rem,5vw,3.5rem)", fontWeight: 600, letterSpacing: "-0.03em", textAlign: "center", lineHeight: 1.05, marginBottom: 20 }}>
          Turn any lecture into a <span style={{ color: "#a78bfa" }}>study session</span>
        </h1>
        <p style={{ textAlign: "center", color: "#888", fontSize: 16, marginBottom: 40 }}>
          Paste a YouTube lecture URL to get started
        </p>
        <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !url.trim() === false && handleAnalyze()} placeholder="https://www.youtube.com/watch?v=..."
          style={{ width: "100%", height: 56, padding: "0 20px", borderRadius: 16, background: "#1a1a1a", border: "1px solid #333", color: "#fafafa", fontSize: 15, outline: "none", boxSizing: "border-box", marginBottom: 12 }} />
        <button onClick={handleAnalyze} disabled={stage === "loading" || !url.trim()}
          style={{ width: "100%", height: 56, borderRadius: 16, background: "#7c3aed", border: "none", color: "white", fontSize: 15, fontWeight: 500, cursor: "pointer", opacity: stage === "loading" || !url.trim() ? 0.6 : 1 }}>
          {stage === "loading" ? "Analyzing…" : "Analyze Lecture"}
        </button>

        {stage === "error" && (
          <div style={{ marginTop: 24, padding: 16, borderRadius: 12, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", display: "flex", gap: 12 }}>
            <AlertCircle size={18} color="#ef4444" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: "#ef4444" }}>Analysis Failed</div>
              <div style={{ fontSize: 13, color: "#f87171", marginTop: 4 }}>{errorMessage}</div>
            </div>
          </div>
        )}

        {stage === "loading" && (
          <div style={{ marginTop: 40, display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              { icon: <FileText size={16} />, label: "Fetching transcript" },
              { icon: <Brain size={16} />, label: "Analyzing content" },
              { icon: <Sparkles size={16} />, label: "Building study materials" },
            ].map((item, idx) => {
              const s = step > idx ? "done" : step === idx ? "active" : "pending";
              return (
                <div key={idx} style={{ display: "flex", alignItems: "center", gap: 16, padding: 16, borderRadius: 12, border: `1px solid ${s === "done" ? "rgba(134,239,172,0.3)" : s === "active" ? "rgba(139,92,246,0.5)" : "#222"}`, background: s === "done" ? "rgba(134,239,172,0.08)" : s === "active" ? "rgba(139,92,246,0.1)" : "#111" }}>
                  <div style={{ height: 36, width: 36, borderRadius: 8, display: "grid", placeItems: "center", background: s === "done" ? "rgba(134,239,172,0.15)" : s === "active" ? "rgba(139,92,246,0.2)" : "#1a1a1a", color: s === "done" ? "#86efac" : s === "active" ? "#a78bfa" : "#666" }}>
                    {s === "done" ? <Check size={16} /> : s === "active" ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : item.icon}
                  </div>
                  <span style={{ fontSize: 14, color: s === "pending" ? "#666" : "#fafafa" }}>{item.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {stage === "results" && activeData && (
        <section style={{ padding: "0 40px 96px", maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "center", gap: 4, padding: 4, background: "#111", borderRadius: 12, border: "1px solid #222", width: "fit-content", margin: "0 auto 8px" }}>
            {(["outline", "summary", "notes", "flashcards", "search", "walkthrough"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: tab === t ? "#7c3aed" : "transparent", color: tab === t ? "white" : "#888", fontSize: 13, cursor: "pointer", textTransform: "capitalize" }}>
                {t}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginBottom: 24 }}>
            {translating && <span style={{ fontSize: 12, color: "#a78bfa" }}>🌐 Translating...</span>}
            <select value={language} onChange={e => handleLanguage(e.target.value)} disabled={translating}
              style={{ padding: "6px 14px", borderRadius: 8, background: "#1a1a1a", border: "1px solid #333", color: "#fafafa", fontSize: 13, cursor: "pointer" }}>
              {["English", "Spanish", "French", "Arabic", "Hindi", "Chinese"].map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          {tab === "outline" && <OutlineTab onSeek={seek} iframeRef={iframeRef} initialStart={seekTo} outline={activeData.outline} videoId={videoId} />}
          {tab === "summary" && <SummaryTab summary={activeData.summary} />}
          {tab === "notes" && <NotesTab notes={activeData.notes} onSeek={seek} />}
          {tab === "flashcards" && <FlashcardsTab onSeek={seek} switchToOutline={() => setTab("outline")} flashcards={activeData.flashcards} />}
          {tab === "search" && <SearchTab onSeek={(s: number) => { setTab("outline"); setTimeout(() => seek(s), 50); }} searchIndex={activeData.search_index} />}
          {tab === "walkthrough" && <WalkthroughTab walkthrough={activeData.walkthrough} recommended_pace={activeData.recommended_pace} total_study_time_minutes={activeData.total_study_time_minutes} onSeek={seek} switchToOutline={() => setTab("outline")} />}
        </section>
      )}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </main>
  );
}
function OutlineTab({ onSeek, iframeRef, initialStart, outline, videoId }: any) {
  if (!outline?.length) return <div style={{ textAlign: "center", padding: 40, color: "#666" }}>No outline generated.</div>;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 24 }}>
      <div style={{ borderRadius: 16, border: "1px solid #222", background: "#111", padding: 8, maxHeight: 480, overflowY: "auto" }}>
        {outline.map((c: any, i: number) => (
          <button key={i} onClick={() => onSeek(c.start_seconds)} style={{ width: "100%", textAlign: "left", padding: 12, borderRadius: 10, border: "none", background: "transparent", color: "#fafafa", cursor: "pointer", display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 4 }}>
            <span style={{ padding: "2px 8px", borderRadius: 6, background: "rgba(139,92,246,0.15)", color: "#a78bfa", fontSize: 11, fontFamily: "monospace", flexShrink: 0 }}>{c.start_display}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{c.title}</div>
              {c.subtopics?.map((s: string, j: number) => <div key={j} style={{ fontSize: 11, color: "#666", marginTop: 2 }}>• {s}</div>)}
            </div>
          </button>
        ))}
      </div>
      <div style={{ borderRadius: 16, border: "1px solid #222", overflow: "hidden", aspectRatio: "16/9" }}>
        <iframe ref={iframeRef} style={{ width: "100%", height: "100%" }} src={`https://www.youtube.com/embed/${videoId}?rel=0${initialStart ? `&start=${initialStart}` : ""}`} title="Lecture" allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture" allowFullScreen />
      </div>
    </div>
  );
}

function SummaryTab({ summary }: any) {
  if (!summary) return <div style={{ textAlign: "center", padding: 40, color: "#666" }}>No summary generated.</div>;
  return <article style={{ maxWidth: 640, margin: "0 auto", borderRadius: 16, border: "1px solid #222", background: "#111", padding: 40 }}>{summary.split("\n\n").map((p: string, i: number) => <p key={i} style={{ fontSize: 15, lineHeight: 1.7, color: "rgba(250,250,250,0.85)", marginBottom: 20 }}>{p}</p>)}</article>;
}

function NotesTab({ notes, onSeek }: any) {
  if (!notes) return <div style={{ textAlign: "center", padding: 40, color: "#666" }}>No notes generated.</div>;
  return (
    <article style={{ maxWidth: 720, margin: "0 auto", borderRadius: 16, border: "1px solid #222", background: "#111", padding: 40 }}>
      <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 12 }}>Overview</h3>
      <p style={{ fontSize: 15, lineHeight: 1.7, color: "rgba(250,250,250,0.85)", marginBottom: 32, textAlign: "left" }}>{notes.overview}</p>
      {notes.key_concepts?.length > 0 && <><h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 16 }}>Key Concepts</h3><div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 32 }}>{notes.key_concepts.map((kc: any, i: number) => <div key={i} style={{ padding: 16, borderRadius: 10, background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)" }}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><span style={{ fontWeight: 600, color: "#a78bfa" }}>{kc.concept}</span>{kc.timestamp_display && <button onClick={() => onSeek(kc.timestamp_seconds || 0)} style={{ fontSize: 11, fontFamily: "monospace", color: "#666", background: "none", border: "none", cursor: "pointer" }}>{kc.timestamp_display}</button>}</div><p style={{ fontSize: 14, lineHeight: 1.6, color: "rgba(250,250,250,0.85)", margin: 0 }}>{kc.explanation}</p></div>)}</div></>}
      {notes.exam_tips?.length > 0 && <><h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 12 }}>Exam Tips</h3><div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{notes.exam_tips.map((tip: any, i: number) => <div key={i} style={{ padding: "10px 16px", borderRadius: 8, background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.15)", fontSize: 14, lineHeight: 1.6, color: "rgba(250,250,250,0.85)", textAlign: "left" }}>{typeof tip === 'string' ? tip : tip.name || tip.title || JSON.stringify(tip)}</div>)}</div></>}
    </article>
  );
}

function FlashcardsTab({ onSeek, switchToOutline, flashcards }: any) {
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  if (!flashcards?.length) return <div style={{ textAlign: "center", padding: 40, color: "#666" }}>No flashcards generated.</div>;
  const card = flashcards[i];
  const go = (d: number) => { setFlipped(false); setI(p => (p + d + flashcards.length) % flashcards.length); };
  return (
    <div style={{ maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ width: "100%", height: 288, perspective: 1200, cursor: "pointer" }} onClick={() => setFlipped(f => !f)}>
        <div style={{ position: "relative", width: "100%", height: "100%", transformStyle: "preserve-3d", transition: "transform 0.5s", transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)" }}>
          <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", borderRadius: 16, border: "1px solid #333", background: "#111", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center", padding: 32 }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#666", marginBottom: 16 }}>Question</div>
            <p style={{ fontSize: 18, fontWeight: 500, lineHeight: 1.4 }}>{card.question}</p>
            <div style={{ marginTop: 24, fontSize: 11, color: "#555" }}>Click to flip</div>
          </div>
          <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", borderRadius: 16, border: "1px solid rgba(139,92,246,0.4)", background: "rgba(139,92,246,0.05)", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center", padding: 32, transform: "rotateY(180deg)" }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a78bfa", marginBottom: 16 }}>Answer</div>
            <p style={{ fontSize: 14, lineHeight: 1.6 }}>{card.answer}</p>
          </div>
        </div>
      </div>
      <button onClick={(e) => { e.stopPropagation(); switchToOutline(); setTimeout(() => onSeek(card.timestamp_seconds), 50); }} style={{ marginTop: 20, padding: "4px 12px", borderRadius: 8, background: "rgba(139,92,246,0.15)", border: "none", color: "#a78bfa", fontSize: 11, fontFamily: "monospace", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
        <Play size={12} />Source: {card.timestamp_display}
      </button>
      <div style={{ marginTop: 32, display: "flex", alignItems: "center", gap: 24 }}>
        <button onClick={() => go(-1)} style={{ height: 40, width: 40, borderRadius: "50%", border: "1px solid #333", background: "transparent", color: "#fafafa", cursor: "pointer", display: "grid", placeItems: "center" }}><ChevronLeft size={20} /></button>
        <span style={{ fontSize: 13, color: "#666" }}>Card {i + 1} of {flashcards.length}</span>
        <button onClick={() => go(1)} style={{ height: 40, width: 40, borderRadius: "50%", border: "1px solid #333", background: "transparent", color: "#fafafa", cursor: "pointer", display: "grid", placeItems: "center" }}><ChevronRight size={20} /></button>
      </div>
    </div>
  );
}

function SearchTab({ onSeek, searchIndex }: any) {
  const [q, setQ] = useState("");
  if (!searchIndex) return <div style={{ textAlign: "center", padding: 40, color: "#666" }}>No search index generated.</div>;
  const results = q.trim() ? searchIndex.filter((c: any) => (c.topic && c.topic.toLowerCase().includes(q.toLowerCase())) || (c.excerpt && c.excerpt.toLowerCase().includes(q.toLowerCase())) || (c.keywords && c.keywords.some((k: string) => k.toLowerCase().includes(q.toLowerCase())))) : searchIndex;
  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <div style={{ position: "relative", marginBottom: 20 }}>
        <SearchIcon size={16} color="#666" style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)" }} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search concepts, keywords, or topics..." style={{ width: "100%", height: 48, paddingLeft: 44, paddingRight: 16, borderRadius: 10, background: "#1a1a1a", border: "1px solid #333", color: "#fafafa", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {results.length === 0 && <p style={{ textAlign: "center", color: "#666", padding: 40, fontSize: 13 }}>No matches found.</p>}
        {results.map((r: any, idx: number) => (
          <button key={idx} onClick={() => onSeek(r.timestamp_seconds)} style={{ textAlign: "left", padding: 16, borderRadius: 12, border: "1px solid #222", background: "#111", cursor: "pointer", display: "flex", gap: 16, alignItems: "flex-start", color: "#fafafa" }}>
            <span style={{ padding: "2px 8px", borderRadius: 6, background: "rgba(139,92,246,0.15)", color: "#a78bfa", fontSize: 11, fontFamily: "monospace", flexShrink: 0 }}>{r.timestamp_display}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{r.topic}</div>
              <div style={{ fontSize: 13, color: "#888" }}>{r.excerpt}</div>
              {r.keywords?.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>{r.keywords.map((k: string, i: number) => <span key={i} style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "#1a1a1a", color: "#666" }}>{k}</span>)}</div>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
function WalkthroughTab({ walkthrough, recommended_pace, total_study_time_minutes, onSeek, switchToOutline }: any) {
  const [activeStep, setActiveStep] = useState(0);
  const [flippedCard, setFlippedCard] = useState<number | null>(null);
  if (!walkthrough?.length) return <div style={{ textAlign: "center", padding: 40, color: "#666" }}>No walkthrough generated.</div>;
  const step = walkthrough[activeStep];
  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div style={{ fontSize: 13, color: "#a78bfa" }}>📚 {total_study_time_minutes} min study plan</div>
        <div style={{ fontSize: 12, color: "#666" }}>{recommended_pace}</div>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 32, flexWrap: "wrap" }}>
        {walkthrough.map((s: any, i: number) => (
          <button key={i} onClick={() => { setActiveStep(i); setFlippedCard(null); }} style={{ padding: "6px 14px", borderRadius: 20, border: "none", background: i === activeStep ? "#7c3aed" : "#1a1a1a", color: i === activeStep ? "white" : "#666", fontSize: 12, cursor: "pointer" }}>
            Step {s.step}
          </button>
        ))}
      </div>
      <div style={{ borderRadius: 16, border: "1px solid rgba(139,92,246,0.3)", background: "rgba(139,92,246,0.05)", padding: 32, marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <h3 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: "#a78bfa" }}>{step.title}</h3>
          <button onClick={() => { switchToOutline(); setTimeout(() => onSeek(step.timestamp_seconds), 50); }} style={{ padding: "4px 12px", borderRadius: 8, background: "rgba(139,92,246,0.15)", border: "none", color: "#a78bfa", fontSize: 11, cursor: "pointer", flexShrink: 0, marginLeft: 12 }}>{step.key_timestamp} ▶</button>
        </div>
        <p style={{ fontSize: 14, lineHeight: 1.7, color: "rgba(250,250,250,0.85)", marginBottom: 16 }}>{step.summary}</p>
        <div style={{ padding: 12, borderRadius: 8, background: "rgba(250,200,0,0.08)", border: "1px solid rgba(250,200,0,0.2)", fontSize: 13, color: "#fbbf24" }}>
          🎯 Focus: {step.what_to_focus_on}
        </div>
      </div>
      <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: "#888" }}>Quick Check — {step.flashcards?.length} cards</h4>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {step.flashcards?.map((fc: any, i: number) => (
          <div key={i} onClick={() => setFlippedCard(flippedCard === i ? null : i)} style={{ padding: 20, borderRadius: 12, border: `1px solid ${flippedCard === i ? "rgba(139,92,246,0.4)" : "#222"}`, background: flippedCard === i ? "rgba(139,92,246,0.05)" : "#111", cursor: "pointer" }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: flippedCard === i ? 12 : 0 }}>{fc.question}</div>
            {flippedCard === i && <div style={{ fontSize: 13, color: "#a78bfa", lineHeight: 1.6, paddingTop: 12, borderTop: "1px solid rgba(139,92,246,0.2)" }}>{fc.answer}</div>}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 32 }}>
        <button onClick={() => { setActiveStep(p => Math.max(0, p - 1)); setFlippedCard(null); }} disabled={activeStep === 0} style={{ padding: "10px 24px", borderRadius: 10, border: "1px solid #333", background: "transparent", color: activeStep === 0 ? "#444" : "#fafafa", cursor: activeStep === 0 ? "default" : "pointer" }}>← Previous</button>
        <button onClick={() => { setActiveStep(p => Math.min(walkthrough.length - 1, p + 1)); setFlippedCard(null); }} disabled={activeStep === walkthrough.length - 1} style={{ padding: "10px 24px", borderRadius: 10, border: "none", background: activeStep === walkthrough.length - 1 ? "#333" : "#7c3aed", color: "white", cursor: activeStep === walkthrough.length - 1 ? "default" : "pointer" }}>Next Step →</button>
      </div>
    </div>
  );
}