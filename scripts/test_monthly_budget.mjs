// Browser regression against the real form, provider, and analysis hooks.
// Supabase/auth are simulated here; verify_monthly_budgets.sql tests real SQL.
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { chromium } from 'playwright-core'
import { normalizeMonthlyBudget, parseBudgetAmount } from '../src/services/monthlyBudget.js'

assert.equal(parseBudgetAmount('₱ 100,000.75'), 100000.75)
assert.equal(parseBudgetAmount('100,000'), 100000)
for (const value of ['100,00', '100000abc', 'Infinity', '']) assert.throws(() => parseBudgetAmount(value))

for (const patch of [{month: ''}, {month: 13}, {month: 1.5}, {year: ''}, {year: 2026.5},
  {amount: ''}, {amount: -1}, {amount: NaN}, {amount: Infinity}]) {
  assert.throws(() => normalizeMonthlyBudget({month: 8, year: 2026, amount: 70000, ...patch}))
}

const mocks = {
  AuthContext: `
    import React from 'react';
    const Context = React.createContext(null);
    const user = { id: 'treasurer-test' };
    export function AuthProvider({children}) {
      const [isAuthenticated, setAuth] = React.useState(true);
      return React.createElement(Context.Provider, {value: {isAuthenticated, user,
        role: 'SK Treasurer', profileName: 'Test Treasurer'}},
        React.createElement('button', {onClick: () => setAuth(!isAuthenticated)}, isAuthenticated ? 'Log out' : 'Log in'), children);
    }
    export const useAuth = () => React.useContext(Context);
  `,
  AuditLogContext: `export const useAuditLog = () => ({addLog: (entry) => (window.auditEntries ||= []).push(entry)});`,
  NotificationContext: `export const useNotifications = () => ({addNotification: () => {}});`,
  supabaseClient: `
    const read = () => JSON.parse(localStorage.getItem('test.database') || '[]');
    const readAdditions = () => JSON.parse(localStorage.getItem('test.additions') || '[]');
    const subscriptions = new Set();
    const publish = () => subscriptions.forEach(c => c.handlers.filter(h => h.table === 'budgets' || h.table === 'monthly_budget_additions').forEach(h => h.callback()));
    window.externalBudgetSave = (amount) => {
      const rows = read(); rows.find(b => b.month === 8 && b.year === 2026).amount = amount;
      localStorage.setItem('test.database', JSON.stringify(rows)); publish();
    };
    window.saveCalls = 0;
    export const supabase = {
      async rpc(name, payload) {
        if (name !== 'add_monthly_budget_funds') throw new Error('Wrong RPC');
        window.saveCalls++;
        await new Promise(resolve => setTimeout(resolve, 150));
        if (window.failNextBudgetSave) {
          window.failNextBudgetSave = false;
          return {data: null, error: {message: 'Database rejected this budget'}};
        }
        const rows = read();
        const previous = rows.find(b => b.month === payload.p_month && b.year === payload.p_year);
        const operations = JSON.parse(localStorage.getItem('test.operations') || '{}');
        if (operations[payload.p_operation_id]) {
          return {data: {...operations[payload.p_operation_id], budget: previous, replayed: true}, error: null};
        }
        const now = new Date().toISOString();
        const row = {month: payload.p_month, year: payload.p_year, quarter: Math.floor((payload.p_month-1)/3)+1,
          amount: (previous?.amount || 0) + payload.p_amount,
          source: payload.p_source, description: payload.p_description,
          id: previous?.id || crypto.randomUUID(), created_by: 'treasurer-test', added_by_name: 'Test Treasurer',
          created_at: previous?.created_at || now, updated_at: now};
        const addition = {operation_id: payload.p_operation_id, month: payload.p_month, year: payload.p_year,
          amount: payload.p_amount, previous_amount: previous?.amount || 0, resulting_amount: row.amount,
          source: payload.p_source, description: payload.p_description,
          created_by: 'treasurer-test', added_by_name: 'Test Treasurer',
          created_at: now};
        const result = {budget: row, added_amount: payload.p_amount, previous_amount: previous?.amount || 0,
          resulting_amount: row.amount, replayed: false, addition};
        localStorage.setItem('test.database', JSON.stringify([...rows.filter(b => b.id !== row.id), row]));
        const currentAdditions = readAdditions();
        localStorage.setItem('test.additions', JSON.stringify([addition, ...currentAdditions]));
        operations[payload.p_operation_id] = result;
        localStorage.setItem('test.operations', JSON.stringify(operations));
        if (window.loseNextSaveResponse) {
          window.loseNextSaveResponse = false;
          return {data: null, error: {message: 'Response lost; please retry'}};
        }
        return {data: result, error: null};
      },
      from(table) {
        return {
          select() { return this; }, order() { return this; }, limit() { return this; }, not() { return this; },
          then(resolve, reject) {
            const data = table === 'budgets' ? read() : table === 'monthly_budget_additions' ? readAdditions() : [];
            const delay = table === 'budgets' ? window.delayNextBudgetRead || 0 : 0;
            if (table === 'budgets') window.delayNextBudgetRead = 0;
            return new Promise(done => setTimeout(() => done({data, error: null}), delay)).then(resolve, reject);
          }
        };
      },
      channel() {
        const channel = {handlers: [],
          on(event, filter, callback) { this.handlers.push({...filter, callback}); return this; },
          subscribe(callback) { subscriptions.add(this); queueMicrotask(() => callback?.('SUBSCRIBED')); return this; }
        }; return channel;
      },
      removeChannel(channel) { subscriptions.delete(channel); }
    };
  `,
}

