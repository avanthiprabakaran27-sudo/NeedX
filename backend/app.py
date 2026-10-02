from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import (
    JWTManager,
    create_access_token,
    jwt_required,
    get_jwt_identity
)
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, timedelta
from math import radians, sin, cos, sqrt, atan2
import re
import os


# ============================================================
# NEEDX - ADVANCED REAL-WORLD SERVICE MATCHING BACKEND
# ============================================================

app = Flask(__name__)

# ------------------------------------------------------------
# CONFIGURATION
# ------------------------------------------------------------

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
DATABASE_PATH = os.path.join(BASE_DIR, "needx.db")

app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{DATABASE_PATH}"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

# Development JWT secret.
# For production deployment, move this to an environment variable.
app.config["JWT_SECRET_KEY"] = os.environ.get(
    "NEEDX_JWT_SECRET",
    "NeedX-Advanced-Production-Secret-2026"
)

app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(days=7)

db = SQLAlchemy(app)
jwt = JWTManager(app)

CORS(
    app,
    resources={
        r"/api/*": {
            "origins": "*"
        }
    }
)


# ============================================================
# HELPER FUNCTIONS
# ============================================================

def now():
    return datetime.utcnow()


def clean_text(value):
    if value is None:
        return ""
    return str(value).strip()


def safe_float(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def safe_int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def error_response(message, status=400):
    return jsonify({
        "success": False,
        "message": message
    }), status


def success_response(data=None, message="Success", status=200):
    response = {
        "success": True,
        "message": message
    }

    if data is not None:
        response["data"] = data

    return jsonify(response), status


def calculate_distance(lat1, lon1, lat2, lon2):
    """
    Calculate distance between two coordinates using Haversine formula.
    Result is returned in kilometers.
    """

    try:
        lat1 = radians(float(lat1))
        lon1 = radians(float(lon1))
        lat2 = radians(float(lat2))
        lon2 = radians(float(lon2))

        dlat = lat2 - lat1
        dlon = lon2 - lon1

        a = (
            sin(dlat / 2) ** 2
            + cos(lat1)
            * cos(lat2)
            * sin(dlon / 2) ** 2
        )

        c = 2 * atan2(sqrt(a), sqrt(1 - a))

        return round(6371.0 * c, 2)

    except Exception:
        return None


def normalize_words(text):
    text = clean_text(text).lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    return set(text.split())


def analyze_need(text):
    """
    Lightweight local NLP-style classification engine.

    It intentionally does not pretend to be a remote generative AI model.
    The engine extracts:
        - category
        - problem
        - service type
        - urgency
        - keywords
    """

    original = clean_text(text)
    lowered = original.lower()

    categories = {
        "mobile_repair": [
            "phone",
            "mobile",
            "iphone",
            "android",
            "screen",
            "display",
            "battery",
            "charging",
            "speaker",
            "camera",
            "mobile repair"
        ],

        "computer_repair": [
            "laptop",
            "computer",
            "pc",
            "keyboard",
            "windows",
            "monitor",
            "software",
            "format",
            "virus",
            "printer"
        ],

        "home_repair": [
            "plumber",
            "plumbing",
            "pipe",
            "tap",
            "water",
            "leak",
            "electrician",
            "electric",
            "wiring",
            "fan",
            "light",
            "ac",
            "air conditioner"
        ],

        "vehicle_service": [
            "bike",
            "motorcycle",
            "scooter",
            "car",
            "vehicle",
            "tyre",
            "tire",
            "engine",
            "oil",
            "service",
            "puncture"
        ],

        "cleaning": [
            "cleaning",
            "clean",
            "house cleaning",
            "deep clean",
            "bathroom",
            "sofa",
            "carpet"
        ],

        "beauty": [
            "hair",
            "salon",
            "beauty",
            "makeup",
            "parlour",
            "parlor",
            "facial"
        ],

        "education": [
            "tuition",
            "teacher",
            "class",
            "course",
            "maths",
            "mathematics",
            "coding",
            "python",
            "java",
            "english"
        ],

        "delivery": [
            "delivery",
            "parcel",
            "courier",
            "pickup",
            "transport"
        ],

        "other": []
    }

    scores = {}

    for category, keywords in categories.items():
        score = 0

        for keyword in keywords:
            if keyword in lowered:
                score += 1

        scores[category] = score

    selected_category = max(
        scores,
        key=scores.get
    )

    if scores[selected_category] == 0:
        selected_category = "other"

    urgency_keywords = [
        "urgent",
        "emergency",
        "immediately",
        "now",
        "asap",
        "today",
        "critical"
    ]

    urgency = "normal"

    if any(word in lowered for word in urgency_keywords):
        urgency = "high"

    problem = original

    service_map = {
        "mobile_repair": "Mobile Repair",
        "computer_repair": "Computer / Laptop Repair",
        "home_repair": "Home Repair",
        "vehicle_service": "Vehicle Service",
        "cleaning": "Cleaning Service",
        "beauty": "Beauty Service",
        "education": "Education / Tutoring",
        "delivery": "Delivery / Courier",
        "other": "General Service"
    }

    return {
        "original_text": original,
        "category": selected_category,
        "service_type": service_map[selected_category],
        "problem": problem,
        "urgency": urgency,
        "keywords": list(normalize_words(original)),
        "category_scores": scores
    }


def provider_to_dict(provider, user_lat=None, user_lng=None):
    distance = None

    if (
        user_lat is not None
        and user_lng is not None
        and provider.latitude is not None
        and provider.longitude is not None
    ):
        distance = calculate_distance(
            user_lat,
            user_lng,
            provider.latitude,
            provider.longitude
        )

    return {
        "id": provider.id,
        "name": provider.name,
        "business_name": provider.business_name,
        "category": provider.category,
        "services": provider.services.split(",") if provider.services else [],
        "description": provider.description,
        "phone": provider.phone,
        "email": provider.email,
        "address": provider.address,
        "city": provider.city,
        "state": provider.state,
        "latitude": provider.latitude,
        "longitude": provider.longitude,
        "rating": round(provider.rating, 2),
        "review_count": provider.review_count,
        "starting_price": provider.starting_price,
        "max_price": provider.max_price,
        "estimated_hours": provider.estimated_hours,
        "availability": provider.availability,
        "verified": provider.verified,
        "featured": provider.featured,
        "distance_km": distance,
        "created_at": provider.created_at.isoformat()
        if provider.created_at else None
    }


def calculate_match_score(
    provider,
    category,
    user_lat=None,
    user_lng=None,
    max_budget=None
):
    score = 0.0

    # Category relevance - 35%
    if provider.category == category:
        score += 35

    # Rating - 20%
    score += min(provider.rating / 5.0, 1.0) * 20

    # Verification - 10%
    if provider.verified:
        score += 10

    # Availability - 10%
    if provider.availability.lower() in [
        "available",
        "open",
        "available today"
    ]:
        score += 10

    # Featured quality signal - 5%
    if provider.featured:
        score += 5

    # Distance - 15%
    if user_lat is not None and user_lng is not None:
        distance = calculate_distance(
            user_lat,
            user_lng,
            provider.latitude,
            provider.longitude
        )

        if distance is not None:
            if distance <= 2:
                score += 15
            elif distance <= 5:
                score += 12
            elif distance <= 10:
                score += 9
            elif distance <= 20:
                score += 5
            else:
                score += 2

    # Budget compatibility - 5%
    if max_budget is not None:
        if provider.starting_price <= max_budget:
            score += 5
        elif provider.starting_price <= max_budget * 1.2:
            score += 2

    return round(min(score, 100), 2)


# ============================================================
# DATABASE MODELS
# ============================================================

class User(db.Model):

    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)

    name = db.Column(
        db.String(120),
        nullable=False
    )

    email = db.Column(
        db.String(180),
        unique=True,
        nullable=False,
        index=True
    )

    password_hash = db.Column(
        db.String(255),
        nullable=False
    )

    phone = db.Column(
        db.String(30),
        nullable=True
    )

    role = db.Column(
        db.String(30),
        default="customer"
    )

    city = db.Column(
        db.String(100),
        nullable=True
    )

    state = db.Column(
        db.String(100),
        nullable=True
    )

    latitude = db.Column(
        db.Float,
        nullable=True
    )

    longitude = db.Column(
        db.Float,
        nullable=True
    )

    created_at = db.Column(
        db.DateTime,
        default=now
    )

    active = db.Column(
        db.Boolean,
        default=True
    )

    bookings = db.relationship(
        "Booking",
        backref="customer",
        lazy=True,
        foreign_keys="Booking.customer_id"
    )

    reviews = db.relationship(
        "Review",
        backref="customer",
        lazy=True
    )


