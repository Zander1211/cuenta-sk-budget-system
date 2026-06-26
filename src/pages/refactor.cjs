const fs = require('fs');
const oldAi = fs.readFileSync('AiAnalysisPage_old.jsx', 'utf8');
const oldMain = fs.readFileSync('MainDashboardPage_old.jsx', 'utf8');

// 1. Build new MainDashboardPage.jsx (from oldAi)
let newMain = oldAi;
newMain = newMain.replace('function AiAnalysisPage() {', 'function MainDashboardPage() {');
newMain = newMain.replace('export default AiAnalysisPage', 'export default MainDashboardPage');

// Add imports
newMain = `import { Search } from 'lucide-react'\nimport { useAuth } from '../context/AuthContext'\nimport NotificationBell from '../components/NotificationBell'\nimport GlobalSearch from '../components/GlobalSearch'\n` + newMain;

// Add variables
const varsToAdd = `
  const { role } = useAuth()
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const currentDate = new Date()
  const greetingRole = role?.replace('SK ', '') || 'Team'
  const initials = role
    ? role
        .split(' ')
        .map((word) => word[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'U'
  const currentHour = currentDate.getHours()
  let timeOfDayGreeting = 'Good evening'
  if (currentHour >= 5 && currentHour < 12) {
    timeOfDayGreeting = 'Good morning'
  } else if (currentHour >= 12 && currentHour < 18) {
    timeOfDayGreeting = 'Good afternoon'
  }
`;
newMain = newMain.replace('const { budgets, expenses, requests, totals } = useBudget()', 'const { budgets, expenses, requests, totals } = useBudget()\n' + varsToAdd);

// Replace header
const newHeader = `<>
      <section className="dashboard-topbar">
        <div className="topbar-greeting">
          <h1>{timeOfDayGreeting}, {greetingRole}!</h1>
          <p>Here&apos;s an overview of your financial status and key insights.</p>
        </div>
        <div className="topbar-actions">
          <label className="search-field" onClick={() => setIsSearchOpen(true)}>
            <Search size={16} />
            <input type="button" value="Search projects, categories..." aria-label="Search" style={{ textAlign: 'left', cursor: 'pointer' }} />
          </label>
          {['SK Chairman', 'SK Treasurer'].includes(role) && <NotificationBell />}
          <div className="user-chip">
            <span className="user-avatar">{initials}</span>
            <span className="user-info">
              <span className="user-name">{role}</span>
              <span className="user-role">Active role</span>
            </span>
          </div>
        </div>
      </section>`;

// Replace <RoleGate allow={...}> \\n <header ...> ... </header> with newHeader
newMain = newMain.replace(/<RoleGate allow=\{\['SK Chairman', 'SK Treasurer'\]\}>\s*<header className="dashboard-header">[\s\S]*?<\/header>/, newHeader);

// Replace </RoleGate> with <GlobalSearch ... /> </>
newMain = newMain.replace(/<\/RoleGate>/, '<GlobalSearch isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />\n    </>');


// 2. Build new AiAnalysisPage.jsx (from oldMain)
let newAi = oldMain;
newAi = newAi.replace('function MainDashboardPage() {', 'function AiAnalysisPage() {');
newAi = newAi.replace('export default MainDashboardPage', 'export default AiAnalysisPage');

// Add RoleGate import
newAi = `import RoleGate from '../components/RoleGate'\n` + newAi;

newAi = newAi.replace(/const greetingRole = role\?\.replace\('SK ', ''\) \|\| 'Team'\n/, '');
newAi = newAi.replace(/const initials = role\s*\?\s*role\s*\.split\(' '\)\s*\.map\(\(word\) => word\[0\]\)\s*\.join\(''\)\s*\.slice\(0, 2\)\s*\.toUpperCase\(\)\s*:\s*'U'\n/, '');
newAi = newAi.replace(/const currentHour = currentDate\.getHours\(\)\s*let timeOfDayGreeting = 'Good evening'\s*if \(currentHour >= 5 && currentHour < 12\) \{\s*timeOfDayGreeting = 'Good morning'\s*\} else if \(currentHour >= 12 && currentHour < 18\) \{\s*timeOfDayGreeting = 'Good afternoon'\s*\}/, '');

const aiHeader = `<RoleGate allow={['SK Chairman', 'SK Treasurer']}>
      <header className="dashboard-header">
        <div className="header-left">
          <div>
            <p className="eyebrow">Financial Dashboard</p>
            <h1>Budget Overview</h1>
            <p>Comprehensive view of quarterly and yearly budget allocations.</p>
          </div>
        </div>
      </header>`;

newAi = newAi.replace(/<>\s*<section className="dashboard-topbar">[\s\S]*?<\/section>/, aiHeader);

newAi = newAi.replace(/<GlobalSearch isOpen=\{isSearchOpen\} onClose=\{.*\} \/>\s*<\/>/, '</RoleGate>');

fs.writeFileSync('MainDashboardPage.jsx', newMain);
fs.writeFileSync('AiAnalysisPage.jsx', newAi);
