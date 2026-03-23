import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyAX0ck49S7hN9oza8vQvWJFBQtSsF2mlSw',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'bcs-internal.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'bcs-internal',
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
