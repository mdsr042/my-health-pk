import crypto from 'node:crypto';

function serializeError(error) {
  if (!error) return undefined;
  return {
    name: error.name,
    message: error.message,
    code: error.code,
    statusCode: error.statusCode,
    stack: process.env.NODE_ENV === 'production' ? undefined : error.stack,
  };
}

function write(level, event, payload = {}) {
  const record = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...payload,
  };
  const line = JSON.stringify(record);
  if (level === 'error') {
    console.error(line);
  } else {
    console.log(line);
  }
}

export function createRequestId() {
  return crypto.randomUUID();
}

export function requestContextMiddleware(req, res, next) {
  req.requestId = createRequestId();
  res.setHeader('X-Request-Id', req.requestId);
  next();
}

export function apiAccessLogMiddleware(req, res, next) {
  const startedAt = Date.now();
  res.on('finish', () => {
    if (!req.path.startsWith('/api')) return;
    write('info', 'api_request', {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
      ip: req.ip,
      userId: req.auth?.user?.id ?? null,
    });
  });
  next();
}

export function logInfo(event, payload = {}) {
  write('info', event, payload);
}

export function logWarn(event, payload = {}) {
  write('warn', event, payload);
}

export function logError(event, error, payload = {}) {
  write('error', event, {
    ...payload,
    error: serializeError(error),
  });
}
