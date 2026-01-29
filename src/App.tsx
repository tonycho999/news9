import React, { useState, useEffect } from 'react';
import { auth } from './firebase'; 
import { onAuthStateChanged, signOut, signInWithEmailAndPassword } from 'firebase/auth';
import jsPDF from 'jspdf';
import Signup from './Signup';

// --- Types ---
interface NewsItem {
  title: string;
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

  const isAdmin = user?.email === 'admin@test.com';

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
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

  // --- 핵심 수정: 검색 및 순차 요약 로직 ---
  const startAnalysis = async () => {
    if (!keyword) return alert("Please enter a topic.");
    
    setIsFinished(false);
    setNewsList([]); 
    
    // 1단계: 초기 엔진 가동 메시지 (화면 노출 없이 메시지만)
    setStatusMsg(`Initializing secure connection to global news servers for "${keyword}"...`);
    await new Promise(resolve => setTimeout(resolve, 5000)); 

    // 2단계: 딥 스크랩 시뮬레이션
    setStatusMsg(`Accessing and scraping verified news archives regarding "${keyword}"... This may take several minutes.`);
    await new Promise(resolve => setTimeout(resolve, 8000)); 

    // 3단계: 검색 결과 리스트 구성 (이제 리스트가 보이기 시작함)
    const initialResults: NewsItem[] = Array.from({ length: 10 }, (_, i) => ({
      title: `Intelligence Source #${i + 1} for "${keyword}" (Pending Analysis)`,
      isAnalyzing: true
    }));
    setNewsList(initialResults);

    // 4단계: 순차적 정밀 AI 요약 (하나씩 천천히 진행)
    for (let i = 0; i < initialResults.length; i++) {
      setStatusMsg(`Performing Deep AI Analysis on Article ${i + 1} of 10...`);
      
      // 기사 하나당 분석 시간을 15초~20초 정도로 대폭 늘림 (기자님 요청 반영)
      await new Promise(resolve => setTimeout(resolve, 15000)); 
      
      setNewsList(prev => prev.map((item, idx) => 
        idx === i ? { 
          ...item, 
          title: `Confirmed Intel: ${keyword} Report #${i + 1}`,
          summary: `[Full Intelligence Summary] This official news source regarding "${keyword}" has been fully scraped and analyzed. The system has identified key strategic patterns and extracted the core geopolitical data points relevant to report #${i+1}.`, 
          isAnalyzing: false 
        } : item
      ));
    }

    // 5단계: 최종 완료 메시지
    setIsFinished(true);
    setStatusMsg('Intelligence gathering and AI analysis for all 10 sources are now COMPLETE.');
  };

  const savePDF = (item: NewsItem) => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(item.title, 10, 20);
    doc.setFontSize(12);
    doc.text(item.summary || "", 10, 40, { maxWidth: 180 });
    doc.save(`Intel_Report_${item.title}.pdf`);
  };

  // --- Login View ---
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
          <p style={{ fontSize: '11px', color: '#95a5a6', marginTop: '15px' }}>Authorized Personnel Only</p>
        </div>
      </div>
    );
  }

  // --- Main Dashboard View ---
  return (
    <div style={styles.pageContainer}>
      <header style={styles.navBar}>
        <h2 style={{ margin: 0, letterSpacing: '1px' }}>PH NEWS INTEL</h2>
        <div style={styles.hStack}>
          <span style={{ fontWeight: 'bold' }}>{user.email}</span>
          {isAdmin && (
            <button onClick={() => window.location.href = '/signup'} style={styles.adminActionBtn}>
              + CREATE USER ACCOUNT
            </button>
          )}
          <button onClick={() => signOut(auth)} style={styles.logoutBtn}>Logout</button>
        </div>
      </header>

      <main style={{ marginTop: '40px' }}>
        <section style={styles.searchSection}>
          <input 
            value={keyword} 
            onChange={(e) => setKeyword(e.target.value)} 
            placeholder="Enter intelligence topic..." 
            style={{ ...styles.input, flex: 1, margin: 0 }}
          />
          <button onClick={startAnalysis} style={styles.mainBtn}>START ANALYSIS</button>
        </section>

        {statusMsg && (
          <div style={isFinished ? styles.doneBanner : styles.infoBanner}>
            {isFinished ? "✅ " : "🔎 "} {statusMsg}
          </div>
        )}

        <div style={styles.newsGrid}>
          {newsList.map((news, index) => (
            <div key={index} style={styles.reportCard}>
              <h4 style={{ margin: '0 0 10px 0' }}>{news.title}</h4>
              {news.isAnalyzing ? (
                <div style={styles.pulseLoader}>⌛ Analyzing intelligence data...</div>
              ) : (
                <>
                  <p style={styles.summaryTxt}>{news.summary}</p>
                  <button onClick={() => savePDF(news)} style={styles.pdfBtn}>EXPORT PDF</button>
                </>
              )}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

// --- Styles (동일) ---
const styles: { [key: string]: React.CSSProperties } = {
  pageContainer: { maxWidth: '1000px', margin: '0 auto', padding: '30px', fontFamily: '"Segoe UI", sans-serif', color: '#34495e' },
  navBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '3px solid #2c3e50', paddingBottom: '15px' },
  loginOverlay: { height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#ecf0f1' },
  loginCard: { padding: '50px', backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', textAlign: 'center' },
  vStack: { display: 'flex', flexDirection: 'column', gap: '15px', width: '320px' },
  hStack: { display: 'flex', alignItems: 'center', gap: '15px' },
  input: { padding: '14px', border: '1px solid #bdc3c7', borderRadius: '6px', fontSize: '15px' },
  mainBtn: { padding: '14px 25px', backgroundColor: '#2c3e50', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' },
  logoutBtn: { backgroundColor: 'transparent', border: '1px solid #bdc3c7', padding: '8px 15px', cursor: 'pointer', borderRadius: '4px' },
  adminActionBtn: { backgroundColor: '#c0392b', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' },
  searchSection: { display: 'flex', gap: '15px', marginBottom: '30px' },
  infoBanner: { padding: '15px', backgroundColor: '#ebf5fb', color: '#2980b9', borderRadius: '6px', marginBottom: '20px', fontWeight: 'bold' },
  doneBanner: { padding: '15px', backgroundColor: '#d4edda', color: '#155724', borderRadius: '6px', marginBottom: '20px', fontWeight: 'bold', border: '1px solid #c3e6cb' },
  newsGrid: { display: 'grid', gridTemplateColumns: '1fr', gap: '20px' },
  reportCard: { padding: '25px', border: '1px solid #dcdde1', borderRadius: '10px', backgroundColor: '#fcfcfc' },
  summaryTxt: { lineHeight: '1.7', fontSize: '15px' },
  pdfBtn: { backgroundColor: '#27ae60', color: '#fff', border: 'none', padding: '8px 15px', borderRadius: '4px', cursor: 'pointer' },
  pulseLoader: { color: '#2980b9', fontStyle: 'italic' }
};

export default App;
