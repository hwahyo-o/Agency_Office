import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAnalytics, isSupported, logEvent } from 'firebase/analytics';

export async function trackPageView() {
  const measurementId = process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID;
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;

  if (!measurementId || !apiKey || !appId || !projectId || !authDomain) return;
  if (!(await isSupported())) return;

  const app = getApps().length
    ? getApp()
    : initializeApp({ measurementId, apiKey, appId, projectId, authDomain });

  const analytics = getAnalytics(app);
  logEvent(analytics, 'page_view', { page_path: window.location.pathname });
}
