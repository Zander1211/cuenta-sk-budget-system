const fs = require('fs');
const file = 'src/context/BudgetContext.jsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Add state
content = content.replace(
  /const \[expensesSyncStatus, setExpensesSyncStatus\] = useState\('idle'\)/g,
  const [expensesSyncStatus, setExpensesSyncStatus] = useState('idle')\n  const [verifiedReceiptTotals, setVerifiedReceiptTotals] = useState({})
);

// 2. Add loadVerifiedReceiptTotalsFromSupabase & update refreshExpensesFromSupabase
content = content.replace(
  /function refreshExpensesFromSupabase\(\) {\s*return loadExpensesFromSupabase\(\)\s*}/g,
  sync function loadVerifiedReceiptTotalsFromSupabase() {
    if (typeof window === 'undefined') return

    try {
      const { data, error } = await supabase
        .from('receipt_records')
        .select('record_id, requisition_id, ocr_metadata, ocr_verified_at')
        .not('ocr_verified_at', 'is', null)

      if (error) {
        throw error
      }

      if (Array.isArray(data)) {
        const totals = {}
        data.forEach((receipt) => {
          const amount = Number(receipt.ocr_metadata?.totalAmount) || 0
          if (amount > 0) {
             const rId = String(receipt.record_id)
             totals[rId] = (totals[rId] || 0) + amount
             if (receipt.requisition_id) {
               const reqId = String(receipt.requisition_id)
               totals[reqId] = (totals[reqId] || 0) + amount
               totals[\equisition:\\] = totals[reqId]
             }
          }
        })
        setVerifiedReceiptTotals(totals)
      }
    } catch (error) {
      console.warn('Supabase verified receipts sync failed', error?.message || error)
    }
  }

  function refreshExpensesFromSupabase() {
    loadVerifiedReceiptTotalsFromSupabase()
    return loadExpensesFromSupabase()
  }
);

// 3. Add to refreshAllBudgetData
content = content.replace(
  /loadRequestsFromSupabase\(\),\s*\]\)/g,
  loadRequestsFromSupabase(),\n        loadVerifiedReceiptTotalsFromSupabase(),\n      ])
);

// 4. Add to useEffect
content = content.replace(
  /loadBudgetsFromSupabase\(\)\s*loadRequestsFromSupabase\(\)/g,
  loadBudgetsFromSupabase()\n    loadRequestsFromSupabase()\n    loadVerifiedReceiptTotalsFromSupabase()
);

// 5. Export from useBudget
content = content.replace(
  /totals,\s*addMonthlyBudget,/g,
  	otals,\n        verifiedReceiptTotals,\n        addMonthlyBudget,
);

// 6. Add to dependency array
content = content.replace(
  /expensesSyncStatus, totals\]/g,
  expensesSyncStatus, totals, verifiedReceiptTotals]
);

fs.writeFileSync(file, content, 'utf8');
