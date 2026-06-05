const API_BASE = window.localStorage.getItem('FISH_API_BASE') || 'http://127.0.0.1:8787';

async function fetchJson(url, options = undefined) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function formatNumber(value, fallback = '—') {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return fallback;
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(Number(value));
}

function formatUsd(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return `$${Number(value).toFixed(2)}`;
}

function setDataState(state) {
  const el = document.getElementById('dataState');
  el.className = `status-badge ${state || 'sample'}`;
  el.textContent = state === 'live' ? 'Live data' : state === 'unavailable' ? 'Unavailable' : 'Sample data';
}

function appendTableRow(tbody, cells) {
  const tr = document.createElement('tr');
  cells.forEach((cell) => {
    const td = document.createElement('td');
    if (cell && typeof cell === 'object') {
      Object.entries(cell.attributes || {}).forEach(([name, value]) => {
        td.setAttribute(name, value);
      });
      td.textContent = cell.text;
    } else {
      td.textContent = cell;
    }
    tr.appendChild(td);
  });
  tbody.appendChild(tr);
}

function renderSummary(summary) {
  const kpis = summary.kpis || {};
  setDataState(summary.dataState || 'sample');
  document.getElementById('lastUpdated').textContent = summary.lastUpdated ? `Last updated ${summary.lastUpdated}` : 'No timestamp';
  document.getElementById('metricTotalGpus').textContent = formatNumber(kpis.totalGpus);
  document.getElementById('metricAvailableGpus').textContent = formatNumber(kpis.availableGpus);
  document.getElementById('metricProviders').textContent = formatNumber(kpis.providerCount);
  document.getElementById('metricH200').textContent = kpis.h200FromUsdHr ? `${formatUsd(kpis.h200FromUsdHr)}/hr` : '—';
  document.getElementById('metricJobs').textContent = formatNumber(kpis.oceanNativeJobs, '0');
  document.getElementById('metricPayouts').textContent = formatUsd(kpis.providerPayoutUsd || 0);

  const gpuTable = document.getElementById('gpuTable');
  gpuTable.replaceChildren();
  (summary.gpuSupply || []).forEach((row) => {
    appendTableRow(gpuTable, [
      row.gpu || 'GPU',
      formatNumber(row.total),
      formatNumber(row.available),
      formatUsd(row.lowestUsdHr),
    ]);
  });
  if (!gpuTable.children.length) {
    appendTableRow(gpuTable, [{ text: 'No GPU rows yet', attributes: { colspan: '4' } }]);
  }

  const providerTable = document.getElementById('providerTable');
  providerTable.replaceChildren();
  (summary.providers || []).forEach((row) => {
    appendTableRow(providerTable, [
      row.label || row.providerId || 'Provider',
      row.region || 'unknown',
      formatNumber(row.availableGpus),
      row.pilotEligible ? 'pilot candidate' : 'needs review',
    ]);
  });
  if (!providerTable.children.length) {
    appendTableRow(providerTable, [{ text: 'No providers yet', attributes: { colspan: '4' } }]);
  }
}

async function loadDashboard() {
  try {
    const summary = await fetchJson(`${API_BASE}/api/ocean/summary`);
    renderSummary(summary);
  } catch (err) {
    console.warn('Backend unavailable, loading local sample data', err);
    try {
      const sample = await fetchJson('data/sample_supply.json');
      renderSummary(sample);
    } catch (sampleErr) {
      console.error(sampleErr);
      setDataState('unavailable');
    }
  }
}

async function submitPilotForm(event) {
  event.preventDefault();
  const status = document.getElementById('formStatus');
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());
  status.textContent = 'Sending...';
  try {
    await fetchJson(`${API_BASE}/api/waitlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  } catch (_err) {
    // fetchJson only supports GET in this prototype. Fall back to direct fetch.
    try {
      const res = await fetch(`${API_BASE}/api/waitlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      status.textContent = 'Backend not running. Your message is not saved yet.';
      return;
    }
  }
  form.reset();
  status.textContent = 'Received. We will follow up.';
}

document.getElementById('refreshButton')?.addEventListener('click', loadDashboard);
document.getElementById('pilotForm')?.addEventListener('submit', submitPilotForm);
loadDashboard();
