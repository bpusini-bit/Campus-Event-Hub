const API = "/api";
const state = { events: [], user: null, token: null, authMode: "login", selectedEvent: null };
const $ = (id) => document.getElementById(id);
const els = {
  eventsGrid: $("eventsGrid"), notice: $("notice"), authModal: $("authModal"),
  authForm: $("authForm"), authMessage: $("authMessage"), detailModal: $("detailModal"),
  detailContent: $("detailContent"), toast: $("toast")
};
let toastTimer;

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[char]));
}
function safeDate(value, options = {}) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date to be announced";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", ...options }).format(date);
}
function categoryClass(category = "Other") {
  const normalized = category.toLowerCase();
  return ["technical","cultural","workshop","sports","talk"].includes(normalized) ? `cover-${normalized}` : "cover-other";
}
function categorySymbol(category = "") {
  return ({ Technical:"⌘", Cultural:"✷", Workshop:"✳", Sports:"◉", Talk:"❝", Other:"✦" })[category] || "✦";
}
function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove("show"), 3000);
}
function showNotice(message) {
  els.notice.textContent = message;
  els.notice.hidden = !message;
}
async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(`${API}${path}`, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
  return payload;
}
function setAuthUi() {
  const signedIn = Boolean(state.user && state.token);
  $("authActions").hidden = signedIn;
  $("userActions").hidden = !signedIn;
  $("userLabel").textContent = state.user?.full_name || state.user?.email || "";
  $("myEventsLink").hidden = !signedIn;
  $("my-events").hidden = !signedIn;
  const organizer = signedIn && state.user.role === "organizer";
  $("organizerLink").hidden = !organizer;
  $("organizer").hidden = !organizer;
}
function openAuth(mode = "login") {
  setAuthMode(mode);
  els.authModal.hidden = false;
  document.body.style.overflow = "hidden";
  setTimeout(() => $("email").focus(), 20);
}
function closeModal(element) {
  element.hidden = true;
  if (els.authModal.hidden && els.detailModal.hidden) document.body.style.overflow = "";
}
function setAuthMode(mode) {
  state.authMode = mode;
  const signup = mode === "signup";
  $("loginTab").classList.toggle("active", !signup);
  $("signupTab").classList.toggle("active", signup);
  $("authTitle").textContent = signup ? "Join the community." : "Welcome back.";
  $("authSubtitle").textContent = signup ? "Create an account to save your spot at campus events." : "Log in to register for campus events.";
  $("nameField").hidden = !signup;
  $("fullName").required = signup;
  $("authSubmit").textContent = signup ? "Create account" : "Log in";
  $("password").autocomplete = signup ? "new-password" : "current-password";
  els.authMessage.hidden = true;
}
function renderEvents() {
  const search = $("searchInput").value.trim().toLowerCase();
  const category = $("categoryFilter").value;
  const sort = $("sortFilter").value;
  const list = state.events.filter(event => {
    const haystack = `${event.title} ${event.description} ${event.venue} ${event.category}`.toLowerCase();
    return (!search || haystack.includes(search)) && (!category || event.category === category);
  });
  list.sort((a, b) => sort === "new" ? new Date(b.created_at) - new Date(a.created_at) : new Date(a.starts_at) - new Date(b.starts_at));
  if (!list.length) {
    els.eventsGrid.innerHTML = `<div class="empty-state"><strong>No events found just yet.</strong><p>Try another search or check back soon.</p></div>`;
    return;
  }
  els.eventsGrid.innerHTML = list.map(event => {
    const spots = Math.max(0, Number(event.capacity) - Number(event.registration_count || 0));
    return `<article class="event-card">
      <div class="event-cover ${categoryClass(event.category)}"><span class="cover-symbol">${categorySymbol(event.category)}</span><span class="category-tag">${escapeHtml(event.category)}</span></div>
      <div class="event-body"><div class="event-meta"><span>◷ ${escapeHtml(safeDate(event.starts_at))}</span><span>·</span><span>${spots} spots left</span></div>
      <h3 class="event-title">${escapeHtml(event.title)}</h3><p class="event-description">${escapeHtml(event.description)}</p>
      <div class="event-footer"><span class="venue">⌖ ${escapeHtml(event.venue)}</span><button class="text-btn" data-view="${escapeHtml(event.id)}">Details ↗</button></div></div></article>`;
  }).join("");
  els.eventsGrid.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => openEvent(button.dataset.view)));
}
async function loadEvents() {
  els.eventsGrid.innerHTML = `<div class="loading-card">Loading campus events…</div>`;
  try {
    const result = await api("/events");
    state.events = result.events || [];
    showNotice("");
    renderEvents();
    if (state.user?.role === "organizer") renderManagedEvents();
  } catch (error) {
    els.eventsGrid.innerHTML = `<div class="empty-state"><strong>Couldn't load events.</strong><p>${escapeHtml(error.message)}. Check your backend and Supabase setup.</p></div>`;
    showNotice("The API is not available yet. Start the backend and configure Supabase to load live events.");
  }
}
function openEvent(id) {
  const event = state.events.find(item => item.id === id);
  if (!event) return;
  state.selectedEvent = event;
  const spots = Math.max(0, Number(event.capacity) - Number(event.registration_count || 0));
  els.detailContent.innerHTML = `<div class="event-cover ${categoryClass(event.category)}"><span class="cover-symbol">${categorySymbol(event.category)}</span><span class="category-tag">${escapeHtml(event.category)}</span></div>
    <span class="eyebrow">CAMPUS EVENT</span><h2 id="detailTitle">${escapeHtml(event.title)}</h2>
    <p class="detail-description">${escapeHtml(event.description)}</p>
    <div class="detail-facts"><div class="detail-fact"><span>Date & time</span><strong>${escapeHtml(safeDate(event.starts_at))}</strong></div><div class="detail-fact"><span>Venue</span><strong>${escapeHtml(event.venue)}</strong></div><div class="detail-fact"><span>Availability</span><strong>${spots} of ${event.capacity} spots</strong></div><div class="detail-fact"><span>Hosted by</span><strong>${escapeHtml(event.organizer_name || "Campus organizer")}</strong></div></div>
    <button class="btn btn-primary btn-full" id="registerEventBtn" ${spots < 1 ? "disabled" : ""}>${spots < 1 ? "Event is full" : "Register for this event ↗"}</button>
    <p id="detailMessage" class="inline-message" hidden></p>`;
  els.detailModal.hidden = false;
  document.body.style.overflow = "hidden";
  $("registerEventBtn").addEventListener("click", () => registerForEvent(event.id));
}
async function registerForEvent(id) {
  if (!state.user) { closeModal(els.detailModal); openAuth("login"); showToast("Log in to register for an event."); return; }
  const button = $("registerEventBtn");
  button.disabled = true; button.textContent = "Registering…";
  try {
    await api(`/events/${encodeURIComponent(id)}/register`, { method: "POST", body: "{}" });
    showToast("You're registered! See you there.");
    closeModal(els.detailModal);
    await Promise.all([loadEvents(), loadRegistrations()]);
  } catch (error) {
    const message = $("detailMessage");
    if (message) { message.textContent = error.message; message.hidden = false; }
    button.disabled = false; button.textContent = "Register for this event ↗";
  }
}
async function loadRegistrations() {
  if (!state.user) return;
  try {
    const result = await api("/events/registrations/me");
    const items = result.registrations || [];
    $("registrationsList").innerHTML = items.length ? items.map(item => `<div class="registration-row"><div><h3>${escapeHtml(item.event_title)}</h3><p>${escapeHtml(safeDate(item.starts_at))} · ${escapeHtml(item.venue)}</p></div><span class="status-tag">${escapeHtml(item.status || "registered")}</span></div>`).join("") : `<div class="empty-state">You haven't registered for any events yet. Explore the event list above.</div>`;
  } catch (error) { $("registrationsList").innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`; }
}
async function loadManagedEvents() {
  if (state.user?.role !== "organizer") return;
  try {
    const result = await api("/events/organizer/events");
    renderManagedEvents(result.events || []);
  } catch (error) { $("managedEvents").innerHTML = `<p class="muted">${escapeHtml(error.message)}</p>`; }
}
function renderManagedEvents(events) {
  const list = events.length ? events : state.events.filter(event => event.organizer_id === state.user?.id);
  $("manageCount").textContent = String(list.length);
  $("managedEvents").innerHTML = list.length ? list.map(event => `<div class="managed-item"><div><h4>${escapeHtml(event.title)}</h4><p>${escapeHtml(safeDate(event.starts_at))} · ${event.registration_count || 0} registered</p></div><div class="managed-actions"><button class="small-btn" data-edit="${escapeHtml(event.id)}">Edit</button><button class="small-btn delete" data-delete="${escapeHtml(event.id)}">Delete</button></div></div>`).join("") : `<p class="muted">No events yet. Create your first one using the form.</p>`;
  $("managedEvents").querySelectorAll("[data-edit]").forEach(btn => btn.addEventListener("click", () => startEdit(btn.dataset.edit, list)));
  $("managedEvents").querySelectorAll("[data-delete]").forEach(btn => btn.addEventListener("click", () => deleteEvent(btn.dataset.delete)));
}
function startEdit(id, events) {
  const event = events.find(item => item.id === id) || state.events.find(item => item.id === id);
  if (!event) return;
  $("eventId").value = event.id;
  $("eventTitle").value = event.title;
  $("eventCategory").value = event.category;
  $("eventCapacity").value = event.capacity;
  $("eventDescription").value = event.description;
  $("eventVenue").value = event.venue;
  const local = new Date(new Date(event.starts_at).getTime() - new Date().getTimezoneOffset() * 60000);
  $("eventDate").value = local.toISOString().slice(0,16);
  $("eventFormTitle").textContent = "Edit your event";
  $("saveEventBtn").textContent = "Save changes";
  $("cancelEditBtn").hidden = false;
  $("organizer").scrollIntoView({ behavior:"smooth", block:"start" });
}
function resetEventForm() {
  $("eventForm").reset(); $("eventId").value = ""; $("eventCapacity").value = 100;
  $("eventFormTitle").textContent = "Create an event"; $("saveEventBtn").textContent = "Publish event"; $("cancelEditBtn").hidden = true;
}
async function deleteEvent(id) {
  if (!confirm("Delete this event? Existing registrations will also be removed. This cannot be undone.")) return;
  try { await api(`/events/organizer/events/${encodeURIComponent(id)}`, { method:"DELETE" }); showToast("Event deleted."); await loadEvents(); await loadManagedEvents(); }
  catch (error) { showToast(error.message); }
}
async function submitEvent(event) {
  event.preventDefault();
  const id = $("eventId").value;
  const startsAt = new Date($("eventDate").value);
  if (Number.isNaN(startsAt.getTime()) || startsAt <= new Date()) { showToast("Choose a valid future date and time."); return; }
  const payload = { title:$("eventTitle").value.trim(), category:$("eventCategory").value, capacity:Number($("eventCapacity").value), description:$("eventDescription").value.trim(), starts_at:startsAt.toISOString(), venue:$("eventVenue").value.trim() };
  const button = $("saveEventBtn"); button.disabled = true;
  try {
    await api(id ? `/events/organizer/events/${encodeURIComponent(id)}` : "/events/organizer/events", { method:id ? "PATCH" : "POST", body:JSON.stringify(payload) });
    showToast(id ? "Event updated." : "Event published."); resetEventForm(); await loadEvents(); await loadManagedEvents();
  } catch (error) { showToast(error.message); }
  finally { button.disabled = false; }
}
async function restoreSession() {
  const token = sessionStorage.getItem("campushub_token");
  if (!token) return;
  try {
    const result = await api("/auth/me", { headers:{ Authorization:`Bearer ${token}` } });
    state.token = token; state.user = result.user;
  } catch { sessionStorage.removeItem("campushub_token"); }
}
async function submitAuth(event) {
  event.preventDefault();
  const signup = state.authMode === "signup";
  const body = { email:$("email").value.trim(), password:$("password").value };
  if (signup) body.full_name = $("fullName").value.trim();
  const button = $("authSubmit"); button.disabled = true; button.textContent = signup ? "Creating account…" : "Logging in…";
  els.authMessage.hidden = true;
  try {
    const result = await api(`/auth/${signup ? "signup" : "login"}`, { method:"POST", body:JSON.stringify(body) });
    if (!result.token) {
      els.authMessage.textContent = "Account created. If email confirmation is enabled in Supabase, confirm your email and then log in.";
      els.authMessage.hidden = false;
      return;
    }
    state.token = result.token; state.user = result.user;
    sessionStorage.setItem("campushub_token", state.token);
    closeModal(els.authModal); $("authForm").reset(); setAuthUi();
    await Promise.all([loadEvents(), loadRegistrations(), loadManagedEvents()]);
    showToast(signup ? "Account created. Welcome to CampusHub!" : "Welcome back!");
  } catch (error) {
    els.authMessage.textContent = error.message; els.authMessage.hidden = false;
  } finally { button.disabled = false; button.textContent = signup ? "Create account" : "Log in"; }
}
async function logout() {
  try { if (state.token) await api("/auth/logout", { method:"POST", body:"{}" }); } catch {}
  state.user = null; state.token = null; sessionStorage.removeItem("campushub_token"); setAuthUi();
  $("registrationsList").innerHTML = ""; $("managedEvents").innerHTML = `<p class="muted">Your published events will appear here.</p>`;
  showToast("You have logged out.");
}
$("loginOpen").addEventListener("click", () => openAuth("login"));
$("signupOpen").addEventListener("click", () => openAuth("signup"));
$("loginTab").addEventListener("click", () => setAuthMode("login"));
$("signupTab").addEventListener("click", () => setAuthMode("signup"));
$("modalClose").addEventListener("click", () => closeModal(els.authModal));
$("detailClose").addEventListener("click", () => closeModal(els.detailModal));
[els.authModal, els.detailModal].forEach(modal => modal.addEventListener("click", event => { if (event.target === modal) closeModal(modal); }));
document.addEventListener("keydown", event => { if (event.key === "Escape") { closeModal(els.authModal); closeModal(els.detailModal); } });
$("authForm").addEventListener("submit", submitAuth);
$("logoutBtn").addEventListener("click", logout);
$("searchInput").addEventListener("input", renderEvents);
$("categoryFilter").addEventListener("change", renderEvents);
$("sortFilter").addEventListener("change", renderEvents);
$("refreshBtn").addEventListener("click", loadEvents);
$("eventForm").addEventListener("submit", submitEvent);
$("cancelEditBtn").addEventListener("click", resetEventForm);

(async function init() {
  await restoreSession();
  setAuthUi();
  await loadEvents();
  if (state.user) await Promise.all([loadRegistrations(), loadManagedEvents()]);
})();
