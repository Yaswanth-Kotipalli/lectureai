# LectureAI

Turn any YouTube lecture into a complete study session.

LectureAI is a multi-agent AI system that takes a public YouTube lecture URL and generates a personalized study environment in under 60 seconds.

## Live Demo

https://lectureai-frontend.vercel.app

## Features

- Outline with timestamped sections and jump-points back into the video
- Summary in plain language covering the full lecture
- Notes with key concepts, explanations, and timestamps
- Flashcards with exam-ready Q&A and source timestamps
- Search any concept and find the exact moment in the lecture

## Architecture

Three-agent pipeline on Cloudflare Workers:

Agent 1 - Ingest: Extracts transcript from any public YouTube video
Agent 2 - Analysis: Sends transcript to Gemini 2.5 Flash, extracts topics and concepts
Agent 3 - Study: Runs two parallel Gemini calls for outline, summary, flashcards, and search index

The frontend splits the pipeline into two sequential API calls to stay within Cloudflare execution limits.

## Tech Stack

- Frontend: React, Vite, TypeScript deployed on Vercel
- Backend: Cloudflare Workers, TypeScript
- AI: Gemini 2.5 Flash
- Transcript: youtube-transcript

## Running Locally

Backend:
cd worker
npm install
cp ../.env.example .env
npx wrangler dev

Frontend:
cd frontend
npm install
npm run dev

## Environment Variables

Copy .env.example and add your keys:
GEMINI_API_KEY=your_gemini_api_key_here
YOUTUBE_API_KEY=your_youtube_api_key_here

## Built For

Cloudforce No Resume Required Frontier Internship Hackathon - May 2026
