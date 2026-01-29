const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

admin.initializeApp();

// 서버 사양 강화: 메모리 512MB, 타임아웃 60초 설정
exports.getNewsProxy = functions.runWith({
  timeoutSeconds: 60,
  memory: "512MB"
}).https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }

  try {
    const idToken = req.headers.authorization?.split('Bearer ')[1];
    if (!idToken) throw new Error("No Auth Token");

    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const userDoc = await admin.firestore().collection('users').doc(decodedToken.uid).get();
    
    if (!userDoc.exists) throw new Error("User data not found in Firestore");
    const userData = userDoc.data();
    
    const { type, query, title, description, lang } = req.body.data;

    // A. 뉴스 검색
    if (type === 'search') {
      const newsKey = (userData.newsKey || userData.apiKey || "").trim();
      const response = await axios.get(`https://gnews.io/api/v4/search?q=${encodeURIComponent(query)}&lang=en&country=ph&max=10&apikey=${newsKey}`);
      return res.status(200).send({ data: { articles: response.data.articles } });
    }

    // B. Gemini 요약 (응답 대기 최적화)
    if (type === 'summarize') {
      const geminiKey = (userData.geminiKey || userData.apiKey || "").trim();
      if (!geminiKey) throw new Error("Gemini Key is missing");

      const prompt = `Summarize this Philippine news in 3 short bullet points in ${lang}:\nTitle: ${title}\nContent: ${description}`;
      
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
        { contents: [{ parts: [{ text: prompt }] }] },
        { timeout: 30000 } // 30초 대기
      );

      if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
        const text = response.data.candidates[0].content.parts[0].text;
        return res.status(200).send({ data: { summary: text } });
      } else {
        throw new Error("Gemini response is empty");
      }
    }
  } catch (error) {
    console.error("Proxy Error:", error.message);
    res.status(500).send({ error: { message: error.message } });
  }
});

// createJournalistAccount (기존과 동일)
exports.createJournalistAccount = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  try {
    const idToken = req.headers.authorization?.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const { email, password, newsKey, geminiKey } = req.body.data;
    const userRecord = await admin.auth().createUser({ email, password });
    await admin.firestore().collection('users').doc(userRecord.uid).set({
      email, newsKey, geminiKey, needsPasswordChange: true
    });
    res.status(200).send({ data: { success: true } });
  } catch (error) { res.status(500).send({ error: { message: error.message } }); }
});
