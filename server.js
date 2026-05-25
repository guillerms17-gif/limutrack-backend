process.on('uncaughtException', err => { console.error('CRASH:', err.message, err.stack); process.exit(1); });
process.on('unhandledRejection', err => { console.error('REJECT:', err); process.exit(1); });
console.log('STARTING LimuTrack v2.0...');

// ═══════════════════════════════════════════════════════
//  LIMUTRACK BACKEND v2.0
//  1. GPS simulado en tiempo real (cada 30s)
//  2. Historial de ruta por vaca (últimas 200 posiciones)
//  3. Script simulador de collar integrado
//  4. MQTT-ready (estructura preparada)
//  5. Registro y asociación de collares
//  6. Alertas gestionables (crear, resolver, listar)
// ═══════════════════════════════════════════════════════

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const jwt        = require('jsonwebtoken');
const bcrypt     = require('bcryptjs');
const fs         = require('fs');
const path       = require('path');

const PORT       = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'limutrack_secret_2024';
const DB_FILE    = process.env.DB_PATH || path.join('/data', 'limutrack_db.json');

// Geocerca de la finca
const FENCE = { n:40.9246, s:40.9200, e:-5.8852, w:-5.8930 };

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ══════════════════════════════════════════════════════
//  BASE DE DATOS JSON
// ══════════════════════════════════════════════════════
function leerDB() {
  if (!fs.existsSync(DB_FILE)) return null;
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch { return null; }
}
function guardarDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// Inicializar BD si no existe
if (!fs.existsSync(DB_FILE)) {
  console.log('📋 Creando base de datos inicial...');
  const hash = '$2a$10$kNvvQO8GqVuZDxkpTKbj9OUjORxQZpLeG.hV1HJb48jE6akOXFOKC'; // pre-computado
  guardarDB({
    usuarios: [{ id:1, nombre:'Admin', email:'admin@limutrack.es', password:hash, finca_id:'finca_el_roble', rol:'admin' }],
    vacas: [
      { id:1,  nombre:'Belinda',   crotal:'ES040120001', edad:4, peso_est:720, lat:40.9232, lng:-5.8910, temp:38.8, actividad:72, salud:'buena',    gestante:false, dias_parto:null, en_celo:false, bateria_collar:87, partos:3, separada:false, alerta_ia:null, comp_actual:'Pastando', notas:'', activa:true },
      { id:2,  nombre:'Carmela',   crotal:'ES040120002', edad:6, peso_est:780, lat:40.9218, lng:-5.8882, temp:38.6, actividad:24, salud:'excelente',gestante:true,  dias_parto:45,   en_celo:false, bateria_collar:92, partos:5, separada:false, alerta_ia:null, comp_actual:'Rumiando',    notas:'', activa:true },
      { id:3,  nombre:'Dolores',   crotal:'ES040120003', edad:3, peso_est:650, lat:40.9240, lng:-5.8866, temp:39.1, actividad:88, salud:'atencion', gestante:false, dias_parto:null, en_celo:true,  bateria_collar:64, partos:1, separada:true,  alerta_ia:'Celo detectado · GPS +340% movimiento', comp_actual:'Caminando',   notas:'', activa:true },
      { id:4,  nombre:'Esperanza', crotal:'ES040120004', edad:8, peso_est:840, lat:40.9208, lng:-5.8920, temp:38.5, actividad:8,  salud:'excelente',gestante:false, dias_parto:null, en_celo:false, bateria_collar:78, partos:7, separada:false, alerta_ia:null, comp_actual:'Descansando', notas:'', activa:true },
      { id:5,  nombre:'Florinda',  crotal:'ES040120005', edad:5, peso_est:760, lat:40.9238, lng:-5.8858, temp:39.8, actividad:58, salud:'alerta',   gestante:false, dias_parto:null, en_celo:false, bateria_collar:44, partos:3, separada:true,  alerta_ia:'Temp 39.8°C + separación → Posible infección', comp_actual:'Pastando', notas:'', activa:true },
      { id:6,  nombre:'Graciela',  crotal:'ES040120006', edad:7, peso_est:810, lat:40.9214, lng:-5.8908, temp:38.9, actividad:16, salud:'atencion', gestante:true,  dias_parto:3,    en_celo:false, bateria_collar:89, partos:6, separada:false, alerta_ia:'Parto en ~3 días · Actividad disminuida', comp_actual:'Pastando', notas:'', activa:true },
      { id:7,  nombre:'Hortensia', crotal:'ES040120007', edad:2, peso_est:620, lat:40.9228, lng:-5.8876, temp:38.7, actividad:26, salud:'buena',    gestante:false, dias_parto:null, en_celo:false, bateria_collar:95, partos:0, separada:false, alerta_ia:null, comp_actual:'Rumiando',    notas:'', activa:true },
      { id:8,  nombre:'Inés',      crotal:'ES040120008', edad:9, peso_est:850, lat:40.9205, lng:-5.8868, temp:38.4, actividad:7,  salud:'excelente',gestante:false, dias_parto:null, en_celo:false, bateria_collar:71, partos:8, separada:false, alerta_ia:null, comp_actual:'Descansando', notas:'', activa:true },
      { id:9,  nombre:'Juana',     crotal:'ES040120009', edad:4, peso_est:700, lat:40.9236, lng:-5.8898, temp:38.8, actividad:80, salud:'buena',    gestante:false, dias_parto:null, en_celo:false, bateria_collar:83, partos:3, separada:false, alerta_ia:null, comp_actual:'Caminando',   notas:'', activa:true },
      { id:10, nombre:'Lucía',     crotal:'ES040120010', edad:6, peso_est:775, lat:40.9220, lng:-5.8888, temp:38.6, actividad:53, salud:'excelente',gestante:true,  dias_parto:90,   en_celo:false, bateria_collar:91, partos:4, separada:false, alerta_ia:null, comp_actual:'Pastando',    notas:'', activa:true },
    ],
    telemetria: [],
    alertas:    [],
    collarens:  [],
    _nextId:    11,
    _nextAlerta: 1,
  });
  console.log('✅ BD creada con 10 vacas Limusinas');
}

