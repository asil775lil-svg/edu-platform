import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  type Auth,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyD2XQ_7uIOk6R1w1MFtc5l8TXW16Xaif8c",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "smart-education-ed253.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "smart-education-ed253",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "smart-education-ed253.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "981195951450",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:981195951450:web:9f1c9518cfdbcfd0c47763",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-M6PP83HH9K",
};

export const app: FirebaseApp =
  getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth: Auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  firebaseSignOut,
};
