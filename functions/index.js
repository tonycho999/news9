const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
admin.initializeApp();
exports.getNewsProxy = functions.https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  try {
    const idToken = req.headers.authorization?.split("Bearer ")[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const userDoc = await admin.firestore().collection("users").doc(decodedToken.uid).get();
    const newsKey = userDoc.data().newsKey || userDoc.data().apiKey;
    const { query } = req.body.data;
    const gnewsRes = await axios.get(`https://gnews.io/api/v4/search?q=${encodeURIComponent(query)}&lang=en&country=ph&max=10&apikey=${newsKey}`);
    res.status(200).send({ data: { articles: gnewsRes.data.articles } });
  } catch (error) { res.status(500).send({ error: { message: error.message } }); }
});
exports.createJournalistAccount = functions.https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  try {
    const idToken = req.headers.authorization?.split("Bearer ")[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    if (decodedToken.email !== "admin@test.com") throw new Error("Admin access only.");
    const { email, password, newsKey, geminiKey } = req.body.data;
    const userRecord = await admin.auth().createUser({ email, password });
    await admin.firestore().collection("users").doc(userRecord.uid).set({ email, newsKey, geminiKey, needsPasswordChange: true });
    res.status(200).send({ data: { success: true } });
  } catch (error) { res.status(500).send({ error: { message: error.message } }); }
});
