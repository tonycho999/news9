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

  const manualUpdateKey = async () => {
    const newKey = prompt("🔑 Enter a NEW Gemini API Key from 'aistudio.google.com':\n(Do NOT use the Firebase Key starting with same letters)");
    if (newKey && user) {
        const cleanKey = newKey.trim();
        try {
            await updateDoc(doc(db, "users", user.uid), {
                geminiKey: cleanKey
            });
            alert("✅ Key Updated! Reloading...");
            window.location.reload(); 
        } catch (e) {
            alert("DB Update Failed.");
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

  // [핵심 기능] 사용 가능한 모델을 스스로 찾아내는 함수
  const findWorkingModel = async (apiKey: string) => {
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        const data = await response.json();
        
        if (!data.models) {
            throw new Error(data.error?.message || "Invalid API Key");
        }

        // 'generateContent' 기능을 지원하는 모델 중 가장 최신 모델을 찾음
        const viableModel = data.models.find((m: any) => 
            m.supportedGenerationMethods?.includes("generateContent") &&
            (m.name.includes("flash") || m.name.includes("pro"))
        );

        if (viableModel) {
            console.log("✅ Auto-Detected Model:", viableModel.name);
            return viableModel.name; // 예: 'models/gemini-1.5-flash'
        }
        return "models/gemini-pro"; // 못 찾으면 기본값
    } catch (e) {
        console.error("Model Detection Failed:", e);
        throw e;
    }
  };

  const startAnalysis = async () => {
    if (!keyword) return alert("Please enter a topic.");
    
    setIsFinished(false);
    setNewsList([]); 

    try {
      let activeKeys = userKeys;

      if (!activeKeys || !activeKeys.newsKey) {
        setStatusMsg("System: Check Credentials...");
        const fetched = await fetchKeys(user);
        if (!fetched || !fetched.newsKey) {
            throw new Error("API Keys missing. Please use 'Change Keys' button.");
        }
        activeKeys = fetched;
      }

      // [1단계] 사용 가능한 AI 모델 자동 감지
      setStatusMsg("System: Auto-detecting best AI model...");
      let targetModel = "models/gemini-1.5-flash"; // 기본값
      try {
          targetModel = await findWorkingModel(activeKeys.geminiKey);
          // 모델명 앞에 'models/'가 없으면 붙여줌 (API 요구사항)
          if (!targetModel.startsWith('models/')) {
              targetModel = `models/${targetModel}`;
          }
      } catch (e: any) {
          // 모델 목록조차 못 가져오면 키가 틀린 것임
          if (window.confirm(`⚠️ API Key Error: ${e.message}\n\nUpdate Key?`)) {
              manualUpdateKey();
              return;
          }
      }

      // [2단계] 뉴스 검색
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

      // [3단계] Gemini 루프 (찾아낸 모델 사용)
      for (let i = 0; i < realArticles.length; i++) {
        setStatusMsg(`System: Analyzing article ${i + 1} with ${targetModel.replace('models/', '')}...`);
        
        // 자동 감지된 모델 URL 사용
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/${targetModel}:generateContent?key=${activeKeys.geminiKey}`;
        
        const geminiResponse = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `Summarize this news title in 3 sentences: "${realArticles[i].title}"` }] }]
          })
        });

        const geminiData = await geminiResponse.json();
        
        if (geminiResponse.status !== 200) {
             console.error("Gemini Error:", geminiData);
             // 모델 감지 후에도 에러가 나면 내용 문제일 수 있음, 일단 진행
        }

        const summaryText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "Analysis unavailable (Content blocked or Error).";

        setNewsList(prev => prev.map((item, idx) => 
          idx === i ? { ...item, summary: summaryText, isAnalyzing: false } : item
        ));
        
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
          <button onClick={manualUpdateKey} style={styles.keyBtn}>🔑 Change Keys</button>
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
              {news.isAnalyzing ? <div>⌛ Deep Analyzing...</div> : 
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
  keyBtn: { padding: '5px 10px', backgroundColor: '#f39c12', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginRight: '5px' },
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
