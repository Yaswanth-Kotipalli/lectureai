# LectureAI - Claude Guide

## Project Overview
Multi-agent AI system that converts YouTube lectures into study materials.
Two-part architecture: Cloudflare Worker backend + React/Vite frontend.

## Structure
- `worker/` - Cloudflare Worker with 3 agents
- `frontend/` - React + Vite UI deployed on Vercel

## Agents
- `worker/agents/ingestAgent.ts` - Fetches YouTube transcript
- `worker/agents/analysisAgent.ts` - Analyzes content via Gemini
- `worker/agents/studyAgent.ts` - Generates study materials (parallel calls)

## Key Commands

### Backend
```bash
cd worker
npm install
npx wrangler dev        # local development
npx wrangler deploy     # deploy to Cloudflare
```

### Frontend
```bash
cd frontend
npm install
npm run dev             # local development
npm run build           # production build
npx vercel --prod       # deploy to Vercel
```

## Environment Variables
Backend needs in `.env` or Cloudflare secrets:
- `GEMINI_API_KEY` - Google Gemini API key
- `YOUTUBE_API_KEY` - YouTube Data API key

## API Endpoints
- `POST /api/analyze` - Agent 1 + 2 (transcript + analysis)
- `POST /api/study` - Agent 3 (study materials generation)

## Important Notes
- Frontend calls `/api/analyze` first, then `/api/study` sequentially
- Transcript sampling: evenly distributed 150 segments max
- Retry logic: 2 retries on Gemini failures
- All output must be in English only
