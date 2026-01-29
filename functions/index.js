const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

admin.initializeApp();

exports.getNewsProxy = functions.runWith({
  timeoutSeconds: 300,
  memory: "512MB"
}).https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }

  try {
    const idToken = req.headers.authorization?.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const userDoc = await admin.firestore().collection('users').doc(decodedToken.uid).get();
    const userData = userDoc.data();
    
    const { type, query, title, description, lang } = req.body.data;
    const apiKey = (userData.geminiKey || userData.apiKey).trim();

    // STEP 1: 검색어에 맞는 뉴스 리스트만 먼저 반환
    if (type === 'search') {
      const response = await axios.get(`https://gnews.io/api/v4/search?q=${encodeURIComponent(query)}&lang=en&country=ph&max=10&apikey=${(userData.newsKey || userData.apiKey).trim()}`);
      return res.status(200).send({ data: { articles: response.data.articles } });
    }

    // STEP 2: 개별 기사 요약 (앱에서 하나씩 요청함)
    if (type === 'summarize') {
      const prompt = `Summarize this Philippine news in 3 professional bullet points in ${lang}. Title: ${title}. Content: ${description}`;
      const geminiRes = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        { contents: [{ parts: [{ text: prompt }] }], safetySettings: [{ category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" }] }
      );
      const summary = geminiRes.data.candidates[0].content.parts[0].text;
      return res.status(200).send({ data: { summary } });
    }
  } catch (error) {
    res.status(500).send({ error: { message: error.message } });
  }
});
