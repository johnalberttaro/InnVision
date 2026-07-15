import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBNWEQbaSPMb5o05g5VlNYypRngX7v-HFI",
  authDomain: "innvision-62466.firebaseapp.com",
  projectId: "innvision-62466",
  storageBucket: "innvision-62466.firebasestorage.app",
  messagingSenderId: "272556017760",
  appId: "1:272556017760:web:e695eb3bef140f9fad1b05",
  measurementId: "G-5HKBJH84W2",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

const secondaryApp = getApps().find((registeredApp) => registeredApp.name === '[SECONDARY]') || initializeApp(firebaseConfig, '[SECONDARY]');
export const secondaryAuth = getAuth(secondaryApp);
export const db = getFirestore(app);
export default app;