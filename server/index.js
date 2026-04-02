import express from 'express';
import cors from 'cors';
import { readSettings, readState, writeSettings, writeState } from './db.js';

const app = express();
const port = Number(process.env.API_PORT || 4001);

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/state', (_req, res) => {
  res.json({ data: readState() });
});

app.post('/api/bootstrap', (req, res) => {
  const existing = readState();

  if (existing) {
    return res.json({ data: existing, bootstrapped: false });
  }

  if (!req.body?.patients || !req.body?.appointments || !req.body?.notes || !req.body?.drafts) {
    return res.status(400).json({ error: 'Invalid bootstrap payload' });
  }

  writeState(req.body);
  return res.status(201).json({ data: req.body, bootstrapped: true });
});

app.put('/api/state', (req, res) => {
  if (!req.body?.patients || !req.body?.appointments || !req.body?.notes || !req.body?.drafts) {
    return res.status(400).json({ error: 'Invalid state payload' });
  }

  writeState(req.body);
  res.json({ ok: true });
});

app.get('/api/settings', (_req, res) => {
  res.json({ data: readSettings() });
});

app.put('/api/settings', (req, res) => {
  writeSettings(req.body ?? {});
  res.json({ ok: true });
});

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});

