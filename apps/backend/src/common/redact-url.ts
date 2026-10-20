/**
 * Query parameters that carry credentials. Their values never reach a log line or an
 * error body: the Bee webhook accepts its shared secret as `?secret=`, and any other
 * token in a URL deserves the same care.
 */
const SENSITIVE_PARAM =
  /^(secret|token|access_token|refresh_token|id_token|api_key|apikey|key|password|signature|sig|code)$/i;

/** The URL with sensitive query values replaced by `[redacted]`. Path and other params kept. */
export function redactUrl(url: string | undefined): string {
  if (!url) return '';
  const q = url.indexOf('?');
  if (q === -1) return url;
  const hashAt = url.indexOf('#', q);
  const query = url.slice(q + 1, hashAt === -1 ? undefined : hashAt);
  const redacted = query
    .split('&')
    .map((pair) => {
      const eq = pair.indexOf('=');
      const rawName = eq === -1 ? pair : pair.slice(0, eq);
      let name = rawName;
      try {
        name = decodeURIComponent(rawName.replace(/\+/g, ' '));
      } catch {
        // Malformed escape: judge the raw name.
      }
      return SENSITIVE_PARAM.test(name.trim()) ? `${rawName}=[redacted]` : pair;
    })
    .join('&');
  return `${url.slice(0, q)}?${redacted}${hashAt === -1 ? '' : url.slice(hashAt)}`;
}