class Provider(db.Model):

    __tablename__ = "providers"

    id = db.Column(
        db.Integer,
        primary_key=True
    )

    user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id"),
        nullable=True
    )

    name = db.Column(
        db.String(120),
        nullable=False
    )

    business_name = db.Column(
        db.String(180),
        nullable=False
    )

    category = db.Column(
        db.String(100),
        nullable=False,
        index=True
    )

    services = db.Column(
        db.Text,
        nullable=True
    )

    description = db.Column(
        db.Text,
        nullable=True
    )

    phone = db.Column(
        db.String(30),
        nullable=True
    )

    email = db.Column(
        db.String(180),
        nullable=True
    )

    address = db.Column(
        db.String(255),
        nullable=True
    )

    city = db.Column(
        db.String(100),
        nullable=True,
        index=True
    )

    state = db.Column(
        db.String(100),
        nullable=True
    )

    latitude = db.Column(
        db.Float,
        nullable=True
    )

    longitude = db.Column(
        db.Float,
        nullable=True
    )

    rating = db.Column(
        db.Float,
        default=0.0
    )

    review_count = db.Column(
        db.Integer,
        default=0
    )

    starting_price = db.Column(
        db.Float,
        default=0.0
    )

    max_price = db.Column(
        db.Float,
        default=0.0
    )

    estimated_hours = db.Column(
        db.Float,
        default=24
    )

    availability = db.Column(
        db.String(100),
        default="Available"
    )

    verified = db.Column(
        db.Boolean,
        default=False
    )

    featured = db.Column(
        db.Boolean,
        default=False
    )

    created_at = db.Column(
        db.DateTime,
        default=now
    )

    active = db.Column(
        db.Boolean,
        default=True
    )

    bookings = db.relationship(
        "Booking",
        backref="provider",
        lazy=True
    )


