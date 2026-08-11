const { CHEM_FB_ACCESS_TOKEN: TOKEN, CHEM_FB_AD_ACCOUNT_ID: ACCT } = process.env
const API = 'https://graph.facebook.com/v21.0'
const get = (path, params = {}) =>
  fetch(`${API}/${path}?${new URLSearchParams({ ...params, access_token: TOKEN })}`).then(r => r.json())

const preset = process.argv[2] || 'last_30d'
const [account, insights, campaigns] = await Promise.all([
  get(ACCT, { fields: 'name,account_status,currency,amount_spent,balance,timezone_name' }),
  get(`${ACCT}/insights`, { fields: 'spend,impressions,clicks,ctr,cpc,cpm,reach,frequency', date_preset: preset }),
  get(`${ACCT}/campaigns`, { fields: 'name,status,effective_status,objective,daily_budget,lifetime_budget', limit: 200 }),
])
console.log(JSON.stringify({ account, insights: insights.data, campaigns: campaigns.data }, null, 2))
