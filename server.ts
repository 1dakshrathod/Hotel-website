import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import {
  BREAKFAST_PLANS,
  BREAKFAST_TIME_SLOTS,
  ROOM_CATEGORIES,
  SUPPORTED_NETBANKING_BANKS,
  TAX_RATE,
  formatDateISO,
} from './shared/hotelData.ts';
import {
  cancelBooking,
  createConfirmedBooking,
  getAvailabilityForRange,
  lookupBooking,
  subscribeAvailability,
  type CheckoutPayload,
} from './server/store.ts';

const PORT = Number(process.env.PORT ?? 3000);
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, serverDate: formatDateISO(new Date()) });
  });

  // Catalog metadata (rooms, pure veg breakfast plans, tax rate, banks)
  app.get('/api/catalog', (_req, res) => {
    res.json({
      serverDate: formatDateISO(new Date()),
      rooms: ROOM_CATEGORIES,
      breakfastPlans: BREAKFAST_PLANS,
      breakfastTimeSlots: BREAKFAST_TIME_SLOTS,
      supportedBanks: SUPPORTED_NETBANKING_BANKS,
      taxRate: TAX_RATE,
      stripeConfigured: Boolean(
        process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.trim().startsWith('sk_'),
      ),
    });
  });

  // Real-time availability snapshot for a date range
  app.get('/api/availability', (req, res) => {
    try {
      const startParam =
        typeof req.query.start === 'string' && req.query.start.length > 0
          ? req.query.start
          : formatDateISO(new Date());
      const daysParam = typeof req.query.days === 'string' ? Number(req.query.days) : 45;
      const days = Number.isFinite(daysParam) ? daysParam : 45;

      const availability = getAvailabilityForRange(startParam, days);
      res.json({
        start: startParam,
        days: availability.length,
        generatedAt: new Date().toISOString(),
        availability,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to fetch room availability.';
      res.status(400).json({ error: message });
    }
  });

  // Real-time Server-Sent Events stream for instant calendar synchronization
  app.get('/api/availability/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    res.write(`data: ${JSON.stringify({ type: 'connected', updatedAt: new Date().toISOString() })}\n\n`);

    const unsubscribe = subscribeAvailability((payload) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    });

    const heartbeat = setInterval(() => {
      res.write(`: heartbeat\n\n`);
    }, 25000);

    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  // Atomic checkout + online payment processing
  app.post('/api/bookings/checkout', async (req, res) => {
    try {
      const body = req.body as CheckoutPayload;
      if (!body || typeof body !== 'object' || !body.payment || typeof body.payment !== 'object') {
        res.status(400).json({ error: 'Invalid booking checkout request.' });
        return;
      }
      const booking = await createConfirmedBooking(body);
      res.status(201).json({ booking });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to process payment and booking.';
      res.status(400).json({ error: message });
    }
  });

  // Verified booking lookup (requires matching bookingRef + guestEmail)
  app.get('/api/bookings/lookup', (req, res) => {
    const ref = typeof req.query.ref === 'string' ? req.query.ref : '';
    const email = typeof req.query.email === 'string' ? req.query.email : '';
    if (!ref.trim() || !email.trim()) {
      res.status(400).json({ error: 'Both booking reference and guest email are required.' });
      return;
    }
    const booking = lookupBooking(ref, email);
    if (!booking) {
      res.status(404).json({ error: 'No matching reservation found for that reference and email.' });
      return;
    }
    res.json({ booking });
  });

  // Verified cancellation & instant room release
  app.post('/api/bookings/:ref/cancel', async (req, res) => {
    try {
      const ref = req.params.ref ?? '';
      const email = typeof req.body?.email === 'string' ? req.body.email : '';
      if (!ref.trim() || !email.trim()) {
        res.status(400).json({ error: 'Booking reference and guest email are required to cancel.' });
        return;
      }
      const booking = await cancelBooking(ref, email);
      res.json({ booking });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to cancel reservation.';
      res.status(400).json({ error: message });
    }
  });

  if (!IS_PRODUCTION) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexHtml = path.resolve(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Sattvika House server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
