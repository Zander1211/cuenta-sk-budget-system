const fs = require('fs');
const path = require('path');

const cssContent = \`
/* ═══════════════════════════════════════════════════════ */
/*  AUDIT TRAIL                                            */
/* ═══════════════════════════════════════════════════════ */

.audit-trail-filters {
	display: grid;
	gap: 14px;
}

.audit-trail-filter-row {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	align-items: flex-end;
}

.audit-date-range {
	display: flex;
	gap: 10px;
	align-items: flex-end;
}

.audit-date-label {
	display: grid;
	gap: 4px;
	font-size: 0.75rem;
	font-weight: 600;
	letter-spacing: 0.05rem;
	text-transform: uppercase;
	color: var(--ink-soft);
}

.audit-date-label input[type="date"] {
	padding: 7px 10px;
	font-size: 0.85rem;
}

.audit-trail-actions {
	display: flex;
	gap: 10px;
	align-items: center;
	flex-wrap: wrap;
}

.audit-clear-btn {
	color: #b91c1c !important;
	border-color: rgba(185, 28, 28, 0.25) !important;
}

.audit-clear-btn:hover {
	background: rgba(185, 28, 28, 0.06) !important;
}

.audit-timestamp {
	font-size: 0.85rem;
	color: var(--ink-soft);
	white-space: nowrap;
}

.audit-actor {
	font-weight: 600;
}

.audit-role {
	font-size: 0.85rem;
	color: var(--ink-soft);
}

.audit-description {
	font-size: 0.85rem;
	color: var(--ink-soft);
	max-width: 280px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.items-found-badge {
	padding: 6px 12px;
	border-radius: 999px;
	background: rgba(15, 31, 54, 0.06);
	font-size: 0.8rem;
	font-weight: 600;
	color: var(--ink-soft);
	white-space: nowrap;
}

.spin-animation {
	animation: spin 1s linear infinite;
}

/* ═══════════════════════════════════════════════════════ */
/*  BACKUP & RESTORE                                       */
/* ═══════════════════════════════════════════════════════ */

.backup-summary-grid {
	display: grid;
	grid-template-columns: repeat(4, 1fr);
	gap: 14px;
	margin-bottom: 16px;
}

.backup-card {
	padding: 16px 18px;
	border-radius: 14px;
	background: rgba(15, 31, 54, 0.03);
	border: 1px solid rgba(15, 31, 54, 0.08);
	display: grid;
	gap: 6px;
}

.backup-card-label {
	font-size: 0.7rem;
	letter-spacing: 0.12rem;
	text-transform: uppercase;
	color: var(--ink-soft);
	font-weight: 600;
}

.backup-card-value {
	font-size: 1.15rem;
	font-weight: 700;
	color: var(--ink);
}

.backup-action-bar {
	display: flex;
	align-items: center;
	gap: 16px;
	flex-wrap: wrap;
	margin-bottom: 8px;
}

.backup-result {
	display: flex;
	align-items: flex-start;
	gap: 10px;
	padding: 12px 16px;
	border-radius: 12px;
	font-size: 0.9rem;
	animation: panelReveal 0.3s ease;
}

.backup-result.success {
	background: rgba(34, 197, 94, 0.1);
	border: 1px solid rgba(34, 197, 94, 0.25);
	color: #15803d;
}

.backup-result.error {
	background: rgba(220, 38, 38, 0.08);
	border: 1px solid rgba(220, 38, 38, 0.2);
	color: #b91c1c;
}

.restore-upload-area {
	display: flex;
	align-items: center;
	gap: 14px;
	padding: 24px;
	border-radius: 14px;
	border: 2px dashed rgba(15, 31, 54, 0.15);
	background: rgba(255, 255, 255, 0.6);
	cursor: pointer;
	color: var(--ink-soft);
	transition: border-color 0.2s ease, background 0.2s ease;
	margin-bottom: 16px;
}

.restore-upload-area:hover {
	border-color: var(--sea);
	background: rgba(109, 227, 183, 0.06);
	color: var(--ink);
}

.restore-error-list {
	display: flex;
	align-items: flex-start;
	gap: 10px;
	padding: 14px 16px;
	border-radius: 12px;
	background: rgba(220, 38, 38, 0.08);
	border: 1px solid rgba(220, 38, 38, 0.2);
	color: #b91c1c;
	font-size: 0.9rem;
	margin-bottom: 16px;
}

.restore-error-list ul {
	margin: 6px 0 0;
	padding-left: 18px;
}

.restore-preview {
	padding: 18px;
	border-radius: 14px;
	border: 1px solid rgba(109, 227, 183, 0.3);
	background: rgba(109, 227, 183, 0.06);
	display: grid;
	gap: 16px;
	margin-bottom: 16px;
}

.restore-preview-header {
	display: flex;
	align-items: flex-start;
	gap: 12px;
}

.restore-preview-tables {
	display: grid;
	gap: 8px;
}

.restore-table-list {
	display: grid;
	gap: 6px;
}

.restore-table-item {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 8px 12px;
	border-radius: 8px;
	background: #fff;
	border: 1px solid rgba(15, 31, 54, 0.08);
	font-size: 0.9rem;
}

.restore-table-name {
	font-weight: 600;
}

.restore-table-count {
	color: var(--ink-soft);
	font-size: 0.85rem;
}

.restore-preview-actions {
	display: flex;
	gap: 10px;
}

@media (max-width: 900px) {
	.backup-summary-grid {
		grid-template-columns: repeat(2, 1fr);
	}

	.audit-trail-filter-row {
		flex-direction: column;
		align-items: stretch;
	}

	.audit-date-range {
		flex-direction: column;
	}
}

@media (max-width: 600px) {
	.backup-summary-grid {
		grid-template-columns: 1fr;
	}
}
\`;

const cssPath = path.join(__dirname, 'src', 'index.css');
if (fs.existsSync(cssPath)) {
  fs.appendFileSync(cssPath, '\\n' + cssContent);
  console.log('Appended CSS successfully.');
} else {
  console.error('index.css not found at', cssPath);
}
