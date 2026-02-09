import React, { useState } from 'react';
import { auth, db } from './firebase'; 
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore'; 

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

    // [진단 1] 버튼이 눌렸는지 확인
    console.log("Signup process started..."); 

    if (formData.password !== formData.confirmPassword) {
      return alert("Passwords do not match!");
    }

    try {
      // [진단 2] Firebase 인증 연결 시도
      console.log("Attempting to create user in Auth...");
      const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
      const user = userCredential.user;
      
      console.log("Auth Success! User UID:", user.uid); // 이게 안 뜨면 Auth 문제

      // [진단 3] Firestore 저장 시도
      console.log("Attempting to save to Firestore...");
      await setDoc(doc(db, "users", user.uid), {
        username: formData.username,
        email: formData.email,
        newsKey: formData.apiKey1,   
        geminiKey: formData.apiKey2, 
        createdAt: new Date().toISOString(),
        role: 'reporter'
      });

      console.log("Firestore Save Success!"); // 이게 안 뜨면 DB 문제
      alert(`User ${formData.username} created successfully!`);
      window.location.href = '/';

    } catch (error: any) {
      // [진단 4] 에러 발생 시 상세 내용 출력
      console.error("CRITICAL ERROR:", error);
      // 에러 메시지를 화면에 띄워서 알려줌
      alert("Registration Failed:\n" + error.message);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={{ marginBottom: '20px', color: '#2c3e50' }}>Create New Intelligence Account</h2>
        <form onSubmit={handleSignup} style={styles.form}>
          <label style={styles.label}>Reporter Name</label>
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

          <label style={styles.label}>Intelligence API Key 1 (News)</label>
          <input name="apiKey1" placeholder="Enter GNews Key" onChange={handleChange} style={styles.input} required />

          <label style={styles.label}>Intelligence API Key 2 (Gemini)</label>
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
