import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { ACTIVE_SEASON } from './config/season.js'
import './i18n/index.js'

if (ACTIVE_SEASON) {
  document.documentElement.dataset.season = ACTIVE_SEASON
} else {
  delete document.documentElement.dataset.season
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