const html = `<!doctype html><html><body><div id="root"></div><script type="module">
  import React from 'react';
  import {createRoot} from 'react-dom/client';
  import {AuthProvider} from '/src/context/AuthContext.jsx';
  import {BudgetProvider, useBudgetCalculations} from '/src/context/BudgetContext.jsx';
  import BudgetAllocationPanel from '/src/pages/budgets/BudgetAllocationPanel.jsx';
  import {useFinancialSummary} from '/src/hooks/useAnalysisData.js';
  function Probe() {
    const dashboard = useBudgetCalculations(8, 2026);
    const analysis = useFinancialSummary({view: 'monthly', month: 8, year: 2026});
    return React.createElement('output', {id:'probe'}, JSON.stringify({dashboard:dashboard.totalBudget,
      analysis:analysis.totalBudget, hasData:analysis.hasAnyData}));
  }
  createRoot(document.getElementById('root')).render(React.createElement(AuthProvider, null,
    React.createElement(BudgetProvider, null, React.createElement(BudgetAllocationPanel), React.createElement(Probe))));
</script></body></html>`

const server = await createServer({
  configFile: false,
  server: { host: '127.0.0.1', port: 0 },
  plugins: [{
    name: 'budget-test-mocks', enforce: 'pre',
    resolveId(id) {
      const name = Object.keys(mocks).find(key => id.endsWith('/' + key) || id.endsWith('/' + key + '.jsx') || id.endsWith('/' + key + '.js'))
      if (name) return '\0budget-test:' + name
    },
    load(id) { if (id.startsWith('\0budget-test:')) return mocks[id.split(':')[1]] },
    configureServer(vite) {
      vite.middlewares.use(async (req, res, next) => {
        if (req.url !== '/__budget_test') return next()
        res.setHeader('Content-Type', 'text/html')
        res.end(await vite.transformIndexHtml(req.url, html))
      })
    },
  }, react()],
})