class Booking(db.Model):

    __tablename__ = "bookings"

    id = db.Column(
        db.Integer,
        primary_key=True
    )

    customer_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id"),
        nullable=False
    )

    provider_id = db.Column(
        db.Integer,
        db.ForeignKey("providers.id"),
        nullable=False
    )

    need_text = db.Column(
        db.Text,
        nullable=False
    )

    category = db.Column(
        db.String(100),
        nullable=False
    )

    problem = db.Column(
        db.Text,
        nullable=True
    )

    quoted_price = db.Column(
        db.Float,
        nullable=True
    )

    scheduled_at = db.Column(
        db.DateTime,
        nullable=True
    )

    status = db.Column(
        db.String(40),
        default="requested"
    )

    customer_note = db.Column(
        db.Text,
        nullable=True
    )

    provider_note = db.Column(
        db.Text,
        nullable=True
    )

    created_at = db.Column(
        db.DateTime,
        default=now
    )

    updated_at = db.Column(
        db.DateTime,
        default=now,
        onupdate=now
    )


class Review(db.Model):

    __tablename__ = "reviews"

    id = db.Column(
        db.Integer,
        primary_key=True
    )

    customer_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id"),
        nullable=False
    )

    provider_id = db.Column(
        db.Integer,
        db.ForeignKey("providers.id"),
        nullable=False
    )

    booking_id = db.Column(
        db.Integer,
        db.ForeignKey("bookings.id"),
        nullable=True
    )

    rating = db.Column(
        db.Float,
        nullable=False
    )

    comment = db.Column(
        db.Text,
        nullable=True
    )

    created_at = db.Column(
        db.DateTime,
        default=now
    )


class SavedProvider(db.Model):

    __tablename__ = "saved_providers"

    id = db.Column(
        db.Integer,
        primary_key=True
    )

    user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id"),
        nullable=False
    )

    provider_id = db.Column(
        db.Integer,
        db.ForeignKey("providers.id"),
        nullable=False
    )

    created_at = db.Column(
        db.DateTime,
        default=now
    )


class Notification(db.Model):

    __tablename__ = "notifications"

    id = db.Column(
        db.Integer,
        primary_key=True
    )

    user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id"),
        nullable=False
    )

    title = db.Column(
        db.String(180),
        nullable=False
    )

    message = db.Column(
        db.Text,
        nullable=False
    )

    notification_type = db.Column(
        db.String(50),
        default="general"
    )

    is_read = db.Column(
        db.Boolean,
        default=False
    )

    created_at = db.Column(
        db.DateTime,
        default=now
    )


# ============================================================
# AUTHENTICATION
# ============================================================

@app.route("/api/auth/register", methods=["POST"])
def register():

    data = request.get_json(silent=True) or {}

    name = clean_text(data.get("name"))
    email = clean_text(data.get("email")).lower()
    password = clean_text(data.get("password"))
    phone = clean_text(data.get("phone"))
    role = clean_text(data.get("role", "customer")).lower()

    if not name:
        return error_response("Name is required")

    if not email:
        return error_response("Email is required")

    if not password or len(password) < 6:
        return error_response(
            "Password must contain at least 6 characters"
        )

    if role not in ["customer", "provider"]:
        role = "customer"

    existing = User.query.filter_by(email=email).first()

    if existing:
        return error_response(
            "An account with this email already exists",
            409
        )

    user = User(
        name=name,
        email=email,
        password_hash=generate_password_hash(password),
        phone=phone,
        role=role,
        city=clean_text(data.get("city")),
        state=clean_text(data.get("state")),
        latitude=safe_float(data.get("latitude"))
        if data.get("latitude") is not None else None,
        longitude=safe_float(data.get("longitude"))
        if data.get("longitude") is not None else None
    )

    db.session.add(user)
    db.session.commit()

    token = create_access_token(
        identity=str(user.id),
        additional_claims={
            "role": user.role
        }
    )

    return success_response(
        {
            "token": token,
            "user": {
                "id": user.id,
                "name": user.name,
                "email": user.email,
                "role": user.role
            }
        },
        "Account created successfully",
        201
    )


@app.route("/api/auth/login", methods=["POST"])
def login():

    data = request.get_json(silent=True) or {}

    email = clean_text(data.get("email")).lower()
    password = clean_text(data.get("password"))

    user = User.query.filter_by(email=email).first()

    if not user:
        return error_response(
            "Invalid email or password",
            401
        )

    if not check_password_hash(
        user.password_hash,
        password
    ):
        return error_response(
            "Invalid email or password",
            401
        )

    if not user.active:
        return error_response(
            "Account is inactive",
            403
        )

    token = create_access_token(
        identity=str(user.id),
        additional_claims={
            "role": user.role
        }
    )

    return success_response(
        {
            "token": token,
            "user": {
                "id": user.id,
                "name": user.name,
                "email": user.email,
                "role": user.role,
                "phone": user.phone,
                "city": user.city,
                "state": user.state
            }
        },
        "Login successful"
    )


@app.route("/api/auth/me", methods=["GET"])
@jwt_required()
def current_user():

    user_id = int(get_jwt_identity())

    user = db.session.get(User, user_id)

    if not user:
        return error_response(
            "User not found",
            404
        )

    return success_response({
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "phone": user.phone,
        "role": user.role,
        "city": user.city,
        "state": user.state,
        "latitude": user.latitude,
        "longitude": user.longitude
    })


# ============================================================
# PROFILE
# ============================================================

