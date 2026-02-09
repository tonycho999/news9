import React from 'react';
import Signup from './Signup';
import { useNewsIntel } from './useNewsIntel'; // Logic Hook 가져오기
import { styles } from './styles'; // Style 가져오기

function App() {
  // 로직 파일에서 모든 기능과 상태를 한 번에 가져옴
  const {
    user, email, setEmail, password, setPassword, targetDate, setTargetDate, getTodayPHT,
    keyword, setKeyword, newsList, isFinished, statusMsg, cooldown,
    showModal, setShowModal, finalReport, isGeneratingReport,
    handleLogin, handleLogout, startAnalysis, generateDailyBriefing, downloadFinalPDF
  } = useNewsIntel();

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
          <input type="date" value={targetDate} max={getTodayPHT()} onChange={(e) => setTargetDate(e.target.value)} style={styles.dateInput} />
          <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Topic..." style={{ ...styles.input, flex: 1 }} />
          <button onClick={startAnalysis} style={cooldown > 0 ? styles.disabledBtn : styles.mainBtn} disabled={cooldown > 0}>
            {cooldown > 0 ? `WAIT ${Math.floor(cooldown / 60)}m ${cooldown % 60}s` : "START ANALYSIS"}
          </button>
        </div>

        {statusMsg && (
            <div style={{ ... (isFinished ? styles.doneBanner : styles.infoBanner), display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{statusMsg}</span>
                {isFinished && ( <button onClick={generateDailyBriefing} style={styles.briefingBtn}>📢 CREATE DAILY BRIEFING</button> )}
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
                  <h3 style={{ borderBottom: '1px solid #ddd', paddingBottom: '10px' }}>📋 Executive Daily Briefing: {keyword} ({targetDate})</h3>
                  <div style={styles.reportBox}>
                    {isGeneratingReport ? (
                        <div style={{textAlign: 'center', marginTop: '20px'}}>
                            <p style={{fontSize: '18px', fontWeight: 'bold'}}>✍️ Generating Report...</p>
                            <p style={{color: '#666'}}>Please wait up to 5 minutes for deep analysis.</p>
                        </div>
                    ) : finalReport}
                  </div>
                  <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                      <button onClick={() => setShowModal(false)} style={styles.closeBtn}>Close</button>
                      {!isGeneratingReport && ( <button onClick={downloadFinalPDF} style={styles.pdfBtn}>⬇️ Download Full PDF</button> )}
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}

export default App;