// ══════════════════════════════════════════════════════
//  SIMULADOR GPS — mueve las vacas cada 30 segundos
// ══════════════════════════════════════════════════════

// Velocidad de movimiento por comportamiento (grados/tick)
const VELOCIDAD = {
  Pastando:    { max: 8e-5,  cambio: 2e-5 },
  Caminando:   { max: 2e-4,  cambio: 5e-5 },
  Descansando: { max: 1e-5,  cambio: 5e-6 },
  Rumiando:    { max: 2e-5,  cambio: 8e-6 },
};

// Estado de velocidad en memoria (no se persiste)
const velState = {};

function inicializarVelocidades() {
  const db = leerDB();
  if (!db) return;
  db.vacas.filter(v => v.activa).forEach(v => {
    velState[v.id] = {
      dlat: (Math.random() - 0.5) * 1e-4,
      dlng: (Math.random() - 0.5) * 1e-4,
    };
  });
}
inicializarVelocidades();

function inferirComportamiento(actividad) {
  if (actividad > 70) return 'Caminando';
  if (actividad > 40) return 'Pastando';
  if (actividad > 15) return 'Rumiando';
  return 'Descansando';
}

function inferirSalud(v, temp) {
  if (temp > 39.5) return 'alerta';
  if (temp > 39.2 || v.separada) return 'atencion';
  if (v.en_celo) return 'atencion';
  return v.salud === 'alerta' && temp <= 39.2 ? 'atencion' : v.salud;
}

