import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function RoleGate({ allow, children }) {
  const { role, isLoading, isAuthenticated } = useAuth()

  if (isLoading) {
    return null
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />
  }

  if (!allow.includes(role)) {
    return <Navigate to="/dashboard" replace />
  }

  return children
}

export default RoleGate
