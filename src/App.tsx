import React, { useState, useEffect } from 'react';
import { auth } from './firebase'; 
import { onAuthStateChanged, signOut } from 'firebase/auth';
import jsPDF from 'jspdf';

interface NewsItem {
  title: string;
  link: string;
  summary?: string;
  isAnalyzing: boolean;
}

function App() {
  const [user, setUser] = useState<any>(null);
  const [keyword, setKeyword] = useState('');
  const [newsList, setNewsList] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const isAdmin = user?.email === 'admin@test.com';

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  const searchNews = async () => {
    setLoading(true);
    const mockNews: NewsItem[] = Array.from({ length: 10 }, (_, i) => ({
      title: `${keyword} 관련 취재 기사 ${i + 1}`,
      link: "#",
      isAnalyzing: true
    }));
    setNewsList(mockNews);
    setLoading(false);

    for (let i = 0; i < mockNews.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      setNewsList(prev => prev.map((item, idx) => 
        idx === i ? { ...item, summary: `${keyword}에 대한 AI 분석 리포트입니다.`, isAnalyzing: false } : item
      ));
    }
  };

  const saveAsPDF = (item: NewsItem) => {
    const doc = new jsPDF();
    doc.text(item.title, 10, 10);
    doc.text(item.summary || "요약본이 없습니다.", 10, 20);
    doc.save(`${item.title}.pdf`);
  };

  if (!user) return <div style={{ padding: '20px' }}>로그인이 필요합니다.</div>;

  return (
    <div style={{ padding: '20px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #ccc', paddingBottom: '10px' }}>
        <h1>필리핀 뉴스 인텔리전스</h1>
        <div>
          <span>{user.email} 기자님</span>
          <button onClick={() => signOut(auth)} style={{ marginLeft: '10px' }}>로그아웃</button>
          {isAdmin && (
            <button 
              onClick={() => window.location.href = '/signup'} 
              style={{ marginLeft: '10px', backgroundColor: '#e74c3c', color: 'white' }}
            >
              ⚠️ 신규 기자 계정 생성 (관리자 전용)
            </button>
          )}
        </div>
      </header>
      <main style={{ marginTop: '20px' }}>
        <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="검색어를 입력하세요..." />
        <button onClick={searchNews}>취재 시작</button>
        <div style={{ marginTop: '20px' }}>
          {newsList.map((item, index) => (
            <div key={index} style={{ marginBottom: '15px', padding: '10px', border: '1px solid #eee' }}>
              <h3>{item.title}</h3>
              {item.isAnalyzing ? <p style={{ color: 'blue' }}>⏳ AI 분석 중...</p> : 
              <> <p>{item.summary}</p> <button onClick={() => saveAsPDF(item)}>PDF 저장</button> </>}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
export default App;
// Build Trigger: 2026-01-30
