/* ═══════════════════════════════════════════════
   News Feed & Notification System — app.js
   All frontend logic: API calls, UI updates
═══════════════════════════════════════════════ */

const API = "";   // same origin — Flask serves everything

// ─── Tab Switching ─────────────────────────────
function switchTab(name, btn) {
  document.querySelectorAll(".tab-content").forEach(el => el.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach(el => el.classList.remove("active"));
  document.getElementById("tab-" + name).classList.add("active");
  btn.classList.add("active");
}

// ─── Toast Notification ────────────────────────
function showToast(msg, type = "") {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = "toast show " + type;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), 3500);
}

// ─── Stats ─────────────────────────────────────
async function refreshStats() {
  try {
    const res  = await fetch(`${API}/api/stats`);
    const data = await res.json();
    document.getElementById("statsLabel").textContent =
      `Subscribers: ${data.subscribers} | Published: ${data.published}`;
  } catch (e) { /* silent */ }
}

// ─── Load Users into Dropdowns ────────────────
async function refreshUsers() {
  try {
    const res   = await fetch(`${API}/api/users`);
    const users = await res.json();

    // User list display
    const listEl = document.getElementById("userList");
    if (users.length === 0) {
      listEl.innerHTML = "No users added yet.";
    } else {
      listEl.innerHTML = users.map(u => {
        const subs = u.subscriptions.length ? u.subscriptions.join(", ") : "None";
        return `👤 ${u.name}  |  Subscribed to: ${subs}  |  Received: ${u.received}`;
      }).join("\n");
    }

    // Populate dropdowns
    const names = users.map(u => u.name);
    ["userSelect", "feedUserSelect"].forEach(id => {
      const sel = document.getElementById(id);
      const cur = sel.value;
      sel.innerHTML = names.map(n => `<option value="${n}">${n}</option>`).join("");
      if (names.includes(cur)) sel.value = cur;
    });
  } catch (e) {
    showToast("Failed to load users", "error");
  }
}

// ─── Load Published News Log ───────────────────
async function refreshPublishLog() {
  try {
    const res   = await fetch(`${API}/api/news`);
    const items = await res.json();
    const log   = document.getElementById("publishLog");
    if (items.length === 0) {
      log.innerHTML = "No news published yet.";
      return;
    }
    log.innerHTML = items.reverse().map(item => {
      return `<div class="log-entry">` +
        `<span class="entry-header">[${item.type}] ${item.timestamp}</span>\n` +
        `<span class="entry-cat">Category: ${item.category}</span>\n` +
        `<span class="entry-msg">${item.message}</span>` +
        `</div>`;
    }).join("\n");
    log.scrollTop = log.scrollHeight;
  } catch (e) { /* silent */ }
}

// ─── Publish News ──────────────────────────────
async function publishNews() {
  const type     = document.getElementById("notifType").value;
  const category = document.getElementById("newsCategory").value;
  const message  = document.getElementById("newsMessage").value.trim();

  if (!message) {
    showToast("⚠️ Please enter a message/headline.", "error");
    return;
  }

  try {
    const res  = await fetch(`${API}/api/publish`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ type, category, message })
    });
    const data = await res.json();

    if (!res.ok) {
      showToast("❌ " + (data.error || "Publish failed"), "error");
      return;
    }

    document.getElementById("newsMessage").value = "";
    showToast(`✅ Published! Notified: ${data.notified_users.join(", ") || "nobody"}`, "success");
    await refreshPublishLog();
    await refreshStats();
    await refreshUsers();
  } catch (e) {
    showToast("❌ Network error", "error");
  }
}

// ─── Add User ──────────────────────────────────
async function addUser() {
  const name = document.getElementById("newUserName").value.trim();
  if (!name) {
    showToast("⚠️ Please enter a user name.", "error");
    return;
  }

  try {
    const res  = await fetch(`${API}/api/users`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ name })
    });
    const data = await res.json();

    if (!res.ok) {
      showToast("❌ " + (data.error || "Add user failed"), "error");
      return;
    }

    document.getElementById("newUserName").value = "";
    showToast(`✅ User '${name}' added!`, "success");
    await refreshUsers();
    await refreshStats();
  } catch (e) {
    showToast("❌ Network error", "error");
  }
}

// ─── Subscribe ─────────────────────────────────
async function subscribeUser() {
  const username = document.getElementById("userSelect").value;
  const category = document.getElementById("subCategory").value;
  if (!username) { showToast("⚠️ Please select a user.", "error"); return; }

  try {
    const res  = await fetch(`${API}/api/subscribe`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ username, category })
    });
    const data = await res.json();
    if (!res.ok) { showToast("❌ " + data.error, "error"); return; }
    showToast(`✅ '${username}' subscribed to [${category}]`, "success");
    await refreshUsers();
    await refreshStats();
  } catch (e) {
    showToast("❌ Network error", "error");
  }
}

