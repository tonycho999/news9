import React, { useState, useEffect } from 'react';
import { auth, db } from './firebase'; 
import { onAuthStateChanged, signOut, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, collection, getDocs, updateDoc } from 'firebase/firestore'; 
import jsPDF from 'jspdf';
import Signup from './Signup';

interface NewsItem {
  title: string;
  link: string;
  summary?: string;
  isAnalyzing: boolean;
}

function App() {
  const [user, setUser] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [keyword, setKeyword] = useState('');
  const [newsList, setNewsList] = useState<NewsItem[]>([]);
  const [isFinished, setIsFinished] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [userKeys, setUserKeys] = useState<{ newsKey: string; geminiKey: string } | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) fetchKeys(currentUser);
    });
    return () => unsubscribe();
  }, []);

  const fetchKeys = async (currentUser: any) => {
    if (!currentUser) return null; 
    try {
      const userDoc = await getDoc(doc(db, "users", currentUser.uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        const keys = { newsKey: data.newsKey || "", geminiKey: data.geminiKey || "" };
        setUserKeys(keys);
        return keys;
      } 
      
      const querySnapshot = await getDocs(collection(db, "users"));
      let foundKeys = null;
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.email === currentUser.email) {
          foundKeys = { newsKey: data.newsKey || "", geminiKey: data.geminiKey || "" };
        }
      });
      
      if (foundKeys) {
        setUserKeys(foundKeys);
        return foundKeys;
      }
    } catch (error) {
      console.error("Key fetch error:", error);
    }
    return null;
  };

  const updateGeminiKey = async () => {
    const newKey = prompt("⚠️ Gemini API Key Error!\n\nThe current key is invalid or lacks permission.\nPlease paste a new Gemini Key from 'aistudio.google.com':");
    if (newKey && user) {
        try {
            await updateDoc(doc(db, "users", user.uid), {
                geminiKey: newKey
            });
            alert("✅ Key updated! analyzing will restart.");
            setUserKeys(prev => prev ? { ...prev, geminiKey: newKey } : null);
            startAnalysis(); 
        } catch (e) {
            alert("Failed to update key in DB.");
        }
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      alert("Login Failed.");
    }
  };

  const startAnalysis = async () => {
    if (!keyword) return alert("Please enter a topic.");
    
    setIsFinished(false);
    setNewsList([]); 

    try {
      let activeKeys = userKeys;

      if (!activeKeys || !activeKeys.newsKey) {
        setStatusMsg("System: Synchronizing credentials...");
        const fetched = await fetchKeys(user);
        if (!fetched || !fetched.newsKey) {
          throw new Error("Critical Error: API Keys not found.");
        }
        activeKeys = fetched;
      }

      setStatusMsg(`System: Searching GNews for "${keyword}"...`);
      await new Promise(resolve => setTimeout(resolve, 1000));

      const newsUrl = `/news-api?q=${encodeURIComponent(keyword)}&country=ph&lang=en&max=10&token=${activeKeys.newsKey}`;
      const newsResponse = await fetch(newsUrl);
      if (!newsResponse.ok) throw new Error(`GNews API Error: ${newsResponse.statusText}`);

      const newsData = await newsResponse.json();
      if (!newsData.articles || newsData.articles.length === 0) {
        throw new Error("No news found.");
      }

      const realArticles: NewsItem[] = newsData.articles.map((art: any) => ({
        title: art.title,
        link: art.url,
        isAnalyzing: true
      }));
      setNewsList(realArticles);

      // [핵심 변경] Gemini 루프: 분석 완료 즉시 반영
      for (let i = 0; i < realArticles.length; i++) {
        setStatusMsg(`System: Analyzing article ${i + 1} of ${realArticles.length}...`);
        
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${activeKeys.geminiKey}`;
        
        const geminiResponse = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `Act as a professional reporter. Summarize this news title in 3 sentences with context: "${realArticles[i].title}"` }] }]
          })
        });

        if (geminiResponse.status === 404 || geminiResponse.status === 400) {
            const errData = await geminiResponse.json();
            console.error("Gemini Error:", errData);
            if (window.confirm(`Gemini Error: ${errData.error?.message}\n\nUpdate API Key?`)) {
                await updateGeminiKey();
                return; 
            }
        }

        const geminiData = await geminiResponse.json();
        const summaryText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "Deep analysis unavailable.";

        // [핵심] 여기서 데이터를 받자마자 화면을 업데이트합니다.
        setNewsList(prev => prev.map((item, idx) => 
          idx === i ? { ...item, summary: summaryText, isAnalyzing: false } : item
        ));
        
        // [안전 장치] 연속 호출 에러 방지를 위해 딱 1초만 대기 (속도와 안정성 타협)
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      setIsFinished(true);
      setStatusMsg('System: All Intelligence Gathered.');

    } catch (error: any) {
      console.error(error);
      setStatusMsg(`System Alert: ${error.message}`);
    }
  };

  const savePDF = (item: NewsItem) => {
    const doc = new jsPDF();
    doc.text(item.title, 10, 20);
    doc.text(item.summary || "", 10, 40, { maxWidth: 180 });
    doc.save(`Report.pdf`);
  };

  if (window.location.pathname === '/signup') return <Signup />;

  if (!user) {
    return (
      <div style={styles.loginOverlay}>
        <div style={styles.loginCard}>
          <h2 style={{ color: '#2c3e50' }}>Intelligence Login</h2>
          <form onSubmit={handleLogin} style={styles.vStack}>
            <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={styles.input} required />
            <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} style={styles.input} required />
            <button type="submit" style={styles.mainBtn}>Sign In</button>
          </form>
        </div>
      </div>
    );
  }

  if (user.email === 'admin@test.com') return <Signup />;

  return (
    <div style={styles.pageContainer}>
      <header style={styles.navBar}>
        <h2 style={{ margin: 0 }}>PH NEWS INTEL</h2>
        <div style={styles.hStack}>
          <span>{user.email}</span>
          <button onClick={() => signOut(auth)} style={styles.logoutBtn}>Logout</button>
        </div>
      </header>
      <main style={{ marginTop: '30px' }}>
        <div style={styles.searchSection}>
          <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Topic..." style={{ ...styles.input, flex: 1 }} />
          <button onClick={startAnalysis} style={styles.mainBtn}>START ANALYSIS</button>
        </div>
        {statusMsg && <div style={isFinished ? styles.doneBanner : styles.infoBanner}>{statusMsg}</div>}
        <div style={styles.newsGrid}>
          {newsList.map((news, index) => (
            <div key={index} style={styles.reportCard}>
              <h4>{news.title}</h4>
              {news.isAnalyzing ? <div>⌛ Analyzing...</div> : 
              <>
                <p style={styles.summaryTxt}>{news.summary}</p>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => savePDF(news)} style={styles.pdfBtn}>PDF</button>
                  <a href={news.link} target="_blank" rel="noopener noreferrer" style={styles.linkBtn}>SOURCE</a>
                </div>
              </>}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  pageContainer: { maxWidth: '1000px', margin: '0 auto', padding: '20px', fontFamily: 'sans-serif' },
  navBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #333', paddingBottom: '10px' },
  loginOverlay: { height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f0f0' },
  loginCard: { padding: '40px', backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' },
  vStack: { display: 'flex', flexDirection: 'column', gap: '10px', width: '300px' },
  hStack: { display: 'flex', alignItems: 'center', gap: '10px' },
  input: { padding: '10px', border: '1px solid #ccc', borderRadius: '4px' },
  mainBtn: { padding: '10px 20px', backgroundColor: '#2c3e50', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' },
  logoutBtn: { padding: '5px 10px', cursor: 'pointer' },
  searchSection: { display: 'flex', gap: '10px', marginBottom: '20px' },
  infoBanner: { padding: '10px', backgroundColor: '#e1f5fe', marginBottom: '20px' },
  doneBanner: { padding: '10px', backgroundColor: '#e8f5e9', marginBottom: '20px' },
  newsGrid: { display: 'flex', flexDirection: 'column', gap: '15px' },
  reportCard: { padding: '20px', border: '1px solid #ddd', borderRadius: '8px' },
  summaryTxt: { lineHeight: '1.6', fontSize: '14px' },
  pdfBtn: { padding: '5px 10px', backgroundColor: '#27ae60', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' },
  linkBtn: { padding: '5px 10px', backgroundColor: '#34495e', color: '#fff', textDecoration: 'none', borderRadius: '4px', fontSize: '12px' }
};

export default App;
