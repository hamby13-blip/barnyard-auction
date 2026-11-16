const LOCAL_ID = /^[A-Za-z0-9_-]{1,64}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function clampText(value, max, label) {
  if (value == null) return '';
  const text = String(value).trim();
  if (text.length > max) httpError(400, `${label} is too long.`);
  return text;
}

function clampOptionalMoney(value, label) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 10_000_000) httpError(400, `Invalid ${label}.`);
  return Math.round(n * 100) / 100;
}

function clampWeight(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 50_000) httpError(400, 'Invalid weight.');
  return Math.round(n * 10) / 10;
}

function clampInt(value, min, max, label) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < min || n > max) httpError(400, `Invalid ${label}.`);
  return n;
}

function clampTouchedAt(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return Date.now();
  return Math.min(n, Date.now() + 86_400_000);
}

function sanitizeAddon(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const amount = clampOptionalMoney(raw.amount, 'add-on amount');
  if (amount == null || amount === 0) return null;
  return {
    id: LOCAL_ID.test(String(raw.id || '')) ? String(raw.id) : undefined,
    amount,
    note: clampText(raw.note, 200, 'Add-on note'),
    buyerName: clampText(raw.buyerName, 120, 'Add-on buyer name'),
    buyerId: raw.buyerId == null || raw.buyerId === '' ? null : (LOCAL_ID.test(String(raw.buyerId)) ? String(raw.buyerId) : null),
    touchedAt: clampTouchedAt(raw.touchedAt)
  };
}

function sanitizeLot(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const addOns = Array.isArray(raw.addOns) ? raw.addOns.map(sanitizeAddon).filter(Boolean).slice(0, 50) : [];
  return {
    id: LOCAL_ID.test(String(raw.id || '')) ? String(raw.id) : undefined,
    n: clampInt(raw.n, 0, 99_999, 'lot number'),
    ex: clampText(raw.ex, 120, 'Exhibitor name'),
    sp: clampText(raw.sp, 80, 'Species'),
    de: clampText(raw.de, 300, 'Description'),
    club: clampText(raw.club, 120, 'Club'),
    weight: clampWeight(raw.weight),
    price: clampOptionalMoney(raw.price, 'sale price'),
    buyer: clampText(raw.buyer, 120, 'Buyer name'),
    buyerId: raw.buyerId == null || raw.buyerId === '' ? null : (LOCAL_ID.test(String(raw.buyerId)) ? String(raw.buyerId) : null),
    addOns,
    touchedAt: clampTouchedAt(raw.touchedAt)
  };
}

function sanitizeBuyer(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const paid = !!raw.paid;
  let paidAt = clampText(raw.paidAt, 32, 'Paid date');
  if (paidAt && !ISO_DATE.test(paidAt)) paidAt = '';
  return {
    id: LOCAL_ID.test(String(raw.id || '')) ? String(raw.id) : undefined,
    num: clampInt(raw.num, 0, 99_999, 'bidder number'),
    name: clampText(raw.name, 120, 'Buyer name'),
    business: clampText(raw.business, 120, 'Business name'),
    phone: clampText(raw.phone, 40, 'Phone'),
    paid,
    paidAt,
    touchedAt: clampTouchedAt(raw.touchedAt)
  };
}

function sanitizePayout(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const status = raw.status === 'picked_up' ? 'picked_up' : 'owed';
  let pickupDate = clampText(raw.pickupDate, 32, 'Pickup date');
  if (pickupDate && !ISO_DATE.test(pickupDate)) pickupDate = '';
  return {
    id: LOCAL_ID.test(String(raw.id || '')) ? String(raw.id) : undefined,
    ex: clampText(raw.ex, 120, 'Exhibitor name'),
    status,
    pickupDate,
    pickupDetail: clampText(raw.pickupDetail, 200, 'Pickup detail'),
    note: clampText(raw.note, 500, 'Payout note'),
    touchedAt: clampTouchedAt(raw.touchedAt)
  };
}

function sanitizeTombstones(list, max) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, max).map((entry) => {
    if (!entry || typeof entry !== 'object') return null;
    const id = LOCAL_ID.test(String(entry.id || '')) ? String(entry.id) : '';
    if (!id) return null;
    return { id, deletedAt: clampTouchedAt(entry.deletedAt) };
  }).filter(Boolean);
}

export function cleanEvent(data, id) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    httpError(400, 'Sale data must be an object.');
  }
  let copy;
  try {
    copy = JSON.parse(JSON.stringify(data));
  } catch {
    httpError(400, 'Sale data is not valid JSON.');
  }
  copy.id = id;
  copy.name = clampText(copy.name || 'Untitled sale', 200, 'Sale name') || 'Untitled sale';
  let fee = Number(copy.feePct);
  if (!Number.isFinite(fee) || fee < 0) fee = 0;
  if (fee > 100) fee = 100;
  copy.feePct = fee;
  copy.isExample = !!copy.isExample;
  copy.saleDate = clampText(copy.saleDate, 32, 'Sale date');
  if (copy.saleDate && !ISO_DATE.test(copy.saleDate)) copy.saleDate = '';
  const pd = Number(copy.payoutDeadlineDays);
  copy.payoutDeadlineDays = Number.isFinite(pd) && pd >= 0 && pd <= 3660 ? Math.floor(pd) : 14;
  copy.metaTouchedAt = clampTouchedAt(copy.metaTouchedAt);
  copy.orderTouchedAt = clampTouchedAt(copy.orderTouchedAt);

  const lots = Array.isArray(copy.lots) ? copy.lots : [];
  const buyers = Array.isArray(copy.buyers) ? copy.buyers : [];
  const payouts = Array.isArray(copy.payouts) ? copy.payouts : [];
  if (lots.length > 8000 || buyers.length > 8000 || payouts.length > 8000) {
    httpError(413, 'Sale is too large.');
  }
  copy.lots = lots.map(sanitizeLot).filter(Boolean);
  copy.buyers = buyers.map(sanitizeBuyer).filter(Boolean);
  copy.payouts = payouts.map(sanitizePayout).filter(Boolean);
  copy.lotTombstones = sanitizeTombstones(copy.lotTombstones, 2000);
  copy.buyerTombstones = sanitizeTombstones(copy.buyerTombstones, 2000);
  return copy;
}