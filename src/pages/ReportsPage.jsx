import RoleGate from '../components/RoleGate'
import SectionPage from '../components/SectionPage'
import { dashboardSections } from './dashboardSections'

function ReportsPage() {
  return (
    <RoleGate allow={['SK Chairman']}>
      <SectionPage {...dashboardSections.reports} />
    </RoleGate>
  )
}

export default ReportsPage
