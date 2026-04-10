function createHttpError(message, code, statusCode) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

class InMemoryRateLimiter {
  constructor({ windowMs, max }) {
    this.windowMs = windowMs;
    this.max = max;
    this.store = new Map();
  }

  consume(key) {
    const now = Date.now();
    const entry = this.store.get(key);
    if (!entry || entry.resetAt <= now) {
      this.store.set(key, { count: 1, resetAt: now + this.windowMs });
      return { allowed: true, remaining: this.max - 1, resetAt: now + this.windowMs };
    }

    entry.count += 1;
    this.store.set(key, entry);
    return {
      allowed: entry.count <= this.max,
      remaining: Math.max(0, this.max - entry.count),
      resetAt: entry.resetAt,
    };
  }
}

export function createRateLimitMiddleware({ windowMs, max, prefix, message, code }) {
  const limiter = new InMemoryRateLimiter({ windowMs, max });

  return (req, res, next) => {
    const key = `${prefix}:${req.ip}`;
    const result = limiter.consume(key);
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(result.remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)));

    if (!result.allowed) {
      return next(createHttpError(message, code, 429));
    }

    next();
  };
}
