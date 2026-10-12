import React, { useEffect } from 'react'
import { X, ShieldCheck, FileText, CheckCircle2, AlertCircle, Building2, UserCheck, Lock } from 'lucide-react'
import { useActiveSkChairmanName } from '../hooks/useActiveSkChairmanName'

/**
 * PrivacyAndTermsModal
 * Displays the complete Privacy Policy and Terms & Conditions specifically written
 * for the Cuenta: SK Budget Monitoring and Documentation Tracking with AI Analysis system.
 * 
 * Features:
 * - Dynamic active SK Chairman name retrieval
 * - Tab switching between Privacy Policy and Terms & Conditions
 * - Esc key listener and backdrop click to close
 * - Scrollable, responsive, accessible design
 */
export default function PrivacyAndTermsModal({ isOpen, onClose, initialTab = 'privacy' }) {
  const [activeTab, setActiveTab] = React.useState(initialTab)
  const chairmanName = useActiveSkChairmanName()
  const activeChairman = chairmanName?.trim() || 'Hon. John Zander Zerrudo'

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab)
    }
  }, [initialTab, isOpen])

  // Close on Escape key press
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Prevent background scrolling while modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-modal-title"
      style={{
        zIndex: 1100,
        backgroundColor: 'rgba(2, 53, 60, 0.65)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        padding: '16px',
      }}
    >
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(820px, 100%)',
          maxWidth: '820px',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          borderRadius: '16px',
          boxShadow: '0 20px 48px rgba(0, 0, 0, 0.28), 0 2px 8px rgba(0, 0, 0, 0.12)',
          border: '1px solid var(--line, #d5e3de)',
          backgroundColor: 'var(--surface, #ffffff)',
          overflow: 'hidden',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '20px 24px 16px',
            borderBottom: '1px solid var(--line, #d5e3de)',
            backgroundColor: 'var(--surface-2, #eaf2ef)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--accent, #0e6b4d)',
                  backgroundColor: 'var(--accent-soft, #e4f3ec)',
                  padding: '2px 8px',
                  borderRadius: '999px',
                }}
              >
                Cuenta System Governance
              </span>
            </div>
            <h2
              id="legal-modal-title"
              style={{
                margin: 0,
                fontSize: '1.25rem',
                fontWeight: 700,
                color: 'var(--ink, #0c2225)',
                fontFamily: 'var(--font-display, inherit)',
              }}
            >
              {activeTab === 'privacy' ? 'Privacy Policy' : 'Terms & Conditions'}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            style={{
              background: 'none',
              border: '1px solid var(--line-strong, #b4cbc5)',
              borderRadius: '8px',
              padding: '6px',
              cursor: 'pointer',
              color: 'var(--ink-2, #40605f)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.16s ease, color 0.16s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--surface, #ffffff)'
              e.currentTarget.style.color = 'var(--ink, #0c2225)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
              e.currentTarget.style.color = 'var(--ink-2, #40605f)'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div
          role="tablist"
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--line, #d5e3de)',
            backgroundColor: 'var(--surface, #ffffff)',
            padding: '4px 24px 0',
            gap: '8px',
          }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'privacy'}
            onClick={() => setActiveTab('privacy')}
            style={{
              padding: '10px 16px',
              fontSize: '0.9rem',
              fontWeight: 600,
              cursor: 'pointer',
              border: 'none',
              borderBottom: activeTab === 'privacy' ? '3px solid var(--accent, #0e6b4d)' : '3px solid transparent',
              background: 'transparent',
              color: activeTab === 'privacy' ? 'var(--accent, #0e6b4d)' : 'var(--ink-3, #5f7b79)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'color 0.18s ease',
            }}
          >
            <ShieldCheck size={16} />
            Privacy Policy
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'terms'}
            onClick={() => setActiveTab('terms')}
            style={{
              padding: '10px 16px',
              fontSize: '0.9rem',
              fontWeight: 600,
              cursor: 'pointer',
              border: 'none',
              borderBottom: activeTab === 'terms' ? '3px solid var(--accent, #0e6b4d)' : '3px solid transparent',
              background: 'transparent',
              color: activeTab === 'terms' ? 'var(--accent, #0e6b4d)' : 'var(--ink-3, #5f7b79)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'color 0.18s ease',
            }}
          >
            <FileText size={16} />
            Terms & Conditions
          </button>
        </div>

        {/* Scrollable Document Body */}
        <div
          tabIndex={0}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '28px clamp(24px, 4vw, 40px)',
            backgroundColor: 'var(--surface, #ffffff)',
          }}
        >
          {activeTab === 'privacy' ? (
            <div className="legal-doc-content">
              <div
                className="legal-doc-notice"
                style={{
                  backgroundColor: 'var(--accent-soft, #e4f3ec)',
                  border: '1px solid var(--accent-line, #a8d9c4)',
                  color: 'var(--accent, #0e6b4d)',
                }}
              >
                <strong>System Notice:</strong> This Privacy Policy applies to the{' '}
                <em>Cuenta: SK Budget Monitoring and Documentation Tracking with AI Analysis</em> platform and outlines
                how official data, user credentials, and financial documentation are collected, safeguarded, and
                utilized.
              </div>

              {/* Introduction */}
              <section className="legal-doc-section">
                <h3>Introduction</h3>
                <p>
                  <strong>Cuenta</strong> is a specialized, web-based financial management system engineered to help the
                  Sangguniang Kabataan (SK) efficiently monitor SK budget allocations, manage financial records, track
                  procurement and disbursement documentation, and foster public transparency and accountability within the
                  barangay. We recognize the importance of privacy and are committed to protecting all organizational and
                  personal information entrusted to the platform.
                </p>
              </section>

              {/* Information We Collect */}
              <section className="legal-doc-section">
                <h3>Information We Collect</h3>
                <p>
                  The system collects and maintains the following categories of information strictly for official SK
                  operations:
                </p>
                <ul>
                  <li><strong>Full Name:</strong> For user identification and signature attribution on reports.</li>
                  <li><strong>Email Address:</strong> Used for account sign-in, multi-factor OTP verification, and notices.</li>
                  <li><strong>User Role:</strong> Designating specific access privileges (SK Chairman, SK Treasurer, SK Kagawad, or Barangay Treasurer).</li>
                  <li><strong>Profile Picture / Biodata:</strong> Optional avatar or demographic profile details if uploaded.</li>
                  <li><strong>Login Activity:</strong> Timestamps of access, IP records, and session statuses.</li>
                  <li><strong>Budget Requests:</strong> Project, event, and honoraria requisitions submitted for review.</li>
                  <li><strong>Approved Records:</strong> Official allocation figures, committee classifications, and disbursement approvals.</li>
                  <li><strong>Uploaded Documents:</strong> Resolutions, CBYDP, ABYIP, minutes of meetings, transmittals, and purchase orders.</li>
                  <li><strong>Uploaded Receipts &amp; Invoices:</strong> Supporting official receipts, delivery receipts, and OCR verification metadata.</li>
                  <li><strong>Activity Logs &amp; Audit Trails:</strong> Cryptographic and chronological transaction events.</li>
                  <li><strong>System Usage Information:</strong> Diagnostics and security telemetry required for system integrity.</li>
                </ul>
              </section>

              {/* How We Use Your Information */}
              <section className="legal-doc-section">
                <h3>How We Use Your Information</h3>
                <p>
                  The data collected is processed exclusively for legitimate government and public administrative purposes:
                </p>
                <ul>
                  <li><strong>Authenticate Users:</strong> Verifying authorized access and blocking unauthorized entries.</li>
                  <li><strong>Manage User Accounts and Roles:</strong> Enforcing separation of duties and administrative controls.</li>
                  <li><strong>Process Budget Requests:</strong> Validating requests against approved monthly allocation ceilings.</li>
                  <li><strong>Generate Statutory Reports:</strong> Automatically assembling official PDF and spreadsheet reports.</li>
                  <li><strong>Maintain Audit Trails:</strong> Providing non-repudiable logs for internal review and COA examination.</li>
                  <li><strong>Improve System Security:</strong> Monitoring potential breaches, anomalous actions, or brute-force attempts.</li>
                  <li><strong>Support AI-Powered Analysis:</strong> Generating spending utilization patterns and variance alerts via Cue AI.</li>
                </ul>
              </section>

              {/* Data Protection */}
              <section className="legal-doc-section">
                <h3>Data Protection</h3>
                <p>
                  Cuenta protects user data and financial documentation through a comprehensive multi-layered security framework:
                </p>
                <ul>
                  <li><strong>Secure Authentication:</strong> Password hashing via bcrypt, bot detection with Google reCAPTCHA, and email-based one-time passwords (OTP).</li>
                  <li><strong>Role-Based Access Control (RBAC):</strong> Strict boundary enforcement preventing unauthorized privilege escalation.</li>
                  <li><strong>Encrypted Communication:</strong> End-to-end transport layer security (TLS/HTTPS) across all network exchanges.</li>
                  <li><strong>Activity Logging:</strong> Automated, immutable audit trail capturing user ID, action type, IP address, and timestamps.</li>
                  <li><strong>Secure Database Storage:</strong> PostgreSQL database security with hardened Row-Level Security (RLS) policies.</li>
                </ul>
              </section>

              {/* User Rights */}
              <section className="legal-doc-section">
                <h3>User Rights</h3>
                <p>
                  In accordance with the Data Privacy Act of 2012 (RA 10173), registered users have the right to:
                </p>
                <ul>
                  <li>View their registered account details and historical system activities.</li>
                  <li>Update their profile credentials, contact information, and security passwords.</li>
                  <li>Request corrections to any inaccurate, outdated, or incomplete records.</li>
                  <li>Contact the SK Chairman or system administrator regarding their account standing and privacy rights.</li>
                </ul>
              </section>

              {/* Data Retention */}
              <section className="legal-doc-section">
                <h3>Data Retention</h3>
                <p>
                  Financial records, budget allocations, uploaded documents, scanned receipts, and audit trail logs are
                  retained in accordance with Commission on Audit (COA) accounting rules, Department of the Interior and
                  Local Government (DILG) directives, and the National Historical and Records Management guidelines.
                  Records cannot be permanently deleted by standard users to ensure accountability throughout the elected
                  tenure.
                </p>
              </section>

              {/* Contact Information */}
              <section
                className="legal-doc-section"
                style={{
                  backgroundColor: 'var(--surface-2, #eaf2ef)',
                  padding: '18px 22px',
                  borderRadius: '12px',
                  border: '1px solid var(--line, #d5e3de)',
                }}
              >
                <h3>Contact Information</h3>
                <p>
                  For inquiries, data verification, or privacy-related concerns regarding the Cuenta system, please contact
                  the Sangguniang Kabataan administration:
                </p>
                <div style={{ display: 'grid', gap: '6px', fontSize: '0.9rem', marginTop: '6px' }}>
                  <div><strong>SK Chairman:</strong> {activeChairman}</div>
                  <div><strong>System Administration:</strong> Cuenta IT &amp; Secretariat Team</div>
                  <div><strong>Office Location:</strong> Barangay Hall &amp; Sangguniang Kabataan Office</div>
                </div>
              </section>
            </div>
          ) : (
            <div className="legal-doc-content">
              <div
                className="legal-doc-notice"
                style={{
                  backgroundColor: 'var(--warn-soft, #fcf1e1)',
                  border: '1px solid var(--warn, #9a5b12)40',
                  color: 'var(--warn, #9a5b12)',
                }}
              >
                <strong>Terms of Service:</strong> Please review these Terms &amp; Conditions carefully. All authorized
                personnel accessing Cuenta must comply with these operational guidelines and statutory responsibilities.
              </div>

              {/* Acceptance of Terms */}
              <section className="legal-doc-section">
                <h3>Acceptance of Terms</h3>
                <p>
                  By accessing, browsing, or signing in to <strong>Cuenta: SK Budget Monitoring and Documentation Tracking with AI Analysis</strong>,
                  you explicitly agree to abide by these Terms &amp; Conditions, the system Privacy Policy, and all applicable
                  statutory laws and barangay resolutions governing youth governance and financial reporting. If you do not
                  agree, you must refrain from accessing this platform.
                </p>
              </section>

              {/* Authorized Use */}
              <section className="legal-doc-section">
                <h3>Authorized Use</h3>
                <p>
                  Access to the authenticated administrative portal is strictly restricted to designated officials who have
                  been issued valid credentials. Permitted roles and authorization scopes include:
                </p>
                <ul>
                  <li>
                    <strong>SK Chairman:</strong> Full executive administration, user account creation and management,
                    budget request approvals, system-wide analytics, and audit log supervision.
                  </li>
                  <li>
                    <strong>SK Treasurer:</strong> Budget allocations preparation, expenditure recording, project and payroll
                    requests, receipt scanning with OCR, and financial documentation.
                  </li>
                  <li>
                    <strong>SK Kagawad:</strong> View-only inspection access to approved budget distributions, completed project
                    records, and analytical visualizations.
                  </li>
                  <li>
                    <strong>Barangay Treasurer:</strong> View-only monitoring access to approved SK budget expenditures,
                    financial summaries, and documentation records.
                  </li>
                  <li>
                    <strong>Visitor / Citizen:</strong> Access restricted exclusively to the public-facing Transparency Page
                    summarizing verified, completed projects.
                  </li>
                </ul>
              </section>

              {/* User Responsibilities */}
              <section className="legal-doc-section">
                <h3>User Responsibilities</h3>
                <p>All authorized users must:</p>
                <ul>
                  <li>Provide accurate, truthful, and up-to-date data for all financial entries and requests.</li>
                  <li>Maintain the strict confidentiality of their personal login credentials, OTP codes, and access sessions.</li>
                  <li>Ensure the system is utilized exclusively for legitimate, official Sangguniang Kabataan purposes.</li>
                  <li>Promptly notify the SK Chairman or system administrator of any suspected unauthorized access or compromised security credentials.</li>
                  <li>Log out of sessions when operating on shared or public workstations.</li>
                </ul>
              </section>

              {/* Prohibited Activities */}
              <section className="legal-doc-section">
                <h3>Prohibited Activities</h3>
                <p>Users are expressly forbidden from engaging in the following actions:</p>
                <ul>
                  <li>Modifying, falsifying, or deleting financial requests, budget figures, or receipts without legitimate administrative justification.</li>
                  <li>Attempting to bypass security barriers or access modules outside their assigned role permissions.</li>
                  <li>Sharing, leasing, or transferring system credentials to unauthorized individuals.</li>
                  <li>Uploading malicious code, corrupted files, deceptive documents, or unauthorized file formats.</li>
                  <li>Attempting denial-of-service, automated scraping, reverse engineering, or intentional disruption of system infrastructure.</li>
                </ul>
              </section>

              {/* System Availability */}
              <section className="legal-doc-section">
                <h3>System Availability</h3>
                <p>
                  While the administration undertakes reasonable efforts to ensure 24/7 service reliability, the platform
                  may experience temporary downtime for scheduled maintenance, database backups, security patches, or
                  unforeseen technical disruptions. Advance notice will be provided whenever possible.
                </p>
              </section>

              {/* Limitation of Liability */}
              <section className="legal-doc-section">
                <h3>Limitation of Liability</h3>
                <p>
                  The developers, capstone researchers, and barangay administrators shall not be held liable for incidental,
                  indirect, or consequential damages resulting from unauthorized account compromise due to user negligence,
                  local internet connection failures, hardware malfunctions, or circumstances beyond reasonable operational
                  control. Official paper documentation and physical vouchers remain the primary statutory audit records
                  under COA guidelines.
                </p>
              </section>

              {/* Policy Updates */}
              <section className="legal-doc-section">
                <h3>Policy Updates</h3>
                <p>
                  These Terms &amp; Conditions and the accompanying Privacy Policy may be updated periodically to accommodate
                  system enhancements, legislative updates, or revised auditing guidelines. Continued utilization of the
                  system following any posted modifications constitutes unconditional agreement to the updated provisions.
                </p>
              </section>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--line, #d5e3de)',
            backgroundColor: 'var(--surface-2, #eaf2ef)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <span style={{ fontSize: '0.8rem', color: 'var(--ink-3, #5f7b79)' }}>
            Cuenta &middot; Republic of the Philippines &middot; Sangguniang Kabataan
          </span>
          <button
            type="button"
            className="auth-btn auth-btn--primary"
            onClick={onClose}
            style={{
              width: 'auto',
              minHeight: '38px',
              padding: '0 24px',
              fontSize: '0.9rem',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