// ─── Unsubscribe ───────────────────────────────
async function unsubscribeUser() {
  const username = document.getElementById("userSelect").value;
  const category = document.getElementById("subCategory").value;
  if (!username) { showToast("⚠️ Please select a user.", "error"); return; }

  try {
    const res  = await fetch(`${API}/api/unsubscribe`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ username, category })
    });
    const data = await res.json();
    if (!res.ok) { showToast("❌ " + data.error, "error"); return; }
    showToast(`✅ '${username}' unsubscribed from [${category}]`, "success");
    await refreshUsers();
    await refreshStats();
  } catch (e) {
    showToast("❌ Network error", "error");
  }
}

// ─── View Feed ─────────────────────────────────
async function viewFeed() {
  const username = document.getElementById("feedUserSelect").value;
  if (!username) { showToast("⚠️ Please select a user.", "error"); return; }

  const display = document.getElementById("feedDisplay");
  display.innerHTML = "Loading...";

  try {
    const res     = await fetch(`${API}/api/feed/${encodeURIComponent(username)}`);
    const entries = await res.json();

    if (entries.length === 0) {
      display.innerHTML =
        `No notifications yet for '${username}'.\nSubscribe to categories and publish news to see updates here.`;
      return;
    }

    display.innerHTML = entries.map(e => {
      const icon = e.icon || "🔔";
      return `<div class="log-entry">` +
        `<span class="entry-header">${icon} [${e.type}] ${e.timestamp}</span>\n` +
        `<span class="entry-cat">Category: ${e.category}</span>\n` +
        `<span class="entry-msg">${e.message}</span>` +
        `</div>`;
    }).join("\n");
    display.scrollTop = display.scrollHeight;
  } catch (e) {
    display.innerHTML = "Error loading feed.";
    showToast("❌ Network error", "error");
  }
}

// ─── Web Push: Enable Real Notifications ───────
async function enablePush() {
  const username = document.getElementById("feedUserSelect").value;
  if (!username) {
    showToast("⚠️ Select a user first, then enable push.", "error");
    return;
  }

  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    showToast("❌ This browser does not support push notifications.", "error");
    return;
  }

  try {
    // Register service worker
    const reg = await navigator.serviceWorker.register("/static/sw.js");
    await navigator.serviceWorker.ready;

    // Ask permission
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      showToast("❌ Notification permission denied.", "error");
      return;
    }

    // Get VAPID key
    const keyRes  = await fetch(`${API}/api/vapid-public-key`);
    const keyData = await keyRes.json();
    if (!keyData.key) {
      showToast("❌ VAPID key not configured on server.", "error");
      return;
    }

    // Subscribe via PushManager
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly:      true,
      applicationServerKey: urlBase64ToUint8Array(keyData.key)
    });

    // Send subscription to backend
    await fetch(`${API}/api/push-subscribe`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ username, subscription: sub.toJSON() })
    });

    showToast(`🔔 Push notifications enabled for '${username}'!`, "success");
  } catch (err) {
    console.error(err);
    showToast("❌ Could not enable push: " + err.message, "error");
  }
}

// ─── VAPID key helper ──────────────────────────
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64  = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw     = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

// ─── Seed Demo Data on First Load ─────────────
async function seedDemoIfEmpty() {
  try {
    const res   = await fetch(`${API}/api/users`);
    const users = await res.json();
    if (users.length > 0) return;   // already has data

    // Add demo users
    for (const name of ["Alice", "Bob", "Carol"]) {
      await fetch(`${API}/api/users`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name })
      });
    }
    // Subscribe them
    await fetch(`${API}/api/subscribe`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "Alice", category: "ALL" }) });
    await fetch(`${API}/api/subscribe`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "Bob", category: "Technology" }) });
    await fetch(`${API}/api/subscribe`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "Bob", category: "Sports" }) });
    await fetch(`${API}/api/subscribe`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "Carol", category: "Politics" }) });

    // Publish demo news
    const demos = [
      { type: "Push",  category: "Technology", message: "OpenAI releases GPT-5 with reasoning capabilities" },
      { type: "Email", category: "Sports",     message: "Pakistan wins the ICC Cricket World Cup 2026" },
      { type: "SMS",   category: "Politics",   message: "New budget announced focusing on education and health" },
    ];
    for (const d of demos) {
      await fetch(`${API}/api/publish`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(d)
      });
    }
  } catch (e) { /* silent */ }
}

// ─── Initialise ────────────────────────────────
(async function init() {
  await seedDemoIfEmpty();
  await refreshUsers();
  await refreshPublishLog();
  await refreshStats();
})();