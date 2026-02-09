import React from 'react';

export const styles: { [key: string]: React.CSSProperties } = {
  pageContainer: { maxWidth: '1000px', margin: '0 auto', padding: '20px', fontFamily: 'sans-serif' },
  navBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #333', paddingBottom: '10px' },
  loginOverlay: { height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f0f0' },
  loginCard: { padding: '40px', backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' },
  vStack: { display: 'flex', flexDirection: 'column', gap: '10px', width: '300px' },
  hStack: { display: 'flex', alignItems: 'center', gap: '10px' },
  input: { padding: '10px', border: '1px solid #ccc', borderRadius: '4px' },
  dateInput: { padding: '10px', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer' },
  mainBtn: { padding: '10px 20px', backgroundColor: '#2c3e50', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', minWidth: '150px' },
  disabledBtn: { padding: '10px 20px', backgroundColor: '#95a5a6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'not-allowed', minWidth: '150px' },
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
