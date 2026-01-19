import { initializeApp } from 'firebase/app';
import { getAuth, browserLocalPersistence, setPersistence } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCduaC_62G-G6Kzxl8Uo4PSWZtCW5T9pvM",
  authDomain: "kopsi-survival.firebaseapp.com",
  projectId: "kopsi-survival",
  storageBucket: "kopsi-survival.firebasestorage.app",
  messagingSenderId: "665873618582",
  appId: "1:665873618582:web:892271ef9d74f38a9c94b7",
  measurementId: "G-XQFEFW1QD6"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Auth with persistence (자동 로그인)
export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence);

// Initialize Firestore with offline persistence
export const db = getFirestore(app);

// Enable offline persistence (오프라인에서도 동작)
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code === 'failed-precondition') {
    // Multiple tabs open, persistence can only be enabled in one tab at a time.
    console.warn('Firestore persistence already enabled in another tab');
  } else if (err.code === 'unimplemented') {
    // The current browser does not support all of the features required
    console.warn('Firestore persistence not supported in this browser');
  }
});

export default app;
