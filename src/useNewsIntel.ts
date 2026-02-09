import { useState, useEffect } from 'react';
import { auth, db } from './firebase'; 
import { onAuthStateChanged, signOut, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, collection, getDocs, updateDoc } from 'firebase/firestore'; 
import jsPDF from 'jspdf';

const COOLDOWN_SECONDS = 600; 

// [최후의 보루] API가 목록을 못 가져올 때만 쓰는 안전장치
const DEFAULT_GROQ_KEY = "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";
const FALLBACK_GROQ_MODEL = "llama-3.3-70b-versatile"; 

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
  
  // 감지된 모델 이름들
  const [activeGroqModel, setActiveGroqModel] = useState<string>(FALLBACK_GROQ_MODEL);
  const [activeGeminiModel, setActiveGeminiModel] = useState<string | null>(null);

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

  // [업그레이드] Groq 모델 자동 감지 (버전 높은 순)
  const detectBestGroqModel = async (apiKey: string) => {
      try {
          const response = await fetch("https://api.groq.com/openai/v1/models", {
              headers: { "Authorization": `Bearer ${apiKey}` }
          });
          const data = await response.json();
          if (!data.data) return FALLBACK_GROQ_MODEL;

          // Llama 계열만 필터링
          const llamaModels = data.data.filter((m: any) => m.id.toLowerCase().includes("llama"));
          
          // 버전 번호 추출 및 정렬 (3.3 > 3.2 > 3.1 ...)
          const sortedModels = llamaModels.map((m: any) => {
              const match = m.id.match(/llama-?(\d+(\.\d+)?)/); // "llama-3.3" -> 3.3 추출
              return {
                  id: m.id,
                  version: match ? parseFloat(match[1]) : 0
              };
          }).sort((a: any, b: any) => b.version - a.version);

          if (sortedModels.length > 0) {
              console.log(`✅ Auto-Selected Groq Model: ${sortedModels[0].id} (v${sortedModels[0].version})`);
              return sortedModels[0].id;
          }

          // Llama가 없으면 Mixtral 찾기
          const mixtral = data.data.find((m: any) => m.id.includes("mixtral"));
          return mixtral ? mixtral.id : FALLBACK_GROQ_MODEL;

      } catch (e) {
          console.warn("Groq model detection failed, using fallback.");
          return FALLBACK_GROQ_MODEL;
      }
  };

  // [기존 유지] Gemini 미래 버전 자동 감지
  const detectBestGeminiModel = async (apiKey: string) => {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      const data = await response.json();
      if (!data.models) return null;

      const candidates = data.models.filter((m: any) => 
        m.supportedGenerationMethods?.includes("generateContent") &&
        !m.name.toLowerCase().includes("pro") 
      );

      const sortedModels = candidates.map((m: any) => {
          const match = m.name.match(/gemini-(\d+(\.\d+)?)/);
          return {
              name: m.name,
              version: match ? parseFloat(match[1]) : 0
          };
      })
      .filter((m: any) => m.version >= 2.5) // 2.5 이상만
      .sort((a: any, b: any) => b.version - a.version);

      if (sortedModels.length > 0) {
          console.log(`✅ Auto-Selected Gemini Backup: ${sortedModels[0].name} (v${sortedModels[0].version})`);
          return sortedModels[0].name;
      }
      return null;
    } catch (e) { return null; }
  };

  // [1순위] Groq 호출 (동적 모델 적용)
  const callGroqMain = async (title: string, dbKey: string | undefined, modelName: string) => {
      const apiKeyToUse = (dbKey && dbKey.length > 10) ? dbKey : DEFAULT_GROQ_KEY;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); 

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
                  model: modelName // [중요] 감지된 최신 모델 사용
              }),
              signal: controller.signal
          });
          
          clearTimeout(timeoutId);

          if (!response.ok) {
              const errData = await response.json().catch(() => ({}));
              throw new Error(`Groq Error ${response.status}: ${errData.error?.message || response.statusText}`);
          }
          
          const data = await response.json();
          return data.choices[0]?.message?.content || "Groq returned empty.";
      } catch (e: any) {
          clearTimeout(timeoutId);
          throw e;
      }
  };

  // [2순위] Gemini 호출
  const callGeminiBackup = async (title: string, apiKey: string, modelName: string) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); 

      try {
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent?key=${apiKey}`, {
             method: 'POST', 
             headers: {'Content-Type': 'application/json'},
             body: JSON.stringify({ 
                contents: [{ parts: [{ text: `Summarize this news title in 3 sentences: "${title}"` }] }], 
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
         if (!res.ok) throw new Error(`Gemini Error ${res.status}`);
         const data = await res.json();
         return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
      } catch (e: any) {
          clearTimeout(timeoutId);
          throw e;
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

      // 1. Groq 최신 모델 감지
      const groqKey = (activeKeys.fallbackKey && activeKeys.fallbackKey.length > 10) ? activeKeys.fallbackKey : DEFAULT_GROQ_KEY;
      const bestGroq = await detectBestGroqModel(groqKey);
      setActiveGroqModel(bestGroq);

      // 2. Gemini 최신 모델 감지
      const bestGemini = await detectBestGeminiModel(activeKeys.geminiKey);
      setActiveGeminiModel(bestGemini);

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
        
        // --- 1차 시도: Groq (자동 감지된 최신 모델) ---
        try {
            const groqResult = await callGroqMain(articles[i].title, activeKeys.fallbackKey, bestGroq);
            if (groqResult) {
                summary = groqResult;
                success = true;
            }
        } catch (e: any) {
            console.warn(`Groq (${bestGroq}) Failed: ${e.message}. Trying Backup...`);
        }

        // --- 2차 시도: Gemini (자동 감지된 최신 모델) ---
        if (!success) {
            if (bestGemini) {
                try {
                    console.log(`⚠️ Switching to Backup: ${bestGemini}`);
                    const geminiResult = await callGeminiBackup(articles[i].title, activeKeys.geminiKey, bestGemini);
                    if (geminiResult) {
                        summary = geminiResult;
                        success = true;
                    } else {
                        summary = "[Analysis Failed] Gemini returned empty.";
                    }
                } catch (geminiError: any) {
                    console.error("Gemini Backup Failed:", geminiError);
                    summary = `[System Failure] Groq & Gemini(${bestGemini}) both failed.`;
                }
            } else {
                summary = "[Analysis Failed] Groq failed, and no suitable Gemini available.";
            }
        }
        
        setNewsList(prev => prev.map((item, idx) => idx === i ? { ...item, summary, isAnalyzing: false } : item));
        
        const delay = Math.floor(Math.random() * (4000) + 1000); 
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
        
        const groqKey = (userKeys?.fallbackKey && userKeys.fallbackKey.length > 10) ? userKeys.fallbackKey : DEFAULT_GROQ_KEY;
        
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
              method: "POST",
              headers: {
                  "Authorization": `Bearer ${groqKey}`, 
                  "Content-Type": "application/json"
              },
              body: JSON.stringify({
                  messages: [{ role: "user", content: prompt }],
                  model: activeGroqModel // 브리핑도 최신 모델 사용
              }),
              signal: controller.signal
          });
          
        const data = await response.json();
        setFinalReport(data.choices?.[0]?.message?.content || "Report Failed.");

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
