import { useState, useEffect } from 'react';
import { auth, db } from './firebase'; 
import { onAuthStateChanged, signOut, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, collection, getDocs, updateDoc } from 'firebase/firestore'; 
import jsPDF from 'jspdf';

const COOLDOWN_SECONDS = 600; 

// [수정] 비상용 키를 코드에 직접 내장 (하드코딩)
const FALLBACK_GROQ_KEY = "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";

export interface NewsItem {
  title: string;
  link: string;
  summary?: string;
  isAnalyzing: boolean;
}

export function useNewsIntel() {
  const [user, setUser] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  const getTodayPHT = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  const [targetDate, setTargetDate] = useState(getTodayPHT());
  const [keyword, setKeyword] = useState('');
  const [newsList, setNewsList] = useState<NewsItem[]>([]);
  const [isFinished, setIsFinished] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  
  // fallbackKey는 이제 상태에서 관리 안 함 (상수 사용)
  const [userKeys, setUserKeys] = useState<{ newsKey: string; geminiKey: string } | null>(null);
  
  const [showModal, setShowModal] = useState(false);
  const [finalReport, setFinalReport] = useState('');
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  
  const [activeModelName, setActiveModelName] = useState("models/gemini-1.5-flash");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) fetchKeys(currentUser);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let timer: any; 
    if (cooldown > 0) timer = setInterval(() => setCooldown((prev) => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const fetchKeys = async (currentUser: any) => {
    if (!currentUser) return null; 
    const localKeyData = localStorage.getItem(`api_keys_${currentUser.uid}`);
    if (localKeyData) {
        const parsedKeys = JSON.parse(localKeyData);
        if (parsedKeys.newsKey && parsedKeys.geminiKey) {
            setUserKeys(parsedKeys);
            return parsedKeys;
        }
    }
    try {
        const userDoc = await getDoc(doc(db, "users", currentUser.uid));
        let keys = null;
        if (userDoc.exists()) keys = userDoc.data();
        else {
            const qs = await getDocs(collection(db, "users"));
            qs.forEach((doc) => { if (doc.data().email === currentUser.email) keys = doc.data(); });
        }
        if (keys) {
             const mappedKeys = { 
                 newsKey: keys.newsKey || "", 
                 geminiKey: keys.geminiKey || ""
             };
             localStorage.setItem(`api_keys_${currentUser.uid}`, JSON.stringify(mappedKeys));
             setUserKeys(mappedKeys);
             return mappedKeys;
        }
    } catch(e) { console.error(e); }
    return null;
  };

  const manualUpdateKey = async () => {
    // 이제 Gemini 키만 물어봅니다.
    const newKey = prompt("🔑 Enter a NEW Gemini API Key from 'aistudio.google.com':");
    
    if (newKey && user) {
        try {
            await updateDoc(doc(db, "users", user.uid), { geminiKey: newKey.trim() });
            localStorage.removeItem(`api_keys_${user.uid}`);
            alert("✅ Key Updated! Reloading...");
            window.location.reload(); 
        } catch (e) { alert("DB Update Failed."); }
    }
  };

  // 3.0 -> 2.5 -> 2.0 -> 1.5 순서로 모델 찾기
  const detectBestModel = async (apiKey: string) => {
    setStatusMsg("System: Connecting to AI Core..."); 
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      const data = await response.json();
      
      if (!data.models) throw new Error("List failed");

      const capableModels = data.models.filter((m: any) => 
        m.supportedGenerationMethods?.includes("generateContent") &&
        !m.name.toLowerCase().includes("pro") 
      );

      if (capableModels.length === 0) throw new Error("No models found.");

      let bestModel = capableModels.find((m: any) => m.name.includes("gemini-3.0")) || 
                      capableModels.find((m: any) => m.name.includes("gemini-2.5")) ||
                      capableModels.find((m: any) => m.name.includes("gemini-2.0")) ||
                      capableModels.find((m: any) => m.name.includes("gemini-1.5-flash")) ||
                      capableModels[0];

      console.log(`✅ Selected Model: ${bestModel.name}`);
      return bestModel.name;

    } catch (e) {
      console.warn("Model detection failed, defaulting to 1.5 flash.");
      return "models/gemini-1.5-flash"; 
    }
  };

  // [수정] 내장된 FALLBACK_GROQ_KEY 사용
  const callFallbackAI = async (title: string) => {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
              "Authorization": `Bearer ${FALLBACK_GROQ_KEY}`, // 하드코딩된 키 사용
              "Content-Type": "application/json"
          },
          body: JSON.stringify({
              messages: [{
                  role: "user",
                  content: `Summarize this news title in 3 sentences: "${title}"`
              }],
              model: "llama3-8b-8192" 
          })
      });
      
      if (!response.ok) throw new Error("Fallback AI Failed");
      const data = await response.json();
      return data.choices[0]?.message?.content || "Fallback Error";
  };

  const startAnalysis = async () => {
    if (!keyword) return alert("Please enter a topic.");
    if (cooldown > 0) return;
    setCooldown(COOLDOWN_SECONDS);
    setIsFinished(false); setShowModal(false); setNewsList([]); 

    try {
      let activeKeys = userKeys;
      if (!activeKeys?.newsKey) activeKeys = await fetchKeys(user);
      if (!activeKeys?.newsKey) throw new Error("API Keys missing.");

      // 1. 모델 감지
      const foundModel = await detectBestModel(activeKeys.geminiKey);
      setActiveModelName(foundModel);

      // 2. 뉴스 검색
      setStatusMsg(`System: Searching GNews for "${keyword}"...`);
      const fromDate = `${targetDate}T00:00:00+08:00`;
      const toDate = `${targetDate}T23:59:59+08:00`;
      
      let newsUrl = `/news-api?q=${encodeURIComponent(keyword)}&country=ph&lang=en&max=10&from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}&token=${activeKeys.newsKey}`;
      let newsRes = await fetch(newsUrl);
      let newsData = await newsRes.json();
      
      if (!newsData.articles?.length) {
           console.warn("Retry without date...");
           setStatusMsg(`System: Searching LATEST news...`);
           newsUrl = `/news-api?q=${encodeURIComponent(keyword)}&country=ph&lang=en&max=10&token=${activeKeys.newsKey}`;
           newsRes = await fetch(newsUrl);
           newsData = await newsRes.json();
      }

      if (!newsData.articles?.length) { setCooldown(0); throw new Error("No news found."); }
      
      const articles = newsData.articles.map((art:any) => ({ title: art.title, link: art.url, isAnalyzing: true }));
      setNewsList(articles);

      // 3. 분석 루프
      for (let i = 0; i < articles.length; i++) {
        let success = false; 
        let summary = "Initializing...";
        
        setStatusMsg(`Analyzing article ${i+1}/${articles.length}...`);
        document.title = `(${i+1}/${articles.length}) Analyzing...`;
        
        // Gemini 시도 (최대 2회)
        for (let attempts = 0; attempts < 2 && !success; attempts++) {
             try {
                 const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${foundModel}:generateContent?key=${activeKeys.geminiKey}`, {
                     method: 'POST', 
                     headers: {'Content-Type': 'application/json'},
                     body: JSON.stringify({ 
                        contents: [{ parts: [{ text: `Summarize this news title in 3 sentences: "${articles[i].title}"` }] }], 
                        safetySettings: [
                            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
                        ]
                     })
                 });

                 if (res.status === 200) {
                     const data = await res.json();
                     if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
                         summary = data.candidates[0].content.parts[0].text;
                         success = true;
                     }
                 } else {
                     throw new Error(`Gemini Error ${res.status}`);
                 }
             } catch(e) { 
                 console.warn("Gemini Failed, retrying...", e);
                 await new Promise(r => setTimeout(r, 2000));
             }
        }

        // Gemini 실패 시 -> 하드코딩된 Fallback AI 투입
        if (!success) {
            try {
                console.log("⚠️ Switching to Fallback AI...");
                // 여기서 내장된 키를 자동으로 사용
                summary = await callFallbackAI(articles[i].title);
                success = true;
            } catch (fallbackError) {
                console.error("Fallback Failed:", fallbackError);
                summary = "Analysis Unavailable (Both AIs Failed)";
            }
        }
        
        setNewsList(prev => prev.map((item, idx) => idx === i ? { ...item, summary, isAnalyzing: false } : item));
        
        const delay = Math.floor(Math.random() * (5000 - 2000 + 1) + 2000);
        await new Promise(r => setTimeout(r, delay));
      }
      setIsFinished(true); setStatusMsg("Analysis Complete."); document.title = "Done!";
    } catch (e: any) { setStatusMsg(e.message); document.title = "Error"; }
  };

  const generateDailyBriefing = async () => {
    setIsGeneratingReport(true); setShowModal(true); setFinalReport("Writing...");
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 300000);
    try {
        const prompt = `Act as an executive editor. Based on these summaries, write a briefing:\n${newsList.map(n => n.title + ": " + n.summary).join('\n')}`;
        
        // 브리핑도 Gemini 우선, 실패시 처리 로직은 복잡해지니 일단 Gemini만 사용
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${activeModelName}:generateContent?key=${userKeys?.geminiKey}`, {
            method: 'POST', 
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }), 
            signal: controller.signal
        });
        const data = await res.json();
        setFinalReport(data.candidates?.[0]?.content?.parts?.[0]?.text || "Report Failed.");
    } catch(e: any) { setFinalReport(`Error: ${e.message}`); } 
    setIsGeneratingReport(false);
  };

  const downloadFinalPDF = () => {
    const doc = new jsPDF();
    doc.text(`Briefing: ${keyword} (${targetDate})`, 10, 20);
    doc.text(doc.splitTextToSize(finalReport, 180), 10, 30);
    doc.save(`${keyword}_Briefing.pdf`);
  };

  return {
    user, email, setEmail, password, setPassword, targetDate, setTargetDate, getTodayPHT,
    keyword, setKeyword, newsList, isFinished, statusMsg, cooldown,
    showModal, setShowModal, finalReport, isGeneratingReport,
    handleLogin: async (e: any) => { e.preventDefault(); try { await signInWithEmailAndPassword(auth, email, password); } catch { alert("Login Failed"); } },
    handleLogout: () => signOut(auth),
    startAnalysis, generateDailyBriefing, downloadFinalPDF, manualUpdateKey
  };
}
