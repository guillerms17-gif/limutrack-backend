// ═══════════════════════════════════════════════════
//  LIMUTRACK BACKEND v1.1 — Sin compilación
//  Base de datos: JSON en disco (sin dependencias nativas)
//  Arrancar: node server.js
// ═══════════════════════════════════════════════════

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const jwt        = require('jsonwebtoken');
const bcrypt     = require('bcryptjs');
const fs         = require('fs');
const path       = require('path');

const PORT       = 3001;
const JWT_SECRET = 'limutrack_secret_2024';
const DB_FILE    = path.join(__dirname, 'limutrack_db.json');

// ── App ─────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ══════════════════════════════════════════════════
//  BASE DE DATOS JSON — lee y escribe un archivo
// ══════════════════════════════════════════════════
function leerDB() {
  if (!fs.existsSync(DB_FILE)) return null;
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}
function guardarDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// Crear BD inicial si no existe
if (!fs.existsSync(DB_FILE)) {
  console.log('📋 Creando base de datos inicial...');

  const hash = bcrypt.hashSync('limutrack123', 10);

  const db = {
    usuarios: [
      { id: 1, nombre: 'Admin', email: 'admin@limutrack.es', password: hash, finca_id: 'finca_el_roble', rol: 'admin' }
    ],
    vacas: [
      { id:1,  nombre:'Belinda',   crotal:'ES040120001', edad:4, peso:720, lat:40.9232, lng:-5.8910, temp:38.8, actividad:72, salud:'buena',     gestante:false, diasParto:null, celo:false, bateria:87, partos:3, separada:false, alerta:null, notas:'', activa:true },
      { id:2,  nombre:'Carmela',   crotal:'ES040120002', edad:6, peso:780, lat:40.9218, lng:-5.8882, temp:38.6, actividad:24, salud:'excelente', gestante:true,  diasParto:45,  celo:false, bateria:92, partos:5, separada:false, alerta:null, notas:'', activa:true },
      { id:3,  nombre:'Dolores',   crotal:'ES040120003', edad:3, peso:650, lat:40.9240, lng:-5.8866, temp:39.1, actividad:88, salud:'atencion',  gestante:false, diasParto:null, celo:true,  bateria:64, partos:1, separada:true,  alerta:'Celo detectado · GPS +340% movimiento', notas:'', activa:true },
      { id:4,  nombre:'Esperanza', crotal:'ES040120004', edad:8, peso:840, lat:40.9208, lng:-5.8920, temp:38.5, actividad:8,  salud:'excelente', gestante:false, diasParto:null, celo:false, bateria:78, partos:7, separada:false, alerta:null, notas:'', activa:true },
      { id:5,  nombre:'Florinda',  crotal:'ES040120005', edad:5, peso:760, lat:40.9238, lng:-5.8858, temp:39.8, actividad:58, salud:'alerta',    gestante:false, diasParto:null, celo:false, bateria:44, partos:3, separada:true,  alerta:'Temp 39.8°C + separación → Posible infección', notas:'', activa:true },
      { id:6,  nombre:'Graciela',  crotal:'ES040120006', edad:7, peso:810, lat:40.9214, lng:-5.8908, temp:38.9, actividad:16, salud:'atencion',  gestante:true,  diasParto:3,   celo:false, bateria:89, partos:6, separada:false, alerta:'Parto en ~3 días · Actividad disminuida', notas:'', activa:true },
      { id:7,  nombre:'Hortensia', crotal:'ES040120007', edad:2, peso:620, lat:40.9228, lng:-5.8876, temp:38.7, actividad:26, salud:'buena',     gestante:false, diasParto:null, celo:false, bateria:95, partos:0, separada:false, alerta:null, notas:'', activa:true },
      { id:8,  nombre:'Inés',      crotal:'ES040120008', edad:9, peso:850, lat:40.9205, lng:-5.8868, temp:38.4, actividad:7,  salud:'excelente', gestante:false, diasParto:null, celo:false, bateria:71, partos:8, separada:false, alerta:null, notas:'', activa:true },
      { id:9,  nombre:'Juana',     crotal:'ES040120009', edad:4, peso:700, lat:40.9236, lng:-5.8898, temp:38.8, actividad:80, salud:'buena',     gestante:false, diasParto:null, celo:false, bateria:83, partos:3, separada:false, alerta:null, notas:'', activa:true },
      { id:10, nombre:'Lucía',     crotal:'ES040120010', edad:6, peso:775, lat:40.9220, lng:-5.8888, temp:38.6, actividad:53, salud:'excelente', gestante:true,  diasParto:90,  celo:false, bateria:91, partos:4, separada:false, alerta:null, notas:'', activa:true },
    ],
    telemetria: [],
    alertas:    [],
    collarens:  [],
    _nextId:    11,
  };

  guardarDB(db);
  console.log('✅ Base de datos creada con 10 vacas Limusinas');
}