function haversineKm(lat1,lng1,lat2,lng2){
  const R=6371,dLat=(lat2-lat1)*Math.PI/180,dLng=(lng2-lng1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function hoyStr(){
  const s=new Date().toLocaleString('sv-SE',{timeZone:'Europe/Madrid'});
  return s.slice(0,10);
}

function tickSimulacion() {
  const db = leerDB();
  if (!db) return;

  const ts = new Date().toISOString();
  let cambiado = false;

  db.vacas.filter(v => v.activa).forEach(v => {
    // Inicializar velocidad si es vaca nueva
    if (!velState[v.id]) {
      velState[v.id] = { dlat: (Math.random()-0.5)*1e-4, dlng: (Math.random()-0.5)*1e-4 };
    }

    const cfg = VELOCIDAD[v.comp_actual] || VELOCIDAD.Pastando;

    // Variar velocidad aleatoriamente
    velState[v.id].dlat += (Math.random() - 0.5) * cfg.cambio;
    velState[v.id].dlng += (Math.random() - 0.5) * cfg.cambio;

    // Limitar velocidad máxima
    const spd = Math.sqrt(velState[v.id].dlat**2 + velState[v.id].dlng**2);
    if (spd > cfg.max) {
      velState[v.id].dlat = velState[v.id].dlat / spd * cfg.max;
      velState[v.id].dlng = velState[v.id].dlng / spd * cfg.max;
    }

    // Nueva posición
    let lat = v.lat + velState[v.id].dlat;
    let lng = v.lng + velState[v.id].dlng;

    // Rebotar en los límites de la geocerca
    if (lat > FENCE.n || lat < FENCE.s) { velState[v.id].dlat *= -1; lat = Math.max(FENCE.s, Math.min(FENCE.n, lat)); }
    if (lng > FENCE.e || lng < FENCE.w) { velState[v.id].dlng *= -1; lng = Math.max(FENCE.w, Math.min(FENCE.e, lng)); }

    // Simular temperatura (variación lenta ±0.05°C por tick)
    const temp = parseFloat(Math.max(38.0, Math.min(40.2, v.temp + (Math.random()-0.5)*0.06)).toFixed(1)); // ±0.03°C por tick → cambios visibles en horas

    // Actividad — suavizado 0.93 → transiciones en ~15min (realista Limusina)
    // 0.93 = 97% del camino en ~16 ticks (8min). Noise ±3 = variación visible pero suave
    const actBase = { Caminando:72, Pastando:48, Rumiando:22, Descansando:7 }[v.comp_actual] || 48;
    const noise = (Math.random()-0.5)*6; // ±3 por tick — visible pero no brusco
    const actividad = Math.round(Math.max(0, Math.min(100, v.actividad * 0.93 + actBase * 0.07 + noise)));

    // Cambio ocasional de comportamiento (~5% por tick)
    let comp_actual = v.comp_actual;
    if (Math.random() < 0.015) { // ~1.5% por tick = cambia comportamiento cada ~25 min de media
      const comps = ['Pastando','Pastando','Pastando','Rumiando','Rumiando','Caminando','Descansando'];
      comp_actual = comps[Math.floor(Math.random() * comps.length)];
    }

    // Salud inferida por IA
    const salud = inferirSalud({ ...v, separada: v.separada }, temp);

    // Guardar en historial de telemetría
    db.telemetria.push({ vaca_id: v.id, collar_id: `sim_${v.id}`, lat, lng, temp, actividad, bateria: v.bateria_collar, ts });

    // Acumular movimiento diario en BD
    const hoy=hoyStr();
    if(!db.movimiento)db.movimiento={};
    if(!db.movimiento[hoy])db.movimiento[hoy]={};
    if(!db.movimiento[hoy][v.id])db.movimiento[hoy][v.id]={km:0,ultima:null};
    const mov=db.movimiento[hoy][v.id];
    if(mov.ultima){const d=haversineKm(mov.ultima.lat,mov.ultima.lng,lat,lng);if(d<0.5)mov.km=parseFloat((mov.km+d).toFixed(4));}
    mov.ultima={lat,lng};

    // Actualizar vaca
    const idx = db.vacas.findIndex(x => x.id === v.id);
    db.vacas[idx] = { ...v, lat, lng, temp, actividad, comp_actual, salud };
    cambiado = true;

    // Emitir por WebSocket
    io.emit('gps:update', { vaca_id:v.id, nombre:v.nombre, lat, lng, temp, actividad, comp_actual, salud, ts });
  });

  // Mantener últimas 50000 telemetrías (~3.5 días con 10 vacas a 30s) para análisis
  if (db.telemetria.length > 50000) db.telemetria = db.telemetria.slice(-50000);

  if (cambiado) guardarDB(db);
}

// Arrancar simulación
setInterval(tickSimulacion, 30000);
console.log('🌍 Simulador GPS activo — tick cada 30s');

// ══════════════════════════════════════════════════════
//  MOTOR IA
// ══════════════════════════════════════════════════════
function inferirIA(vaca, { temp, actividad, bateria }) {
  const out = [];
  if (temp > 39.5)
    out.push({ tipo:'temperatura', mensaje:`Temperatura ${temp.toFixed(1)}°C por encima del rango (38.5–39.5°C)`, severidad:'alta' });
  if (actividad > 85 && vaca.actividad < 60)
    out.push({ tipo:'celo', mensaje:`Actividad muy alta → posible celo detectado`, severidad:'media' });
  if (vaca.gestante && actividad < 15 && vaca.actividad > 25)
    out.push({ tipo:'parto', mensaje:`Descenso brusco de actividad en gestante → vigilar parto`, severidad:'alta' });
  if (bateria < 20)
    out.push({ tipo:'bateria', mensaje:`Batería collar al ${bateria}% — recargar urgente`, severidad:'baja' });
  return out;
}

// ── Auth ──────────────────────────────────────────────
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token requerido' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Token inválido' }); }
}

