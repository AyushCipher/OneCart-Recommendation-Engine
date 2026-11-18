// Offline evaluation for the recommender (read-only against MongoDB).
//
// Usage: MONGODB_URL=... node scripts/evalRecommender.js [--k=10] [--test-frac=0.2] [--min-events=5]
//
// For every user with enough tracked events, the user's distinct products are
// ordered by time; the most recent fraction is held out as "relevant" items and
// the earlier part is the training history. Each recommender gets only the
// training data and is scored with precision@k and hit-rate@k on the held-out
// items. Two simple reference recommenders (popularity, item co-occurrence)
// are included; add your own to `recommenders` to compare.
//
// This script only computes metrics when run; it makes no claims about results.
import mongoose from 'mongoose'
import { fileURLToPath } from 'url'

const POSITIVE_EVENTS = ['view', 'click', 'add_to_cart', 'purchase', 'recommendation_click']

export const precisionAtK = (recommended, relevant, k) => {
  const top = recommended.slice(0, k)
  if (top.length === 0) return 0
  const rel = new Set(relevant)
  return top.filter((id) => rel.has(id)).length / k
}

export const hitAtK = (recommended, relevant, k) => {
  const rel = new Set(relevant)
  return recommended.slice(0, k).some((id) => rel.has(id)) ? 1 : 0
}

// events: [{ userId, productId, ts }] -> [{ userId, train: [productId], test: [productId] }]
export const splitByUser = (events, { testFrac = 0.2, minProducts = 5 } = {}) => {
  const byUser = new Map()
  for (const e of [...events].sort((a, b) => a.ts - b.ts)) {
    if (!byUser.has(e.userId)) byUser.set(e.userId, [])
    const list = byUser.get(e.userId)
    if (!list.includes(e.productId)) list.push(e.productId)
  }
  const out = []
  for (const [userId, products] of byUser) {
    if (products.length < minProducts) continue
    const nTest = Math.max(1, Math.round(products.length * testFrac))
    out.push({ userId, train: products.slice(0, -nTest), test: products.slice(-nTest) })
  }
  return out
}

export const popularityRecommender = (splits) => {
  const counts = new Map()
  for (const s of splits) for (const p of s.train) counts.set(p, (counts.get(p) || 0) + 1)
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p)
  return (train) => ranked.filter((p) => !train.includes(p))
}

export const coOccurrenceRecommender = (splits) => {
  const co = new Map()
  for (const s of splits) {
    for (const a of s.train) {
      for (const b of s.train) {
        if (a === b) continue
        if (!co.has(a)) co.set(a, new Map())
        co.get(a).set(b, (co.get(a).get(b) || 0) + 1)
      }
    }
  }
  return (train) => {
    const scores = new Map()
    for (const a of train) {
      for (const [b, n] of co.get(a) || []) {
        if (!train.includes(b)) scores.set(b, (scores.get(b) || 0) + n)
      }
    }
    return [...scores.entries()].sort((x, y) => y[1] - x[1]).map(([p]) => p)
  }
}

// NOTE: the models are fit on the training portion of ALL users (including the
// evaluated user's own training history, never their held-out items).
export const evaluate = (splits, makeRecommender, k = 10) => {
  const rec = makeRecommender(splits)
  let p = 0
  let h = 0
  for (const s of splits) {
    const list = rec(s.train)
    p += precisionAtK(list, s.test, k)
    h += hitAtK(list, s.test, k)
  }
  const n = splits.length || 1
  return { users: splits.length, [`precision@${k}`]: p / n, [`hitRate@${k}`]: h / n }
}

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? Number(hit.split('=')[1]) : fallback
}

const main = async () => {
  const k = arg('k', 10)
  await mongoose.connect(process.env.MONGODB_URL)
  const docs = await mongoose.connection
    .collection('userinteractions')
    .find({ eventType: { $in: POSITIVE_EVENTS }, productId: { $ne: null } }, { projection: { userId: 1, productId: 1, timestamp: 1, createdAt: 1 } })
    .toArray()
  const events = docs.map((d) => ({
    userId: String(d.userId),
    productId: String(d.productId),
    ts: new Date(d.timestamp || d.createdAt).getTime(),
  }))
  const splits = splitByUser(events, { testFrac: arg('test-frac', 0.2), minProducts: arg('min-events', 5) })
  console.log(`events=${events.length} evaluable_users=${splits.length}`)
  if (splits.length === 0) console.log('Not enough tracked data to evaluate.')
  const recommenders = { popularity: popularityRecommender, coOccurrence: coOccurrenceRecommender }
  for (const [name, make] of Object.entries(recommenders)) {
    console.log(name, evaluate(splits, make, k))
  }
  await mongoose.disconnect()
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
