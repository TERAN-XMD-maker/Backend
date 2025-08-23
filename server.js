import express from "express";
import bodyParser from "body-parser";
import webpush from "web-push";
import dotenv from "dotenv";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

dotenv.config();

const app = express();
app.use(bodyParser.json());

const publicVapidKey = process.env.PUBLIC_VAPID;
const privateVapidKey = process.env.PRIVATE_VAPID;

webpush.setVapidDetails(
  "mailto:youremail@example.com",
  publicVapidKey,
  privateVapidKey
);

// Open SQLite database
let db;
(async () => {
  db = await open({
    filename: "./subscriptions.db",
    driver: sqlite3.Database
  });

  await db.exec(`CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint TEXT UNIQUE,
    keys TEXT
  )`);
})();

// Subscribe route
app.post("/subscribe", async (req, res) => {
  const subscription = req.body;

  try {
    await db.run(
      "INSERT OR IGNORE INTO subscriptions (endpoint, keys) VALUES (?, ?)",
      subscription.endpoint,
      JSON.stringify(subscription.keys)
    );
    res.status(201).json({ message: "Subscribed!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to subscribe" });
  }
});

// Unsubscribe route
app.post("/unsubscribe", async (req, res) => {
  const { endpoint } = req.body;

  try {
    await db.run("DELETE FROM subscriptions WHERE endpoint = ?", endpoint);
    res.json({ message: "Unsubscribed!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to unsubscribe" });
  }
});

// Send notifications
app.get("/send", async (req, res) => {
  try {
    const rows = await db.all("SELECT * FROM subscriptions");

    const payload = JSON.stringify({
      title: "🚀 Helalink Reminder",
      body: "Helalink is launching soon — don’t miss your bonus!",
    });

    let successCount = 0;

    for (const row of rows) {
      const subscription = {
        endpoint: row.endpoint,
        keys: JSON.parse(row.keys)
      };

      try {
        await webpush.sendNotification(subscription, payload);
        successCount++;
      } catch (err) {
        console.error("Failed to send, removing:", row.endpoint);
        await db.run("DELETE FROM subscriptions WHERE endpoint = ?", row.endpoint);
      }
    }

    res.json({ success: true, sent: successCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to send notifications" });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
