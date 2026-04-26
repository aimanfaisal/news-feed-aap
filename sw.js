/* ═══════════════════════════════════════════════
   sw.js — Service Worker
   Handles real Web Push notifications on devices
═══════════════════════════════════════════════ */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("push", function(event) {
  let data = { title: "📰 News Feed", body: "New notification received!" };

  try {
    data = event.data.json();
  } catch (e) {
    data.body = event.data ? event.data.text() : "New update";
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:    data.body,
      icon:    "/static/icon.png",   // optional — add a 192x192 PNG here
      badge:   "/static/icon.png",
      vibrate: [200, 100, 200],
      tag:     "news-feed",
      data:    { url: self.location.origin }
    })
  );
});

self.addEventListener("notificationclick", function(event) {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url || "/")
  );
});