import { assertPublicUrl, normalizePublicUrl } from './url-safety.js';

const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);
const DEFAULT_MAX_CHARS = 500_000;

export async function readBoundedText(response, maxChars = DEFAULT_MAX_CHARS) {
  return (await readBoundedResult(response, maxChars)).text;
}

async function readBoundedResult(response, maxChars = DEFAULT_MAX_CHARS) {
  if (!response.body) {
    const text = await response.text();
    return { text: text.slice(0, maxChars), truncated: text.length > maxChars };
  }

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let output = '';
  let completed = false;

  try {
    while (output.length <= maxChars) {
      const { done, value } = await reader.read();
      if (done) {
        completed = true;
        break;
      }
      output += decoder.decode(value, { stream: true });
    }
    output += decoder.decode();
    return { text: output.slice(0, maxChars), truncated: output.length > maxChars };
  } finally {
    if (!completed) await reader.cancel().catch(() => {});
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
  } = options;

  let currentUrl = normalizePublicUrl(target);

  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    await assertUrlFn(currentUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response;

    try {
      response = await fetchFn(currentUrl, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          Accept: accept,
          'User-Agent': userAgent || 'PrerenderBuddyCLI/0.1 (+https://prerenderbuddy.com)',
        },
      });
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error(`Request timed out after ${timeoutMs} ms.`);
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    if (!REDIRECT_CODES.has(response.status)) {
      const body = await readBoundedResult(response, maxChars);
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
}