@app.route("/api/profile", methods=["PUT"])
@jwt_required()
def update_profile():

    user_id = int(get_jwt_identity())

    user = db.session.get(User, user_id)

    if not user:
        return error_response(
            "User not found",
            404
        )

    data = request.get_json(silent=True) or {}

    if "name" in data:
        user.name = clean_text(data["name"])

    if "phone" in data:
        user.phone = clean_text(data["phone"])

    if "city" in data:
        user.city = clean_text(data["city"])

    if "state" in data:
        user.state = clean_text(data["state"])

    if "latitude" in data:
        user.latitude = safe_float(data["latitude"])

    if "longitude" in data:
        user.longitude = safe_float(data["longitude"])

    db.session.commit()

    return success_response(
        {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "phone": user.phone,
            "city": user.city,
            "state": user.state,
            "latitude": user.latitude,
            "longitude": user.longitude
        },
        "Profile updated"
    )


# ============================================================
# NEED ANALYSIS
# ============================================================

@app.route("/api/needs/analyze", methods=["POST"])
def analyze_need_api():

    data = request.get_json(silent=True) or {}

    text = clean_text(data.get("need"))

    if not text:
        return error_response(
            "Please describe what you need"
        )

    result = analyze_need(text)

    return success_response(
        result,
        "Need analyzed successfully"
    )


# ============================================================
# PROVIDER SEARCH / SMART MATCHING
# ============================================================

@app.route("/api/providers", methods=["GET"])
def get_providers():

    query = Provider.query.filter_by(active=True)

    category = clean_text(
        request.args.get("category")
    )

    city = clean_text(
        request.args.get("city")
    )

    search = clean_text(
        request.args.get("search")
    )

    verified_only = (
        request.args.get(
            "verified",
            "false"
        ).lower() == "true"
    )

    min_rating = safe_float(
        request.args.get("min_rating"),
        0
    )

    max_price = request.args.get(
        "max_price"
    )

    if category:
        query = query.filter(
            Provider.category == category
        )

    if city:
        query = query.filter(
            Provider.city.ilike(
                f"%{city}%"
            )
        )

    if verified_only:
        query = query.filter(
            Provider.verified.is_(True)
        )

    if min_rating:
        query = query.filter(
            Provider.rating >= min_rating
        )

    if max_price:
        query = query.filter(
            Provider.starting_price <= safe_float(
                max_price
            )
        )

    providers = query.all()

    if search:
        search_lower = search.lower()

        providers = [
            p for p in providers
            if (
                search_lower in p.name.lower()
                or search_lower in p.business_name.lower()
                or search_lower in (p.services or "").lower()
                or search_lower in (p.description or "").lower()
            )
        ]

    user_lat = request.args.get("latitude")
    user_lng = request.args.get("longitude")

    user_lat = (
        safe_float(user_lat)
        if user_lat is not None
        else None
    )

    user_lng = (
        safe_float(user_lng)
        if user_lng is not None
        else None
    )

    sort_by = clean_text(
        request.args.get(
            "sort",
            "recommended"
        )
    ).lower()

    provider_data = [
        provider_to_dict(
            p,
            user_lat,
            user_lng
        )
        for p in providers
    ]

    if sort_by == "price":
        provider_data.sort(
            key=lambda x: x["starting_price"]
        )

    elif sort_by == "rating":
        provider_data.sort(
            key=lambda x: x["rating"],
            reverse=True
        )

    elif sort_by == "distance":
        provider_data.sort(
            key=lambda x: (
                x["distance_km"]
                if x["distance_km"] is not None
                else 999999
            )
        )

    else:
        provider_data.sort(
            key=lambda x: (
                x["verified"],
                x["featured"],
                x["rating"],
                x["review_count"]
            ),
            reverse=True
        )

    return success_response(
        {
            "count": len(provider_data),
            "providers": provider_data
        }
    )


@app.route("/api/providers/<int:provider_id>", methods=["GET"])
def get_provider(provider_id):

    provider = db.session.get(
        Provider,
        provider_id
    )

    if not provider or not provider.active:
        return error_response(
            "Provider not found",
            404
        )

    user_lat = request.args.get("latitude")
    user_lng = request.args.get("longitude")

    return success_response(
        provider_to_dict(
            provider,
            safe_float(user_lat)
            if user_lat else None,
            safe_float(user_lng)
            if user_lng else None
        )
    )


@app.route("/api/match", methods=["POST"])
def smart_match():

    data = request.get_json(silent=True) or {}

    need = clean_text(data.get("need"))

    if not need:
        return error_response("Please describe your need")

    analysis = analyze_need(need)
    category = analysis["category"]

    user_lat = (
        safe_float(data.get("latitude"))
        if data.get("latitude") is not None
        else None
    )

    user_lng = (
        safe_float(data.get("longitude"))
        if data.get("longitude") is not None
        else None
    )

    max_budget = (
        safe_float(data.get("max_budget"))
        if data.get("max_budget") is not None
        else None
    )

    # Only return providers belonging to the detected service category.
    providers = Provider.query.filter_by(
        active=True,
        category=category
    ).all()

    matches = []

    for provider in providers:
        score = calculate_match_score(
            provider,
            category,
            user_lat,
            user_lng,
            max_budget
        )

        item = provider_to_dict(
            provider,
            user_lat,
            user_lng
        )

        item["match_score"] = score
        matches.append(item)

    matches.sort(
        key=lambda x: (
            x["match_score"],
            x["rating"],
            x["review_count"]
        ),
        reverse=True
    )

    return success_response(
        {
            "analysis": analysis,
            "matches": matches[:20],
            "count": len(matches)
        },
        "Smart matching completed"
    )


