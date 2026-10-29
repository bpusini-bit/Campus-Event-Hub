const { authClient, db } = require("../supabase");

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return res.status(401).json({ error: "Please log in to continue." });
  if (!authClient || !db) return res.status(503).json({ error: "Authentication is not configured on the server." });

  try {
    const { data, error } = await authClient.auth.getUser(match[1]);
    if (error || !data.user) return res.status(401).json({ error: "Your session is invalid or expired. Please log in again." });
    const { data: profile, error: profileError } = await db.from("profiles")
      .select("id, full_name, role, email").eq("id", data.user.id).maybeSingle();
    if (profileError) throw profileError;
    if (!profile) return res.status(403).json({ error: "Your profile is not ready. Please contact the project administrator." });
    req.user = { id: data.user.id, email: data.user.email, full_name: profile.full_name, role: profile.role };
    req.accessToken = match[1];
    next();
  } catch (error) {
    next(error);
  }
}
function requireOrganizer(req, res, next) {
  if (req.user?.role !== "organizer") return res.status(403).json({ error: "Organizer permission is required for this action." });
  next();
}
module.exports = { requireAuth, requireOrganizer };
