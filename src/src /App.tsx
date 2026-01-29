// @ts-ignore
import { jsPDF } from "jspdf";
import React, { useState, useEffect } from 'react';
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";
import { getFirestore, doc, getDoc } from "firebase/firestore";

// --- MANDATORY CONFIGURATIONS ---
const firebaseConfig = {
  apiKey: "AIzaSyDG82G8sn5WgAXJz_5e2ElOC6Bw_g4WzEY",
  authDomain: "news-efc4a.firebaseapp.com",
  projectId: "news-efc4a",
  storageBucket: "news-efc4a.firebasestorage.app",
  messagingSenderId: "717438175301",
  appId: "1:717438175301:web:32626f4b8010ee6c107b2c"
};

const PROXY_URL = 'https://getnewsproxy-ag6knztn3a-uc.a.run.app';

// Initialize Firebase services
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

function App() {
  const [user, setUser] = useState<any>(null);
  const [articles, setArticles] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [targetLang, setTargetLang] = useState<'English' | 'Tagalog'>('English');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => { 
    const unsubscribe = onAuthStateChanged(auth, (u) => setUser(u)); 
    return () => unsubscribe();
  }, []);

  const handleIntelligenceSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query) return;
    
    setIsSearching(true);
    setArticles([]);

    try {
      const idToken = await auth.currentUser?.getIdToken();
      
      // 1. Fetch news list first (Fast)
      const res = await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
        body: JSON.stringify({ data: { type: 'search', query } })
      });
      const result = await res.json();
      
      if (!res.ok) throw new Error(result.error?.message || "Search failed");
      
      const initialArticles = result.data.articles.map((a: any) => ({ ...a, summary: null }));
      setArticles(initialArticles);

      // 2. Summarize one by one (Streaming-style UI)
      for (let i = 0; i < initialArticles.length; i++) {
        const art = initialArticles[i];
        try {
          const sumRes = await fetch(PROXY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
            body: JSON.stringify({ data: { type: 'summarize', title: art.title, description: art.description, lang: targetLang } })
          });
          const sumResult = await sumRes.json();
          
          setArticles(prev => {
            const updated = [...prev];
            updated[i] = { ...updated[i], summary: sumResult.data?.summary || "Summary failed", summaryLang: targetLang };
            return updated;
          });
        } catch (err) {
          console.error("Summary error for item", i);
        }
      }
    } catch (e: any) { 
      alert("Intelligence Error: " + e.message); 
    } finally { 
      setIsSearching(false); 
    }
  };

  const downloadPDF = (art: any) => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("INTEL REPORT", 10, 20);
    doc.setFontSize(10);
    doc.text(`Title: ${art.title}`, 10, 35, { maxWidth: 180 });
    doc.text(`Source: ${art.source.name} | ${new Date(art.publishedAt).toLocaleString()}`, 10, 50);
    doc.line(10, 55, 200, 55);
    doc.text("AI SUMMARY:", 10, 65);
    doc.setFontSize(12);
    doc.text(art.summary || "No summary available", 10, 75, { maxWidth: 180 });
    doc.save(`Intel_${art.source.name}.pdf`);
  };

  if (!user) return (
    <div className="flex items-center justify-center min-h-screen bg-slate-900 font-sans">
      <form onSubmit={(e) => {e.preventDefault(); signInWithEmailAndPassword(auth, email, password);}} className="bg-white p-12 rounded-[3rem] w-full max-w-sm space-y-6 shadow-2xl">
        <h2 className="text-2xl font-black text-blue-600 text-center uppercase italic tracking-tighter">PH News Intel</h2>
        <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className="w-full p-4 bg-slate-50 rounded-2xl outline-none ring-1 ring-slate-100" required />
        <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} className="w-full p-4 bg-slate-50 rounded-2xl outline-none ring-1 ring-slate-100" required />
        <button className="w-full bg-blue-600 text-white p-4 rounded-2xl font-black hover:bg-blue-700 transition-all">SIGN IN</button>
      </form>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto p-6 min-h-screen bg-white font-sans text-slate-900">
      <header className="flex justify-between items-center mb-10 border-b pb-6">
        <h1 className="text-2xl font-black text-blue-600 italic tracking-tighter uppercase">Intelligence Hub</h1>
        <div className="flex gap-2 bg-slate-100 p-1.5 rounded-2xl">
          <button onClick={() => setTargetLang('English')} className={`px-5 py-2 rounded-xl text-[10px] font-black transition-all ${targetLang === 'English' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}>ENGLISH</button>
          <button onClick={() => setTargetLang('Tagalog')} className={`px-5 py-2 rounded-xl text-[10px] font-black transition-all ${targetLang === 'Tagalog' ? 'bg-red-600 text-white' : 'text-slate-400'}`}>TAGALOG</button>
        </div>
      </header>

      <form onSubmit={handleIntelligenceSearch} className="relative mb-16">
        <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search Philippine issues..." className="w-full p-8 rounded-[2.5rem] shadow-2xl ring-1 ring-slate-100 outline-none text-xl font-medium focus:ring-4 focus:ring-blue-100 transition-all" />
        <button type="submit" disabled={isSearching} className="absolute right-5 top-4 bg-blue-600 text-white p-4 rounded-[1.5rem] shadow-xl hover:bg-blue-700 font-bold">
          {isSearching ? '...' : '🔍'}
        </button>
      </form>

      {isSearching && (
        <div className="mb-12 p-6 bg-blue-50 border border-blue-100 rounded-3xl flex items-center justify-between animate-pulse">
          <span className="text-blue-700 text-xs font-black uppercase tracking-widest">AI analysis in progress. Reading articles one by one...</span>
        </div>
      )}

      <div className="space-y-14">
        {articles.map((a, i) => (
          <div key={i} className="group bg-white p-8 rounded-[3.5rem] border border-slate-100 shadow-sm hover:shadow-2xl transition-all duration-500">
            <div className="flex justify-between items-center mb-6">
              <span className="bg-blue-50 text-blue-600 text-[10px] px-4 py-1.5 rounded-full font-black uppercase tracking-widest">{a.source.name}</span>
              {a.summary && (
                <button onClick={() => downloadPDF(a)} className="text-[10px] font-black text-slate-300 hover:text-green-600 uppercase tracking-widest transition-colors">Download PDF ↓</button>
              )}
            </div>
            <h3 className="text-2xl font-extrabold text-slate-900 leading-tight mb-8">
              <a href={a.url} target="_blank" rel="noreferrer" className="hover:underline decoration-blue-200 underline-offset-4">{a.title}</a>
            </h3>
            
            <div className={`min-h-[120px] flex items-center justify-center rounded-[2.5rem] transition-all duration-1000 ${a.summary ? (a.summaryLang === 'Tagalog' ? 'bg-red-50/40 border border-red-100' : 'bg-blue-50/40 border border-blue-100') : 'bg-slate-50 border-2 border-dashed border-slate-100'}`}>
              {a.summary ? (
                <p className="p-8 text-slate-700 text-lg leading-9 font-medium italic whitespace-pre-wrap animate-in fade-in zoom-in duration-1000">
                  {a.summary}
                </p>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <div className="flex gap-2">
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce [animation-delay:-.3s]"></div>
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce [animation-delay:-.5s]"></div>
                  </div>
                  <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Awaiting AI Intel...</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      
      <footer className="mt-20 py-10 text-center border-t border-slate-50">
        <button onClick={() => signOut(auth)} className="text-[10px] font-black text-slate-300 hover:text-red-500 uppercase tracking-widest">Terminate Session</button>
      </footer>
    </div>
  );
}

export default App;
