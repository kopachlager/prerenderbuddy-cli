import { assertPublicUrl, normalizePublicUrl } from './url-safety.js';

const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);
const DEFAULT_MAX_CHARS = 500_000;

export async function readBoundedText(response, maxChars = DEFAULT_MAX_CHARS) {
  return (await readBoundedResult(response, maxChars)).text;
}

function abortError() {
  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
}

async function waitForAbort(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) throw abortError();

  let onAbort;
  const aborted = new Promise((_, reject) => {
    onAbort = () => reject(abortError());
    signal.addEventListener('abort', onAbort, { once: true });
  });

  try {
    return await Promise.race([promise, aborted]);
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}

async function cancelBody(body, signal) {
  if (!body) return;
  const cancellation = body.cancel().catch(() => {});
  await waitForAbort(cancellation, signal);
}

async function readBoundedResult(response, maxChars = DEFAULT_MAX_CHARS, signal) {
  if (!response.body) {
    const text = await waitForAbort(response.text(), signal);
    return { text: text.slice(0, maxChars), truncated: text.length > maxChars };
  }

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let output = '';
  let completed = false;

  try {
    while (output.length <= maxChars) {
      const { done, value } = await waitForAbort(reader.read(), signal);
      if (done) {
        completed = true;
        break;
      }
      output += decoder.decode(value, { stream: true });
    }
    output += decoder.decode();
    return { text: output.slice(0, maxChars), truncated: output.length > maxChars };
  } finally {
    if (!completed) {
      const cancellation = reader.cancel().catch(() => {});
      if (signal?.aborted) void cancellation;
      else await waitForAbort(cancellation, signal);
    }
    reader.releaseLock();
  }
}

export async function fetchPublicText(target, options = {}) {
  const {
    userAgent,
    accept = 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5',
    timeoutMs = 15_000,
    maxChars = DEFAULT_MAX_CHARS,
    maxRedirects = 5,
    fetchFn = fetch,
    assertUrlFn = assertPublicUrl,
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
  } = options;

  let currentUrl = normalizePublicUrl(target);
  const controller = new AbortController();
  const timeout = setTimeoutFn(() => controller.abort(), timeoutMs);

  try {
    for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
      await waitForAbort(Promise.resolve().then(() => assertUrlFn(currentUrl)), controller.signal);
      const response = await waitForAbort(fetchFn(currentUrl, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          Accept: accept,
          'User-Agent': userAgent || 'PrerenderBuddyCLI/0.1 (+https://prerenderbuddy.com)',
        },
      }), controller.signal);

      if (!REDIRECT_CODES.has(response.status)) {
        const body = await readBoundedResult(response, maxChars, controller.signal);
        return {
          requestedUrl: normalizePublicUrl(target),
          finalUrl: currentUrl,
          statusCode: response.status,
          ok: response.ok,
          contentType: response.headers.get('content-type') || '',
          text: body.text,
          truncated: body.truncated,
          maxChars,
        };
      }

      await cancelBody(response.body, controller.signal);
      const location = response.headers.get('location');
      if (!location) {
        return {
          requestedUrl: normalizePublicUrl(target),
          finalUrl: currentUrl,
          statusCode: response.status,
          ok: response.ok,
          contentType: response.headers.get('content-type') || '',
          text: '',
          truncated: false,
          maxChars,
        };
      }
      if (redirects === maxRedirects) throw new Error('Too many redirects while checking this URL.');
      currentUrl = normalizePublicUrl(new URL(location, currentUrl).toString());
    }

    throw new Error('Too many redirects while checking this URL.');
  } catch (error) {
    if (controller.signal.aborted || error?.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs} ms.`);
    }
    throw error;
  } finally {
    clearTimeoutFn(timeout);
  }
}
