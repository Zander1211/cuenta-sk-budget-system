import { Loader2 } from 'lucide-react'

function LoadingScreen() {
  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      width: '100vw',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#f9fafb'
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
        <Loader2 size={40} className="animate-spin" style={{ animation: 'spin 1s linear infinite', color: '#10b981' }} />
        <p style={{ color: '#4b5563', fontWeight: 500 }}>Checking authentication...</p>
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
