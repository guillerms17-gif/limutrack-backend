#!/usr/bin/env node
// ═══════════════════════════════════════════════════════
//  LIMUTRACK — Simulador de collar GPS
//  Simula exactamente lo que hace el TTGO T-SIM7000G real
//  Útil para probar el pipeline completo sin hardware
//
//  Uso: node simulador_collar.js [vaca_id] [collar_id]
//  Ej:  node simulador_collar.js 1 collar_001
// ═══════════════════════════════════════════════════════

const SERVIDOR = 'https://limutrack-production.up.railway.app';
const INTERVALO = 30000; // 30 segundos como el collar real

const vaca_id  = process.argv[2] || 1;
const collar_id = process.argv[3] || `sim_collar_${vaca_id}`;

// Posición inicial — centro de la finca El Roble, Salamanca
let lat = 40.9223 + (Math.random() - 0.5) * 0.002;
let lng = -5.8891 + (Math.random() - 0.5) * 0.003;
let dlat = (Math.random() - 0.5) * 1e-4;
let dlng = (Math.random() - 0.5) * 1e-4;
let temp = 38.6;
let actividad = 50;
let bateria = 100;

// Geocerca
const FENCE = { n:40.9246, s:40.9200, e:-5.8852, w:-5.8930 };

function simularPaso() {
  // Movimiento aleatorio con inercia
  dlat += (Math.random() - 0.5) * 3e-5;
  dlng += (Math.random() - 0.5) * 3e-5;
  const spd = Math.sqrt(dlat**2 + dlng**2);
  const MAX = 1.5e-4;
  if (spd > MAX) { dlat = dlat/spd*MAX; dlng = dlng/spd*MAX; }

  lat += dlat; lng += dlng;
  if (lat > FENCE.n || lat < FENCE.s) { dlat *= -1; lat = Math.max(FENCE.s, Math.min(FENCE.n, lat)); }
  if (lng > FENCE.e || lng < FENCE.w) { dlng *= -1; lng = Math.max(FENCE.w, Math.min(FENCE.e, lng)); }

  temp = parseFloat(Math.max(38.0, Math.min(40.2, temp + (Math.random()-0.5)*0.06)).toFixed(1));
  actividad = Math.round(Math.max(0, Math.min(100, actividad + (Math.random()-0.5)*10)));
  bateria = Math.max(0, bateria - 0.01); // Descarga muy lenta
}

async function enviar() {
  simularPaso();
  const payload = { collar_id, vaca_id: parseInt(vaca_id), lat, lng, temp, actividad, bateria: Math.round(bateria) };

  try {
    const res = await fetch(`${SERVIDOR}/api/v1/telemetry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    const hora = new Date().toLocaleTimeString('es-ES');
    console.log(`[${hora}] 📡 Vaca ${vaca_id} → ${lat.toFixed(6)}, ${lng.toFixed(6)} | ${temp}°C | Act:${actividad}% | Bat:${Math.round(bateria)}%`);
    if (data.alertas?.length) console.log(`          ⚠️  Alertas IA: ${data.alertas.map(a=>a.mensaje).join(' | ')}`);
  } catch (err) {
    console.error(`[${new Date().toLocaleTimeString('es-ES')}] ❌ Error: ${err.message}`);
  }
}

console.log(`🐄 Simulador de collar LimuTrack`);
console.log(`   Vaca ID:    ${vaca_id}`);
console.log(`   Collar ID:  ${collar_id}`);
console.log(`   Servidor:   ${SERVIDOR}`);
console.log(`   Intervalo:  ${INTERVALO/1000}s`);
console.log(`   Posición inicial: ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
console.log(`─────────────────────────────────────────`);

// Primer envío inmediato
enviar();
setInterval(enviar, INTERVALO);
