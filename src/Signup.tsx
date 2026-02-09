import React, { useState } from 'react';
import { auth, db } from './firebase'; // db 추가
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore'; // Firestore 저장 함수 추가

function Signup() {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    apiKey1: '',
    apiKey2: ''
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.password !== formData.confirmPassword) {
      return alert("Passwords do not match!");
    }

    try {
      // 1. Firebase 인증 계정 생성 (로그인용)
      const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
      const user = userCredential.user;
      
      console.log("Auth Account Created:", user.uid);

      // 2. Firestore 데이터베이스에 유저 정보 및 API Key 저장 (필수 단계)
      // App.tsx가 읽어갈 수 있도록 필드명을 newsKey, geminiKey로 매핑하여 저장합니다.
      await setDoc(doc(db, "users", user.uid), {
        username: formData.username,
        email: formData.email,
        newsKey: formData.apiKey1,   // apiKey1 입력값을 newsKey로 저장
        geminiKey: formData.apiKey2, // apiKey2 입력값을 geminiKey로 저장
        createdAt: new Date().toISOString(),
        role: 'reporter'
      });

      alert(`User ${formData.username} created successfully! API Keys are saved to database.`);
      
      // 가입 성공 시 메인 화면으로 이동 (자동 로그인 됨)
      window.location.href = '/';

    } catch (error: any) {
      console.error("Signup Error:", error);
      alert("Error creating account: " + error.message);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={{ marginBottom: '20px', color: '#2c3e50' }}>Create New Intelligence Account</h2>
        <form onSubmit={handleSignup} style={styles.form}>
          <label style={styles.label}>Reporter Name (Username)</label>
          <input name="username" placeholder="Full Name" onChange={handleChange} style={styles.input} required />
          
          <label style={styles.label}>Official Email</label>
          <input name="email" type="email" placeholder="email@example.com" onChange={handleChange} style={styles.input} required />
          
          <div style={{ display: 'flex', gap: '10px' }}>
            <div style={{ flex: 1 }}>
              <label style={styles.label}>Password</label>
              <input name="password" type="password" placeholder="••••••••" onChange={handleChange} style={styles.input} required />
            </div>
            <div style={{ flex: 1 }}>
              <label style={styles.label}>Confirm Password</label>
              <input name="confirmPassword" type="password" placeholder="••••••••" onChange={handleChange} style={styles.input} required />
            </div>
          </div>

          <hr style={{ margin: '20px 0', border: '0.5px solid #eee' }} />

          <label style={styles.label}>Intelligence API Key 1 (News Access)</label>
          <input name="apiKey1" placeholder="Enter GNews Key" onChange={handleChange} style={styles.input} required />

          <label style={styles.label}>Intelligence API Key 2 (AI Analysis)</label>
          <input name="apiKey2" placeholder="Enter Gemini Key" onChange={handleChange} style={styles.input} required />

          <button type="submit" style={styles.submitBtn}>REGISTER ACCOUNT</button>
          <button type="button" onClick={() => window.location.href = '/'} style={styles.cancelBtn}>CANCEL</button>
        </form>
      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: { height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#f4f7f6' },
  card: { width: '450px', padding: '40px', backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 8px 20px rgba(0,0,0,0.1)' },
  form: { display: 'flex', flexDirection: 'column', gap: '12px' },
  label: { fontSize: '13px', fontWeight: 'bold', color: '#7f8c8d', textAlign: 'left' },
  input: { padding: '12px', border: '1px solid #dcdde1', borderRadius: '6px', fontSize: '14px' },
  submitBtn: { padding: '15px', backgroundColor: '#c0392b', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', marginTop: '10px' },
  cancelBtn: { padding: '10px', backgroundColor: 'transparent', color: '#7f8c8d', border: 'none', cursor: 'pointer', fontSize: '13px' }
};

export default Signup;
