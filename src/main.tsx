import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { PlanProvider } from './features/plan/PlanProvider'
import '../style.css'
import './step-two.css'
import './release.css'
import './workspace.css'
import './travel-book.css'

const root = document.getElementById('root')

if (!root) throw new Error('未找到应用挂载节点。')

createRoot(root).render(<StrictMode><PlanProvider><App /></PlanProvider></StrictMode>)
