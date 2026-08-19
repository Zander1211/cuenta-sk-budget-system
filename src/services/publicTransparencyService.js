import { supabase } from '../supabase/supabaseClient'

export async function getPublicTransparencyData() {
  const projectResult = await supabase
    .from('public_projects')
    .select('id, name, description, category, approved_allocation, actual_expenditure, expenditure_reported, verified_receipt_count, remaining_amount, status, implementation_start, implementation_end, target_beneficiaries, progress_update, progress_percent, last_updated')
    .order('name')
  const error = projectResult.error
  if (error) throw new Error('Transparency information could not be loaded.')
  return { projects: projectResult.data || [] }
}
