import { useState, useEffect } from 'react';
import { auth, db } from './firebase'; 
import { onAuthStateChanged, signOut, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, collection, getDocs, updateDoc } from 'firebase/firestore'; 
import jsPDF from 'jspdf';

const COOLDOWN_SECONDS = 600; 

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
  const [userKeys, setUserKeys] = useState<{ newsKey: string; geminiKey: string } | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [finalReport, setFinalReport] = useState('');
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  
  // [핵심] 찾아낸 모델 이름을 저장할 상태 변수
  const [activeModelName, setActiveModelName] = useState("models/gemini-pro");

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
             const mappedKeys = { newsKey: keys.newsKey || "", geminiKey: keys.geminiKey || "" };
             localStorage.setItem(`api_keys_${currentUser.uid}`, JSON.stringify(mappedKeys));
             setUserKeys(mappedKeys);
             return mappedKeys;
        }
    } catch(e) { console.error(e); }
    return null;
  };

  const manualUpdateKey = async () => {
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

  // [핵심 기능] 사용 가능한 모델을 무조건 찾아내는 함수 (버전 제한 없음)
  const detectBestModel = async (apiKey: string) => {
    setStatusMsg("System: Auto-detecting AI Model...");
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      const data = await response.json();
      
      if (!data.models) throw new Error("Failed to list models");

      // 1. generateContent 기능을 가진 모델만 싹 다 긁어모음
      const capableModels = data.models.filter((m: any) => 
        m.supportedGenerationMethods?.includes("generateContent")
      );

      if (capableModels.length === 0) throw new Error("No text generation models found.");

      // 2. 우선순위 정하기: 1.5버전 -> flash -> pro -> 아무거나
      // (기자님 말씀대로 제한을 두지 않고, 목록에 있는 것 중 가장 좋은 걸 잡습니다)
      let bestModel = capableModels.find((m: any) => m.name.includes("gemini-1.5-flash")) || 
                      capableModels.find((m: any) => m.name.includes("gemini-1.5-pro")) ||
                      capableModels.find((m: any) => m.name.includes("gemini-pro")) ||
                      capableModels[0]; // 정 없으면 목록의 첫 번째 녀석을 잡음

      console.log("✅ Auto-selected Model:", bestModel.name);
      return bestModel.name;

    } catch (e) {
      console.warn("Model detection failed, falling back to gemini-pro");
      return "models/gemini-pro"; // 최후의 수단
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

      // [1단계] 실행 가능한 모델 자동 감지 (딱 한 번 실행)
      const foundModel = await detectBestModel(activeKeys.geminiKey);
      setActiveModelName(foundModel); // 찾은 모델 저장

      setStatusMsg(`System: Searching GNews for "${keyword}" on ${targetDate}...`);
      const fromDate = `${targetDate}T00:00:00+08:00`;
      const toDate = `${targetDate}T23:59:59+08:00`;
      
      let newsUrl = `/news-api?q=${encodeURIComponent(keyword)}&country=ph&lang=en&max=10&from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}&token=${activeKeys.newsKey}`;
      let newsRes = await fetch(newsUrl);
      let newsData = await newsRes.json();
      
      if (!newsData.articles?.length) {
           console.warn("No news found for date, retrying without date filter...");
           setStatusMsg(`System: No news on ${targetDate}. Searching LATEST news...`);
           newsUrl = `/news-api?q=${encodeURIComponent(keyword)}&country=ph&lang=en&max=10&token=${activeKeys.newsKey}`;
           newsRes = await fetch(newsUrl);
           newsData = await newsRes.json();
      }

      if (!newsData.articles?.length) { setCooldown(0); throw new Error("No news found."); }
      
      const articles = newsData.articles.map((art:any) => ({ title: art.title, link: art.url, isAnalyzing: true }));
      setNewsList(articles);

      for (let i = 0; i < articles.length; i++) {
        let success = false; 
        let attempts = 0; 
        let summary = "Initializing AI...";
        
        setStatusMsg(`Analyzing ${i+1}/${articles.length}...`);
        document.title = `(${i+1}/${articles.length}) Analyzing...`;
        
        while(attempts < 3 && !success) {
             try {
                 const safetySettings = [
                    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
                 ];

                 // [핵심] 위에서 찾아낸 '작동하는 모델(foundModel)'을 사용
                 const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${foundModel}:generateContent?key=${activeKeys.geminiKey}`, {
                     method: 'POST', 
                     headers: {'Content-Type': 'application/json'},
                     body: JSON.stringify({ 
                        contents: [{ parts: [{ text: `Summarize this news title in 3 sentences: "${articles[i].title}"` }] }], 
                        safetySettings: safetySettings 
                     })
                 });

                 if (res.status === 429) { 
                     summary = "⏳ Speed Limit (Waiting...)";
                     setNewsList(prev => prev.map((item, idx) => idx === i ? { ...item, summary } : item));
                     await new Promise(r => setTimeout(r, 15000)); 
                     attempts++; continue; 
                 }
                 
                 if (res.status !== 200) {
                     const errData = await res.json();
                     // 404면 모델이 없다는 뜻이므로, 다음 루프땐 gemini-pro로 강제 변경 시도 가능하지만,
                     // detectBestModel에서 이미 걸러냈으므로 여기선 키 문제나 서버 문제일 확률이 높음.
                     if (res.status === 404) {
                        throw new Error(`Model Error (${foundModel} not found)`);
                     }
                     throw new Error(`API Error ${res.status}: ${errData.error?.message || res.statusText}`);
                 }

                 const data = await res.json();
                 
                 if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
                     summary = data.candidates[0].content.parts[0].text;
                     success = true;
                 } else {
                     summary = "[Error: Empty Response]";
                     success = true;
                 }

             } catch(e: any) { 
                 console.error(e);
                 attempts++; 
                 summary = `[Retry ${attempts}/3: ${e.message}]`;
                 setNewsList(prev => prev.map((item, idx) => idx === i ? { ...item, summary } : item));
                 await new Promise(r => setTimeout(r, 3000)); 
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
        
        const safetySettings = [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ];

        // 여기서도 찾아낸 모델 사용
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${activeModelName}:generateContent?key=${userKeys?.geminiKey}`, {
            method: 'POST', 
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ 
                contents: [{ parts: [{ text: prompt }] }],
                safetySettings: safetySettings
            }), 
            signal: controller.signal
        });
        const data = await res.json();
        setFinalReport(data.candidates?.[0]?.content?.parts?.[0]?.text || `Failed: ${JSON.stringify(data)}`);
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
    startAnalysis, generateDailyBriefing, downloadFinalPDF
  };
}