# ============================================================
# PROVIDER REGISTRATION
# ============================================================

@app.route("/api/providers/register", methods=["POST"])
@jwt_required()
def register_provider():

    user_id = int(get_jwt_identity())

    user = db.session.get(
        User,
        user_id
    )

    if not user:
        return error_response(
            "User not found",
            404
        )

    data = request.get_json(silent=True) or {}

    required = [
        "business_name",
        "category"
    ]

    for field in required:
        if not clean_text(data.get(field)):
            return error_response(
                f"{field} is required"
            )

    provider = Provider(
        user_id=user.id,
        name=user.name,
        business_name=clean_text(
            data.get("business_name")
        ),
        category=clean_text(
            data.get("category")
        ),
        services=clean_text(
            data.get("services")
        ),
        description=clean_text(
            data.get("description")
        ),
        phone=clean_text(
            data.get("phone", user.phone)
        ),
        email=user.email,
        address=clean_text(
            data.get("address")
        ),
        city=clean_text(
            data.get("city", user.city)
        ),
        state=clean_text(
            data.get("state", user.state)
        ),
        latitude=(
            safe_float(data.get("latitude"))
            if data.get("latitude") is not None
            else None
        ),
        longitude=(
            safe_float(data.get("longitude"))
            if data.get("longitude") is not None
            else None
        ),
        starting_price=safe_float(
            data.get("starting_price"),
            0
        ),
        max_price=safe_float(
            data.get("max_price"),
            0
        ),
        estimated_hours=safe_float(
            data.get("estimated_hours"),
            24
        ),
        availability=clean_text(
            data.get(
                "availability",
                "Available"
            )
        ),
        verified=False
    )

    db.session.add(provider)

    user.role = "provider"

    db.session.commit()

    return success_response(
        provider_to_dict(provider),
        "Provider profile created. Verification is pending.",
        201
    )


# ============================================================
# BOOKING / REQUEST
# ============================================================

@app.route("/api/bookings", methods=["POST"])
@jwt_required()
def create_booking():

    user_id = int(get_jwt_identity())

    data = request.get_json(silent=True) or {}

    provider_id = safe_int(
        data.get("provider_id")
    )

    need = clean_text(
        data.get("need")
    )

    if not provider_id:
        return error_response(
            "Provider ID is required"
        )

    if not need:
        return error_response(
            "Need description is required"
        )

    provider = db.session.get(
        Provider,
        provider_id
    )

    if not provider or not provider.active:
        return error_response(
            "Provider not found",
            404
        )

    analysis = analyze_need(need)

    scheduled_at = None

    scheduled_text = clean_text(
        data.get("scheduled_at")
    )

    if scheduled_text:

        try:
            scheduled_at = datetime.fromisoformat(
                scheduled_text.replace(
                    "Z",
                    ""
                )
            )

        except ValueError:
            return error_response(
                "Invalid scheduled_at format"
            )

    booking = Booking(
        customer_id=user_id,
        provider_id=provider.id,
        need_text=need,
        category=analysis["category"],
        problem=analysis["problem"],
        quoted_price=(
            safe_float(data.get("quoted_price"))
            if data.get("quoted_price") is not None
            else provider.starting_price
        ),
        scheduled_at=scheduled_at,
        status="requested",
        customer_note=clean_text(
            data.get("customer_note")
        )
    )

    db.session.add(booking)
    db.session.flush()

    notification = Notification(
        user_id=provider.user_id
        if provider.user_id
        else user_id,
        title="New NeedX Request",
        message=(
            f"New service request for "
            f"{provider.business_name}"
        ),
        notification_type="booking"
    )

    db.session.add(notification)

    db.session.commit()

    return success_response(
        {
            "booking_id": booking.id,
            "status": booking.status,
            "provider": provider_to_dict(
                provider
            ),
            "category": booking.category
        },
        "Service request created successfully",
        201
    )


@app.route("/api/bookings", methods=["GET"])
@jwt_required()
def get_bookings():

    user_id = int(get_jwt_identity())

    user = db.session.get(
        User,
        user_id
    )

    if not user:
        return error_response(
            "User not found",
            404
        )

    if user.role == "provider":

        providers = Provider.query.filter_by(
            user_id=user.id
        ).all()

        provider_ids = [
            p.id for p in providers
        ]

        bookings = Booking.query.filter(
            Booking.provider_id.in_(provider_ids)
        ).order_by(
            Booking.created_at.desc()
        ).all()

    else:

        bookings = Booking.query.filter_by(
            customer_id=user.id
        ).order_by(
            Booking.created_at.desc()
        ).all()

    results = []

    for booking in bookings:

        results.append({
            "id": booking.id,
            "provider_id": booking.provider_id,
            "provider_name": booking.provider.business_name
            if booking.provider else None,
            "customer_id": booking.customer_id,
            "need": booking.need_text,
            "category": booking.category,
            "problem": booking.problem,
            "quoted_price": booking.quoted_price,
            "scheduled_at": (
                booking.scheduled_at.isoformat()
                if booking.scheduled_at
                else None
            ),
            "status": booking.status,
            "customer_note": booking.customer_note,
            "provider_note": booking.provider_note,
            "created_at": booking.created_at.isoformat()
        })

    return success_response(results)


