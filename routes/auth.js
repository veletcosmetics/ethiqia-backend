import express from "express";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

const router = express.Router();

// Registro
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: "Faltan campos" });
    }
    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ error: "El usuario ya existe" });

    const user = await User.create({ name, email, password });
    res.status(201).json({
      message: "Usuario registrado",
      user: { id: user._id, name: user.name, email: user.email }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "Usuario no encontrado" });

    const match = await user.matchPassword(password);
    if (!match) return res.status(401).json({ error: "Contraseña incorrecta" });

    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET || "ethiqia_secret",
      { expiresIn: "7d" }
    );

    res.json({
      message: "Login correcto",
      token,
      user: { id: user._id, name: user.name, email: user.email }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
