"""
News Feed & Notification System — Flask Backend
Factory Pattern | Observer Pattern | MVC Pattern | MongoDB Atlas
"""

import os, json
from datetime import datetime
from abc import ABC, abstractmethod
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
from pymongo import MongoClient
from dotenv import load_dotenv
from pywebpush import webpush, WebPushException


load_dotenv()

app = Flask(__name__)
CORS(app)

# ─────────────────────────────────────────────
# MongoDB Atlas Connection
# ─────────────────────────────────────────────
client = MongoClient(os.getenv("MONGO_URI", "mongodb://localhost:27017/"))
db            = client["news_feed_db"]
users_col     = db["users"]
news_col      = db["news_items"]
notif_col     = db["notifications"]
push_subs_col = db["push_subscriptions"]   # stores browser push subscriptions

VAPID_PUBLIC_KEY  = os.getenv("VAPID_PUBLIC_KEY", "")
VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY", "")
VAPID_EMAIL       = os.getenv("VAPID_EMAIL", "mailto:test@test.com")

CATEGORIES = ["Technology", "Sports", "Politics", "Entertainment", "Science"]
NOTIF_TYPES = ["Email", "SMS", "Push"]

# ─────────────────────────────────────────────
# FACTORY PATTERN — Notification Factory
# ─────────────────────────────────────────────
class Notification(ABC):
    def __init__(self, message, category):
        self.message   = message
        self.category  = category
        self.timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    @abstractmethod
    def get_display(self): pass

    @abstractmethod
    def get_icon(self): pass


class EmailNotification(Notification):
    def get_display(self):
        return f"[EMAIL] {self.timestamp}\nCategory: {self.category}\n{self.message}"
    def get_icon(self): return "📧"


class SMSNotification(Notification):
    def get_display(self):
        return f"[SMS] {self.timestamp}\nCategory: {self.category}\n{self.message}"
    def get_icon(self): return "📱"


class PushNotification(Notification):
    def get_display(self):
        return f"[PUSH] {self.timestamp}\nCategory: {self.category}\n{self.message}"
    def get_icon(self): return "🔔"


class NotificationFactory:
    _creators = {
        "Email": EmailNotification,
        "SMS":   SMSNotification,
        "Push":  PushNotification,
    }

    @staticmethod
    def create(notif_type, message, category):
        creator = NotificationFactory._creators.get(notif_type)
        if not creator:
            raise ValueError(f"Unknown type: {notif_type}")
        return creator(message, category)


# ─────────────────────────────────────────────
# OBSERVER PATTERN — Publisher / Subscriber
# ─────────────────────────────────────────────
class NewsPublisher:
    def __init__(self):
        self._subscribers     = {}   # category → [usernames]
        self._all_subscribers = []   # subscribed to ALL

    def subscribe(self, username, category="ALL"):
        if category == "ALL":
            if username not in self._all_subscribers:
                self._all_subscribers.append(username)
        else:
            self._subscribers.setdefault(category, [])
            if username not in self._subscribers[category]:
                self._subscribers[category].append(username)

    def unsubscribe(self, username, category="ALL"):
        if category == "ALL":
            if username in self._all_subscribers:
                self._all_subscribers.remove(username)
        else:
            lst = self._subscribers.get(category, [])
            if username in lst:
                lst.remove(username)

    def get_notified_users(self, category):
        """Return set of usernames who should receive this notification."""
        users = set(self._all_subscribers)
        users.update(self._subscribers.get(category, []))
        return users

    def get_subscriber_count(self):
        count = len(self._all_subscribers)
        for lst in self._subscribers.values():
            count += len(lst)
        return count

    def load_from_db(self):
        """Re-hydrate from MongoDB on startup."""
        for doc in users_col.find():
            name = doc["name"]
            for cat in doc.get("subscriptions", []):
                self.subscribe(name, cat)


# Global publisher (in-memory, loaded from DB on startup)
publisher = NewsPublisher()
publisher.load_from_db()


# ─────────────────────────────────────────────
# Helper: send real browser push notification
# ─────────────────────────────────────────────
def send_browser_push(username, title, body):
    """Send a real Web Push notification to all of a user's browsers."""
    if not VAPID_PRIVATE_KEY:
        return
    for sub_doc in push_subs_col.find({"username": username}):
        try:
            sub_info = sub_doc["subscription"]
            webpush(
                subscription_info=sub_info,
                data=json.dumps({"title": title, "body": body}),
                vapid_private_key=VAPID_PRIVATE_KEY,
                vapid_claims={"sub": VAPID_EMAIL},
            )
        except WebPushException:
            # Subscription expired — remove it
            push_subs_col.delete_one({"_id": sub_doc["_id"]})


# ─────────────────────────────────────────────
# API ROUTES
# ─────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html", vapid_public_key=VAPID_PUBLIC_KEY)


