window.addEventListener('pageshow', () => {
  if (!window.location.hash) window.scrollTo(0, 0);
});

const client = window.jeazySupabase;
const search = document.querySelector('#trackingSearch');
const statusFilter = document.querySelector('#trackingStatus');
const tableBody = document.querySelector('#trackingRows');
const empty = document.querySelector('#trackingEmpty');
const lastRefresh = document.querySelector('#lastRefresh');
const refreshButton = document.querySelector('#refreshTracking');
const metricTotal = document.querySelector('#metricTotal');
const metricProgress = document.querySelector('#metricProgress');
const metricComplete = document.querySelector('#metricComplete');
const metricSubmitted = document.querySelector('#metricSubmitted');
const metricActive = document.querySelector('#metricActive');

let records = [];

const safeDate = (value) => value
  ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : 'Sin actividad';

function getProgress(record) {
  const dataComplete = Boolean(
    record.full_name && record.phone && record.birth_date && record.city && record.state
  );
  const identityComplete = Number(record.identity_files) >= 2;
  const legalComplete = Number(record.legal_acceptances) >= 1;
  const complete = dataComplete && record.profile_photo_uploaded && identityComplete && legalComplete;
  const submitted = ['submitted', 'under_review', 'approved'].includes(record.application_status);
  const active = record.membership_status === 'active';

  if (active) return { key: 'active', label: 'Membresía activa', tone: 'success', complete, submitted };
  if (submitted) return { key: 'submitted', label: 'Solicitud enviada', tone: 'success', complete, submitted };
  if (complete) return { key: 'complete', label: 'Expediente completo', tone: 'success', complete, submitted };
  if (record.full_name || record.phone || record.identity_files || record.profile_photo_uploaded) {
    return { key: 'progress', label: 'Registro en proceso', tone: 'warning', complete, submitted };
  }
  return { key: 'account', label: 'Solo creó cuenta', tone: 'neutral', complete, submitted };
}

function makeCell(value, className = '') {
  const cell = document.createElement('td');
  cell.textContent = value;
  if (className) cell.className = className;
  return cell;
}

function renderRows() {
  const query = search.value.trim().toLowerCase();
  const filter = statusFilter.value;
  const filtered = records.filter((record) => {
    const progress = getProgress(record);
    const haystack = [record.email, record.full_name, record.phone, record.application_code]
      .filter(Boolean).join(' ').toLowerCase();
    return (!query || haystack.includes(query)) && (filter === 'all' || progress.key === filter);
  });

  tableBody.replaceChildren();
  filtered.forEach((record) => {
    const progress = getProgress(record);
    const row = document.createElement('tr');
    const personCell = document.createElement('td');
    const name = document.createElement('strong');
    name.textContent = record.full_name || 'Nombre pendiente';
    const email = document.createElement('small');
    email.textContent = record.email || 'Correo no disponible';
    personCell.append(name, email);

    const statusCell = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `status ${progress.key}`;
    badge.textContent = progress.label;
    statusCell.append(badge);

    const dataComplete = Boolean(
      record.full_name && record.phone && record.birth_date && record.city && record.state
    );
    const identityFiles = Number(record.identity_files) || 0;
    const legalAccepted = Number(record.legal_acceptances) >= 1;

    row.append(
      personCell,
      statusCell,
      makeCell(dataComplete ? 'Completos' : 'Incompletos', dataComplete ? 'check yes' : 'check no'),
      makeCell(record.profile_photo_uploaded ? 'Cargada' : 'Pendiente', record.profile_photo_uploaded ? 'check yes' : 'check no'),
      makeCell(`${identityFiles}/2`, identityFiles >= 2 ? 'check yes' : identityFiles > 0 ? 'check partial' : 'check no'),
      makeCell(legalAccepted ? 'Aceptadas' : 'Pendientes', legalAccepted ? 'check yes' : 'check no'),
      makeCell(record.application_code || 'Sin código'),
      makeCell(safeDate(record.last_activity || record.created_at))
    );
    tableBody.append(row);
  });
  empty.hidden = filtered.length > 0;
}

function updateMetrics() {
  const progress = records.map(getProgress);
  metricTotal.textContent = records.length;
  metricProgress.textContent = progress.filter((item) => ['account', 'progress'].includes(item.key)).length;
  metricComplete.textContent = progress.filter((item) => item.complete).length;
  metricSubmitted.textContent = progress.filter((item) => item.submitted || item.key === 'active').length;
  metricActive.textContent = progress.filter((item) => item.key === 'active').length;
}

function showError(message) {
  tableBody.replaceChildren();
  empty.hidden = false;
  empty.textContent = message;
  empty.classList.add('tracking-error');
}

async function loadTracking() {
  refreshButton.disabled = true;
  lastRefresh.textContent = 'Actualizando…';

  const { data: sessionData } = await client.auth.getSession();
  if (!sessionData.session) {
    window.location.replace('../');
    return;
  }

  const { data, error } = await client.rpc('admin_registration_tracking');
  if (error) {
    showError(error.message.includes('admin_registration_tracking')
      ? 'Falta activar la consulta de seguimiento en Supabase.'
      : 'No fue posible consultar los registros.');
    lastRefresh.textContent = 'No actualizado';
    refreshButton.disabled = false;
    return;
  }

  records = data || [];
  empty.classList.remove('tracking-error');
  empty.textContent = 'No hay registros que coincidan con esta búsqueda.';
  updateMetrics();
  renderRows();
  lastRefresh.textContent = `Actualizado: ${new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`;
  refreshButton.disabled = false;
}

search.addEventListener('input', renderRows);
statusFilter.addEventListener('change', renderRows);
refreshButton.addEventListener('click', loadTracking);
setInterval(loadTracking, 30000);
loadTracking();
