import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './ui/App.tsx'
import './styles.css'

// ?dev opens the screen gallery instead of the game — a catalog of every screen
// and branch with its trigger, sequence, and variable sources, for auditing.
// Lazy-loaded so its chunk never reaches normal players.
const isDev = new URLSearchParams(location.search).has('dev')
const DevGallery = React.lazy(() => import('./ui/DevGallery.tsx').then((m) => ({ default: m.DevGallery })))

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isDev ? <React.Suspense fallback={null}><DevGallery /></React.Suspense> : <App />}
  </React.StrictMode>,
)

// PWA: installs to a phone home screen, runs on a plane. (SPEC §13)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('./sw.js')
  })
}
