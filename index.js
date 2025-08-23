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
  fs.writeFileSync(keyFile, JSON.stringify(vapidKeys));
}

webpush.setVapidDetails(
  'mailto:teranxd11@gmail.com', // Change to your email
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

// --- Expose public key endpoint for frontend ---
app.get('/vapidPublic', (req, res) => {
  res.json({ publicKey: vapidKeys.publicKey });
});

// --- In-memory store for subscriptions ---
const subscriptions = [];

// --- Endpoint to receive push subscriptions from frontend ---
app.post('/subscribe', (req, res) => {
  const subscription = req.body;
  // Avoid duplicates (simple check)
  if (!subscriptions.find(sub => JSON.stringify(sub) === JSON.stringify(subscription))) {
    subscriptions.push(subscription);
  }
  res.status(201).json({ message: 'Subscribed!' });
});

// --- Test endpoint to send notifications immediately ---
app.post('/notify', async (req, res) => {
  const payload = JSON.stringify({
    title: "Manual Notification",
    body: "This is a manual test notification!"
  });
  const results = [];
  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(sub, payload);
      results.push({ success: true });
    } catch (err) {
      results.push({ success: false, error: err.message });
    }
  }
  res.json(results);
});

// --- Scheduled notification every day at 9AM UTC ---
cron.schedule('0 9 * * *', async () => {
  const payload = JSON.stringify({
    title: "Daily Notification",
    body: "This is your scheduled notification!"
  });
  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(sub, payload);
    } catch (err) {
      // Optionally log errors or remove invalid subscriptions
      console.error('Push error:', err.message);
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server started on ${PORT}`));