# ── Users ──────────────────────────────────────────────
@app.route("/api/users", methods=["GET"])
def get_users():
    docs = list(users_col.find({}, {"_id": 0}))
    # Attach subscription lists from in-memory publisher for display
    result = []
    for doc in docs:
        name = doc["name"]
        subs = []
        if name in publisher._all_subscribers:
            subs.append("ALL")
        for cat, lst in publisher._subscribers.items():
            if name in lst:
                subs.append(cat)
        received = notif_col.count_documents({"user": name})
        result.append({"name": name, "subscriptions": subs, "received": received})
    return jsonify(result)


@app.route("/api/users", methods=["POST"])
def add_user():
    data = request.json
    name = data.get("name", "").strip()
    if not name:
        return jsonify({"error": "Name required"}), 400
    if users_col.find_one({"name": name}):
        return jsonify({"error": "User already exists"}), 409
    users_col.insert_one({
        "name":          name,
        "subscriptions": [],
        "created_at":    datetime.now().isoformat()
    })
    return jsonify({"message": f"User '{name}' added"}), 201


# ── Subscriptions ──────────────────────────────────────
@app.route("/api/subscribe", methods=["POST"])
def subscribe():
    data     = request.json
    username = data.get("username")
    category = data.get("category", "ALL")
    if not users_col.find_one({"name": username}):
        return jsonify({"error": "User not found"}), 404
    publisher.subscribe(username, category)
    users_col.update_one(
        {"name": username},
        {"$addToSet": {"subscriptions": category}}
    )
    return jsonify({"message": f"'{username}' subscribed to [{category}]"})


@app.route("/api/unsubscribe", methods=["POST"])
def unsubscribe():
    data     = request.json
    username = data.get("username")
    category = data.get("category", "ALL")
    publisher.unsubscribe(username, category)
    users_col.update_one(
        {"name": username},
        {"$pull": {"subscriptions": category}}
    )
    return jsonify({"message": f"'{username}' unsubscribed from [{category}]"})


# ── Publish News ───────────────────────────────────────
@app.route("/api/publish", methods=["POST"])
def publish_news():
    data       = request.json
    notif_type = data.get("type", "Email")
    category   = data.get("category", "Technology")
    message    = data.get("message", "").strip()
    if not message:
        return jsonify({"error": "Message required"}), 400

    # Factory Pattern — create notification object
    notif = NotificationFactory.create(notif_type, message, category)

    # Persist news item
    news_col.insert_one({
        "type":      notif_type,
        "category":  category,
        "message":   message,
        "timestamp": notif.timestamp
    })

    # Observer Pattern — notify relevant users
    notified_users = publisher.get_notified_users(category)
    for username in notified_users:
        notif_col.insert_one({
            "user":      username,
            "type":      notif_type,
            "category":  category,
            "message":   message,
            "timestamp": notif.timestamp,
            "icon":      notif.get_icon()
        })
        # Real browser push notification
        send_browser_push(
            username,
            title=f"{notif.get_icon()} [{notif_type}] {category}",
            body=message
        )

    return jsonify({
        "display":        notif.get_display(),
        "icon":           notif.get_icon(),
        "notified_users": list(notified_users),
        "timestamp":      notif.timestamp
    })


# ── News Feed ──────────────────────────────────────────
@app.route("/api/feed/<username>", methods=["GET"])
def get_feed(username):
    entries = list(notif_col.find({"user": username}, {"_id": 0}))
    return jsonify(entries)


# ── Published News Log ─────────────────────────────────
@app.route("/api/news", methods=["GET"])
def get_news():
    items = list(news_col.find({}, {"_id": 0}).sort("timestamp", -1))
    return jsonify(items)


# ── Stats ──────────────────────────────────────────────
@app.route("/api/stats", methods=["GET"])
def get_stats():
    return jsonify({
        "subscribers": publisher.get_subscriber_count(),
        "published":   news_col.count_documents({})
    })


# ── Web Push subscription storage ─────────────────────
@app.route("/api/push-subscribe", methods=["POST"])
def push_subscribe():
    data         = request.json
    username     = data.get("username")
    subscription = data.get("subscription")
    if not username or not subscription:
        return jsonify({"error": "Missing data"}), 400
    # Upsert: one entry per endpoint per user
    push_subs_col.update_one(
        {"username": username, "subscription.endpoint": subscription["endpoint"]},
        {"$set": {"username": username, "subscription": subscription}},
        upsert=True
    )
    return jsonify({"message": "Push subscription saved"})


@app.route("/api/vapid-public-key", methods=["GET"])
def get_vapid_key():
    return jsonify({"key": VAPID_PUBLIC_KEY})


# ── Config ─────────────────────────────────────────────
@app.route("/api/config", methods=["GET"])
def get_config():
    return jsonify({"categories": CATEGORIES, "notif_types": NOTIF_TYPES})


if __name__ == "__main__":
    app.run(debug=True, port=5000)