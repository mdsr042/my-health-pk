import { describe, expect, it } from 'vitest';
import { createRateLimitMiddleware } from '../../server/rateLimit.js';
import { validatePasswordPolicy } from '../../server/validation.js';

function createReq(ip = '127.0.0.1') {
  return { ip, path: '/api/auth/login', method: 'POST' };
}

function createRes() {
  const headers = new Map();
  return {
    headers,
    setHeader(name, value) {
      headers.set(name, value);
    },
  };
}

describe('security helpers', () => {
  it('rejects weak passwords', () => {
    expect(validatePasswordPolicy('short')).toContain('at least 8');
    expect(validatePasswordPolicy('lowercase1')).toContain('uppercase');
    expect(validatePasswordPolicy('UPPERCASE1')).toContain('lowercase');
    expect(validatePasswordPolicy('NoNumbers')).toContain('number');
    expect(validatePasswordPolicy('StrongPass1')).toBe('');
  });

  it('rate limits repeated requests', () => {
    const middleware = createRateLimitMiddleware({
      windowMs: 60_000,
      max: 2,
      prefix: 'auth',
      message: 'Limited',
      code: 'RATE_LIMITED',
    });

    let passed = 0;
    middleware(createReq(), createRes(), error => {
      if (!error) passed += 1;
    });
    middleware(createReq(), createRes(), error => {
      if (!error) passed += 1;
    });
    middleware(createReq(), createRes(), error => {
      expect(error).toMatchObject({ code: 'RATE_LIMITED', statusCode: 429 });
    });

    expect(passed).toBe(2);
  });
});
