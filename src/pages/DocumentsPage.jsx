import { useEffect, useState } from 'react'
import RoleGate from '../components/RoleGate'
import { supabase } from '../supabase/supabaseClient'

function DocumentsPage() {
  const [reportTitle, setReportTitle] = useState('')
  const [reportFile, setReportFile] = useState(null)
  const [receiptFile, setReceiptFile] = useState(null)
  const [reports, setReports] = useState([])
  const [receipts, setReceipts] = useState([])
  const [reportError, setReportError] = useState('')
  const [receiptError, setReceiptError] = useState('')
  const [isUploadingReport, setIsUploadingReport] = useState(false)
  const [isUploadingReceipt, setIsUploadingReceipt] = useState(false)
  const REPORTS_BUCKET = 'liquidation-reports'
  const RECEIPTS_BUCKET = 'receipts'

  useEffect(() => {
    async function loadReports() {
      const { data, error } = await supabase
        .from('liquidation_reports')
        .select('id, title, file_name, file_path, created_at')
        .order('created_at', { ascending: false })

      if (error) {
        setReportError(error.message)
        return
      }

      const withUrls = await Promise.all(
        (data ?? []).map(async (item) => {
          const { data: signedData } = await supabase.storage
            .from(REPORTS_BUCKET)
            .createSignedUrl(item.file_path, 60 * 60)
          return {
            ...item,
            fileUrl: signedData?.signedUrl || null,
          }
        })
      )

      setReports(withUrls)
    }

    async function loadReceipts() {
      const { data, error } = await supabase
        .from('receipt_uploads')
        .select('id, file_name, file_path, created_at')
        .eq('source', 'liquidation')
        .order('created_at', { ascending: false })

      if (error) {
        setReceiptError(error.message)
        return
      }

      const withUrls = await Promise.all(
        (data ?? []).map(async (item) => {
          const { data: signedData } = await supabase.storage
            .from(RECEIPTS_BUCKET)
            .createSignedUrl(item.file_path, 60 * 60)
          return {
            ...item,
            fileUrl: signedData?.signedUrl || null,
          }
        })
      )

      setReceipts(withUrls)
    }

    loadReports()
    loadReceipts()
  }, [])

  async function handleReportSubmit(event) {
    event.preventDefault()
    setReportError('')
    if (!reportTitle.trim() || !reportFile) {
      return
    }

    setIsUploadingReport(true)
    const safeName = reportFile.name.replace(/\s+/g, '-')
    const filePath = `reports/${Date.now()}-${safeName}`
    const { error: uploadError } = await supabase.storage
      .from(REPORTS_BUCKET)
      .upload(filePath, reportFile, { upsert: false })

    if (uploadError) {
      setReportError(uploadError.message)
      setIsUploadingReport(false)
      return
    }

    const { error: insertError } = await supabase
      .from('liquidation_reports')
      .insert({
        title: reportTitle.trim(),
        file_name: reportFile.name,
        file_path: filePath,
      })

    if (insertError) {
      setReportError(insertError.message)
      setIsUploadingReport(false)
      return
    }

    setReportTitle('')
    setReportFile(null)
    setIsUploadingReport(false)

    const { data: signedData } = await supabase.storage
      .from(REPORTS_BUCKET)
      .createSignedUrl(filePath, 60 * 60)

    setReports((prev) => [
      {
        id: `${Date.now()}`,
        title: reportTitle.trim(),
        file_name: reportFile.name,
        file_path: filePath,
        created_at: new Date().toISOString(),
        fileUrl: signedData?.signedUrl || null,
      },
      ...prev,
    ])
  }

  async function handleReceiptSubmit(event) {
    event.preventDefault()
    setReceiptError('')
    if (!receiptFile) {
      return
    }

    setIsUploadingReceipt(true)
    const safeName = receiptFile.name.replace(/\s+/g, '-')
    const filePath = `liquidation/${Date.now()}-${safeName}`

    const { error: uploadError } = await supabase.storage
      .from(RECEIPTS_BUCKET)
      .upload(filePath, receiptFile, { upsert: false })

    if (uploadError) {
      setReceiptError(uploadError.message)
      setIsUploadingReceipt(false)
      return
    }

    const { error: insertError } = await supabase
      .from('receipt_uploads')
      .insert({
        source: 'liquidation',
        file_name: receiptFile.name,
        file_path: filePath,
      })

    if (insertError) {
      setReceiptError(insertError.message)
      setIsUploadingReceipt(false)
      return
    }

    const { data: signedData } = await supabase.storage
      .from(RECEIPTS_BUCKET)
      .createSignedUrl(filePath, 60 * 60)

    setReceipts((prev) => [
      {
        id: `${Date.now()}`,
        file_name: receiptFile.name,
        file_path: filePath,
        created_at: new Date().toISOString(),
        fileUrl: signedData?.signedUrl || null,
      },
      ...prev,
    ])

    setReceiptFile(null)
    setIsUploadingReceipt(false)
  }

  return (
    <RoleGate allow={['SK Chairman', 'SK Treasurer']}>
      <header className="dashboard-header">
        <div className="header-left">
          <div>
            <p className="eyebrow">Documents</p>
            <h1>Liquidation reports and receipts</h1>
            <p>Upload liquidation reports and keep receipts organized.</p>
          </div>
        </div>
      </header>

      <section className="dashboard-content">
        <div className="overview-card">
          <p className="eyebrow">Liquidation reports</p>
          <h2>Upload a liquidation report</h2>
          <form className="user-form" onSubmit={handleReportSubmit}>
            <div className="form-grid">
              <label className="field">
                <span>Report title</span>
                <input
                  type="text"
                  value={reportTitle}
                  onChange={(event) => setReportTitle(event.target.value)}
                  placeholder="Q2 Budget Liquidation"
                  required
                />
              </label>
              <label className="field">
                <span>Upload report</span>
                <input
                  type="file"
                  onChange={(event) =>
                    setReportFile(event.target.files?.[0] || null)
                  }
                  required
                />
              </label>
            </div>
            {reportError ? <p className="form-error">{reportError}</p> : null}
            <button type="submit" className="primary-button" disabled={isUploadingReport}>
              {isUploadingReport ? 'Uploading...' : 'Upload Report'}
            </button>
          </form>

          <table className="data-table">
            <thead>
              <tr>
                <th>Report</th>
                <th>File</th>
                <th>Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {reports.length ? (
                reports.map((report) => (
                  <tr key={report.id}>
                    <td>{report.title}</td>
                    <td>
                      {report.fileUrl ? (
                        <a className="file-link" href={report.fileUrl} target="_blank" rel="noreferrer">
                          {report.file_name}
                        </a>
                      ) : (
                        report.file_name
                      )}
                    </td>
                    <td>{new Date(report.created_at).toLocaleDateString()}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="3" className="empty-state">
                    No liquidation reports uploaded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="overview-card">
          <p className="eyebrow">Receipts</p>
          <h2>Upload receipts</h2>
          <form className="user-form" onSubmit={handleReceiptSubmit}>
            <label className="field">
              <span>Upload receipt</span>
              <input
                type="file"
                onChange={(event) =>
                  setReceiptFile(event.target.files?.[0] || null)
                }
                required
              />
            </label>
            {receiptError ? <p className="form-error">{receiptError}</p> : null}
            <button type="submit" className="secondary-button" disabled={isUploadingReceipt}>
              {isUploadingReceipt ? 'Uploading...' : 'Upload Receipt'}
            </button>
          </form>

          <table className="data-table">
            <thead>
              <tr>
                <th>File</th>
                <th>Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {receipts.length ? (
                receipts.map((receipt) => (
                  <tr key={receipt.id}>
                    <td>
                      {receipt.fileUrl ? (
                        <a className="file-link" href={receipt.fileUrl} target="_blank" rel="noreferrer">
                          {receipt.file_name}
                        </a>
                      ) : (
                        receipt.file_name
                      )}
                    </td>
                    <td>{new Date(receipt.created_at).toLocaleDateString()}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="2" className="empty-state">
                    No receipts uploaded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </RoleGate>
  )
}

export default DocumentsPage
