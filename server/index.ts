// MUST be first — populates process.env before route modules load their SDK clients.
import './creds-loader.js';

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import normalStripeRouter from './normal/stripe.js';
import normalAdyenRouter from './normal/adyen.js';
import prismStripeRouter from './prism/stripe.js';
import prismAdyenRouter from './prism/adyen.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const clientPath = path.join(__dirname, '..', 'client');
app.use(express.static(clientPath));

app.use('/api/normal/stripe', normalStripeRouter);
app.use('/api/normal/adyen', normalAdyenRouter);
app.use('/api/prism/stripe', prismStripeRouter);
app.use('/api/prism/adyen', prismAdyenRouter);

app.get('/', (_req, res) => res.sendFile(path.join(clientPath, 'index.html')));
app.get('/normal/stripe', (_req, res) => res.sendFile(path.join(clientPath, 'normal', 'stripe.html')));
app.get('/normal/adyen', (_req, res) => res.sendFile(path.join(clientPath, 'normal', 'adyen.html')));
app.get('/prism/stripe', (_req, res) => res.sendFile(path.join(clientPath, 'prism', 'stripe.html')));
app.get('/prism/adyen', (_req, res) => res.sendFile(path.join(clientPath, 'prism', 'adyen.html')));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Server Error]', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

const PORT = parseInt(process.env.PORT || '3000', 10);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\nDemo running at http://localhost:${PORT}\n`);
  console.log('Pages:');
  console.log(`  http://localhost:${PORT}/                 - Landing`);
  console.log(`  http://localhost:${PORT}/normal/stripe    - Direct Stripe integration`);
  console.log(`  http://localhost:${PORT}/normal/adyen     - Direct Adyen integration`);
  console.log(`  http://localhost:${PORT}/prism/stripe     - Prism + Stripe`);
  console.log(`  http://localhost:${PORT}/prism/adyen      - Prism + Adyen`);
  console.log('\nAPI:');
  console.log('  POST /api/normal/stripe/intent');
  console.log('  POST /api/normal/adyen/session');
  console.log('  POST /api/prism/stripe/sdk-session');
  console.log('  POST /api/prism/stripe/authorize');
  console.log('  POST /api/prism/adyen/sdk-session');
  console.log('  POST /api/prism/adyen/authorize');
});
