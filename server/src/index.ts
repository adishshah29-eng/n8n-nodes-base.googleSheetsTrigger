import express from 'express';
import { workers } from './routes/workers.js';

const app = express();
app.use(express.json({ limit: '2mb' })); // enrollment photo travels as a data URL

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/workers', workers);

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`aotan server on :${port}`));
