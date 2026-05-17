import { YoutubeTranscript } from 'youtube-transcript';

export async function processVideoIngestion(url: string) {
  console.log(`[IngestAgent] Starting ingestion for URL: ${url}`);

  // Extract video ID from YouTube URL
  // Matches standard watch URLs, short youtu.be URLs, and embeds
  const videoIdMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
  
  if (!videoIdMatch || !videoIdMatch[1]) {
    console.log(`[IngestAgent] Failed to extract Video ID from URL: ${url}`);
    return { error: "Invalid YouTube URL" };
  }

  const video_id = videoIdMatch[1];
  console.log(`[IngestAgent] Successfully extracted Video ID: ${video_id}`);

  try {
    console.log(`[IngestAgent] Attempting to fetch transcript for Video ID: ${video_id}...`);
    const transcript = await YoutubeTranscript.fetchTranscript(video_id);
    
    console.log(`[IngestAgent] Successfully fetched transcript! Total segments: ${transcript.length}`);
    
    const firstSegmentText = transcript.length > 0 ? transcript[0].text : "";
    const preview = firstSegmentText.substring(0, 100);
    console.log(`[IngestAgent] First segment preview: "${preview}"`);

    // Chunking
    const CHUNK_DURATION_SECONDS = 180; // 3 minutes per chunk

    // Total video duration from last segment (offsets are in milliseconds)
    const lastSeg = transcript[transcript.length - 1];
    const video_duration_seconds = lastSeg
      ? Math.round((lastSeg.offset + (lastSeg.duration || 0)) / 1000)
      : 0;

    // Build 3-minute chunks
    const chunks: Array<{
      chunk_index: number;
      start_time: number;
      end_time: number;
      transcript_text: string;
    }> = [];

    let chunkIndex = 0;
    let chunkStart = 0;

    while (chunkStart < video_duration_seconds) {
      const isLastChunk = chunkStart + CHUNK_DURATION_SECONDS >= video_duration_seconds;
      const chunkEnd = isLastChunk ? video_duration_seconds : chunkStart + CHUNK_DURATION_SECONDS;

      // Collect all transcript segments that fall within this chunk's window
      const lines = transcript
        .filter((t: any) => {
          const tSec = t.offset / 1000;
          return tSec >= chunkStart && tSec < chunkEnd;
        })
        .map((t: any) => t.text)
        .join(' ');

      chunks.push({
        chunk_index: chunkIndex,
        start_time: chunkStart,
        end_time: chunkEnd,
        transcript_text: lines
      });

      chunkStart = chunkEnd;
      chunkIndex++;
    }

    // Validation
    const covered_duration_seconds = chunks.reduce(
      (sum, c) => sum + (c.end_time - c.start_time),
      0
    );
    const TOLERANCE_SECONDS = 10;
    const validation_passed =
      Math.abs(covered_duration_seconds - video_duration_seconds) <= TOLERANCE_SECONDS;

    if (!validation_passed) {
      console.log(
        `[IngestAgent] Validation FAILED — video: ${video_duration_seconds}s, covered: ${covered_duration_seconds}s`
      );
    } else {
      console.log(
        `[IngestAgent] Validation PASSED — ${chunks.length} chunks, ${video_duration_seconds}s covered`
      );
    }

    return {
      video_id,
      transcript_available: true,
      segment_count: transcript.length,
      first_segment_preview: preview,
      transcript, // Passed through for Agent 2 & 3
      // Chunked output
      video_duration_seconds,
      total_chunks: chunks.length,
      covered_duration_seconds,
      validation_passed,
      chunks: validation_passed ? chunks : []
    };
  } catch (error: any) {
    console.log(`[IngestAgent] Error fetching transcript: ${error.message || error}`);
    return { error: "No transcript available" };
  }
}
