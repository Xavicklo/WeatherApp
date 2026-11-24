/**
 * fetch() wrapper with a timeout and consistent errors.
 * Uses the fetch built into Node 18+, so no HTTP client dependency is needed.
 */
class UpstreamError extends Error {
  constructor(message, { status = 502, cause } = {}) {
    super(message);
    this.name = "UpstreamError";
    this.status = status;
    this.cause = cause;
  }
}

async function getJson(url, { timeoutMs = 8000, fetchImpl = globalThis.fetch, headers } = {}) {
  let response;
  try {
    response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs), headers });
  } catch (err) {
    const timedOut = err && (err.name === "TimeoutError" || err.name === "AbortError");
    throw new UpstreamError(
      timedOut ? "Weather service timed out, please try again." : "Unable to reach the weather service.",
      { status: timedOut ? 504 : 502, cause: err }
    );
  }

  if (!response.ok) {
    throw new UpstreamError(`Weather service responded with ${response.status}.`, { status: 502 });
  }

  try {
    return await response.json();
  } catch (err) {
    throw new UpstreamError("Weather service returned an invalid response.", { status: 502, cause: err });
  }
}

module.exports = { getJson, UpstreamError };
