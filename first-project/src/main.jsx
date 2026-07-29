import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import useFlowStore from './store/useFlowStore'

// Playwright/E2E: 스토어 스냅샷·좌표 주입 검증용
if (import.meta.env.DEV || new URLSearchParams(window.location.search).has('e2e')) {
  window.__FLOW_STORE__ = useFlowStore
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
