import React, { useState } from 'react';
import { auth } from './firebase';
import { createUserWithEmailAndPassword } from 'firebase/auth';

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
      // Firebase 계정 생성
      await createUserWithEmailAndPassword(auth, formData.email, formData.password);
      
      // 가입 성공 시 알림 (실제 운영 시에는 여기서 Firestore 등에 API Key를 저장합니다)
      alert(`User ${formData.username} created successfully! API Keys have been registered.`);
      window.location.href = '/';
    } catch (error: any) {
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
          <input name="apiKey1" placeholder="Enter API Key 1" onChange={handleChange} style={styles.input} required />

          <label style={styles.label}>Intelligence API Key 2 (AI Analysis)</label>
          <input name="apiKey2" placeholder="Enter API Key 2" onChange={handleChange} style={styles.input} required />

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
