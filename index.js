const express = require('express');
const webpush = require('web-push');
const cron = require('node-cron');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// --- VAPID key generation and loading ---
const keyFile = './vapid-keys.json';
let vapidKeys;

if (fs.existsSync(keyFile)) {
  vapidKeys = JSON.parse(fs.readFileSync(keyFile));
} else {
  vapidKeys = webpush.generateVAPIDKeys();
  fs.writeFileSync(keyFile, JSON.stringify(vapidKeys, null, 2));
}

webpush.setVapidDetails(
  'mailto:teranxd11@gmail.com', // change to your email if desired
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

// --- Expose public key endpoint for frontend ---
app.get('/vapidPublic', (req, res) => {
  res.json({ publicKey: vapidKeys.publicKey });
});

// --- Persistent subscriptions ---
const subsFile = './subscriptions.json';
let subscriptions = fs.existsSync(subsFile)
  ? JSON.parse(fs.readFileSync(subsFile))
  : [];

function saveSubscriptions() {
  fs.writeFileSync(subsFile, JSON.stringify(subscriptions, null, 2));
}

// --- Receive push subscriptions from frontend ---
app.post('/subscribe', (req, res) => {
  const subscription = req.body;
  if (!subscriptions.find(sub => JSON.stringify(sub) === JSON.stringify(subscription))) {
    subscriptions.push(subscription);
    saveSubscriptions();
    console.log('New subscription saved. Total:', subscriptions.length);
  } else {
    console.log('Subscription already exists.');
  }
  res.status(201).json({ message: 'Subscribed!' });
});

// --- Helper to send notifications (no removal of invalid subs per request) ---
async function sendNotificationToAll(payload) {
  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(sub, payload);
    } catch (err) {
      // Log errors but DO NOT remove subscriptions
      console.error('Push error (not removed):', err && (err.stack || err.message || err));
    }
  }
}

// --- Countdown calculation (to 13 Sept 2025 UTC) ---
function getCountdownParts() {
  const now = new Date();
  const target = new Date('2025-09-13T00:00:00Z'); // launch date (UTC)
  const diffMs = Math.max(target - now, 0);

  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diffMs / (1000 * 60)) % 60);

  return { days, hours, minutes, totalMs: diffMs };
}

// --- Build time-of-day message variants with countdown ---
function buildMessageVariant(slot) {
  const { days, hours, minutes, totalMs } = getCountdownParts();
  const countdownText = `⏳ ${days}d ${hours}h ${minutes}m left`;

  // You can customize emojis/text per slot
  if (slot === 'morning') {
    return {
      title: 'Good Morning — Launch Countdown!',
      body: `Good morning! HELALINK launches soon. REG FEE: 550. ${countdownText}. Ready to secure your spot?`
    };
  } else if (slot === 'afternoon') {
    return {
      title: 'Afternoon Reminder — Don’t Miss Out',
      body: `Afternoon! HELALINK launches 13 Sep. REG FEE: 550. ${countdownText}. Join the movement and prepare to earn!`
    };
  } else if (slot === 'evening') {
    return {
      title: 'Evening Alert — Last Checks',
      body: `Evening! Final checks before HELALINK launch. REG FEE: 550. ${countdownText}. Tomorrow could be day 1 of your 2K days!`
    };
  } else {
    return {
      title: 'HELALINK Notification',
      body: `HELALINK launch on 13 Sep. ${countdownText}. REG FEE: 550.`
    };
  }
}

// --- Manual test endpoint ---
app.post('/notify', async (req, res) => {
  // allow optional ?slot=morning|afternoon|evening or body override
  const slot = (req.query.slot || 'custom').toLowerCase();
  let payloadObj;

  if (slot === 'custom' && req.body && req.body.message) {
    payloadObj = { title: req.body.title || 'Manual Notification', body: req.body.message };
  } else if (['morning', 'afternoon', 'evening'].includes(slot)) {
    payloadObj = buildMessageVariant(slot);
  } else {
    payloadObj = buildMessageVariant('morning'); // default
  }

  const payload = JSON.stringify(payloadObj);
  await sendNotificationToAll(payload);
  res.json({ message: 'Notifications sent (manual)', payload: payloadObj });
});

// --- Scheduled notifications 3 times a day (UTC) with different text ---
const scheduleSlots = [
  { cron: '0 9 * * *', slot: 'morning' },   // 09:00 UTC
  { cron: '0 13 * * *', slot: 'afternoon' },// 13:00 UTC
  { cron: '0 17 * * *', slot: 'evening' }   // 17:00 UTC
];

scheduleSlots.forEach(({ cron: cronTime, slot }) => {
  cron.schedule(cronTime, async () => {
    const msg = buildMessageVariant(slot);
    const payload = JSON.stringify(msg);
    console.log(`[${new Date().toISOString()}] Sending ${slot} notification:`, msg.title);
    await sendNotificationToAll(payload);
  }, {
    scheduled: true,
    timezone: 'UTC' // ensure runs in UTC
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