let browser
try {
  await server.listen()
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true })
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__budget_test`)
  const selectAugust = async () => {
    await page.getByRole('combobox', { name: 'Filter by month' }).selectOption('8')
    const year = page.getByRole('textbox', { name: 'Enter Year' }).first()
    await year.fill('2026')
    await year.press('Tab')
  }
  const expectTotals = async (amount) => {
    await page.waitForFunction(value => {
      const probe = JSON.parse(document.getElementById('probe').textContent)
      return probe.dashboard === value && probe.analysis === value
    }, amount)
  }
  const save = async amount => {
    await page.getByRole('textbox', { name: 'Amount to add (PHP)' }).fill(amount)
    await page.getByRole('button', { name: 'Save Budget', exact: true }).click()
    assert.equal(await page.getByRole('button', {name: 'Saving...'}).isDisabled(), true)
    await page.getByRole('status').filter({hasText: 'added to August 2026. Monthly budget is now'}).waitFor()
  }

  await selectAugust()
  assert.equal(await page.locator('form select').first().inputValue(), '8')
  await save('50000')
  await expectTotals(50000)
  const first = await page.evaluate(() => JSON.parse(localStorage.getItem('test.database'))[0])
  assert.equal(first.month, 8)
  assert.equal(first.year, 2026)
  assert.equal(JSON.parse(await page.locator('#probe').textContent()).hasData, true)
  await save('50000')
  await expectTotals(100000)
  assert.equal(await page.getByRole('textbox', {name: 'Amount to add (PHP)'}).inputValue(), '')
  const updated = await page.evaluate(() => JSON.parse(localStorage.getItem('test.database')))
  assert.equal(updated.length, 1)
  assert.equal(updated[0].id, first.id)
  assert.equal(updated[0].created_at, first.created_at)

  // Native/autofill input still adds the visible amount, including centavos.
  await page.getByRole('textbox', {name: 'Amount to add (PHP)'}).evaluate(input => {
    input.value = '125,000.75'
  })
  await page.getByRole('button', {name: 'Save Budget', exact: true}).click()
  await expectTotals(225000.75)

  // An addition committed before a lost response must not be added twice
  // when the user retries the same draft.
  await page.evaluate(() => { window.loseNextSaveResponse = true })
  await page.getByRole('textbox', {name: 'Amount to add (PHP)'}).fill('5000')
  await page.getByRole('button', {name: 'Save Budget', exact: true}).click()
  await page.getByRole('alert').filter({hasText: 'Response lost'}).waitFor()
  await save('5000')
  await expectTotals(230000.75)

  // Start a stale read, then save before it resolves. A delayed load must not
  // replace the confirmed save or the totals consumed by other modules.
  await page.evaluate(() => {
    window.delayNextBudgetRead = 600;
    window.dispatchEvent(new Event('focus'));
  })
  await save('81000')
  await new Promise(resolve => setTimeout(resolve, 700))
  await expectTotals(311000.75)

  await page.evaluate(() => { window.failNextBudgetSave = true })
  await page.getByRole('textbox', {name: 'Amount to add (PHP)'}).fill('90000')
  await page.getByRole('button', {name: 'Save Budget', exact: true}).click()
  await page.getByRole('alert').filter({hasText: 'Database rejected this budget'}).waitFor()
  await expectTotals(311000.75)
  assert.match(await page.getByRole('textbox', {name: 'Amount to add (PHP)'}).inputValue(), /90,000/)
  assert.equal(await page.getByRole('status').filter({hasText: 'Monthly budget is now'}).count(), 0)
  assert.equal(await page.evaluate(() => window.auditEntries.length), 4)

  await page.getByRole('textbox', {name: 'Amount to add (PHP)'}).fill('0')
  await page.getByRole('button', {name: 'Save Budget', exact: true}).click()
  await page.getByRole('alert').filter({hasText: 'greater than zero'}).waitFor()
  assert.equal(await page.evaluate(() => window.saveCalls), 7)

  await page.getByRole('button', {name: 'Log out', exact: true}).click()
  await expectTotals(0)
  await page.getByRole('button', {name: 'Log in', exact: true}).click()
  await expectTotals(311000.75)
  await page.reload()
  await selectAugust()
  await expectTotals(311000.75)
  await page.evaluate(() => window.externalBudgetSave(85000))
  await expectTotals(85000)
  assert.equal(await page.getByRole('textbox', {name: 'Amount to add (PHP)'}).inputValue(), '')
  // A realtime update must not discard an amount currently being edited.
  await page.getByRole('textbox', {name: 'Amount to add (PHP)'}).fill('110000')
  await page.evaluate(() => window.externalBudgetSave(90000))
  await expectTotals(90000)
  assert.match(await page.getByRole('textbox', {name: 'Amount to add (PHP)'}).inputValue(), /110,000/)
  assert.equal(errors.length, 0, errors.join('\n'))
  console.log('PASS: cumulative additions, 50,000 + 50,000 = 100,000, retry safety, shared totals, login/reload, realtime updates')
} finally {
  await browser?.close()
  await server.close()
}
