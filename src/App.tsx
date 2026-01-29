import React, { useState, useEffect } from 'react';
import { auth } from './firebase'; 
import { onAuthStateChanged, signOut, signInWithEmailAndPassword } from 'firebase/auth';
import jsPDF from 'jspdf';

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
  const [loading, setLoading] = useState(false);

  const isAdmin = user?.email === 'admin@test.com';

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      alert("로그인 실패: 이메일과 비밀번호를 확인하세요.");
    }
  };

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
      await new Promise(resolve => setTimeout(resolve, 800));
      setNewsList(prev => prev.map((item, idx) => 
        idx === i ? { ...item, summary: `${keyword}에 대한 AI 분석 리포트입니다.`, isAnalyzing: false } : item
      ));
    }
  };

  const saveAsPDF = (item: NewsItem) => {
    const doc = new jsPDF();
    doc.text(item.title, 10, 10);
    doc.text(item.summary || "", 10, 20);
    doc.save(`${item.title}.pdf`);
  };

  // 1. 로그인 전 화면 (로그인 폼 디자인 추가)
  if (!user) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '100px' }}>
        <h2>필리핀 뉴스 인텔리전스 로그인</h2>
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', width: '300px', gap: '10px' }}>
          <input type="email" placeholder="이메일" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input type="password" placeholder="비밀번호" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <button type="submit">로그인</button>
        </form>
        <p style={{ fontSize: '12px', color: '#666', marginTop: '20px' }}>관리자: admin@test.com</p>
      </div>
    );
  }

  // 2. 로그인 후 화면
  return (
    <div style={{ padding: '20px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #ccc', paddingBottom: '10px' }}>
        <h1>PH News Intel</h1>
        <div>
          <span>{user.email} 님</span>
          <button onClick={() => signOut(auth)} style={{ marginLeft: '10px' }}>로그아웃</button>
          {isAdmin && (
            <button onClick={() => window.location.href = '/signup'} style={{ marginLeft: '10px', backgroundColor: '#e74c3c', color: 'white' }}>
              ⚠️ 계정 생성
            </button>
          )}
        </div>
      </header>
      <main style={{ marginTop: '20px' }}>
        <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="키워드 입력..." />
        <button onClick={searchNews}>뉴스 분석 시작</button>
        <div style={{ marginTop: '20px' }}>
          {newsList.map((item, index) => (
            <div key={index} style={{ marginBottom: '15px', padding: '15px', border: '1px solid #eee', borderRadius: '8px' }}>
              <h3>{item.title}</h3>
              {item.isAnalyzing ? <p style={{ color: '#3498db' }}>⌛ AI 분석 중...</p> : 
              <> <p>{item.summary}</p> <button onClick={() => saveAsPDF(item)}>PDF 저장</button> </>}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
export default App;
