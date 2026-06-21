const express = require('express');
const admin = require('firebase-admin');
const app = express();
app.use(express.json({ limit: '1kb' }));
admin.initializeApp({ credential: admin.credential.cert(require('./serviceAccountKey.json')) });
const db = admin.firestore();
const MEMORY_LIMIT_MB = 300;
setInterval(() => {
  const usedMB = process.memoryUsage().rss / 1024 / 1024;
  if (usedMB > MEMORY_LIMIT_MB) { process.exit(1); }
}, 30000);
app.get('/', (req, res) => res.status(200).json({ ok: true }));
app.post('/notify', async (req, res) => {
  try {
    const { to, fromName, type } = req.body;
    if (!to || !fromName || !type) return res.status(400).json({ error: 'Missing fields' });
    const userDoc = await db.doc('users/' + to).get();
    const fcmToken = userDoc.data()?.fcmToken;
    if (!fcmToken) return res.json({ sent: false, reason: 'no_fcm_token' });
    const typeLabels = { text: 'a message', image: 'an Image', video: 'a Video', audio: 'a Voice message' };
    await admin.messaging().send({
      token: fcmToken,
      notification: { title: fromName, body: fromName + ' sent ' + (typeLabels[type] || 'a message') },
      data: { type: 'new_' + type, fromName },
      android: { priority: 'high' },
      apns: { headers: { 'apns-priority': '10' }, payload: { aps: { 'content-available': 1 } } },
    });
    res.json({ sent: true });
  } catch (err) { res.status(500).json({ error: 'Internal error' }); }
});
app.listen(process.env.PORT || 3000, () => console.log('FCM relay running'));
