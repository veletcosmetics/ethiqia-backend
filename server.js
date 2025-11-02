
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import morgan from 'morgan';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import path from 'path';
import mongoose from 'mongoose';
import OpenAI from 'openai';
import authRoutes from './routes/auth.js';


dotenv.config();
const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

app.use('/api/auth', authRoutes);

const useMongo = !!process.env.MONGO_URI;
let User, Post;

if (useMongo) {
  const userSchema = new mongoose.Schema({
    name: String, email: { type: String, unique: true }, passwordHash: String, score: { type: Number, default: 50 }, createdAt: { type: Date, default: Date.now }
  });
  const postSchema = new mongoose.Schema({
    authorId: String, text: String, mediaUrl: String, mediaType: String, authenticity: { label: String, probability_ai: Number }, createdAt: { type: Date, default: Date.now }
  });
  User = mongoose.model('User', userSchema);
  Post = mongoose.model('Post', postSchema);
  mongoose.connect(process.env.MONGO_URI).then(()=>console.log('MongoDB connected')).catch(e=>console.warn('MongoDB error', e.message));
} else {
  console.warn('Running WITHOUT MongoDB (in-memory demo storage). Set MONGO_URI to use Mongo.');
  const mem = { users: [], posts: [] };
  User = {
    async findOne(q){ return mem.users.find(u=>u.email===q.email)||null; },
    async create(obj){ const u={...obj, _id:String(Date.now()), score:50}; mem.users.push(u); return u; },
    async findById(id){ return mem.users.find(u=>u._id===id)||null; },
  };
  Post = {
    async find(){ return mem.posts.sort((a,b)=>b.createdAt-a.createdAt); },
    async create(obj){ const p={...obj, _id:String(Date.now()), createdAt:new Date()}; mem.posts.push(p); return p; },
  };
}

const upload = multer({ dest: 'uploads/' });
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const AI_ENABLED = (process.env.ETHIQIA_AI_ENABLED || 'true').toLowerCase() === 'true';
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

function auth(req,res,next){
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : null;
  if(!t) return res.status(401).json({ error: 'No token' });
  try{
    const p = jwt.verify(t, JWT_SECRET);
    req.uid = p.uid;
    next();
  }catch(e){ res.status(401).json({ error: 'Invalid token' }); }
}

app.get('/api/health', (req,res)=> res.json({ ok:true, env: process.env.NODE_ENV || 'production', ts: Date.now() }));

app.post('/api/auth/register', async (req,res)=>{
  const { name, email, password } = req.body;
  if(!name || !email || !password) return res.status(400).json({ error: 'Missing fields' });
  const exists = await User.findOne({ email });
  if(exists) return res.status(400).json({ error: 'Email already registered' });
  const passwordHash = await bcrypt.hash(password, 10);
  const u = await User.create({ name, email, passwordHash });
  res.json({ ok:true, user: { id: u._id, name: u.name, email: u.email, score: u.score } });
});

app.post('/api/auth/login', async (req,res)=>{
  const { email, password } = req.body;
  const u = await User.findOne({ email });
  if(!u) return res.status(400).json({ error: 'Invalid credentials' });
  const ok = await bcrypt.compare(password, u.passwordHash);
  if(!ok) return res.status(400).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ uid: u._id }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: u._id, name: u.name, email: u.email, score: u.score } });
});

app.post('/api/ai/moderate', async (req,res)=>{
  try{
    const text = (req.body?.text || '').toString().slice(0, 5000);
    if(!AI_ENABLED || !openai){
      return res.json({ allowed: true, flags: [], model: 'fallback' });
    }
    const resp = await openai.moderations.create({ model: 'omni-moderation-latest', input: text });
    const r = resp.results?.[0];
    const flags = Object.entries(r?.categories||{}).filter(([k,v])=>v).map(([k])=>k);
    res.json({ allowed: !r?.flagged, flags, model: 'omni-moderation-latest' });
  }catch(e){ res.status(500).json({ error: e.message }); }
});

function estimateAuthenticity(filename, mediaType){
  if(!filename) return { label: 'real', probability_ai: 0.05 };
  let sum = 0; for(const c of filename) sum = (sum + c.charCodeAt(0)) % 1000;
  const p = Math.round((0.15 + 0.7 * (sum/1000)) * 100) / 100;
  let label = 'uncertain'; if(p > 0.7) label = 'ai'; if(p < 0.3) label = 'real';
  return { label, probability_ai: p };
}

app.get('/api/posts', async (req,res)=>{
  const list = await Post.find();
  res.json(list);
});

app.post('/api/posts', auth, upload.single('media'), async (req,res)=>{
  const text = req.body?.text || '';
  let mediaUrl = '', mediaType = '';
  if(req.file){
    mediaUrl = `/uploads/${req.file.filename}`;
    mediaType = (req.file.mimetype||'').startsWith('video') ? 'video' : 'image';
  }
  const authenticity = estimateAuthenticity(req.file?.filename || '', mediaType);
  const p = await Post.create({ authorId: req.uid, text, mediaUrl, mediaType, authenticity, createdAt: new Date() });
  res.json(p);
});

import { fileURLToPath } from 'url';
import fs from 'fs';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const PORT = process.env.PORT || 5000;
// Ruta raíz para evitar el "Cannot GET /"
// Ruta raíz para evitar el "Cannot GET /"
app.get('/', (req, res) => {
  res.json({ ok: true, message: '✅ Ethiqia API funcionando correctamente' });
});

// ✅ NUEVA RUTA DE ESTADO GENERAL
app.get('/api/health', (req, res) => {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  const dbState = states[mongoose.connection.readyState] || 'unknown';

  res.json({
    ok: true,
    env: process.env.NODE_ENV || 'production',
    mongo: dbState,
    timestamp: new Date().toISOString(),
    message: '✅ Ethiqia backend funcionando correctamente'
  });
});

app.listen(PORT, ()=> console.log('Ethiqia backend listening on :' + PORT));
