import React, { useState, useEffect } from 'react';
import { auth, db } from './firebase'; 
import { onAuthStateChanged, signOut, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore'; 
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
  const [userKeys, setUserKeys] = useState<{ newsKey: string; geminiKey: string } | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [keyword, setKeyword] = useState('');
  const [newsList, setNewsList] = useState<NewsItem[]>([]);
  const [isFinished, setIsFinished] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  const isAdmin = user?.email === 'admin@test.com';

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Firestore에서 유저별 API Key 로드
        const userDoc = await getDoc(doc(db, "users", currentUser.uid));
        if (userDoc.exists()) {
          setUserKeys({
            newsKey: userDoc.data().apiKey1,
            geminiKey: userDoc.data().apiKey2
          });
        }
      }
    });
    return () => unsubscribe();
  }, []);

  if (window.location.pathname === '/signup') {
    return <Signup />;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      alert("Login Failed. Please check your credentials.");
    }
  };

  // --- [수정된 핵심 로직: GNews & Gemini API 연동] ---
  const startAnalysis = async () => {
    if (!keyword) return alert("Please enter a topic.");
    if (!userKeys?.newsKey || !userKeys?.geminiKey) {
      return alert("API Keys not found. Please contact admin to register keys via Signup.");
    }

    setIsFinished(false);
    setNewsList([]); 
    
    try {
      // 1단계: GNews API로 필리핀 뉴스 가져오기
      setStatusMsg(`Searching real-time Philippine news for "${keyword}"...`);
      const newsUrl = `https://gnews.io/api/v4/search?q=${encodeURIComponent(keyword)}&country=ph&lang=en&max=10&token=${userKeys.newsKey}`;
      
      const newsResponse = await fetch(newsUrl);
      const newsData = await newsResponse.json();

      if (!newsData.articles || newsData.articles.length === 0) {
        throw new Error("No related news found in Philippine sources.");
      }

      const realArticles: NewsItem[] = newsData.articles.map((art: any) => ({
        title: art.title,
        link: art.url,
        isAnalyzing: true
      }));
      setNewsList(realArticles);

      // 2단계: Gemini API로 하나씩 정밀 요약
      for (let i = 0; i < realArticles.length; i++) {
        setStatusMsg(`Gemini AI analyzing source ${i + 1} of ${realArticles.length}...`);
        
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${userKeys.geminiKey}`;
        
        const geminiResponse = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: `Summarize this news article for a professional reporter in 3-4 concise sentences: ${realArticles[i].title}` }]
            }]
          })
        });

        const geminiData = await geminiResponse.json();
        const summaryText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "Analysis currently unavailable.";

        setNewsList(prev => prev.map((item, idx) => 
          idx === i ? { ...item, summary: summaryText, isAnalyzing: false } : item
        ));

        // API 과부하 방지를 위한 짧은 휴식
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      setIsFinished(true);
      setStatusMsg('Intelligence gathering and AI analysis complete.');

    } catch (error: any) {
      console.error(error);
      setStatusMsg(`System Alert: ${error.message}`);
    }
  };

  const savePDF = (item: NewsItem) => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(item.title, 10, 20);
    doc.setFontSize(12);
    doc.text(item.summary || "", 10, 40, { maxWidth: 180 });
    doc.save(`Intel_${item.title}.pdf`);
  };

  if (!user) {
    return (
      <div style={styles.loginOverlay}>
        <div style={styles.loginCard}>
          <h2 style={{ color: '#2c3e50' }}>Intelligence System Login</h2>
          <form onSubmit={handleLogin} style={styles.vStack}>
            <input type="email" placeholder="Email Address" value={email} onChange={(e) => setEmail(e.target.value)} style={styles.input} required />
            <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} style={styles.input} required />
            <button type="submit" style={styles.mainBtn}>Sign In</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.pageContainer}>
      <header style={styles.navBar}>
        <h2 style={{ margin: 0 }}>PH NEWS INTEL</h2>
        <div style={styles.hStack}>
          <span>{user.email}</span>
          {isAdmin && <button onClick={() => window.location.href = '/signup'} style={styles.adminBtn}>+ CREATE USER</button>}
          <button onClick={() => signOut(auth)} style={styles.logoutBtn}>Logout</button>
        </div>
      </header>
      <main style={{ marginTop: '30px' }}>
        <div style={styles.searchSection}>
          <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Enter topic..." style={{ ...styles.input, flex: 1 }} />
          <button onClick={startAnalysis} style={styles.mainBtn}>START ANALYSIS</button>
        </div>
        {statusMsg && <div style={isFinished ? styles.doneBanner : styles.infoBanner}>{statusMsg}</div>}
        <div style={styles.newsGrid}>
          {newsList.map((news, index) => (
            <div key={index} style={styles.reportCard}>
              <h4>{news.title}</h4>
              {news.isAnalyzing ? <div>⌛ Processing...</div> : 
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
  adminBtn: { padding: '5px 10px', backgroundColor: '#c0392b', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' },
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
