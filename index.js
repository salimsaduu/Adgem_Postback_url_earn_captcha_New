import express from "express";
import admin from "firebase-admin";

const app = express();

// Firebase Admin init (FIREBASE_SERVICE_ACCOUNT env me hona chahiye)
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

// Conversion rate: $1 -> 2000 coins
const COINS_PER_USD = 2000;

app.get("/api/adgem", async (req, res) => {
  try {
    // AdGem can send different param names; prefer payout_usd, fallback to amount or usd
    const player_id = req.query.player_id || req.query.playerid || req.query.playerId;
    const payoutUsdRaw = req.query.payout_usd || req.query.amount || req.query.usd || "0";

    if (!player_id) return res.status(400).send("Missing player_id");
    const payoutUsd = parseFloat(payoutUsdRaw);
    if (isNaN(payoutUsd) || payoutUsd <= 0) {
      console.warn("Invalid payout_usd:", payoutUsdRaw);
      return res.status(400).send("Invalid payout amount");
    }

    // Convert USD to coins
    const coins = Math.round(payoutUsd * COINS_PER_USD);
    if (coins <= 0) return res.status(400).send("Converted coins zero");

    const userRef = db.collection("users").doc(player_id);

    // Increment balance
    await userRef.update({
      balance: admin.firestore.FieldValue.increment(coins)
    });

    // Log the transaction for audit
    await db.collection("adgem_logs").add({
      player_id,
      payout_usd: payoutUsd,
      coins,
      source: "adgem",
      raw_query: req.query,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`✅ Credited ${coins} coins (USD ${payoutUsd}) to user: ${player_id}`);
    return res.status(200).send("OK");
  } catch (err) {
    console.error("Postback error:", err);
    return res.status(500).send("Server Error");
  }
});

app.get("/", (req, res) => res.send("AdGem Postback API Working ✅"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
