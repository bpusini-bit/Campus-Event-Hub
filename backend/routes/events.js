const express = require("express");
const router = express.Router();
const { db } = require("../supabase");
const { requireAuth, requireOrganizer } = require("../middleware/auth");

function validEvent(body) {
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const venue = typeof body.venue === "string" ? body.venue.trim() : "";
  const category = body.category;
  const capacity = Number(body.capacity);
  const starts = new Date(body.starts_at);
  const categories = ["Workshop", "Technical", "Cultural", "Sports", "Talk", "Other"];
  if (!title || title.length > 120) return "Title is required and must be at most 120 characters.";
  if (!description || description.length > 3000) return "Description is required and must be at most 3000 characters.";
  if (!venue || venue.length > 160) return "Venue is required and must be at most 160 characters.";
  if (!categories.includes(category)) return "Choose a valid event category.";
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 10000) return "Capacity must be a whole number between 1 and 10000.";
  if (!body.starts_at || Number.isNaN(starts.getTime()) || starts <= new Date()) return "Event date and time must be in the future.";
  return null;
}
function eventPayload(body) {
  return { title: body.title.trim(), description: body.description.trim(), venue: body.venue.trim(),
    category: body.category, capacity: Number(body.capacity), starts_at: new Date(body.starts_at).toISOString() };
}
async function withCounts(events) {
  if (!events?.length) return [];
  const ids = events.map(event => event.id);
  const { data: regs, error } = await db.from("registrations").select("event_id").in("event_id", ids).eq("status", "registered");
  if (error) throw error;
  const counts = {};
  (regs || []).forEach(reg => { counts[reg.event_id] = (counts[reg.event_id] || 0) + 1; });
  return events.map(event => ({ ...event, registration_count: counts[event.id] || 0 }));
}
router.get("/", async (req, res, next) => {
  try {
    if (!db) return res.status(503).json({ error: "Database is not configured. Add Supabase credentials to backend/.env." });
    const { data, error } = await db.from("events").select("id, title, description, category, venue, starts_at, capacity, organizer_id, created_at").eq("status", "published").order("starts_at", { ascending: true });
    if (error) throw error;
    const mapped = (data || []).map(event => ({ ...event, organizer_name: "Campus organizer" }));
    res.json({ events: await withCounts(mapped) });
  } catch (error) { next(error); }
});
router.get("/registrations/me", requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await db.from("registrations")
      .select("id, status, created_at, events:event_id(id, title, starts_at, venue, category)")
      .eq("user_id", req.user.id).order("created_at", { ascending: false });
    if (error) throw error;
    res.json({ registrations: (data || []).filter(row => row.events).map(row => ({
      id: row.id, status: row.status, created_at: row.created_at, event_id: row.events.id,
      event_title: row.events.title, starts_at: row.events.starts_at, venue: row.events.venue, category: row.events.category
    })) });
  } catch (error) { next(error); }
});
router.post("/:id/register", requireAuth, async (req, res, next) => {
  try {
    const { data: event, error: eventError } = await db.from("events").select("id, capacity, starts_at, status").eq("id", req.params.id).eq("status", "published").maybeSingle();
    if (eventError) throw eventError;
    if (!event) return res.status(404).json({ error: "This event does not exist or is no longer published." });
    if (new Date(event.starts_at) <= new Date()) return res.status(400).json({ error: "Registration is closed because this event has started." });
    // A PostgreSQL function uses a row lock to avoid overbooking under concurrent requests.
    const { data, error } = await db.rpc("register_for_event", { p_event_id: event.id, p_user_id: req.user.id });
    if (error) {
      if (error.message.includes("ALREADY_REGISTERED")) return res.status(409).json({ error: "You are already registered for this event." });
      if (error.message.includes("EVENT_FULL")) return res.status(409).json({ error: "Sorry, this event is full." });
      if (error.message.includes("EVENT_NOT_AVAILABLE")) return res.status(404).json({ error: "This event is not available for registration." });
      throw error;
    }
    res.status(201).json({ registration: data, message: "Registration successful." });
  } catch (error) { next(error); }
});
router.get("/organizer/events", requireAuth, requireOrganizer, async (req, res, next) => {
  try {
    const { data, error } = await db.from("events").select("id, title, description, category, venue, starts_at, capacity, organizer_id, created_at, status").eq("organizer_id", req.user.id).order("starts_at", { ascending: true });
    if (error) throw error;
    res.json({ events: await withCounts(data || []) });
  } catch (error) { next(error); }
});
router.post("/organizer/events", requireAuth, requireOrganizer, async (req, res, next) => {
  try {
    const problem = validEvent(req.body);
    if (problem) return res.status(400).json({ error: problem });
    const { data, error } = await db.from("events").insert({ ...eventPayload(req.body), organizer_id: req.user.id, status: "published" }).select().single();
    if (error) throw error;
    res.status(201).json({ event: { ...data, registration_count: 0 } });
  } catch (error) { next(error); }
});
router.patch("/organizer/events/:id", requireAuth, requireOrganizer, async (req, res, next) => {
  try {
    const problem = validEvent(req.body);
    if (problem) return res.status(400).json({ error: problem });
    const { data, error } = await db.from("events").update(eventPayload(req.body)).eq("id", req.params.id).eq("organizer_id", req.user.id).select().maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Event not found or you do not own it." });
    res.json({ event: data });
  } catch (error) { next(error); }
});
router.delete("/organizer/events/:id", requireAuth, requireOrganizer, async (req, res, next) => {
  try {
    const { data, error } = await db.from("events").delete().eq("id", req.params.id).eq("organizer_id", req.user.id).select("id").maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Event not found or you do not own it." });
    res.json({ message: "Event and its registrations deleted." });
  } catch (error) { next(error); }
});
module.exports = router;