@app.route("/api/bookings/<int:booking_id>", methods=["GET"])
@jwt_required()
def get_booking(booking_id):

    user_id = int(get_jwt_identity())

    booking = db.session.get(
        Booking,
        booking_id
    )

    if not booking:
        return error_response(
            "Booking not found",
            404
        )

    provider_user_id = (
        booking.provider.user_id
        if booking.provider
        else None
    )

    if (
        booking.customer_id != user_id
        and provider_user_id != user_id
    ):
        return error_response(
            "Access denied",
            403
        )

    return success_response({
        "id": booking.id,
        "need": booking.need_text,
        "category": booking.category,
        "problem": booking.problem,
        "quoted_price": booking.quoted_price,
        "scheduled_at": (
            booking.scheduled_at.isoformat()
            if booking.scheduled_at
            else None
        ),
        "status": booking.status,
        "customer_note": booking.customer_note,
        "provider_note": booking.provider_note,
        "provider": (
            provider_to_dict(
                booking.provider
            )
            if booking.provider
            else None
        ),
        "created_at": booking.created_at.isoformat(),
        "updated_at": booking.updated_at.isoformat()
        if booking.updated_at else None
    })


@app.route("/api/bookings/<int:booking_id>/status", methods=["PUT"])
@jwt_required()
def update_booking_status(booking_id):

    user_id = int(get_jwt_identity())

    booking = db.session.get(
        Booking,
        booking_id
    )

    if not booking:
        return error_response(
            "Booking not found",
            404
        )

    provider_user_id = (
        booking.provider.user_id
        if booking.provider
        else None
    )

    if (
        booking.customer_id != user_id
        and provider_user_id != user_id
    ):
        return error_response(
            "Access denied",
            403
        )

    data = request.get_json(silent=True) or {}

    new_status = clean_text(
        data.get("status")
    ).lower()

    allowed_statuses = [
        "requested",
        "accepted",
        "rejected",
        "confirmed",
        "in_progress",
        "completed",
        "cancelled"
    ]

    if new_status not in allowed_statuses:
        return error_response(
            "Invalid booking status"
        )

    booking.status = new_status

    if "provider_note" in data:
        booking.provider_note = clean_text(
            data["provider_note"]
        )

    if "quoted_price" in data:
        booking.quoted_price = safe_float(
            data["quoted_price"]
        )

    db.session.add(
        Notification(
            user_id=booking.customer_id,
            title="Booking Updated",
            message=(
                f"Your NeedX request "
                f"#{booking.id} is now "
                f"{new_status.replace('_', ' ')}."
            ),
            notification_type="booking"
        )
    )

    db.session.commit()

    return success_response(
        {
            "booking_id": booking.id,
            "status": booking.status
        },
        "Booking status updated"
    )


# ============================================================
# REVIEWS
# ============================================================

@app.route("/api/providers/<int:provider_id>/reviews", methods=["GET"])
def get_reviews(provider_id):

    reviews = Review.query.filter_by(
        provider_id=provider_id
    ).order_by(
        Review.created_at.desc()
    ).all()

    results = []

    for review in reviews:

        results.append({
            "id": review.id,
            "rating": review.rating,
            "comment": review.comment,
            "customer_name": (
                review.customer.name
                if review.customer
                else "Customer"
            ),
            "created_at": review.created_at.isoformat()
        })

    return success_response(results)


@app.route("/api/providers/<int:provider_id>/reviews", methods=["POST"])
@jwt_required()
def create_review(provider_id):

    user_id = int(get_jwt_identity())

    data = request.get_json(silent=True) or {}

    rating = safe_float(
        data.get("rating")
    )

    comment = clean_text(
        data.get("comment")
    )

    if rating < 1 or rating > 5:
        return error_response(
            "Rating must be between 1 and 5"
        )

    provider = db.session.get(
        Provider,
        provider_id
    )

    if not provider:
        return error_response(
            "Provider not found",
            404
        )

    existing = Review.query.filter_by(
        customer_id=user_id,
        provider_id=provider_id
    ).first()

    if existing:
        return error_response(
            "You have already reviewed this provider"
        )

    review = Review(
        customer_id=user_id,
        provider_id=provider_id,
        rating=rating,
        comment=comment,
        booking_id=data.get("booking_id")
    )

    db.session.add(review)

    provider_reviews = Review.query.filter_by(
        provider_id=provider_id
    ).all()

    total_rating = sum(
        r.rating for r in provider_reviews
    ) + rating

    total_count = len(provider_reviews) + 1

    provider.rating = round(
        total_rating / total_count,
        2
    )

    provider.review_count = total_count

    db.session.commit()

    return success_response(
        {
            "rating": provider.rating,
            "review_count": provider.review_count
        },
        "Review submitted",
        201
    )


# ============================================================
# SAVED PROVIDERS
# ============================================================

@app.route("/api/saved-providers", methods=["GET"])
@jwt_required()
def get_saved_providers():

    user_id = int(get_jwt_identity())

    saved = SavedProvider.query.filter_by(
        user_id=user_id
    ).all()

    providers = []

    for item in saved:

        provider = db.session.get(
            Provider,
            item.provider_id
        )

        if provider:
            providers.append(
                provider_to_dict(provider)
            )

    return success_response(providers)


