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

  const gpuRows = (summary.gpuSupply || []).map(row => `
    <tr>
      <td>${row.gpu || 'GPU'}</td>
      <td>${formatNumber(row.total)}</td>
      <td>${formatNumber(row.available)}</td>
      <td>${formatUsd(row.lowestUsdHr)}</td>
    </tr>
  `).join('');
  document.getElementById('gpuTable').innerHTML = gpuRows || '<tr><td colspan="4">No GPU rows yet</td></tr>';

  const providerRows = (summary.providers || []).map(row => `
    <tr>
      <td>${row.label || row.providerId || 'Provider'}</td>
      <td>${row.region || 'unknown'}</td>
      <td>${formatNumber(row.availableGpus)}</td>
      <td>${row.pilotEligible ? 'pilot candidate' : 'needs review'}</td>
    </tr>
  `).join('');
  document.getElementById('providerTable').innerHTML = providerRows || '<tr><td colspan="4">No providers yet</td></tr>';
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
