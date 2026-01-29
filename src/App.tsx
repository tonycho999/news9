import React, { useState, useEffect } from 'react';
import { auth } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import jsPDF from 'jspdf'; // 앞서 설치한 jspdf 라이브러리

// 뉴스 아이템 타입 정의
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

  // 관리자 여부 확인
  const isAdmin = user?.email === 'admin@test.com';

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // 뉴스 검색 및 순차 요약 로직
  const searchNews = async () => {
    setLoading(true);
    // 1. 뉴스 제목 10개를 먼저 즉시 가져옵니다.
    const mockNews: NewsItem[] = Array.from({ length: 10 }, (_, i) => ({
      title: `${keyword} 관련 취재 기사 ${i + 1}`,
      link: "#",
      isAnalyzing: true
    }));
    setNewsList(mockNews);
    setLoading(false);

    // 2. 각 기사별로 순차적으로 AI 요약을 진행합니다.
    for (let i = 0; i < mockNews.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // 요약 중임을 시연
      setNewsList(prev => prev.map((item, idx) => 
        idx === i ? { ...item, summary: `${keyword}에 대한 AI 분석 리포트입니다.`, isAnalyzing: false } : item
      ));
    }
  };

  // PDF 저장 기능 (jspdf 활용)
  const saveAsPDF = (item: NewsItem) => {
    const doc = new jsPDF();
    doc.text(item.title, 10, 10);
    doc.text(item.summary || "요약본이 없습니다.", 10, 20);
    doc.save(`${item.title}.pdf`);
  };

  if (!user) return <div>로그인이 필요합니다. (Login form here)</div>;

  return (
    <div style={{ padding: '20px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #ccc', pb: '10px' }}>
        <h1>필리핀 뉴스 인텔리전스</h1>
        <div>
          <span>{user.email} 기자님</span>
          <button onClick={() => signOut(auth)}>로그아웃</button>
          
          {/* 관리자(admin@test.com)에게만 보이는 버튼 */}
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
        <input 
          value={keyword} 
          onChange={(e) => setKeyword(e.target.value)} 
          placeholder="검색어를 입력하세요..." 
        />
        <button onClick={searchNews}>취재 시작</button>

        <div style={{ marginTop: '20px' }}>
          {newsList.map((item, index) => (
            <div key={index} style={{ marginBottom: '15px', padding: '10px', border: '1px solid #eee' }}>
              <h3>{item.title}</h3>
              {item.isAnalyzing ? (
                <p style={{ color: 'blue' }}>⏳ AI가 기사를 분석 중입니다...</p>
              ) : (
                <>
                  <p>{item.summary}</p>
                  <button onClick={() => saveAsPDF(item)}>PDF 리포트 저장</button>
                </>
              )}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

export default App;
