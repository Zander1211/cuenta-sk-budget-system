import { useMemo, useState, useEffect } from 'react'
import CurrencyInput from '../components/CurrencyInput';
import { useNavigate } from 'react-router-dom'
import { FileText, Printer, ArrowLeft } from 'lucide-react'
import RoleGate from '../components/RoleGate'
import { useBudget } from '../context/BudgetContext'
import AnnualReportPreview from '../components/documents/AnnualReportPreview'
import { useAuth } from '../context/AuthContext'
import YearSpinner from '../components/YearSpinner'
import { supabase } from '../supabase/supabaseClient'

const currentYear = new Date().getFullYear()

function AnnualReportPage() {
  const { budgets, expenses } = useBudget()
  const { profileName, role, profileSurname } = useAuth()
  const navigate = useNavigate()
  
  const [expectedResults, setExpectedResults] = useState('')
  const [performanceIndicators, setPerformanceIndicators] = useState('')
  const [projectOverrides, setProjectOverrides] = useState({})
  
  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [showPreview, setShowPreview] = useState(false)
  
  const fullName = profileName
  const surname = profileSurname || fullName.split(' ').filter(Boolean).slice(-1)[0] || ''
  
  // Basic Info
  const [barangayName, setBarangayName] = useState('UPPER GLAD 2')
  const [cityMunicipality, setCityMunicipality] = useState('MIDSAYAP')
  const [province, setProvince] = useState('COTABATO')
  
  const [skTreasurer, setSkTreasurer] = useState(role === 'SK Treasurer' ? fullName : '')
  const [skChairperson, setSkChairperson] = useState(role === 'SK Chairman' ? fullName : '')
  const [skSecretary, setSkSecretary] = useState('')
  const [skKagawads, setSkKagawads] = useState(['', '', '', '', '', '', ''])

  const handleKagawadChange = (index, value) => {
    const newKagawads = [...skKagawads]
    newKagawads[index] = value
    setSkKagawads(newKagawads)
  }
  
  // Calculate system totals for the selected year
  const systemTotals = useMemo(() => {
    const yearBudgets = budgets.filter((b) => b.year === selectedYear)
    const totalBudget = yearBudgets.reduce((sum, b) => sum + (Number(b.amount) || 0), 0)
    
    const yearExpenses = expenses.filter((e) => {
      if (e.archivedAt) return false
      const dateStr = e.eventDate || e.date || e.approvedAt
      if (!dateStr) return false
      return new Date(dateStr).getFullYear() === selectedYear
    })
    const totalExpenses = yearExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
    
    return {
      totalBudget,
      totalExpenses,
      projects: yearExpenses.filter((e) => ['Approved', 'Released'].includes(e.status || 'Approved')),
    }
  }, [budgets, expenses, selectedYear])

  // --- Form State ---
  
  // Receipts
  const [subsidyBarangay, setSubsidyBarangay] = useState(0)
  const [subsidyOtherLGU, setSubsidyOtherLGU] = useState(0)
  const [subsidyNGA, setSubsidyNGA] = useState(0)
  const [subsidyGOCC, setSubsidyGOCC] = useState(0)
  const [grantsSpecific, setGrantsSpecific] = useState(0)
  const [grantsWithoutSpecific, setGrantsWithoutSpecific] = useState(0)
  const [miscIncome, setMiscIncome] = useState(0)
  const [otherReceipts, setOtherReceipts] = useState(0)

  // MOOE
  const [mooe, setMooe] = useState({
    travelling: 0,
    training: 0,
    officeSupplies: 0,
    semiExpendable: 0,
    fuelOil: 0,
    accountableForms: 0,
    otherSupplies: 0,
    water: 0,
    electricity: 0,
    postage: 0,
    telephone: 0,
    internet: 0,
    prizes: 0,
    rmLandImprovements: 0,
    rmBuildings: 0,
    rmMachinery: 0,
    rmOfficeEquipment: 0,
    rmICT: 0,
    rmSports: 0,
    rmTransportation: 0,
    rmFurniture: 0,
    rmOtherProperty: 0,
    fidelityBond: 0,
    advertising: 0,
    rent: 0,
    membershipDues: 0,
    donation: 0,
    honoraria: 0,
    bankCharges: 0,
    otherMOOE: 0,
  })

  // Capital Outlay
  const [co, setCo] = useState({
    land: 0,
    landImprovements: 0,
    buildings: 0,
    otherStructures: 0,
    machinery: 0,
    officeEquipment: 0,
    ictEquipment: 0,
    sportsEquipment: 0,
    transportation: 0,
    furniture: 0,
    otherProperty: 0,
    cipLandImprovements: 0,
    cipBuildings: 0,
    cipOtherStructures: 0,
  })

  // Other cash items
  const [cashAdvancesNet, setCashAdvancesNet] = useState(0)
  const [addLessOthers, setAddLessOthers] = useState(0)
  
  const [cashBeginningHand, setCashBeginningHand] = useState(0)
  const [cashBeginningBank, setCashBeginningBank] = useState(0)
  
  const [cashEndHand, setCashEndHand] = useState(0)
  const [cashEndBank, setCashEndBank] = useState(0)

  // Load saved settings from database
  useEffect(() => {
    async function loadSettings() {
      const { data, error } = await supabase
        .from('report_summaries')
        .select('summary')
        .eq('report_id', 'annual_report_settings')
        .eq('model', 'global')
        .single()
      
      if (data && data.summary) {
        try {
          const settings = JSON.parse(data.summary)
          if (settings.expectedResults) setExpectedResults(settings.expectedResults)
          if (settings.performanceIndicators) setPerformanceIndicators(settings.performanceIndicators)
          if (settings.projectOverrides) setProjectOverrides(settings.projectOverrides)
        } catch (e) {
          console.error('Failed to parse settings', e)
        }
      }
    }
    loadSettings()
  }, [])

  // Auto-fill system totals when year changes
  useEffect(() => {
    setSubsidyBarangay(systemTotals.totalBudget)
    setMooe((prev) => ({
      ...prev,
      otherMOOE: systemTotals.totalExpenses
    }))
  }, [systemTotals.totalBudget, systemTotals.totalExpenses])

  const handleMooeChange = (key, value) => {
    setMooe((prev) => ({ ...prev, [key]: Number(value) || 0 }))
  }

  const handleCoChange = (key, value) => {
    setCo((prev) => ({ ...prev, [key]: Number(value) || 0 }))
  }

  // Derived totals
  const totalReceipts = 
    subsidyBarangay + subsidyOtherLGU + subsidyNGA + subsidyGOCC +
    grantsSpecific + grantsWithoutSpecific + miscIncome + otherReceipts

  const totalMOOE = Object.values(mooe).reduce((a, b) => a + b, 0)
  const totalCO = Object.values(co).reduce((a, b) => a + b, 0)
  const totalPayments = totalMOOE + totalCO + cashAdvancesNet
  
  const increaseDecreaseCash = totalReceipts - totalPayments
  const totalIncreaseDecreaseCash = increaseDecreaseCash + addLessOthers
  const cashBeginning = cashBeginningHand + cashBeginningBank
  const cashEnd = cashBeginning + totalIncreaseDecreaseCash

  const handlePreview = async (e) => {
    e.preventDefault()
    
    // Save to database
    try {
      await supabase.from('report_summaries').upsert({
        report_id: 'annual_report_settings',
        model: 'global',
        summary: JSON.stringify({ expectedResults, performanceIndicators, projectOverrides })
      }, { onConflict: 'report_id, model' })
    } catch (err) {
      console.error('Failed to save settings', err)
    }

    setShowPreview(true)
  }

  return (
    <RoleGate allow={['SK Chairman', 'SK Treasurer']}>
      <header className="dashboard-header">
        <div className="header-left">
          <div>
            <p className="eyebrow">Documents</p>
            <h1>Annual Report</h1>
            <p>Generate the official Annual Statement of Receipts and Payments and Project Summary.</p>
          </div>
        </div>
        <div className="header-actions">
          <button type="button" className="secondary-button" onClick={() => navigate(-1)}>
            <ArrowLeft size={16} />
            Back
          </button>
          <button type="button" className="primary-button" onClick={handlePreview}>
            <Printer size={16} />
            Preview & Print
          </button>
        </div>
      </header>

      <section className="dashboard-content" style={{ display: showPreview ? 'none' : 'block' }}>
        
        {/* System Reference Card */}
        <div className="overview-card" style={{ borderLeft: '4px solid var(--sea)', background: 'var(--sea-light)' }}>
          <div className="card-header-row">
            <div>
              <p className="eyebrow">System Reference</p>
              <h2>{selectedYear} Data Overview</h2>
            </div>
            <YearSpinner year={selectedYear} onYearChange={setSelectedYear} />
          </div>
          <div className="breakdown-summary-row" style={{ marginTop: '16px' }}>
            <div>
              <span className="breakdown-summary-label">Total System Budget</span>
              <span className="breakdown-summary-value">PHP {systemTotals.totalBudget.toLocaleString()}</span>
              <p style={{ fontSize: '0.8rem', color: 'var(--ink-soft)' }}>Auto-filled into Subsidy from Barangay</p>
            </div>
            <div>
              <span className="breakdown-summary-label">Total System Expenses</span>
              <span className="breakdown-summary-value">PHP {systemTotals.totalExpenses.toLocaleString()}</span>
              <p style={{ fontSize: '0.8rem', color: 'var(--ink-soft)' }}>Auto-filled into Other MOOE</p>
            </div>
            <div>
              <span className="breakdown-summary-label">Approved Projects</span>
              <span className="breakdown-summary-value">{systemTotals.projects.length}</span>
              <p style={{ fontSize: '0.8rem', color: 'var(--ink-soft)' }}>Will be appended as Annex A</p>
            </div>
          </div>
        </div>

        <form onSubmit={handlePreview} className="user-form nr-section-list">
          {/* Section: Basic Info */}
          <div className="overview-card">
            <h2>Basic Information</h2>
            <div className="form-grid">
              <label className="field">
                <span>Barangay</span>
                <input type="text" value={barangayName} onChange={(e) => setBarangayName(e.target.value)} />
              </label>
              <label className="field">
                <span>City / Municipality</span>
                <input type="text" value={cityMunicipality} onChange={(e) => setCityMunicipality(e.target.value)} />
              </label>
              <label className="field">
                <span>Province</span>
                <input type="text" value={province} onChange={(e) => setProvince(e.target.value)} />
              </label>
            </div>
            <div className="form-grid" style={{ marginTop: '16px' }}>
              <label className="field">
                <span>SK Treasurer</span>
                <input type="text" value={skTreasurer} onChange={(e) => setSkTreasurer(e.target.value)} />
              </label>
              <label className="field">
                <span>SK Chairperson</span>
                <input type="text" value={skChairperson} onChange={(e) => setSkChairperson(e.target.value)} />
              </label>
            </div>
          </div>

          {/* Section: Resolution Officials */}
          <div className="overview-card">
            <h2>Resolution Officials (For PRESENTS Section)</h2>
            <div className="form-grid">
              <label className="field">
                <span>SK Secretary</span>
                <input type="text" value={skSecretary} onChange={(e) => setSkSecretary(e.target.value)} placeholder="Enter name..." />
              </label>
            </div>
            <h3 style={{ marginTop: '16px', marginBottom: '8px', fontSize: '1rem' }}>SK Kagawads</h3>
            <div className="form-grid">
              {skKagawads.map((kagawad, idx) => (
                <label key={idx} className="field">
                  <span>SK Kagawad {idx + 1}</span>
                  <input type="text" value={kagawad} onChange={(e) => handleKagawadChange(idx, e.target.value)} placeholder="Enter name..." />
                </label>
              ))}
            </div>
          </div>

          {/* Section: General Administration Goals */}
          <div className="overview-card">
            <h2>General Administration Goals</h2>
            <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
              <label className="field">
                <span>EXPECTED RESULTS (DESIRED OBJECTIVES)</span>
                <textarea 
                  value={expectedResults} 
                  onChange={(e) => setExpectedResults(e.target.value)} 
                  placeholder="Enter expected results..."
                  rows={4}
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '0.95rem', fontFamily: 'inherit', resize: 'vertical' }}
                />
              </label>
              <label className="field">
                <span>PERFORMANCE INDICATORS (MEANS OF MEASUREMENT)</span>
                <textarea 
                  value={performanceIndicators} 
                  onChange={(e) => setPerformanceIndicators(e.target.value)} 
                  placeholder="Enter performance indicators..."
                  rows={4}
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '0.95rem', fontFamily: 'inherit', resize: 'vertical' }}
                />
              </label>
            </div>
          </div>

          {/* Section: Project Details */}
          {systemTotals.projects.length > 0 && (
            <div className="overview-card">
              <h2>Project Objectives & Indicators</h2>
              {systemTotals.projects.map((proj) => (
                <div key={proj.id} style={{ marginBottom: '24px', padding: '16px', border: '1px solid var(--border)', borderRadius: '8px' }}>
                  <h3 style={{ marginBottom: '12px', fontSize: '1rem' }}>{proj.event || proj.project || 'Untitled Project'}</h3>
                  <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
                    <label className="field">
                      <span>EXPECTED RESULTS (DESIRED OBJECTIVES)</span>
                      <textarea 
                        value={projectOverrides[proj.id]?.expectedResult ?? proj.description ?? ''} 
                        onChange={(e) => setProjectOverrides(prev => ({ ...prev, [proj.id]: { ...prev[proj.id], expectedResult: e.target.value } }))} 
                        placeholder={`e.g. To implement and complete ${proj.event || proj.project || 'Untitled Project'}`}
                        rows={2}
                        style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '0.95rem', fontFamily: 'inherit', resize: 'vertical' }}
                      />
                    </label>
                    <label className="field">
                      <span>PERFORMANCE INDICATORS (MEANS OF MEASUREMENT)</span>
                      <textarea 
                        value={projectOverrides[proj.id]?.indicator ?? proj.projectStatus ?? proj.status ?? ''} 
                        onChange={(e) => setProjectOverrides(prev => ({ ...prev, [proj.id]: { ...prev[proj.id], indicator: e.target.value } }))} 
                        placeholder="e.g. Completed"
                        rows={2}
                        style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '0.95rem', fontFamily: 'inherit', resize: 'vertical' }}
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Section: Receipts */}
          <div className="overview-card">
            <h2>Receipts</h2>
            <div className="form-grid">
              <label className="field">
                <span>Subsidy from Barangay</span>
                <CurrencyInput value={subsidyBarangay} onValueChange={(val) => setSubsidyBarangay(Number(val))} />
              </label>
              <label className="field">
                <span>Subsidy from Other LGUs</span>
                <CurrencyInput value={subsidyOtherLGU} onValueChange={(val) => setSubsidyOtherLGU(Number(val))} />
              </label>
              <label className="field">
                <span>Subsidy from Nat. Gov Agencies</span>
                <CurrencyInput value={subsidyNGA} onValueChange={(val) => setSubsidyNGA(Number(val))} />
              </label>
              <label className="field">
                <span>Subsidy from GOCCs</span>
                <CurrencyInput value={subsidyGOCC} onValueChange={(val) => setSubsidyGOCC(Number(val))} />
              </label>
              <label className="field">
                <span>Grants/Donations (With Specific Purpose)</span>
                <CurrencyInput value={grantsSpecific} onValueChange={(val) => setGrantsSpecific(Number(val))} />
              </label>
              <label className="field">
                <span>Grants/Donations (Without Specific Purpose)</span>
                <CurrencyInput value={grantsWithoutSpecific} onValueChange={(val) => setGrantsWithoutSpecific(Number(val))} />
              </label>
              <label className="field">
                <span>Miscellaneous Income</span>
                <CurrencyInput value={miscIncome} onValueChange={(val) => setMiscIncome(Number(val))} />
              </label>
              <label className="field">
                <span>Other Receipts</span>
                <CurrencyInput value={otherReceipts} onValueChange={(val) => setOtherReceipts(Number(val))} />
              </label>
            </div>
            <div className="form-note" style={{ marginTop: '16px', fontWeight: 700, fontSize: '1.1rem' }}>
              Total Receipts: PHP {totalReceipts.toLocaleString()}
            </div>
          </div>

          {/* Section: MOOE */}
          <div className="overview-card">
            <h2>Payments: Maintenance and Other Operating Expenses (MOOE)</h2>
            <div className="form-grid">
              {[
                { key: 'travelling', label: 'Travelling Expenses' },
                { key: 'training', label: 'Training Expenses' },
                { key: 'officeSupplies', label: 'Office Supplies Expenses' },
                { key: 'semiExpendable', label: 'Semi-Expendable Property Expenses' },
                { key: 'fuelOil', label: 'Fuel, Oil and Lubricants Expenses' },
                { key: 'accountableForms', label: 'Accountable Forms Expenses' },
                { key: 'otherSupplies', label: 'Other Supplies and Materials Expenses' },
                { key: 'water', label: 'Water Expenses' },
                { key: 'electricity', label: 'Electricity Expenses' },
                { key: 'postage', label: 'Postage and Courier Services' },
                { key: 'telephone', label: 'Telephone Expenses' },
                { key: 'internet', label: 'Internet Subscription Expenses' },
                { key: 'prizes', label: 'Prizes' },
                { key: 'rmLandImprovements', label: 'Repairs & Maint. - Land Improvements' },
                { key: 'rmBuildings', label: 'Repairs & Maint. - Buildings & Structures' },
                { key: 'rmMachinery', label: 'Repairs & Maint. - Machinery' },
                { key: 'rmOfficeEquipment', label: 'Repairs & Maint. - Office Equipment' },
                { key: 'rmICT', label: 'Repairs & Maint. - ICT Equipment' },
                { key: 'rmSports', label: 'Repairs & Maint. - Sports Equipment' },
                { key: 'rmTransportation', label: 'Repairs & Maint. - Transportation Eq.' },
                { key: 'rmFurniture', label: 'Repairs & Maint. - Furniture & Books' },
                { key: 'rmOtherProperty', label: 'Repairs & Maint. - Other Property & Eq.' },
                { key: 'fidelityBond', label: 'Fidelity Bond Premiums' },
                { key: 'advertising', label: 'Advertising Expenses' },
                { key: 'rent', label: 'Rent/Lease Expenses' },
                { key: 'membershipDues', label: 'Membership Dues & Contributions' },
                { key: 'donation', label: 'Donation' },
                { key: 'honoraria', label: 'Honoraria' },
                { key: 'bankCharges', label: 'Bank Charges' },
                { key: 'otherMOOE', label: 'Other Maintenance and Operating Expenses' },
              ].map((item) => (
                <label key={item.key} className="field">
                  <span>{item.label}</span>
                  <input 
                    type="number" 
                    min="0" 
                    value={mooe[item.key]} 
                    onChange={(e) => handleMooeChange(item.key, e.target.value)} 
                  />
                </label>
              ))}
            </div>
            <div className="form-note" style={{ marginTop: '16px', fontWeight: 700, fontSize: '1.1rem' }}>
              Total MOOE: PHP {totalMOOE.toLocaleString()}
            </div>
          </div>

          {/* Section: Capital Outlay */}
          <div className="overview-card">
            <h2>Payments: Capital Outlay</h2>
            <div className="form-grid">
              {[
                { key: 'land', label: 'Land' },
                { key: 'landImprovements', label: 'Land Improvements' },
                { key: 'buildings', label: 'Buildings' },
                { key: 'otherStructures', label: 'Other Structures' },
                { key: 'machinery', label: 'Machinery' },
                { key: 'officeEquipment', label: 'Office Equipment' },
                { key: 'ictEquipment', label: 'ICT Equipment' },
                { key: 'sportsEquipment', label: 'Sports Equipment' },
                { key: 'transportation', label: 'Transportation Equipment' },
                { key: 'furniture', label: 'Furniture, Fixtures and Books' },
                { key: 'otherProperty', label: 'Other Property and Equipment' },
                { key: 'cipLandImprovements', label: 'CIP - Land Improvements' },
                { key: 'cipBuildings', label: 'CIP - Buildings' },
                { key: 'cipOtherStructures', label: 'CIP - Other Structures' },
              ].map((item) => (
                <label key={item.key} className="field">
                  <span>{item.label}</span>
                  <input 
                    type="number" 
                    min="0" 
                    value={co[item.key]} 
                    onChange={(e) => handleCoChange(item.key, e.target.value)} 
                  />
                </label>
              ))}
            </div>
            <div className="form-note" style={{ marginTop: '16px', fontWeight: 700, fontSize: '1.1rem' }}>
              Total Capital Outlay: PHP {totalCO.toLocaleString()}
            </div>
          </div>

          {/* Section: Cash Summary */}
          <div className="overview-card">
            <h2>Cash Summary</h2>
            <div className="form-grid">
              <label className="field">
                <span>Cash Advances, Net</span>
                <CurrencyInput value={cashAdvancesNet} onValueChange={(val) => setCashAdvancesNet(Number(val))} />
              </label>
              <label className="field">
                <span>Add/Less: Others</span>
                <CurrencyInput value={addLessOthers} onValueChange={(val) => setAddLessOthers(Number(val))} />
              </label>
            </div>
            <h3 style={{ marginTop: '24px', marginBottom: '8px' }}>Cash at beginning of year</h3>
            <div className="form-grid">
              <label className="field">
                <span>Cash on Hand</span>
                <CurrencyInput value={cashBeginningHand} onValueChange={(val) => setCashBeginningHand(Number(val))} />
              </label>
              <label className="field">
                <span>Cash in Bank</span>
                <CurrencyInput value={cashBeginningBank} onValueChange={(val) => setCashBeginningBank(Number(val))} />
              </label>
            </div>
            
            <h3 style={{ marginTop: '24px', marginBottom: '8px' }}>Breakdown of Cash at end of year</h3>
            <p className="form-note">Calculated Cash at End: PHP {cashEnd.toLocaleString()}</p>
            <div className="form-grid">
              <label className="field">
                <span>Cash on Hand</span>
                <CurrencyInput value={cashEndHand} onValueChange={(val) => setCashEndHand(Number(val))} />
              </label>
              <label className="field">
                <span>Cash in Bank</span>
                <CurrencyInput value={cashEndBank} onValueChange={(val) => setCashEndBank(Number(val))} />
              </label>
            </div>
          </div>
          
          <div style={{ paddingBottom: '32px' }}>
            <button type="submit" className="primary-button" onClick={handlePreview}>
              <Printer size={16} />
              Preview & Generate PDF
            </button>
          </div>
        </form>
      </section>

      {/* Preview Full-Screen Modal */}
      {showPreview && (
        <AnnualReportPreview 
          data={{
            year: selectedYear,
            barangay: barangayName,
            city: cityMunicipality,
            province: province,
            skTreasurer,
            skChairperson,
            skSecretary,
            skKagawads,
            receipts: {
              subsidyBarangay,
              subsidyOtherLGU,
              subsidyNGA,
              subsidyGOCC,
              grantsSpecific,
              grantsWithoutSpecific,
              miscIncome,
              otherReceipts,
              total: totalReceipts
            },
            mooe: { ...mooe, total: totalMOOE },
            co: { ...co, total: totalCO },
            cashAdvancesNet,
            totalPayments,
            increaseDecreaseCash,
            addLessOthers,
            totalIncreaseDecreaseCash,
            cashBeginning: {
              hand: cashBeginningHand,
              bank: cashBeginningBank,
              total: cashBeginning
            },
            cashEnd: {
              hand: cashEndHand,
              bank: cashEndBank,
              calculatedTotal: cashEnd
            },
            projects: systemTotals.projects,
            expectedResults,
            performanceIndicators,
            projectOverrides
          }}
          onClose={() => setShowPreview(false)}
        />
      )}
    </RoleGate>
  )
}

export default AnnualReportPage
