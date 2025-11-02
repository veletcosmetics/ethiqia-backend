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
import { fileURLToPath } from 'url';
import fs from 'fs';

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

// Rutas de autenticación
app.use('/api/auth', authRoutes);

const useMongo = !!process.env.MONGO_URI;
let User, Post;

if (useMongo) {
  const userSchema = new mongoose.Schema({
    name: String,
    email: { type: String, unique: true },
    passwordHash: String,
    score: { type: Number, default: 50 },
    createdAt: { type: Date, default: Date.now }
  });

  const postSchema = new mongoose.Schema({
    authorId: String,
    text: String,
    mediaUrl: String,
    mediaType: String,
    authenticity: { label: String, probability_ai: Number },
    createdAt: { type: Date, default: Date.now }
  });

  // ✅ Reutiliza modelos si ya están compilados
  User = mongoose.models.User || mongoose.model('User', userSchema);
  Post = mongoose.models.Post || mongoose.model('Post', postSchema);

  mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB connected'))
    .catch(e => console.warn('MongoDB error', e.message));
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

// Registro
app.post('/api/auth/register', async (req,res)=>{
  const { name, email, password } = req.body;
  if(!name || !email || !password) return res.status(400).json({ error: 'Missing fields' });
  const exists = await User.findOne({ email });
  if(exists) return res.status(400).json({ error: 'Email already registered' });
  const passwordHash = await bcrypt.hash(password, 10);
  const u = await User.create({ name, email, passwordHash });
  res.json({ ok:true, user: { id: u._id, name: u.name, email: u.email, score: u.score } });
});

// Login
app.post('/api/auth/login', async (req,res)=>{
  const { email, password } = req.body;
  const u = await User.findOne({ email });
  if(!u) return res.status(400).json({ error: 'Invalid credentials' });
  const ok = awai
