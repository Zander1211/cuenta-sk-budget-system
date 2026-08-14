import { Loader2 } from 'lucide-react'

function LoadingScreen() {
  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      width: '100vw',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'radial-gradient(ellipse at 50% 50%, rgba(193, 246, 237, 0.08), transparent 60%), linear-gradient(160deg, #e6f5f0 0%, #dbeee9 40%, #c8e6e0 100%)'
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
        <Loader2 size={44} className="animate-spin" style={{ animation: 'spin 1s linear infinite', color: '#2EAF7D' }} />
        <p style={{ color: '#02353C', fontWeight: 600, fontSize: '0.95rem' }}>Checking authentication...</p>
      </div>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

export default LoadingScreen
