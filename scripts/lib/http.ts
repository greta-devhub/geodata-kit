import { createWriteStream, existsSync, renameSync, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/** Abort only when the server sends nothing for this long (GeoNames can be slow, but should not stop). */
const STALL_TIMEOUT_MS = 90_000;
const PROGRESS_STEP_BYTES = 25 * 1024 * 1024;
export const USER_AGENT = 'geodata-kit-generator/0.1 (open-source data build script)';

function formatMegabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Downloads `url` to `target` (written to `<target>.part` first, renamed at the
 * end, so an interrupted run never leaves a truncated file behind). Retries a
 * few times on network errors and HTTP 429/5xx.
 */
export async function downloadFile(url: string, target: string, attempts = 4): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await downloadOnce(url, target);
      return;
    } catch (error) {
      if (attempt >= attempts) throw error;
      const waitSeconds = 5 * attempt;
      console.warn(`  ${(error as Error).message}; retrying in ${waitSeconds}s (${attempt}/${attempts - 1})`);
      await new Promise((done) => setTimeout(done, waitSeconds * 1000));
    }
  }
}

async function downloadOnce(url: string, target: string): Promise<void> {
  const controller = new AbortController();
  let stallTimer = setTimeout(() => controller.abort(), STALL_TIMEOUT_MS);
  const resetStallTimer = (): void => {
    clearTimeout(stallTimer);
    stallTimer = setTimeout(() => controller.abort(), STALL_TIMEOUT_MS);
  };

  try {
    const response = await fetch(url, { signal: controller.signal, headers: { 'user-agent': USER_AGENT } });
    if (!response.ok || !response.body) throw new Error(`HTTP ${response.status} for ${url}`);

    // With content-encoding (e.g. gzip from GitHub raw), content-length is the
    // compressed size while fetch yields decompressed bytes, so it can't be checked.
    const encoded = Boolean(response.headers.get('content-encoding'));
    const total = encoded ? 0 : Number(response.headers.get('content-length')) || 0;
    let received = 0;
    let lastReported = 0;
    const body = Readable.fromWeb(response.body as import('node:stream/web').ReadableStream);
    body.on('data', (chunk: Buffer) => {
      resetStallTimer();
      received += chunk.length;
      if (received - lastReported >= PROGRESS_STEP_BYTES) {
        lastReported = received;
        console.log(`    ${formatMegabytes(received)}${total ? ` / ${formatMegabytes(total)}` : ''}`);
      }
    });

    const partial = `${target}.part`;
    await pipeline(body, createWriteStream(partial));
    if (total && statSync(partial).size !== total) {
      throw new Error(`Incomplete download of ${url}: ${statSync(partial).size} of ${total} bytes`);
    }
    renameSync(partial, target);
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`Download stalled: no data for ${STALL_TIMEOUT_MS / 1000}s (${url})`);
    throw error;
  } finally {
    clearTimeout(stallTimer);
  }
}

/** GET a URL and parse JSON, with retries; `null` on 404. */
export async function fetchJson<T>(url: string, init: RequestInit = {}, attempts = 5): Promise<T | null> {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(url, {
      ...init,
      headers: { 'user-agent': USER_AGENT, ...(init.headers ?? {}) },
    }).catch((error: Error) => ({ ok: false, status: 0, error }) as const);

    if ('error' in response) {
      if (attempt >= attempts) throw response.error;
    } else if (response.ok) {
      return (await response.json()) as T;
    } else if (response.status === 404) {
      return null;
    } else if (attempt >= attempts || (response.status !== 429 && response.status < 500)) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }
    const retryAfter = 'headers' in response ? Number(response.headers.get('retry-after')) : 0;
    const waitSeconds = retryAfter > 0 ? retryAfter : 3 * attempt;
    await new Promise((done) => setTimeout(done, waitSeconds * 1000));
  }
}

export const fileExists = (path: string): boolean => existsSync(path) && statSync(path).size > 0;
