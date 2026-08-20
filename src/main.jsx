import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'lenis/dist/lenis.css'
import './index.css'
import './analysis.css'
// Last: the shared component layer aliases the portal's parts onto the
// internal class names, so it has to win on equal specificity.
import './system-components.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
