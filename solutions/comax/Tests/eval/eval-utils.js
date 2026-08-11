import fs from 'fs'

export const loadVerifiedQuestions = () => {
  const md = fs.readFileSync(new URL('../../Doclets/verified-questions.md', import.meta.url), 'utf8')
  return [...md.matchAll(/<doclet id="(Q\d+)" label="(.*?)" status="(\w+)">\s*<question>([\s\S]*?)<\/question>\s*<sql>([\s\S]*?)<\/sql>\s*<notes>([\s\S]*?)<\/notes>/g)]
    .map(([, id, label, status, question, sql, notes]) => ({ id, label: label.replace(/&quot;/g, '"'), status, question: question.trim(), refSql: sql.trim(), notes: notes.trim() }))
}

export const pMap = async (items, fn, limit) => {
  const out = [], queue = [...items.entries()]
  await Promise.all([...Array(Math.min(limit, items.length))].map(async () => {
    for (let next = queue.shift(); next; next = queue.shift()) out[next[0]] = await fn(next[1], next[0])
  }))
  return out
}
