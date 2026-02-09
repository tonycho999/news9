import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// [핵심] 보내주신 news-efc4a 프로젝트 설정값으로 교체 완료
const firebaseConfig = {
  apiKey: "AIzaSyDG82G8sn5WgAXJz_5e2ElOC6Bw_g4WzEY",
  authDomain: "news-efc4a.firebaseapp.com",
  projectId: "news-efc4a",
  storageBucket: "news-efc4a.firebasestorage.app",
  messagingSenderId: "717438175301",
  appId: "1:717438175301:web:32626f4b8010ee6c107b2c",
  measurementId: "G-GPS5MG9FTF"
};

// 1. 앱 초기화
const app = initializeApp(firebaseConfig);

// 2. 인증 및 DB 도구 내보내기 (다른 파일에서 쓸 수 있도록)
export const auth = getAuth(app);
export const db = getFirestore(app);