// ══════════════════════════════════════════════════════
//  RUTAS
// ══════════════════════════════════════════════════════

app.get('/health', (_, res) => res.json({ ok:true, version:'2.0', sim:'active', ts:new Date().toISOString() }));

// ── Auth ──────────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const db = leerDB();
  const user = db.usuarios.find(u => u.email === email);
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  const token = jwt.sign({ id:user.id, email:user.email, finca_id:user.finca_id, rol:user.rol }, JWT_SECRET, { expiresIn:'7d' });
  res.json({ token, usuario:{ id:user.id, nombre:user.nombre, email:user.email } });
});

// ── Vacas ─────────────────────────────────────────────
app.get('/api/v1/cattle', auth, (req, res) => {
  const db = leerDB();
  const vacas = db.vacas.filter(v => v.activa).map(v => {
    // Incluir últimos 30 puntos del track directamente — cero peticiones extra en el frontend
    const track = db.telemetria
      .filter(t => String(t.vaca_id) === String(v.id))
      .slice(-30)
      .map(t => ({ lat:t.lat, lng:t.lng, ts:t.ts }));
    return { ...v, track };
  });
  res.json({ ok:true, data:vacas, total:vacas.length });
});

app.get('/api/v1/cattle/:id', auth, (req, res) => {
  const db = leerDB();
  const v  = db.vacas.find(v => v.id === parseInt(req.params.id) && v.activa);
  if (!v) return res.status(404).json({ error: 'No encontrada' });
  res.json({ ok:true, data:v });
});

app.post('/api/v1/cattle', auth, (req, res) => {
  const db = leerDB();
  const { nombre, crotal, edad, peso_est, gestante, dias_parto, en_celo, partos, notas, foto_url } = req.body;
  if (!nombre || !crotal) return res.status(400).json({ error: 'nombre y crotal obligatorios' });
  if (db.vacas.find(v => v.crotal === crotal && v.activa))
    return res.status(400).json({ error: 'Crotal ya existe' });
  const nueva = {
    id: db._nextId++, nombre, crotal,
    edad: edad||0, peso_est: peso_est||700,
    lat: 40.9223 + (Math.random()-0.5)*0.002,
    lng: -5.8891 + (Math.random()-0.5)*0.003,
    temp: 38.6, actividad: 50, salud: 'buena',
    gestante: !!gestante, dias_parto: dias_parto||null,
    en_celo: !!en_celo, bateria_collar: 100,
    partos: partos||0, separada: false,
    alerta_ia: null, comp_actual: 'Pastando',
    foto_url: foto_url||null, notas: notas||'', activa: true,
  };
  db.vacas.push(nueva);
  guardarDB(db);
  io.emit('vaca:nueva', nueva);
  res.status(201).json({ ok:true, data:nueva });
});

