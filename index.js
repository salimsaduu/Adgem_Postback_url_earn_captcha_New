// index.js (improved, paste this into your repo)
import express from "express";
import admin from "firebase-admin";

const app = express();

function initFirebaseFromEnv() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT environment variable is NOT set.");
  }

  // Helpful log: length (content not logged)
  console.log("FIREBASE_SERVICE_ACCOUNT length:", raw.length);

  // Try to parse JSON safely
  try {
    const serviceAccount = JSON.parse(raw);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log("Firebase Admin initialized (from ENV).");
    return;
  } catch (err) {
    // If parsing fails, show helpful hint (do NOT print raw)
    console.error("Failed to JSON.parse(FIREBASE_SERVICE_ACCOUNT).");
    console.error("Error message:", err.message);
    console.error("Hint: Ensure the JSON is ONE LINE and private_key contains literal \\n sequences (not actual new lines).");
    throw err;
  }
}

// Optional: allow loading from a file path (for local testing only)
// set FIREBASE_SERVICE_ACCOUNT_FILE=/path/to/key.json in Vercel if you prefer (not recommended for production)
function initFirebaseFromFileFallback() {
  const filePath = process.env.FIREBASE_SERVICE_ACCOUNT_FILE;
  if (!filePath) {
    return false;
  }
  try {
    // synchronous require is OK for JSON file
    const serviceAccount = JSON.parse(require('fs').readFileSync(filePath, 'utf8'));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log("Firebase Admin initialized (from FILE).");
    return true;
  } catch (err) {
    console.error("Failed to initialize Firebase from file fallback:", err.message);
    return false;
  }
}

// Initialize Firebase with robust error messages
try {
  initFirebaseFromEnv();
} catch (e) {
  const fallbackOk = initFirebaseFromFileFallback();
  if (!fallbackOk) {
    console.error("Firebase initialization failed. Exiting.");
    // Do not crash the whole process on Vercel — keep server running but respond with 500 for API calls.
  }
}

const db = admin.firestore();

// Conversion rate: $1 -> 2000 coins
const COINS_PER_USD = 2000;

app.get("/api/adgem", async (req, res) => {
  try {
    if (!admin.apps.length) {
      console.error("Firebase Admin not initialized. Check FIREBASE_SERVICE_ACCOUNT.");
      return res.status(500).send("Server configuration error");
    }

    const player_id = req.query.player_id || req.query.playerid || req.query.playerId;
    const payoutUsdRaw = req.query.payout_usd || req.query.amount || req.query.usd || "0";

    if (!player_id) return res.status(400).send("Missing player_id");

    const payoutUsd = parseFloat(payoutUsdRaw);
    if (isNaN(payoutUsd) || payoutUsd <= 0) {
      console.warn("Invalid payout_usd received:", payoutUsdRaw);
      return res.status(400).send("Invalid payout amount");
    }

    const coins = Math.round(payoutUsd * COINS_PER_USD);
    if (coins <= 0) return res.status(400).send("Converted coins zero");

    const userRef = db.collection("users").doc(player_id);

    // If user doc may not exist, use set with merge true as fallback
    await userRef.set({
      balance: admin.firestore.FieldValue.increment(coins)
    }, { merge: true });

    await db.collection("adgem_logs").add({
      player_id,
      payout_usd: payoutUsd,
      coins,
      source: "adgem",
      raw_query: req.query,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`Credited ${coins} coins to ${player_id} (USD ${payoutUsd})`);
    return res.status(200).send("OK");
  } catch (err) {
    console.error("Postback handler error:", err && err.message ? err.message : err);
    return res.status(500).send("Server Error");
  }
});

app.get("/", (req, res) => res.send("AdGem Postback API Working ✅"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
