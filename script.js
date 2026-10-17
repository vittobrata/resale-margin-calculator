const HISTORY_KEY = 'resale-margin-calculator-history-v1';
const $ = (id) => document.getElementById(id);
const rupiah = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/**
 * Menghitung harga jual rekomendasi, titik impas, laba, dan margin.
 *  - totalCost   = beli + biaya tambahan + ongkir
 *  - titik impas = totalCost / (1 - fee)
 *  - rekomendasi = totalCost / (1 - fee - targetMargin)   (margin dihitung dari harga jual)
 *  - laba        = harga * (1 - fee) - totalCost
 */
function calcPricing({ buy, extra, ship, feePct, marginPct, customPrice }) {
  const fee = feePct / 100;
  const margin = marginPct / 100;
  if (buy < 0 || extra < 0 || ship < 0) return { error: 'Biaya tidak boleh negatif.' };
  if (fee < 0 || margin < 0) return { error: 'Persentase tidak boleh negatif.' };
  if (fee + margin >= 1) return { error: 'Potongan marketplace + target margin harus di bawah 100%.' };
  const totalCost = buy + extra + ship;
  if (totalCost <= 0) return { error: 'Masukkan harga beli lebih dari 0.' };

  const breakEven = totalCost / (1 - fee);
  const recommended = totalCost / (1 - fee - margin);
  const price = customPrice > 0 ? customPrice : recommended;
  const profit = price * (1 - fee) - totalCost;
  const realMargin = price > 0 ? (profit / price) * 100 : 0;
  return {
    totalCost, breakEven, recommended, price, profit, realMargin,
    usingCustom: customPrice > 0
  };
}

function buildAd({ name, cond, spec, box, warranty, price }) {
  const lines = [
    `${name} - ${cond}`,
    '',
    `Harga: ${rupiah.format(Math.round(price / 1000) * 1000)}`,
    spec ? `Detail: ${spec}` : '',
    box ? `Kelengkapan: ${box}` : '',
    warranty ? `${warranty}` : '',
    '',
    'Cek kondisi unit dipersilakan. Chat untuk nego dan info lebih lanjut.'
  ];
  return lines.filter((l, i, a) => !(l === '' && (i === 0 || a[i - 1] === ''))).join('\n');
}

// ---------- Tampilan ----------
let lastResult = null;

function readInputs() {
  return {
    buy: num($('buy').value), extra: num($('extra').value), ship: num($('ship').value),
    feePct: num($('fee').value), marginPct: num($('margin').value), customPrice: num($('custom').value)
  };
}

function renderResults() {
  const r = calcPricing(readInputs());
  if (r.error) {
    $('calcError').textContent = r.error;
    $('results').innerHTML = '';
    lastResult = null;
    return;
  }
  $('calcError').textContent = '';
  lastResult = r;
  const cls = r.profit >= 0 ? 'pos' : 'neg';
  $('results').innerHTML = `
    <div class="res main"><span>${r.usingCustom ? 'Harga jual yang kamu pasang' : 'Harga jual rekomendasi'}</span><strong>${rupiah.format(r.price)}</strong></div>
    <div class="res"><span>Total biaya</span><strong>${rupiah.format(r.totalCost)}</strong></div>
    <div class="res"><span>Titik impas</span><strong>${rupiah.format(r.breakEven)}</strong></div>
    <div class="res"><span>Laba</span><strong class="${cls}">${rupiah.format(r.profit)}</strong></div>
    <div class="res"><span>Margin sebenarnya</span><strong class="${cls}">${r.realMargin.toFixed(1)}%</strong></div>`;
  renderAd();
}

function renderAd() {
  if (!lastResult) { $('adOut').value = ''; return; }
  $('adOut').value = buildAd({
    name: $('adName').value.trim() || 'Nama produk',
    cond: $('adCond').value,
    spec: $('adSpec').value.trim(),
    box: $('adBox').value.trim(),
    warranty: $('adWarranty').value.trim(),
    price: lastResult.price
  });
}

// ---------- Riwayat ----------
function loadHistory() {
  try { const d = JSON.parse(localStorage.getItem(HISTORY_KEY)); if (Array.isArray(d)) return d; } catch (e) { /* kosong */ }
  return [];
}
let history = loadHistory();
const saveHistory = () => { try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch (e) { /* abaikan */ } };

function renderHistory() {
  $('historyRows').innerHTML = history.length
    ? history.map((h) => `<tr>
        <td>${new Date(h.time).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</td>
        <td>${rupiah.format(h.totalCost)}</td>
        <td>${rupiah.format(h.price)}</td>
        <td class="${h.profit >= 0 ? 'pos' : 'neg'}">${rupiah.format(h.profit)}</td>
        <td>${h.realMargin.toFixed(1)}%</td>
      </tr>`).join('')
    : '<tr><td colspan="5" class="empty">Belum ada riwayat. Tekan "Simpan ke Riwayat" setelah menghitung.</td></tr>';
}

// ---------- Event ----------
['buy', 'extra', 'ship', 'fee', 'margin', 'custom'].forEach((id) => $(id).addEventListener('input', renderResults));
['adName', 'adCond', 'adSpec', 'adBox', 'adWarranty'].forEach((id) => $(id).addEventListener('input', renderAd));

$('saveBtn').addEventListener('click', () => {
  if (!lastResult) return;
  const { totalCost, price, profit, realMargin } = lastResult;
  history.unshift({ time: new Date().toISOString(), totalCost, price, profit, realMargin });
  history = history.slice(0, 20);
  saveHistory(); renderHistory();
});

$('clearBtn').addEventListener('click', () => { history = []; saveHistory(); renderHistory(); });

$('copyBtn').addEventListener('click', async () => {
  const text = $('adOut').value;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    $('adOut').select();
    document.execCommand('copy');
  }
  $('copyMsg').textContent = 'Tersalin!';
  setTimeout(() => { $('copyMsg').textContent = ''; }, 1800);
});

renderResults();
renderHistory();

if (typeof module !== 'undefined') module.exports = { calcPricing, buildAd };