app.put('/api/v1/cattle/:id', auth, (req, res) => {
  const db  = leerDB();
  const idx = db.vacas.findIndex(v => v.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'No encontrada' });
  db.vacas[idx] = { ...db.vacas[idx], ...req.body, id:db.vacas[idx].id };
  guardarDB(db);
  io.emit('vaca:actualizada', db.vacas[idx]);
  res.json({ ok:true, data:db.vacas[idx] });
});

app.delete('/api/v1/cattle/:id', auth, (req, res) => {
  const db  = leerDB();
  const idx = db.vacas.findIndex(v => v.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'No encontrada' });
  db.vacas[idx].activa = false;
  delete velState[db.vacas[idx].id];
  guardarDB(db);
  io.emit('vaca:eliminada', { id:req.params.id });
  res.json({ ok:true });
});

// ── Telemetría (collar real o simulador externo) ──────
app.post('/api/v1/telemetry', (req, res) => {
  const { collar_id, vaca_id, lat, lng, temp=38.6, actividad=50, bateria=100 } = req.body;
  if (!vaca_id || !lat || !lng) return res.status(400).json({ error: 'Faltan campos' });
  const db  = leerDB();
  const idx = db.vacas.findIndex(v => v.id === parseInt(vaca_id));
  if (idx === -1) return res.status(404).json({ error: 'Vaca no encontrada' });

  db.telemetria.push({ vaca_id, collar_id, lat, lng, temp, actividad, bateria, ts:new Date().toISOString() });
  const alertasIA = inferirIA(db.vacas[idx], { temp, actividad, bateria });
  alertasIA.forEach(a => {
    db.alertas.push({ id:db._nextAlerta++, vaca_id, nombre:db.vacas[idx].nombre, ...a, resuelta:false, ts:new Date().toISOString() });
  });
  db.vacas[idx] = { ...db.vacas[idx], lat, lng, temp, actividad, bateria_collar:bateria,
    alerta_ia: alertasIA[0]?.mensaje || db.vacas[idx].alerta_ia };
  if (db.telemetria.length > 50000) db.telemetria = db.telemetria.slice(-50000);
  guardarDB(db);
  io.emit('gps:update', { vaca_id, nombre:db.vacas[idx].nombre, lat, lng, temp, actividad, bateria, alertas:alertasIA, ts:new Date().toISOString() });
  res.json({ ok:true, alertas:alertasIA });
});

// ── Historial GPS de una vaca (Punto 2) ───────────────
app.get('/api/v1/telemetry/:vacaId', auth, (req, res) => {
  const db    = leerDB();
  const limit = parseInt(req.query.limit)||200;
  const rows  = db.telemetria
    .filter(t => String(t.vaca_id) === req.params.vacaId)
    .slice(-limit)
    .map(t=>({ lat:t.lat, lng:t.lng, temp:t.temp, actividad:t.actividad, ts:t.ts }));
  res.json({ ok:true, data:rows });
});

// ── Alertas gestionables (Punto 6) ────────────────────
app.get('/api/v1/alerts', auth, (req, res) => {
  const db = leerDB();
  const activas = db.alertas.filter(a => !a.resuelta);
  res.json({ ok:true, data:activas, total:activas.length });
});

app.put('/api/v1/alerts/:id/resolve', auth, (req, res) => {
  const db  = leerDB();
  const alerta = db.alertas.find(a => a.id === parseInt(req.params.id));
  if (!alerta) return res.status(404).json({ error: 'Alerta no encontrada' });
  alerta.resuelta    = true;
  alerta.resuelta_ts = new Date().toISOString();
  alerta.resuelta_by = req.user?.email || 'admin';
  guardarDB(db);
  io.emit('alerta:resuelta', { id:alerta.id });
  res.json({ ok:true });
});

app.delete('/api/v1/alerts/:id', auth, (req, res) => {
  const db  = leerDB();
  const idx = db.alertas.findIndex(a => a.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'No encontrada' });
  db.alertas.splice(idx, 1);
  guardarDB(db);
  res.json({ ok:true });
});

// ── Collares — registro y asociación (Punto 5) ────────
app.get('/api/v1/collarens', auth, (req, res) => {
  const db = leerDB();
  res.json({ ok:true, data:db.collarens });
});

