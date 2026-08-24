import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase/supabaseClient'

/** Receipt counts keyed by requisition expense id, including legacy rows whose
 * record_id still points directly at the requisition. */
export default function useRequisitionReceiptCounts(expenses = []) {
  const [counts, setCounts] = useState({})
  const requisitionIds = useMemo(
    () => expenses
      .filter(expense => expense.isAdditional)
      .map(expense => String(expense.id))
      .sort(),
    [expenses],
  )
  const idKey = requisitionIds.join(',')

  useEffect(() => {
    let mounted = true
    if (!requisitionIds.length) return undefined

    ;(async () => {
      const seenReceipts = new Set()
      const nextCounts = {}
      const addRows = (rows, keyName) => {
        ;(rows || []).forEach(row => {
          if (seenReceipts.has(String(row.id))) return
          const requisitionId = row[keyName]
          if (!requisitionId) return
          seenReceipts.add(String(row.id))
          const key = String(requisitionId)
          nextCounts[key] = (nextCounts[key] || 0) + 1
        })
      }

      const consolidated = await supabase
        .from('receipt_records')
        .select('id, requisition_id')
        .in('requisition_id', requisitionIds)
      if (!consolidated.error) addRows(consolidated.data, 'requisition_id')

      const legacy = await supabase
        .from('receipt_records')
        .select('id, record_id')
        .in('record_id', requisitionIds)
      if (!legacy.error) addRows(legacy.data, 'record_id')

      if (mounted) setCounts(nextCounts)
    })()

    return () => { mounted = false }
  }, [idKey, requisitionIds])

  return counts
}
