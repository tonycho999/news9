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

  // 종합 요약 관련 상태
  const [showModal, setShowModal] = useState(false);
  const [finalReport, setFinalReport] = useState('');
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) fetchKeys(currentUser);
    });
    return () => unsubscribe();
  }, []);

  const fetchKeys = async (currentUser: any) => {
    if (!currentUser) return null; 

    // 1. 브라우저 금고(Local Storage) 확인
    const localKeyData = localStorage.getItem(`api_keys_${currentUser.uid}`);
    if (localKeyData) {
        const parsedKeys = JSON.parse(localKeyData);
        if (parsedKeys.newsKey && parsedKeys.geminiKey) {
            console.log("✅ Loaded keys from Local Storage");
            setUserKeys(parsedKeys);
            return parsedKeys;
        }
    }

    // 2. DB에서 가져오기 (최초 1회)
    try {
      const userDoc = await getDoc(doc(db, "users", currentUser.uid));
      let keys = null;

      if (userDoc.exists()) {
        const data = userDoc.data();
        keys = { newsKey: data.newsKey || "", geminiKey: data.geminiKey || "" };
      } else {
        const querySnapshot = await getDocs(collection(db, "users"));
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          if (data.email === currentUser.email) {
            keys = { newsKey: data.newsKey || "", geminiKey: data.geminiKey || "" };
          }
        });
      }
      
      if (keys) {
        localStorage.setItem(`api_keys_${currentUser.uid}`, JSON.stringify(keys));
        setUserKeys(keys);
        return keys;
      }
    } catch (error) {
      console.error("Key fetch error:", error);
    }
    return null;
  };

  const manualUpdateKey = async () => {
    const newKey = prompt("🔑 Enter a NEW Gemini API Key from 'aistudio.google.com':");
    if (newKey && user) {
        const cleanKey = newKey.trim();
        try {
            await updateDoc(doc(db, "users", user.uid), { geminiKey: cleanKey });
            
            const currentKeys = userKeys || { newsKey: '', geminiKey: '' };
            const newKeys = { ...currentKeys, geminiKey: cleanKey };
            localStorage.setItem(`api_keys_${user.uid}`, JSON.stringify(newKeys));

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

  const handleLogout = () => {
      signOut(auth);
  };

  const findWorkingModel = async (apiKey: string) => {
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        const data = await response.json();
        if (!data.models) return "models/gemini-1.5-flash"; 
        const viableModel = data.models.find((m: any) => 
            m.supportedGenerationMethods?.includes("generateContent") &&
            (m.name.includes("flash") || m.name.includes("pro"))
        );
        if (viableModel) return viableModel.name;
        return "models/gemini-1.5-flash"; 
    } catch (e) {
        return "models/gemini-1.5-flash";
    }
  };

  const startAnalysis = async () => {
    if (!keyword) return alert("Please enter a topic.");
    setIsFinished(false);
    setShowModal(false);
    setNewsList([]); 

    try {
      let activeKeys = userKeys;
      if (!activeKeys || !activeKeys.newsKey) {
        setStatusMsg("System: Checking Credentials...");
        const fetched = await fetchKeys(user);
        if (!fetched || !fetched.newsKey) throw new Error("API Keys missing.");
        activeKeys = fetched;
      }

      setStatusMsg("System: Initializing AI...");
      let targetModel = "models/gemini-1.5-flash"; 
      try {
          targetModel = await findWorkingModel(activeKeys.geminiKey);
          if (!targetModel.startsWith('models/')) targetModel = `models/${targetModel}`;
      } catch (e) {}

      setStatusMsg(`System: Searching GNews for "${keyword}"...`);
      await new Promise(resolve => setTimeout(resolve, 1000));

      const newsUrl = `/news-api?q=${encodeURIComponent(keyword)}&country=ph&lang=en&max=10&token=${activeKeys.newsKey}`;
      const newsResponse = await fetch(newsUrl);
      if (!newsResponse.ok) throw new Error(`GNews API Error: ${newsResponse.statusText}`);
      
      const newsData = await newsResponse.json();
      if (!newsData.articles || newsData.articles.length === 0) throw new Error("No news found.");

      const realArticles: NewsItem[] = newsData.articles.map((art: any) => ({
        title: art.title,
        link: art.url,
        isAnalyzing: true
      }));
      setNewsList(realArticles);

      for (let i = 0; i < realArticles.length; i++) {
        let attempts = 0;
        let success = false;
        let summaryText = "Analysis unavailable.";
        setStatusMsg(`System: Analyzing article ${i + 1}/${realArticles.length}...`);

        while (attempts < 3 && !success) {
            try {
                const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/${targetModel}:generateContent?key=${activeKeys.geminiKey}`;
                const geminiResponse = await fetch(geminiUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    contents: [{ parts: [{ text: `Summarize this news title in 3 sentences: "${realArticles[i].title}"` }] }]
                  })
                });

                if (geminiResponse.status === 429) {
                    setStatusMsg(`⚠️ Speed Limit. Cooling down for 10s...`);
                    await new Promise(resolve => setTimeout(resolve, 10000));
                    attempts++;
                    continue; 
                }

                if (geminiResponse.status !== 200) {
                     if (geminiResponse.status === 400 || geminiResponse.status === 404) {
                        const errData = await geminiResponse.json();
                        if (window.confirm(`Gemini Key Error: ${errData.error?.message}\nUpdate Key?`)) {
                            manualUpdateKey();
                            return;
                        }
                     }
                     throw new Error("API Error");
                }

                const geminiData = await geminiResponse.json();
                summaryText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "Analysis unavailable.";
                success = true;
            } catch (error) {
                attempts++;
                if (attempts < 3) await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        setNewsList(prev => prev.map((item, idx) => idx === i ? { ...item, summary: summaryText, isAnalyzing: false } : item));
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      setIsFinished(true);
      setStatusMsg('System: All Intelligence Gathered.');
    } catch (error: any) {
      console.error(error);
      setStatusMsg(`System Alert: ${error.message}`);
    }
  };

  // [핵심 변경] 60초 타임아웃 적용된 Daily Briefing 생성
  const generateDailyBriefing = async () => {
    setIsGeneratingReport(true);
    // 사용자에게 60초까지 걸릴 수 있다고 안내
    setFinalReport("✍️ AI is writing the Executive Briefing... (Allow up to 60 seconds for deep analysis)");
    setShowModal(true);

    // 60초 타임아웃 설정 (AbortController 사용)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60,000ms = 1분

    try {
        const allSummaries = newsList.map(n => `- ${n.title}: ${n.summary}`).join("\n");
        const prompt = `Based on the following news summaries about "${keyword}", write a comprehensive executive briefing.
        Structure it with:
        1. Key Trends (What is happening overall?)
        2. Major Details (Important facts)
        3. Conclusion (What this means)
        
        News Data:
        ${allSummaries}`;

        let targetModel = "models/gemini-1.5-flash"; 
        
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/${targetModel}:generateContent?key=${userKeys?.geminiKey}`;
        
        const response = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }]
            }),
            signal: controller.signal // 타임아웃 신호 연결
        });

        clearTimeout(timeoutId); // 성공하면 타이머 해제

        if (!response.ok) {
            throw new Error(`Server Error: ${response.statusText}`);
        }

        const data = await response.json();
        const report = data.candidates?.[0]?.content?.parts?.[0]?.text || "Report generation returned empty.";
        setFinalReport(report);

    } catch (e: any) {
        if (e.name === 'AbortError') {
            setFinalReport("⚠️ Error: Generation timed out (exceeded 60 seconds). Please try again or reduce news volume.");
        } else {
            setFinalReport(`⚠️ Error generating report: ${e.message}`);
        }
    } finally {
        setIsGeneratingReport(false);
    }
  };

  const downloadFinalPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`Daily Briefing: ${keyword}`, 10, 20);
    
    doc.setFontSize(11);
    const splitText = doc.splitTextToSize(finalReport, 180);
    doc.text(splitText, 10, 30);
    
    doc.save(`${keyword}_Briefing.pdf`);
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
          <button onClick={handleLogout} style={styles.logoutBtn}>Logout</button>
        </div>
      </header>
      <main style={{ marginTop: '30px' }}>
        <div style={styles.searchSection}>
          <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Topic..." style={{ ...styles.input, flex: 1 }} />
          <button onClick={startAnalysis} style={styles.mainBtn}>START ANALYSIS</button>
        </div>

        {statusMsg && (
            <div style={{ ... (isFinished ? styles.doneBanner : styles.infoBanner), display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{statusMsg}</span>
                {isFinished && (
                    <button onClick={generateDailyBriefing} style={styles.briefingBtn}>
                        📢 CREATE DAILY BRIEFING
                    </button>
                )}
            </div>
        )}

        <div style={styles.newsGrid}>
          {newsList.map((news, index) => (
            <div key={index} style={styles.reportCard}>
              <h4>{news.title}</h4>
              {news.isAnalyzing ? <div>⌛ Analyzing...</div> : 
              <>
                <p style={styles.summaryTxt}>{news.summary}</p>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <a href={news.link} target="_blank" rel="noopener noreferrer" style={styles.linkBtn}>SOURCE ▶</a>
                </div>
              </>}
            </div>
          ))}
        </div>
      </main>

      {showModal && (
          <div style={styles.modalOverlay}>
              <div style={styles.modalContent}>
                  <h3 style={{ borderBottom: '1px solid #ddd', paddingBottom: '10px' }}>
                      📋 Executive Daily Briefing: {keyword}
                  </h3>
                  <div style={styles.reportBox}>
                    {/* [수정] 로딩 메시지 조건부 렌더링 */}
                    {isGeneratingReport ? (
                        <div style={{textAlign: 'center', marginTop: '20px'}}>
                            <p style={{fontSize: '18px', fontWeight: 'bold'}}>✍️ Generating Report...</p>
                            <p style={{color: '#666'}}>Please wait up to 60 seconds.</p>
                        </div>
                    ) : finalReport}
                  </div>
                  <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                      <button onClick={() => setShowModal(false)} style={styles.closeBtn}>Close</button>
                      {!isGeneratingReport && (
                          <button onClick={downloadFinalPDF} style={styles.pdfBtn}>
                              ⬇️ Download Full PDF
                          </button>
                      )}
                  </div>
              </div>
          </div>
      )}
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
  infoBanner: { padding: '15px', backgroundColor: '#e1f5fe', marginBottom: '20px', borderRadius: '4px' },
  doneBanner: { padding: '15px', backgroundColor: '#e8f5e9', marginBottom: '20px', borderRadius: '4px', border: '1px solid #c8e6c9' },
  newsGrid: { display: 'flex', flexDirection: 'column', gap: '15px' },
  reportCard: { padding: '20px', border: '1px solid #ddd', borderRadius: '8px', backgroundColor: '#fff' },
  summaryTxt: { lineHeight: '1.6', fontSize: '14px', color: '#444' },
  briefingBtn: { padding: '8px 15px', backgroundColor: '#27ae60', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' },
  linkBtn: { padding: '5px 15px', backgroundColor: '#34495e', color: '#fff', textDecoration: 'none', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  modalContent: { backgroundColor: '#fff', padding: '30px', borderRadius: '10px', width: '600px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' },
  reportBox: { whiteSpace: 'pre-wrap', lineHeight: '1.6', fontSize: '14px', marginTop: '10px', flex: 1, overflowY: 'auto', padding: '10px', backgroundColor: '#f9f9f9', borderRadius: '4px' },
  pdfBtn: { padding: '10px 20px', backgroundColor: '#e74c3c', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' },
  closeBtn: { padding: '10px 20px', backgroundColor: '#95a5a6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }
};

export default App;
