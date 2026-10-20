import { redactUrl } from './redact-url';

describe('redactUrl', () => {
  it('redacts secret and token query values, keeping everything else', () => {
    expect(redactUrl('/bee/webhook?secret=s3cr3t')).toBe('/bee/webhook?secret=[redacted]');
    expect(redactUrl('/ring/webhook?x=1&Token=abc&access_token=def#frag')).toBe(
      '/ring/webhook?x=1&Token=[redacted]&access_token=[redacted]#frag',
    );
    expect(redactUrl('/a?%73ecret=encoded-name')).toBe('/a?%73ecret=[redacted]');
  });

  it('leaves URLs without sensitive params unchanged', () => {
    expect(redactUrl('/me/visits?status=pending')).toBe('/me/visits?status=pending');
    expect(redactUrl('/health')).toBe('/health');
    expect(redactUrl(undefined)).toBe('');
  });
});
