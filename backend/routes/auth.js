const express = require("express");
const router = express.Router();
const { authClient, db } = require("../supabase");
const { requireAuth } = require("../middleware/auth");

function cleanError(error) {
  const message = error?.message || "Authentication failed.";
  if (/invalid login credentials/i.test(message)) return "Email or password is incorrect.";
  if (/already registered|user already registered/i.test(message)) return "An account with this email already exists.";
  if (/password should be at least/i.test(message)) return "Choose a password that meets the minimum length.";
  return message;
}
router.post("/signup", async (req, res, next) => {
  try {
    const full_name = typeof req.body.full_name === "string" ? req.body.full_name.trim() : "";
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body.password === "string" ? req.body.password : "";
    if (!full_name || full_name.length > 100) return res.status(400).json({ error: "Enter your name (up to 100 characters)." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return res.status(400).json({ error: "Enter a valid email address." });
    if (password.length < 8 || password.length > 128) return res.status(400).json({ error: "Password must be 8–128 characters long." });
    if (!authClient) return res.status(503).json({ error: "Supabase Auth is not configured." });
    const { data, error } = await authClient.auth.signUp({
      email, password, options: { data: { full_name } }
    });
    if (error) return res.status(400).json({ error: cleanError(error) });
    if (!data.session) return res.status(201).json({ message: "Account created. Check your email to confirm it, then log in.", token: null });
    res.status(201).json({ token: data.session.access_token, user: { id: data.user.id, email: data.user.email, full_name, role: "student" } });
  } catch (error) { next(error); }
});
router.post("/login", async (req, res, next) => {
  try {
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body.password === "string" ? req.body.password : "";
    if (!email || !password) return res.status(400).json({ error: "Enter your email and password." });
    if (!authClient) return res.status(503).json({ error: "Supabase Auth is not configured." });
    const { data, error } = await authClient.auth.signInWithPassword({ email, password });
    if (error || !data.user || !data.session) return res.status(401).json({ error: cleanError(error || new Error("Login failed.")) });
    const { data: profile, error: profileError } = await db.from("profiles").select("id, full_name, role, email").eq("id", data.user.id).maybeSingle();
    if (profileError) throw profileError;
    if (!profile) return res.status(403).json({ error: "Your profile is not ready. Please contact the project administrator." });
    res.json({ token: data.session.access_token, user: { id: data.user.id, email: data.user.email, full_name: profile.full_name, role: profile.role } });
  } catch (error) { next(error); }
});
router.get("/me", requireAuth, (req, res) => res.json({ user: req.user }));
router.post("/logout", requireAuth, (req, res) => {
  // The frontend discards its bearer token. Supabase access tokens expire; server does not store sessions.
  res.json({ message: "Logged out on this device." });
});
module.exports = router;
