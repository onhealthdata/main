/* Toronto 2001 Census Dissemination Areas — interactive Leaflet map */

const TORONTO_BOUNDS = [
  [43.581, -79.639],
  [43.856, -79.116]
];

const map = L.map('map', {
  zoomControl: false,
  minZoom: 9,
  maxBounds: L.latLngBounds(TORONTO_BOUNDS).pad(0.15)
}).fitBounds(TORONTO_BOUNDS);

L.control.zoom({ position: 'bottomright' }).addTo(map);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 18
}).addTo(map);

// Colour ramp: cream -> amber -> teal -> ink (light values = low, dark = high)
const RAMP = ['#f2e9d8', '#e7c98a', '#d98e3c', '#b6702a', '#6b7f6b', '#3e6b6b', '#1b2430'];

const METRICS = {
  density: {
    label: 'People per hectare',
    unit: '/ ha',
    getValue: (p) => {
      const area = parseFloat(p.a);
      const pop = parseFloat(p.pop);
      if (!area || area <= 0) return null;
      return pop / area;
    },
    format: (v) => v.toFixed(1)
  },
  pop: {
    label: 'Population',
    unit: 'people',
    getValue: (p) => parseFloat(p.pop),
    format: (v) => Math.round(v).toLocaleString()
  },
  dw: {
    label: 'Dwellings',
    unit: 'dwellings',
    getValue: (p) => parseFloat(p.dw),
    format: (v) => Math.round(v).toLocaleString()
  }
};

let currentMetric = 'density';
let geoLayer = null;
let breaksByMetric = {};
let daIndex = {}; // id -> layer

function computeQuantileBreaks(values, classes) {
  const sorted = values.filter(v => v !== null && !isNaN(v) && v >= 0).sort((a, b) => a - b);
  const breaks = [];
  for (let i = 1; i < classes; i++) {
    const idx = Math.floor((i / classes) * sorted.length);
    breaks.push(sorted[Math.min(idx, sorted.length - 1)]);
  }
  breaks.push(sorted[sorted.length - 1]);
  return breaks;
}

function colorForValue(value, breaks) {
  if (value === null || isNaN(value)) return '#cfc8b8';
  for (let i = 0; i < breaks.length; i++) {
    if (value <= breaks[i]) return RAMP[i];
  }
  return RAMP[RAMP.length - 1];
}

function styleFeature(feature) {
  const metric = METRICS[currentMetric];
  const value = metric.getValue(feature.properties);
  return {
    fillColor: colorForValue(value, breaksByMetric[currentMetric]),
    fillOpacity: 0.78,
    color: '#1b2430',
    weight: 0.6,
    opacity: 0.35
  };
}

function highlightStyle() {
  return { weight: 2.2, color: '#d98e3c', opacity: 1, fillOpacity: 0.88 };
}

const hoverCard = document.getElementById('hover-card');

function showHoverCard(feature, evt) {
  const p = feature.properties;
  const density = METRICS.density.getValue(p);
  hoverCard.innerHTML = `
    <div class="hc-title">DA ${p.id}</div>
    <div class="hc-row"><span class="hc-key">Population</span><span>${Math.round(parseFloat(p.pop)).toLocaleString()}</span></div>
    <div class="hc-row"><span class="hc-key">Dwellings</span><span>${Math.round(parseFloat(p.dw)).toLocaleString()}</span></div>
    <div class="hc-row"><span class="hc-key">Households</span><span>${Math.round(parseFloat(p.hh)).toLocaleString()}</span></div>
    <div class="hc-row"><span class="hc-key">Area</span><span>${parseFloat(p.a).toFixed(1)} ha</span></div>
    <div class="hc-row"><span class="hc-key">Density</span><span>${density !== null ? density.toFixed(1) + ' /ha' : '—'}</span></div>
  `;
  hoverCard.style.display = 'block';
  positionHoverCard(evt);
}

function positionHoverCard(evt) {
  const offset = 16;
  let x = evt.originalEvent.clientX + offset;
  let y = evt.originalEvent.clientY + offset;
  const cardRect = hoverCard.getBoundingClientRect();
  if (x + cardRect.width > window.innerWidth - 10) x = evt.originalEvent.clientX - cardRect.width - offset;
  if (y + cardRect.height > window.innerHeight - 10) y = evt.originalEvent.clientY - cardRect.height - offset;
  hoverCard.style.left = x + 'px';
  hoverCard.style.top = y + 'px';
}

function hideHoverCard() {
  hoverCard.style.display = 'none';
}