// ── Motor IA básico ──────────────────────────────────
function inferirIA(vaca, { temp, actividad, bateria }) {
  const out = [];
  if (temp > 39.5)
    out.push({ tipo:'temperatura', mensaje:`Temperatura ${temp.toFixed(1)}°C — por encima de 39.5°C (normal: 38.5–39.5)`, severidad:'alta' });
  if (actividad > 85 && vaca.actividad < 60)
    out.push({ tipo:'celo', mensaje:`Actividad muy alta → posible celo detectado`, severidad:'media' });
  if (vaca.gestante && actividad < 15 && vaca.actividad > 25)
    out.push({ tipo:'parto', mensaje:`Descenso brusco de actividad en gestante → vigilar parto`, severidad:'alta' });
  if (bateria < 20)
    out.push({ tipo:'bateria', mensaje:`Batería collar ${bateria}% — recargar urgente`, severidad:'baja' });
  return out;
}

// ── Auth middleware ───────────────────────────────────
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token requerido' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Token inválido' }); }
}

// ══════════════════════════════════════════════════
//  RUTAS API
// ══════════════════════════════════════════════════

app.get('/health', (_, res) => res.json({ ok: true, version: '1.1', ts: new Date().toISOString() }));

// LOGIN
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const db   = leerDB();
  const user = db.usuarios.find(u => u.email === email);
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  const token = jwt.sign({ id: user.id, email: user.email, finca_id: user.finca_id, rol: user.rol }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, usuario: { id: user.id, nombre: user.nombre, email: user.email } });
});

// GET todas las vacas
app.get('/api/v1/cattle', auth, (req, res) => {
  const db = leerDB();
  res.json({ ok: true, data: db.vacas.filter(v => v.activa), total: db.vacas.filter(v => v.activa).length });
});

// GET una vaca
app.get('/api/v1/cattle/:id', auth, (req, res) => {
  const db = leerDB();
  const v  = db.vacas.find(v => v.id === parseInt(req.params.id) && v.activa);
  if (!v) return res.status(404).json({ error: 'Vaca no encontrada' });
  res.json({ ok: true, data: v });
});

// POST crear vaca
app.post('/api/v1/cattle', auth, (req, res) => {
  const db = leerDB();
  const { nombre, crotal, edad, peso, gestante, diasParto, celo, partos, notas } = req.body;
  if (!nombre || !crotal) return res.status(400).json({ error: 'nombre y crotal obligatorios' });
  if (db.vacas.find(v => v.crotal === crotal && v.activa))
    return res.status(400).json({ error: 'El crotal ya existe' });
  const nueva = {
    id: db._nextId++, nombre, crotal,
    edad: edad || 0, peso: peso || 700,
    lat: 40.9223, lng: -5.8891,
    temp: 38.6, actividad: 50, salud: 'buena',
    gestante: !!gestante, diasParto: diasParto || null,
    celo: !!celo, bateria: 100,
    partos: partos || 0, separada: false,
    alerta: null, notas: notas || '', activa: true,
  };
  db.vacas.push(nueva);
  guardarDB(db);
  io.emit('vaca:nueva', nueva);
  res.status(201).json({ ok: true, data: nueva });
});

// PUT actualizar vaca
app.put('/api/v1/cattle/:id', auth, (req, res) => {
  const db  = leerDB();
  const idx = db.vacas.findIndex(v => v.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Vaca no encontrada' });
  db.vacas[idx] = { ...db.vacas[idx], ...req.body, id: db.vacas[idx].id };
  guardarDB(db);
  io.emit('vaca:actualizada', db.vacas[idx]);
  res.json({ ok: true, data: db.vacas[idx] });
});

// DELETE vaca (soft)
app.delete('/api/v1/cattle/:id', auth, (req, res) => {
  const db  = leerDB();
  const idx = db.vacas.findIndex(v => v.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'No encontrada' });
  db.vacas[idx].activa = false;
  guardarDB(db);
  io.emit('vaca:eliminada', { id: req.params.id });
  res.json({ ok: true });
});

