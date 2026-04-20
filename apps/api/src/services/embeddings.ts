import { query, transaction } from "../db/client.js";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;
const MAX_TOKENS_SINGLE_CHUNK = 8000;
const CHARS_PER_TOKEN_ESTIMATE = 4;
const MAX_CHARS_SINGLE_CHUNK = MAX_TOKENS_SINGLE_CHUNK * CHARS_PER_TOKEN_ESTIMATE;

export async function generateEmbedding(text: string): Promise<number[]> {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for embedding generation");
  }

  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text,
      dimensions: EMBEDDING_DIMENSIONS,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI embedding API error ${res.status}: ${err}`);
  }

  const data = (await res.json()) as {
    data: Array<{ embedding: number[] }>;
  };
  return data.data[0].embedding;
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for embedding generation");
  }

  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: texts,
      dimensions: EMBEDDING_DIMENSIONS,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI embedding API error ${res.status}: ${err}`);
  }

  const data = (await res.json()) as {
    data: Array<{ embedding: number[]; index: number }>;
  };
  return data.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}

function buildEmbeddingText(
  collectionName: string,
  structuredData: Record<string, unknown> | null,
  content: string | null
): string {
  const parts: string[] = [collectionName];

  if (structuredData) {
    const fields = Object.entries(structuredData)
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join("\n");
    parts.push(fields);
  }

  if (content) {
    parts.push(content);
  }

  return parts.join("\n\n");
}

function chunkText(text: string): string[] {
  if (text.length <= MAX_CHARS_SINGLE_CHUNK) {
    return [text];
  }

  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    if (current.length + para.length + 2 > MAX_CHARS_SINGLE_CHUNK) {
      if (current) chunks.push(current.trim());
      current = para;
    } else {
      current += (current ? "\n\n" : "") + para;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  return chunks.length > 0 ? chunks : [text.slice(0, MAX_CHARS_SINGLE_CHUNK)];
}

export async function embedEntry(entryId: string): Promise<void> {
  const entryResult = await query(
    `SELECT e.id, e.structured_data, e.content, c.name AS collection_name
     FROM entries e
     INNER JOIN collections c ON e.collection_id = c.id
     WHERE e.id = $1`,
    [entryId]
  );

  if (entryResult.rows.length === 0) return;

  const entry = entryResult.rows[0];
  const fullText = buildEmbeddingText(
    entry.collection_name,
    entry.structured_data,
    entry.content
  );

  const chunks = chunkText(fullText);

  if (chunks.length === 1) {
    const embedding = await generateEmbedding(chunks[0]);
    const pgVector = `[${embedding.join(",")}]`;
    await query("UPDATE entries SET embedding = $1 WHERE id = $2", [
      pgVector,
      entryId,
    ]);
    await query("DELETE FROM entry_chunks WHERE entry_id = $1", [entryId]);
  } else {
    const embeddings = await generateEmbeddings(chunks);
    const primaryEmbedding = embeddings[0];
    const pgVector = `[${primaryEmbedding.join(",")}]`;

    await transaction(async (client) => {
      await client.query("UPDATE entries SET embedding = $1 WHERE id = $2", [
        pgVector,
        entryId,
      ]);

      await client.query("DELETE FROM entry_chunks WHERE entry_id = $1", [
        entryId,
      ]);

      for (let i = 0; i < chunks.length; i++) {
        const chunkVector = `[${embeddings[i].join(",")}]`;
        await client.query(
          `INSERT INTO entry_chunks (entry_id, chunk_index, chunk_text, embedding)
           VALUES ($1, $2, $3, $4)`,
          [entryId, i, chunks[i], chunkVector]
        );
      }
    });
  }
}

// Simple polling-based job queue using a DB table
export async function enqueueEmbedding(entryId: string): Promise<void> {
  await query(
    `INSERT INTO embedding_jobs (entry_id)
     VALUES ($1)
     ON CONFLICT (entry_id) DO UPDATE SET
       status = 'pending',
       attempts = 0,
       updated_at = now()`,
    [entryId]
  );
}

export async function processEmbeddingJobs(batchSize = 10): Promise<number> {
  const jobs = await query(
    `UPDATE embedding_jobs
     SET status = 'processing', updated_at = now()
     WHERE id IN (
       SELECT id FROM embedding_jobs
       WHERE status = 'pending' AND attempts < 3
       ORDER BY created_at
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING entry_id`,
    [batchSize]
  );

  let processed = 0;
  for (const job of jobs.rows) {
    try {
      await embedEntry(job.entry_id);
      await query(
        "UPDATE embedding_jobs SET status = 'completed', updated_at = now() WHERE entry_id = $1",
        [job.entry_id]
      );
      processed++;
    } catch (e) {
      console.error(`Embedding failed for entry ${job.entry_id}:`, e);
      await query(
        "UPDATE embedding_jobs SET status = 'pending', attempts = attempts + 1, updated_at = now() WHERE entry_id = $1",
        [job.entry_id]
      );
    }
  }

  return processed;
}

let workerInterval: ReturnType<typeof setInterval> | null = null;

export function startEmbeddingWorker(intervalMs = 3000): void {
  if (workerInterval) return;

  console.log("Embedding worker started");
  workerInterval = setInterval(async () => {
    try {
      const count = await processEmbeddingJobs();
      if (count > 0) {
        console.log(`Embedded ${count} entries`);
      }
    } catch (e) {
      console.error("Embedding worker error:", e);
    }
  }, intervalMs);
}

export function stopEmbeddingWorker(): void {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }
}