app.post('/api/v1/collarens', auth, (req, res) => {
  const db = leerDB();
  const { id, vaca_id, modelo='TTGO-T-SIM7000G', notas='' } = req.body;
  if (!id || !vaca_id) return res.status(400).json({ error: 'id y vaca_id obligatorios' });
  if (db.collarens.find(c => c.id === id))
    return res.status(400).json({ error: 'Collar ya registrado' });
  const collar = { id, vaca_id:parseInt(vaca_id), modelo, bateria:100, activo:true,
    notas, registrado_ts:new Date().toISOString(), ultimo_ping:null };
  db.collarens.push(collar);
  // Asociar a la vaca
  const idx = db.vacas.findIndex(v => v.id === parseInt(vaca_id));
  if (idx !== -1) db.vacas[idx].collar_id = id;
  guardarDB(db);
  res.status(201).json({ ok:true, data:collar });
});

app.put('/api/v1/collarens/:id', auth, (req, res) => {
  const db  = leerDB();
  const idx = db.collarens.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'No encontrado' });
  db.collarens[idx] = { ...db.collarens[idx], ...req.body, id:db.collarens[idx].id };
  guardarDB(db);
  res.json({ ok:true, data:db.collarens[idx] });
});

app.delete('/api/v1/collarens/:id', auth, (req, res) => {
  const db  = leerDB();
  const idx = db.collarens.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'No encontrado' });
  // Desasociar de la vaca
  const vIdx = db.vacas.findIndex(v => v.collar_id === req.params.id);
  if (vIdx !== -1) delete db.vacas[vIdx].collar_id;
  db.collarens.splice(idx, 1);
  guardarDB(db);
  res.json({ ok:true });
});

// ── Telemetría bulk — últimos N puntos de todas las vacas ──
app.get('/api/v1/telemetry/bulk', auth, (req, res) => {
  const db    = leerDB();
  const limit = parseInt(req.query.limit)||30;
  const vacas = db.vacas.filter(v=>v.activa).map(v=>v.id);
  const result = {};
  vacas.forEach(vid=>{
    result[vid]=db.telemetria
      .filter(t=>String(t.vaca_id)===String(vid))
      .slice(-limit)
      .map(t=>({lat:t.lat,lng:t.lng,temp:t.temp,actividad:t.actividad,ts:t.ts}));
  });
  res.json({ok:true,data:result});
});

// ── Heatmap global — todas las vacas ─────────────────────
// Ponderación de permanencia: cuanto más lento se mueve la vaca, más peso
// (zonas donde PERMANECE pesan más que zonas donde solo PASA)
function pesoPermanencia(speedMporMin){
  if(speedMporMin<3)  return 4.0;   // parada / descanso / rumia
  if(speedMporMin<10) return 2.5;   // pastando despacio
  if(speedMporMin<30) return 1.2;   // caminando normal
  return 0.5;                        // tránsito rápido
}

app.get('/api/v1/heatmap/all', auth, (req, res) => {
  const db = leerDB();
  // Rango temporal: 'horas' (preset rápido) o desde/hasta (ISO)
  let desde, hasta=Date.now();
  if(req.query.desde){ desde=new Date(req.query.desde).getTime(); if(req.query.hasta)hasta=new Date(req.query.hasta).getTime(); }
  else { const horas=parseFloat(req.query.horas)||168; desde=Date.now()-horas*36e5; }
  // Filtro de franja horaria (hora del día 0-24), opcional
  const hmin = req.query.hmin!==undefined ? parseInt(req.query.hmin) : null;
  const hmax = req.query.hmax!==undefined ? parseInt(req.query.hmax) : null;
  const enFranja = (ts)=>{
    if(hmin===null||hmax===null) return true;
    const h = new Date(ts).getHours(); // hora local del servidor
    return hmin<=hmax ? (h>=hmin&&h<hmax) : (h>=hmin||h<hmax); // soporta franjas que cruzan medianoche
  };

  const result = {};
  db.vacas.filter(v=>v.activa).forEach(v=>{
    const pts = db.telemetria
      .filter(t=>String(t.vaca_id)===String(v.id)&&t.lat&&t.lng)
      .filter(t=>{ const tt=new Date(t.ts).getTime(); return tt>=desde&&tt<=hasta&&enFranja(t.ts); });
    // calcular peso de permanencia según velocidad respecto al punto anterior
    const out=[];
    for(let i=0;i<pts.length;i++){
      let peso=2; // por defecto
      if(i>0){
        const a=pts[i-1], b=pts[i];
        const dM=haversineKm(a.lat,a.lng,b.lat,b.lng)*1000;
        const dMin=Math.max(0.1,(new Date(b.ts)-new Date(a.ts))/60000);
        peso=pesoPermanencia(dM/dMin);
      }
      out.push({lat:pts[i].lat,lng:pts[i].lng,ts:pts[i].ts,peso});
    }
    result[v.id]=out;
  });
  res.json({ok:true,data:result,rango:{desde:new Date(desde).toISOString(),hasta:new Date(hasta).toISOString()}});
});

