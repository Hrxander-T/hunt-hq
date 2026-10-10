// Client for the local PokeMMO card-reader API (contract: poke-reader/API_INTEGRATION.md).
// Knows nothing about the app's own types: turning a ReaderCard into app data is src/dump/mapping.ts.

export type ReaderStatus = 'ok' | 'review' | 'not_found' | 'error';
/** The game's stat names. SPD is SPEED (not Sp. Def). */
export type ReaderStatKey = 'ATK' | 'DEF' | 'SPD' | 'SPATK' | 'SPDEF' | 'HP';
export interface ReaderStat { stat: number | null; iv: number | null; ev: number | null }
export interface ReaderCard {
  status: ReaderStatus; source?: 'cropped' | 'screenshot'; image?: string;
  name?: string | null; level?: number | null; gender?: 'M' | 'F' | 'N' | null; shiny?: boolean; types?: string[];
  ability?: string | null; nature?: string | null; region?: string | null; hidden_power?: string | null; hp_max?: number | null;
  stats?: Partial<Record<ReaderStatKey, ReaderStat>>;
  warnings?: string[]; corrected?: string[];
  detect?: { score: number; scale: number; box: [number, number, number, number] }; // box is in ORIGINAL screenshot pixels
  level_inferred?: boolean; name_from_stats?: boolean;
  filled?: unknown; shiny_px?: unknown; nature_check?: unknown; debug?: unknown; // optional extras, shape not guaranteed
}

export type ReaderErrorKind = 'config' | 'network' | 'timeout' | 'aborted' | 'http' | 'bad_response';
export class ReaderError extends Error {
  kind: ReaderErrorKind; status?: number;
  constructor(kind: ReaderErrorKind, message: string, status?: number) {
    super(message); this.name = 'ReaderError'; this.kind = kind; this.status = status;
  }
}

export const READ_TIMEOUT_MS = 120_000; // the slow fallback reader needs over a minute
export const HEALTH_TIMEOUT_MS = 5_000;

// Read lazily so tests (and a changed .env) are picked up.
const baseUrl = () => String(import.meta.env.VITE_READER_URL ?? '').trim().replace(/\/+$/, '');
export const readerConfigured = () => baseUrl() !== '';
// ngrok's free domain answers browsers with an HTML warning page unless this header is sent.
// VITE_READER_API_KEY is for local dev only: anything in a VITE_ variable ends up in the public JS bundle.
const headers = (): Record<string, string> => {
  const h: Record<string, string> = { 'ngrok-skip-browser-warning': '1' };
  const key = String(import.meta.env.VITE_READER_API_KEY ?? '').trim();
  if (key) h['x-api-key'] = key;
  return h;
};

function httpMessage(status: number): string {
  switch (status) {
    case 400: return 'The reader could not open that file as an image.';
    case 401: return 'The reader refused the request (API key missing or wrong).';
    case 413: return 'That image is too big for the reader.';
    case 500: return 'The reader failed while processing that image. Try again.';
    default: return `The reader answered with an error (HTTP ${status}).`;
  }
}

// One request, timeout and caller cancel included, body parsed inside the same guard so a stalled body is cut off too.
async function call(path: string, init: RequestInit, ms: number, outer?: AbortSignal): Promise<unknown> {
  const base = baseUrl();
  if (!base) throw new ReaderError('config', 'The reader address is not set (VITE_READER_URL).');
  const ctl = new AbortController(); let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctl.abort(); }, ms);
  const onAbort = () => ctl.abort();
  if (outer?.aborted) ctl.abort(); else outer?.addEventListener('abort', onAbort, { once: true });
  try {
    const res = await fetch(base + path, { ...init, headers: headers(), signal: ctl.signal });
    if (!res.ok) throw new ReaderError('http', httpMessage(res.status), res.status);
    try { return await res.json(); }
    catch (e) {
      if (ctl.signal.aborted) throw e;
      throw new ReaderError('bad_response', 'The reader answered with something that is not JSON (check the reader address).');
    }
  } catch (e) {
    if (e instanceof ReaderError) throw e;
    if (timedOut) throw new ReaderError('timeout', 'The reader took too long to answer.');
    if (ctl.signal.aborted) throw new ReaderError('aborted', 'Cancelled.');
    throw new ReaderError('network', 'Could not reach the reader. Is the PC on and the tunnel running?');
  } finally { clearTimeout(timer); outer?.removeEventListener('abort', onAbort); }
}

/** Every card found in one screenshot, best first. Throws ReaderError. */
export async function readCards(file: File, signal?: AbortSignal): Promise<ReaderCard[]> {
  const fd = new FormData();
  fd.append('file', file, file.name || 'screenshot.png');
  const j = (await call('/read_all', { method: 'POST', body: fd }, READ_TIMEOUT_MS, signal)) as { cards?: unknown } | null;
  if (!j || !Array.isArray(j.cards) || j.cards.length === 0) throw new ReaderError('bad_response', 'The reader answered without any cards.');
  return j.cards as ReaderCard[];
}

/** Never throws: the badge only needs up or down. */
export async function health(signal?: AbortSignal): Promise<{ ok: boolean; pokemon_loaded?: number; error?: string }> {
  try {
    const j = (await call('/health', { method: 'GET' }, HEALTH_TIMEOUT_MS, signal)) as { ok?: boolean; pokemon_loaded?: number } | null;
    return { ok: !!j?.ok, pokemon_loaded: j?.pokemon_loaded };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}
