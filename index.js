import express from "express";
import admin from "firebase-admin";

const app = express();

// Firebase initialization
function initFirebase() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT not set");

  const serviceAccount = JSON.parse(raw);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  console.log("✅ Firebase initialized");
}

try {
  initFirebase();
} catch (err) {
  console.error("Firebase init error:", err.message);
}

const db = admin.firestore();
const COINS_PER_USD = 2000;

// === AdGem Postback Route ===
app.get("/api/adgem", async (req, res) => {
  try {
    if (!admin.apps.length) {
      return res.status(500).send("❌ Firebase not initialized");
    }

    const player_id = req.query.player_id || req.query.playerid || req.query.playerId;
    const payoutUsdRaw = req.query.payout_usd || req.query.amount || req.query.usd || "0";

    if (!player_id) return res.status(400).send("❌ player_id missing");

    const payoutUsd = parseFloat(payoutUsdRaw);
    if (isNaN(payoutUsd) || payoutUsd <= 0)
      return res.status(400).send("❌ Invalid payout_usd");

    const coins = Math.round(payoutUsd * COINS_PER_USD);

    const userRef = db.collection("users").doc(player_id);
    await userRef.set(
      { balance: admin.firestore.FieldValue.increment(coins) },
      { merge: true }
    );

    await db.collection("adgem_logs").add({
      player_id,
      payout_usd: payoutUsd,
      coins,
      source: "adgem",
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`✅ ${coins} coins added to ${player_id}`);
    // 👇 Yahan message badla gaya hai
    return res
      .status(200)
      .send(`✅ ${coins} coins user ${player_id} ke wallet me credit ho gaye hain`);
  } catch (err) {
    console.error("Postback error:", err.message);
    return res.status(500).send("❌ Server Error");
  }
});

app.get("/", (req, res) => res.send("AdGem Postback API Working ✅"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
