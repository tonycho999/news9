import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore"; // Firestore 추가

const firebaseConfig = {
  apiKey: "AIzaSyDdyLCiNuJ8x-iSH0OT3Jrwte_X1w97I8k",
  authDomain: "hrproject-744f0.firebaseapp.com",
  projectId: "hrproject-744f0",
  storageBucket: "hrproject-744f0.firebasestorage.app",
  messagingSenderId: "37797360783",
  appId: "1:37797360783:web:aceb21a9bb37b336516cfa",
  measurementId: "G-XTS13EJ5XK"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app); // db를 외부에서 쓸 수 있게 내보냄