@app.route("/api/saved-providers/<int:provider_id>", methods=["POST"])
@jwt_required()
def save_provider(provider_id):

    user_id = int(get_jwt_identity())

    provider = db.session.get(
        Provider,
        provider_id
    )

    if not provider:
        return error_response(
            "Provider not found",
            404
        )

    existing = SavedProvider.query.filter_by(
        user_id=user_id,
        provider_id=provider_id
    ).first()

    if existing:
        return success_response(
            None,
            "Provider already saved"
        )

    saved = SavedProvider(
        user_id=user_id,
        provider_id=provider_id
    )

    db.session.add(saved)
    db.session.commit()

    return success_response(
        None,
        "Provider saved"
    )


@app.route("/api/saved-providers/<int:provider_id>", methods=["DELETE"])
@jwt_required()
def remove_saved_provider(provider_id):

    user_id = int(get_jwt_identity())

    saved = SavedProvider.query.filter_by(
        user_id=user_id,
        provider_id=provider_id
    ).first()

    if not saved:
        return error_response(
            "Saved provider not found",
            404
        )

    db.session.delete(saved)
    db.session.commit()

    return success_response(
        None,
        "Provider removed from saved list"
    )


# ============================================================
# NOTIFICATIONS
# ============================================================

@app.route("/api/notifications", methods=["GET"])
@jwt_required()
def get_notifications():

    user_id = int(get_jwt_identity())

    notifications = Notification.query.filter_by(
        user_id=user_id
    ).order_by(
        Notification.created_at.desc()
    ).limit(50).all()

    results = []

    for item in notifications:

        results.append({
            "id": item.id,
            "title": item.title,
            "message": item.message,
            "type": item.notification_type,
            "is_read": item.is_read,
            "created_at": item.created_at.isoformat()
        })

    return success_response(results)


@app.route(
    "/api/notifications/<int:notification_id>/read",
    methods=["PUT"]
)
@jwt_required()
def mark_notification_read(notification_id):

    user_id = int(get_jwt_identity())

    notification = db.session.get(
        Notification,
        notification_id
    )

    if not notification:
        return error_response(
            "Notification not found",
            404
        )

    if notification.user_id != user_id:
        return error_response(
            "Access denied",
            403
        )

    notification.is_read = True

    db.session.commit()

    return success_response(
        None,
        "Notification marked as read"
    )


# ============================================================
# CUSTOMER DASHBOARD
# ============================================================

@app.route("/api/dashboard", methods=["GET"])
@jwt_required()
def dashboard():

    user_id = int(get_jwt_identity())

    user = db.session.get(
        User,
        user_id
    )

    if not user:
        return error_response(
            "User not found",
            404
        )

    total_bookings = Booking.query.filter_by(
        customer_id=user_id
    ).count()

    active_bookings = Booking.query.filter(
        Booking.customer_id == user_id,
        Booking.status.in_([
            "requested",
            "accepted",
            "confirmed",
            "in_progress"
        ])
    ).count()

    completed_bookings = Booking.query.filter(
        Booking.customer_id == user_id,
        Booking.status == "completed"
    ).count()

    saved_count = SavedProvider.query.filter_by(
        user_id=user_id
    ).count()

    unread_notifications = Notification.query.filter_by(
        user_id=user_id,
        is_read=False
    ).count()

    return success_response({
        "user": {
            "name": user.name,
            "role": user.role
        },
        "statistics": {
            "total_bookings": total_bookings,
            "active_bookings": active_bookings,
            "completed_bookings": completed_bookings,
            "saved_providers": saved_count,
            "unread_notifications": unread_notifications
        }
    })


# ============================================================
# ADMIN DASHBOARD
# ============================================================

@app.route("/api/admin/stats", methods=["GET"])
@jwt_required()
def admin_stats():

    user_id = int(get_jwt_identity())

    user = db.session.get(
        User,
        user_id
    )

    if not user or user.role != "admin":
        return error_response(
            "Admin access required",
            403
        )

    return success_response({
        "users": User.query.count(),
        "customers": User.query.filter_by(
            role="customer"
        ).count(),
        "providers": Provider.query.count(),
        "verified_providers": Provider.query.filter_by(
            verified=True
        ).count(),
        "bookings": Booking.query.count(),
        "completed_bookings": Booking.query.filter_by(
            status="completed"
        ).count(),
        "reviews": Review.query.count(),
        "saved_providers": SavedProvider.query.count()
    })


# ============================================================
# HEALTH CHECK
# ============================================================

@app.route("/api/health", methods=["GET"])
def health():

    return success_response({
        "application": "NeedX",
        "version": "1.0.0",
        "status": "online",
        "database": "connected",
        "timestamp": now().isoformat()
    })


# ============================================================
# DATABASE SEED DATA
# ============================================================

