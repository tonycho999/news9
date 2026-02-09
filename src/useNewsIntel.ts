import { useState, useEffect } from 'react';
import { auth, db } from './firebase'; 
import { onAuthStateChanged, signOut, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, collection, getDocs, updateDoc } from 'firebase/firestore'; 
import jsPDF from 'jspdf';

const COOLDOWN_SECONDS = 600; 

// [중요] 최후의 보루: Firebase에서 키를 못 가져오면 이 키를 씁니다.
const EMERGENCY_GROQ_KEY = "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";

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
  
  const [userKeys, setUserKeys] = useState<{ newsKey: string; geminiKey: string; fallbackKey?: string } | null>(null);
  
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
        // DB 키가 있거나, 없어도 일단 로컬에 있는거 씀
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
                 geminiKey: keys.geminiKey || "",
                 fallbackKey: keys.fallbackKey || "" 
             };
             localStorage.setItem(`api_keys_${currentUser.uid}`, JSON.stringify(mappedKeys));
             setUserKeys(mappedKeys);
             return mappedKeys;
        }
    } catch(e) { console.error(e); }
    return null;
  };

  const manualUpdateKey = async () => {
    const newKey = prompt("🔑 Enter a NEW Gemini API Key:");
    if (newKey && user) {
        try {
            await updateDoc(doc(db, "users", user.uid), { geminiKey: newKey.trim() });
            localStorage.removeItem(`api_keys_${user.uid}`);
            alert("✅ Key Updated! Reloading...");
            window.location.reload(); 
        } catch (e) { alert("DB Update Failed."); }
    }
  };

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
      return "models/gemini-1.5-flash"; 
    }
  };

  // [핵심] 비상용 AI 호출 (3중 안전장치)
  const callFallbackAI = async (title: string, dbKey?: string) => {
      // 1. 모델: 제일 빠르고 에러 없는 llama3-8b 선택
      const targetModel = "llama3-8b-8192"; 
      
      // 2. 키: DB에 있으면 그거 쓰고, 없으면 코드에 박힌 EMERGENCY_GROQ_KEY 사용
      const apiKeyToUse = (dbKey && dbKey.length > 10) ? dbKey : EMERGENCY_GROQ_KEY;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10초 제한

      try {
          const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
              method: "POST",
              headers: {
                  "Authorization": `Bearer ${apiKeyToUse}`, 
                  "Content-Type": "application/json"
              },
              body: JSON.stringify({
                  messages: [{
                      role: "user",
                      content: `Summarize this news title in 3 sentences: "${title}"`
                  }],
                  model: targetModel
              }),
              signal: controller.signal
          });
          
          clearTimeout(timeoutId);

          if (!response.ok) {
              const errData = await response.json().catch(() => ({}));
              // 에러 발생 시 원인을 정확히 리턴 (화면에 보여주기 위함)
              throw new Error(`Groq Error ${response.status}: ${errData.error?.message || response.statusText}`);
          }
          
          const data = await response.json();
          return data.choices[0]?.message?.content || "Fallback returned empty.";
      } catch (e: any) {
          clearTimeout(timeoutId);
          throw new Error(e.message);
      }
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

      const foundModel = await detectBestModel(activeKeys.geminiKey);
      setActiveModelName(foundModel);

      setStatusMsg(`System: Searching GNews for "${keyword}"...`);
      const fromDate = `${targetDate}T00:00:00+08:00`;
      const toDate = `${targetDate}T23:59:59+08:00`;
      
      let newsUrl = `/news-api?q=${encodeURIComponent(keyword)}&country=ph&lang=en&max=10&from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}&token=${activeKeys.newsKey}`;
      let newsRes = await fetch(newsUrl);
      let newsData = await newsRes.json();
      
      if (!newsData.articles?.length) {
           setStatusMsg(`System: Searching LATEST news...`);
           newsUrl = `/news-api?q=${encodeURIComponent(keyword)}&country=ph&lang=en&max=10&token=${activeKeys.newsKey}`;
           newsRes = await fetch(newsUrl);
           newsData = await newsRes.json();
      }

      if (!newsData.articles?.length) { setCooldown(0); throw new Error("No news found."); }
      
      const articles = newsData.articles.map((art:any) => ({ title: art.title, link: art.url, isAnalyzing: true }));
      setNewsList(articles);

      for (let i = 0; i < articles.length; i++) {
        let success = false; 
        let summary = "Initializing...";
        
        setStatusMsg(`Analyzing article ${i+1}/${articles.length}...`);
        document.title = `(${i+1}/${articles.length}) Analyzing...`;
        
        // 1. Gemini 시도 (10초 타임아웃)
        try {
             const controller = new AbortController();
             const timeoutId = setTimeout(() => controller.abort(), 10000); // 10초 제한

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
                 }),
                 signal: controller.signal
             });

             clearTimeout(timeoutId);

             if (res.status === 200) {
                 const data = await res.json();
                 if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
                     summary = data.candidates[0].content.parts[0].text;
                     success = true;
                 }
             } else {
                 console.warn(`Gemini Error ${res.status} - Switching to Fallback`);
             }
        } catch(e) { 
             console.warn("Gemini Timeout or Error, switching to Fallback...", e);
        }

        // 2. Gemini 실패 시 -> Fallback (Groq) 투입
        if (!success) {
            try {
                console.log("⚠️ Executing Fallback Protocol (Groq)...");
                // DB 키가 있으면 쓰고, 없으면 undefined가 들어가서 내부적으로 EMERGENCY_KEY를 씀
                summary = await callFallbackAI(articles[i].title, activeKeys.fallbackKey || "");
                success = true;
            } catch (fallbackError: any) {
                console.error("Fallback Failed:", fallbackError);
                // 화면에 에러 원인 출력
                summary = `[System Failure] Backup Error: ${fallbackError.message}`;
            }
        }
        
        setNewsList(prev => prev.map((item, idx) => idx === i ? { ...item, summary, isAnalyzing: false } : item));
        
        // 1초 ~ 5초 사이 랜덤 대기
        const delay = Math.floor(Math.random() * (5000 - 1000 + 1) + 1000);
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
