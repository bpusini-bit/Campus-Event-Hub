const { createClient } = require("@supabase/supabase-js");

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceRoleKey) {
  console.warn("Supabase environment variables are missing. Add them to backend/.env before using database features.");
}

const authClient = url && anonKey ? createClient(url, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false }
}) : null;

// This client has elevated privileges. It is server-side only and must never be sent to the browser.
const db = url && serviceRoleKey ? createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
}) : null;

module.exports = { authClient, db };