function popupHTML(p) {
  const density = METRICS.density.getValue(p);
  return `
    <div class="popup-title">Dissemination Area ${p.id}</div>
    <div class="popup-row"><span class="popup-key">Population</span><span class="popup-val">${Math.round(parseFloat(p.pop)).toLocaleString()}</span></div>
    <div class="popup-row"><span class="popup-key">Dwellings</span><span class="popup-val">${Math.round(parseFloat(p.dw)).toLocaleString()}</span></div>
    <div class="popup-row"><span class="popup-key">Households</span><span class="popup-val">${Math.round(parseFloat(p.hh)).toLocaleString()}</span></div>
    <div class="popup-row"><span class="popup-key">Area</span><span class="popup-val">${parseFloat(p.a).toFixed(2)} ha</span></div>
    <div class="popup-row"><span class="popup-key">Density</span><span class="popup-val">${density !== null ? density.toFixed(1) + ' / ha' : '—'}</span></div>
  `;
}

function onEachFeature(feature, layer) {
  const p = feature.properties;
  if (p.id) daIndex[String(p.id)] = layer;

  layer.on({
    mouseover: (e) => {
      e.target.setStyle(highlightStyle());
      e.target.bringToFront();
      showHoverCard(feature, e);
    },
    mousemove: (e) => positionHoverCard(e),
    mouseout: (e) => {
      geoLayer.resetStyle(e.target);
      hideHoverCard();
    },
    click: (e) => {
      e.target.bindPopup(popupHTML(p)).openPopup();
    }
  });
}

function renderLegend() {
  const breaks = breaksByMetric[currentMetric];
  const metric = METRICS[currentMetric];
  const legend = document.getElementById('legend');
  legend.innerHTML = '';
  let lower = 0;
  breaks.forEach((b, i) => {
    const row = document.createElement('div');
    row.className = 'legend-row';
    const swatch = document.createElement('div');
    swatch.className = 'legend-swatch';
    swatch.style.background = RAMP[i];
    const range = document.createElement('span');
    range.className = 'legend-range';
    range.textContent = `${metric.format(lower)} \u2013 ${metric.format(b)}`;
    row.appendChild(swatch);
    row.appendChild(range);
    legend.appendChild(row);
    lower = b;
  });
  document.getElementById('legend-label').textContent = metric.label;
}

function updateStats(features) {
  let totalPop = 0, totalDw = 0;
  features.forEach(f => {
    totalPop += parseFloat(f.properties.pop) || 0;
    totalDw += parseFloat(f.properties.dw) || 0;
  });
  document.getElementById('stat-total-pop').textContent = Math.round(totalPop).toLocaleString();
  document.getElementById('stat-total-dw').textContent = Math.round(totalDw).toLocaleString();
  document.getElementById('stat-count').textContent = features.length.toLocaleString();
}

function setMetric(metric) {
  currentMetric = metric;
  document.querySelectorAll('.metric-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.metric === metric);
  });
  geoLayer.setStyle(styleFeature);
  renderLegend();
}

document.querySelectorAll('.metric-btn').forEach(btn => {
  btn.addEventListener('click', () => setMetric(btn.dataset.metric));
});

// Mobile panel toggle
document.getElementById('panel-toggle').addEventListener('click', () => {
  document.getElementById('panel').classList.toggle('open');
});

// Search
const searchBox = document.getElementById('search-box');
const searchStatus = document.getElementById('search-status');
let activeSearchLayer = null;

searchBox.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const query = searchBox.value.trim();
  searchStatus.className = '';
  if (!query) return;

  const layer = daIndex[query];
  if (layer) {
    if (activeSearchLayer) geoLayer.resetStyle(activeSearchLayer);
    map.fitBounds(layer.getBounds(), { maxZoom: 16, padding: [80, 80] });
    layer.setStyle(highlightStyle());
    layer.bringToFront();
    layer.bindPopup(popupHTML(layer.feature.properties)).openPopup();
    activeSearchLayer = layer;
    searchStatus.textContent = 'Found.';
    searchStatus.className = 'ok';
  } else {
    searchStatus.textContent = 'No DA with that identifier.';
    searchStatus.className = 'error';
  }
});

// Load data
fetch('da_boundaries_2001.geojson')
  .then(res => res.json())
  .then(data => {
    Object.keys(METRICS).forEach(key => {
      const values = data.features.map(f => METRICS[key].getValue(f.properties));
      breaksByMetric[key] = computeQuantileBreaks(values, RAMP.length);
    });

    geoLayer = L.geoJSON(data, {
      style: styleFeature,
      onEachFeature
    }).addTo(map);

    renderLegend();
    updateStats(data.features);
  })
  .catch(err => {
    console.error('Failed to load DA boundaries:', err);
    document.getElementById('stat-count').textContent = 'error';
  });
