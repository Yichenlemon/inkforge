import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './components/App.jsx'
import './index.css'

const el = document.getElementById('root')
if (!el) throw new Error('#root 未找到')

createRoot(el).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
