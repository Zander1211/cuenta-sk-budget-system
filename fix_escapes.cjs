const fs = require('fs');
const path = require('path');

const files = [
  'src/context/BackupRestoreContext.jsx',
  'src/pages/BackupRestorePage.jsx',
  'src/context/AuditLogContext.jsx',
  'src/pages/AuditTrailPage.jsx',
];

for (const relPath of files) {
  const filePath = path.join(__dirname, relPath);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    // We want to replace backslash-backtick with just backtick
    content = content.replace(/\\\`/g, '\`');
    // We want to replace backslash-dollar with just dollar
    content = content.replace(/\\\$/g, '$');
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Fixed', relPath);
  }
}