// ── Heatmap — historial extendido de posiciones ──────────
app.get('/api/v1/heatmap/:vacaId', auth, (req, res) => {
  const db = leerDB();
  const vacaId = parseInt(req.params.vacaId);
  const dias = parseInt(req.query.dias)||7;
  const cutoff = new Date(Date.now()-dias*864e5).toISOString();
  const pts = db.telemetria
    .filter(t=>String(t.vaca_id)===String(vacaId)&&t.ts>=cutoff&&t.lat&&t.lng)
    .map(t=>({lat:t.lat,lng:t.lng,ts:t.ts}));
  res.json({ok:true,data:pts,total:pts.length});
});

// ── Movimiento diario — últimos 7 días por vaca ──────────
app.get('/api/v1/movement/:vacaId', auth, (req, res) => {
  const db = leerDB();
  const vacaId = parseInt(req.params.vacaId);
  const resultado = [];
  for(let i=6;i>=0;i--){
    // Siempre Madrid para que coincida con las claves del db.movimiento
    const fecha=new Date(Date.now()-i*864e5).toLocaleString('sv-SE',{timeZone:'Europe/Madrid'}).slice(0,10);
    const km=(db.movimiento||{})[fecha]?.[vacaId]?.km||0;
    resultado.push({fecha, km:parseFloat(km.toFixed(2)), esHoy:i===0});
  }
  res.json({ok:true, data:resultado});
});

// ── Dashboard ──────────────────────────────────────────
app.get('/api/v1/dashboard', auth, (req, res) => {
  const db    = leerDB();
  const vacas = db.vacas.filter(v => v.activa);
  res.json({ ok:true, data:{
    total_vacas:     vacas.length,
    alertas_activas: db.alertas.filter(a => !a.resuelta).length,
    gestantes:       vacas.filter(v => v.gestante).length,
    en_celo:         vacas.filter(v => v.en_celo).length,
    separadas:       vacas.filter(v => v.separada).length,
    collares_activos:db.collarens.filter(c => c.activo).length,
    temp_media:      parseFloat((vacas.reduce((s,v)=>s+(v.temp||38.6),0)/vacas.length).toFixed(1)),
  }});
});

// ── WebSocket ──────────────────────────────────────────
io.on('connection', socket => {
  console.log(`🔌 Cliente: ${socket.id}`);
  const db = leerDB();
  socket.emit('estado:inicial', { vacas:db.vacas.filter(v=>v.activa), ts:new Date().toISOString() });
  socket.on('disconnect', () => console.log(`❌ Desconectado: ${socket.id}`));
});

// ── Arrancar ───────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('🐄 ════════════════════════════════════════');
  console.log('   LIMUTRACK BACKEND v2.0');
  console.log(`   http://localhost:${PORT}`);
  console.log('   ✅ GPS Simulado activo');
  console.log('   ✅ Historial de ruta');
  console.log('   ✅ Alertas gestionables');
  console.log('   ✅ Registro de collares');
  console.log('');
  console.log('   admin@limutrack.es / limutrack123');
  console.log('🐄 ════════════════════════════════════════');
});