def seed_demo_data():

    # Create demo customer
    demo_customer = User.query.filter_by(
        email="demo@needx.app"
    ).first()

    if not demo_customer:

        demo_customer = User(
            name="NeedX Demo User",
            email="demo@needx.app",
            password_hash=generate_password_hash(
                "NeedX@123"
            ),
            phone="9999999999",
            role="customer",
            city="Tirunelveli",
            state="Tamil Nadu"
        )

        db.session.add(
            demo_customer
        )

    # Create demo providers
    demo_providers = [
        {
            "name": "Arun Kumar",
            "business_name": "SmartFix Mobile Care",
            "category": "mobile_repair",
            "services": "iPhone Repair,Screen Replacement,Battery Replacement,Charging Port Repair",
            "description": "Professional smartphone repair service with device diagnostics and replacement support.",
            "phone": "9876543210",
            "email": "smartfix@needx.app",
            "address": "Main Road",
            "city": "Tirunelveli",
            "state": "Tamil Nadu",
            "latitude": 8.7139,
            "longitude": 77.7567,
            "rating": 4.7,
            "review_count": 128,
            "starting_price": 799,
            "max_price": 6500,
            "estimated_hours": 4,
            "availability": "Available Today",
            "verified": True,
            "featured": True
        },
        {
            "name": "Suresh",
            "business_name": "TechCare Laptop Solutions",
            "category": "computer_repair",
            "services": "Laptop Repair,Windows Installation,SSD Upgrade,Data Recovery",
            "description": "Laptop and computer diagnostics, upgrades and software services.",
            "phone": "9876501234",
            "email": "techcare@needx.app",
            "address": "Market Road",
            "city": "Tirunelveli",
            "state": "Tamil Nadu",
            "latitude": 8.7290,
            "longitude": 77.7490,
            "rating": 4.6,
            "review_count": 94,
            "starting_price": 499,
            "max_price": 5000,
            "estimated_hours": 6,
            "availability": "Available",
            "verified": True,
            "featured": True
        },
        {
            "name": "Rajesh",
            "business_name": "QuickHome Services",
            "category": "home_repair",
            "services": "Plumbing,Electrical,Fan Repair,Light Installation",
            "description": "Home maintenance services with doorstep support.",
            "phone": "9988776655",
            "email": "quickhome@needx.app",
            "address": "Palayamkottai",
            "city": "Tirunelveli",
            "state": "Tamil Nadu",
            "latitude": 8.7145,
            "longitude": 77.7385,
            "rating": 4.5,
            "review_count": 76,
            "starting_price": 300,
            "max_price": 3000,
            "estimated_hours": 3,
            "availability": "Available Today",
            "verified": True,
            "featured": False
        },
        {
            "name": "Vijay",
            "business_name": "Pro Bike Care",
            "category": "vehicle_service",
            "services": "Bike Service,Oil Change,Puncture,Brake Service",
            "description": "Two-wheeler servicing and doorstep assistance.",
            "phone": "9898989898",
            "email": "probike@needx.app",
            "address": "High Ground",
            "city": "Tirunelveli",
            "state": "Tamil Nadu",
            "latitude": 8.7350,
            "longitude": 77.7600,
            "rating": 4.4,
            "review_count": 61,
            "starting_price": 350,
            "max_price": 2500,
            "estimated_hours": 4,
            "availability": "Available",
            "verified": True,
            "featured": False
        },
        {
            "name": "Meena",
            "business_name": "FreshHome Cleaning",
            "category": "cleaning",
            "services": "Home Cleaning,Deep Cleaning,Sofa Cleaning,Bathroom Cleaning",
            "description": "Professional residential cleaning and deep cleaning services.",
            "phone": "9777766666",
            "email": "freshhome@needx.app",
            "address": "Junction",
            "city": "Tirunelveli",
            "state": "Tamil Nadu",
            "latitude": 8.7180,
            "longitude": 77.7300,
            "rating": 4.8,
            "review_count": 142,
            "starting_price": 699,
            "max_price": 5000,
            "estimated_hours": 5,
            "availability": "Available Today",
            "verified": True,
            "featured": True
        }
    ]

    for item in demo_providers:

        exists = Provider.query.filter_by(
            business_name=item["business_name"]
        ).first()

        if not exists:

            provider = Provider(
                name=item["name"],
                business_name=item["business_name"],
                category=item["category"],
                services=item["services"],
                description=item["description"],
                phone=item["phone"],
                email=item["email"],
                address=item["address"],
                city=item["city"],
                state=item["state"],
                latitude=item["latitude"],
                longitude=item["longitude"],
                rating=item["rating"],
                review_count=item["review_count"],
                starting_price=item["starting_price"],
                max_price=item["max_price"],
                estimated_hours=item["estimated_hours"],
                availability=item["availability"],
                verified=item["verified"],
                featured=item["featured"]
            )

            db.session.add(provider)

    db.session.commit()


# ============================================================
# ERROR HANDLERS
# ============================================================

@app.errorhandler(404)
def not_found(error):

    return jsonify({
        "success": False,
        "message": "API endpoint not found"
    }), 404


@app.errorhandler(500)
def internal_error(error):

    db.session.rollback()

    return jsonify({
        "success": False,
        "message": "Internal server error"
    }), 500


# ============================================================
# APPLICATION STARTUP
# ============================================================

with app.app_context():

    db.create_all()

    seed_demo_data()


if __name__ == "__main__":

    print("=" * 60)
    print("NEEDX ADVANCED SERVICE MATCHING PLATFORM")
    print("=" * 60)
    print("Backend: Flask")
    print("Database: SQLite")
    print("Authentication: JWT")
    print("API: REST")
    print("Status: Starting...")
    print("=" * 60)

    app.run(
        host="0.0.0.0",
        port=5000,
        debug=True
    )