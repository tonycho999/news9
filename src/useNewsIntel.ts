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
    // (DB Fetch logic simplified for brevity, assumes standard fetch logic here if local fails)
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

  const startAnalysis = async () => {
    if (!keyword) return alert("Please enter a topic.");
    if (cooldown > 0) return;
    setCooldown(COOLDOWN_SECONDS);
    setIsFinished(false); setShowModal(false); setNewsList([]); 

    try {
      let activeKeys = userKeys;
      if (!activeKeys?.newsKey) activeKeys = await fetchKeys(user);
      if (!activeKeys?.newsKey) throw new Error("API Keys missing.");

      setStatusMsg(`System: Searching GNews for "${keyword}" on ${targetDate}...`);
      const newsUrl = `/news-api?q=${encodeURIComponent(keyword)}&country=ph&lang=en&max=100&from=${targetDate}T00:00:00+08:00&to=${targetDate}T23:59:59+08:00&token=${activeKeys.newsKey}`;
      const newsRes = await fetch(newsUrl);
      const newsData = await newsRes.json();
      
      if (!newsData.articles?.length) { setCooldown(0); throw new Error("No news found."); }
      const articles = newsData.articles.map((art:any) => ({ title: art.title, link: art.url, isAnalyzing: true }));
      setNewsList(articles);

      for (let i = 0; i < articles.length; i++) {
        let success = false; let attempts = 0; let summary = "Unavailable";
        setStatusMsg(`Analyzing ${i+1}/${articles.length}...`);
        
        while(attempts < 3 && !success) {
             try {
                 const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${activeKeys.geminiKey}`, {
                     method: 'POST', headers: {'Content-Type': 'application/json'},
                     body: JSON.stringify({ contents: [{ parts: [{ text: `Summarize: "${articles[i].title}"` }] }], safetySettings: [{category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE"}] })
                 });
                 if (res.status === 429) { await new Promise(r => setTimeout(r, 15000)); attempts++; continue; }
                 if (res.status === 400) { if(window.confirm("Key Error. Update?")) manualUpdateKey(); return; }
                 const data = await res.json();
                 summary = data.candidates?.[0]?.content?.parts?.[0]?.text || "Blocked";
                 success = true;
             } catch(e) { attempts++; await new Promise(r => setTimeout(r, 2000)); }
        }
        setNewsList(prev => prev.map((item, idx) => idx === i ? { ...item, summary, isAnalyzing: false } : item));
        await new Promise(r => setTimeout(r, Math.random() * 3000 + 2000));
      }
      setIsFinished(true); setStatusMsg("Analysis Complete.");
    } catch (e: any) { setStatusMsg(e.message); }
  };

  const generateDailyBriefing = async () => {
    setIsGeneratingReport(true); setShowModal(true); setFinalReport("Writing...");
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 300000);
    try {
        const prompt = `Summarize trends:\n${newsList.map(n => n.title + ": " + n.summary).join('\n')}`;
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${userKeys?.geminiKey}`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }), signal: controller.signal
        });
        const data = await res.json();
        setFinalReport(data.candidates?.[0]?.content?.parts?.[0]?.text || "Failed.");
    } catch(e) { setFinalReport("Error/Timeout."); } 
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
