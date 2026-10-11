export function parseBudgetAmount(value) {
  if (typeof value === 'number') return value
  const text = String(value ?? '').trim()
  // Read the visible CurrencyInput value, including pesos and grouping. Do
  // not use parseFloat, which silently turns "100,000" into 100.
  if (!/^(?:₱\s*)?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{0,2})?$/.test(text)) {
    throw new Error('Enter a valid budget amount greater than zero.')
  }
  return Number(text.replace(/^₱\s*/, '').replaceAll(',', ''))
}

export function normalizeMonthlyBudget({ month, year, amount, source = '', description = '' }) {
  month = Number(month)
  year = Number(year)
  amount = parseBudgetAmount(amount)
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error('Select a valid month before saving.')
  }
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error('Select a year between 2000 and 2100.')
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Enter a valid budget amount greater than zero.')
  }
  const roundedAmount = Math.round(amount * 100) / 100
  if (roundedAmount <= 0 || !Number.isSafeInteger(Math.round(amount * 100))) {
    throw new Error('Enter a valid budget amount in pesos and centavos.')
  }
  return { month, year, quarter: Math.floor((month - 1) / 3) + 1,
    amount: roundedAmount, source: source.trim(), description: description.trim() }
}

export function mapBudgetRow(row) {
  return {
    id: String(row.id), month: Number(row.month), year: Number(row.year),
    quarter: Number(row.quarter), amount: Number(row.amount),
    source: row.source || '', description: row.description || '',
    createdBy: row.created_by || row.added_by || null,
    addedBy: row.added_by_name || '',
    createdAt: row.created_at, updatedAt: row.updated_at,
  }
}

export function mapBudgetAllocationRow(row) {
  return mapBudgetRow({ ...row, id: row.operation_id,
    quarter: Math.floor((Number(row.month) - 1) / 3) + 1,
    updated_at: row.created_at })
}

// Add on the server so concurrent saves cannot overwrite each other's funds.
// Retrying the same operation ID never applies the addition twice.
export async function saveMonthlyBudget(client, input) {
  try {
    const payload = normalizeMonthlyBudget(input)
    const operationId = input.operationId || crypto.randomUUID()
    const { data, error } = await client.rpc('add_monthly_budget_funds', {
      p_month: payload.month, p_year: payload.year, p_amount: payload.amount,
      p_source: payload.source, p_description: payload.description,
      p_operation_id: operationId,
    })
    if (error) throw error
    if (!data?.budget) throw new Error('The database did not confirm the saved allocation. Please try again.')
    const saved = mapBudgetRow(data.budget)
    const addedAmount = Number(data.added_amount)
    const previousAmount = Number(data.previous_amount)
    const resultingAmount = Number(data.resulting_amount)
    if (saved.month !== payload.month || saved.year !== payload.year || addedAmount !== payload.amount
      || !Number.isFinite(previousAmount) || !Number.isFinite(resultingAmount)
      || Math.round(previousAmount * 100) + Math.round(addedAmount * 100) !== Math.round(resultingAmount * 100)
      || (!data.replayed && saved.amount !== resultingAmount)) {
      throw new Error('The database did not confirm the entered amount for the selected month. Please try again.')
    }
    const additionRow = data.addition || {
      operation_id: operationId,
      month: saved.month,
      year: saved.year,
      amount: addedAmount,
      previous_amount: previousAmount,
      resulting_amount: resultingAmount,
      source: payload.source || saved.source || '',
      description: payload.description || saved.description || '',
      created_by: saved.createdBy,
      added_by_name: saved.addedBy || '',
      created_at: saved.updatedAt || saved.createdAt || new Date().toISOString(),
    }
    return { data: saved, allocation: mapBudgetAllocationRow(additionRow), addedAmount, previousAmount,
      replayed: Boolean(data.replayed), error: null }
  } catch (error) {
    return { data: null, error }
  }
}
