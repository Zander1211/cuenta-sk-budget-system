const fs = require('fs');
const oldMain = fs.readFileSync('MainDashboardPage_old.jsx', 'utf8');
const oldAi = fs.readFileSync('AiAnalysisPage_old.jsx', 'utf8');

// --- 1. Modify MainDashboardPage_old.jsx to keep only requested sections ---
let newMain = oldMain;

// Remove Budget Allocation panel
// It starts with <div className="panel-card">\n          <div className="panel-header">\n            <div>\n              <p className="panel-eyebrow">Budget Allocation</p>
// and ends before </section>
const budgetAllocRegex = /<div className="panel-card">\s*<div className="panel-header">\s*<div>\s*<p className="panel-eyebrow">Budget Allocation<\/p>[\s\S]*?<\/div>\s*<\/div>/;
newMain = newMain.replace(budgetAllocRegex, '');

// Change className="dashboard-panels" to "dashboard-panels single" because it only has one child now
newMain = newMain.replace(/<section className="dashboard-panels">/, '<section className="dashboard-panels single">');

// Remove Recent Alerts section entirely
const alertsRegex = /<section className="dashboard-panels single">\s*<div className="panel-card">\s*<div className="panel-header">\s*<div className="panel-title-row">\s*<TriangleAlert size=\{18\} \/>\s*<h2>Recent Alerts<\/h2>[\s\S]*?<\/section>/;
newMain = newMain.replace(alertsRegex, '');


// --- 2. Modify AiAnalysisPage_old.jsx to keep only AI stuff ---
let newAi = oldAi;

// Remove stat-grid
const statGridRegex = /<div className="stat-grid">[\s\S]*?<\/div>\s*<div className="ai-main-grid">/;
newAi = newAi.replace(statGridRegex, '<div className="ai-main-grid">');

// Remove Spending Overview from ai-main-grid
const aiSpendingRegex = /<div className="overview-card">\s*<div className="ai-card-header">\s*<div>\s*<p className="eyebrow">Spending Overview<\/p>[\s\S]*?Total Expenses.*?<\/p>\s*<\/div>/;
newAi = newAi.replace(aiSpendingRegex, '');

// Add style={{ gridColumn: '1 / -1' }} to Risk and recommendations
newAi = newAi.replace(/<div className="overview-card">(\s*<div className="ai-card-header">\s*<div>\s*<p className="eyebrow">AI Insights<\/p>)/, '<div className="overview-card" style={{ gridColumn: \'1 / -1\' }}>$1');


// Write them out!
fs.writeFileSync('MainDashboardPage.jsx', newMain);
fs.writeFileSync('AiAnalysisPage.jsx', newAi);