// POST telemetría GPS — lo llama el collar cada 30s
app.post('/api/v1/telemetry', (req, res) => {
  const { collar_id, vaca_id, lat, lng, temp = 38.6, actividad = 50, bateria = 100 } = req.body;
  if (!vaca_id || !lat || !lng) return res.status(400).json({ error: 'Faltan campos' });

  const db  = leerDB();
  const idx = db.vacas.findIndex(v => v.id === parseInt(vaca_id));
  if (idx === -1) return res.status(404).json({ error: 'Vaca no encontrada' });

  // Guardar en historial
  db.telemetria.push({ vaca_id, collar_id, lat, lng, temp, actividad, bateria, ts: new Date().toISOString() });

  // Inferencia IA
  const alertasIA = inferirIA(db.vacas[idx], { temp, actividad, bateria });
  alertasIA.forEach(a => {
    db.alertas.push({ vaca_id, nombre: db.vacas[idx].nombre, ...a, resuelta: false, ts: new Date().toISOString() });
  });

  // Actualizar posición de la vaca
  db.vacas[idx] = {
    ...db.vacas[idx], lat, lng, temp, actividad, bateria,
    alerta: alertasIA[0]?.mensaje || db.vacas[idx].alerta,
  };

  // Mantener solo últimas 5000 telemetrías para no crecer infinito
  if (db.telemetria.length > 5000) db.telemetria = db.telemetria.slice(-5000);

  guardarDB(db);

  // Emitir por WebSocket en tiempo real
  io.emit('gps:update', { vaca_id, nombre: db.vacas[idx].nombre, lat, lng, temp, actividad, bateria, alertas: alertasIA, ts: new Date().toISOString() });

  res.json({ ok: true, alertas: alertasIA });
});

// GET historial GPS de una vaca
app.get('/api/v1/telemetry/:vacaId', auth, (req, res) => {
  const db   = leerDB();
  const rows = db.telemetria.filter(t => String(t.vaca_id) === req.params.vacaId).slice(-200);
  res.json({ ok: true, data: rows });
});

// GET alertas activas
app.get('/api/v1/alerts', auth, (req, res) => {
  const db = leerDB();
  res.json({ ok: true, data: db.alertas.filter(a => !a.resuelta), total: db.alertas.filter(a => !a.resuelta).length });
});

// PUT resolver alerta
app.put('/api/v1/alerts/:idx/resolve', auth, (req, res) => {
  const db  = leerDB();
  const idx = parseInt(req.params.idx);
  if (db.alertas[idx]) db.alertas[idx].resuelta = true;
  guardarDB(db);
  res.json({ ok: true });
});

// GET dashboard
app.get('/api/v1/dashboard', auth, (req, res) => {
  const db    = leerDB();
  const vacas = db.vacas.filter(v => v.activa);
  res.json({ ok: true, data: {
    total_vacas:     vacas.length,
    alertas_activas: db.alertas.filter(a => !a.resuelta).length,
    gestantes:       vacas.filter(v => v.gestante).length,
    en_celo:         vacas.filter(v => v.celo).length,
    separadas:       vacas.filter(v => v.separada).length,
    temp_media:      parseFloat((vacas.reduce((s,v)=>s+v.temp,0)/vacas.length).toFixed(1)),
  }});
});

// ── WebSocket ─────────────────────────────────────────
io.on('connection', socket => {
  console.log(`🔌 Cliente conectado: ${socket.id}`);
  const db    = leerDB();
  const vacas = db.vacas.filter(v => v.activa);
  socket.emit('estado:inicial', { vacas, ts: new Date().toISOString() });
  socket.on('disconnect', () => console.log(`❌ Desconectado: ${socket.id}`));
});

// ── Arrancar ──────────────────────────────────────────
server.listen(PORT, () => {
  console.log('');
  console.log('🐄 ════════════════════════════════════');
  console.log('   LIMUTRACK BACKEND v1.1');
  console.log(`   http://localhost:${PORT}`);
  console.log(`   BD:  limutrack_db.json`);
  console.log('');
  console.log('   Login: admin@limutrack.es');
  console.log('   Pass:  limutrack123');
  console.log('🐄 ════════════════════════════════════');
  console.log('');
});
