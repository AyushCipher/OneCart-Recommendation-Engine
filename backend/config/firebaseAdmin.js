import admin from 'firebase-admin'

let app = null

// Configured via FIREBASE_SERVICE_ACCOUNT (the service-account JSON as a string).
// Returns null when not configured so callers can fail closed.
const getApp = () => {
  if (app) return app
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) return null
  try {
    app = admin.apps.length
      ? admin.app()
      : admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) })
    return app
  } catch (err) {
    console.error('Firebase admin init failed:', err.message)
    return null
  }
}

export const isFirebaseConfigured = () => Boolean(getApp())

// Verifies a Firebase ID token and returns its decoded claims.
export const verifyFirebaseIdToken = async (idToken) => {
  const firebaseApp = getApp()
  if (!firebaseApp) return null
  return admin.auth(firebaseApp).verifyIdToken(idToken)
}
