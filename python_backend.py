"""Standalone Python backend for the PashuRaksha AI health-check flow."""

import argparse
import hashlib
import hmac
import json
import mimetypes
import re
import secrets
import sqlite3
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from http import cookies
from urllib.parse import unquote, urlparse


DATABASE_PATH = Path(__file__).with_name("python_pashuraksha.sqlite")
SESSIONS: dict[str, int] = {}
SUPPORTED_LANGUAGES = {
    "mr": "Marathi", "hi": "Hindi", "en": "English", "bn": "Bengali",
    "gu": "Gujarati", "kn": "Kannada", "ml": "Malayalam", "or": "Odia",
    "pa": "Punjabi", "ta": "Tamil", "te": "Telugu", "as": "Assamese",
}


def database_connection() -> sqlite3.Connection:
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS health_checks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            animal_name TEXT NOT NULL,
            animal_type TEXT NOT NULL,
            temperature REAL NOT NULL,
            appetite TEXT NOT NULL,
            behavior TEXT NOT NULL,
            symptoms TEXT NOT NULL,
            risk_level TEXT NOT NULL,
            risk_score INTEGER NOT NULL,
            recommendation TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        ;
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE COLLATE NOCASE,
            password_hash TEXT NOT NULL,
            display_name TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        ;
        CREATE TABLE IF NOT EXISTS veterinary_clinics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            clinic_type TEXT NOT NULL,
            address TEXT NOT NULL,
            state TEXT NOT NULL,
            district TEXT NOT NULL,
            locality TEXT NOT NULL,
            phone TEXT,
            opening_info TEXT,
            verified_source TEXT NOT NULL
        )
        """
    )
    columns = {row[1] for row in connection.execute("PRAGMA table_info(users)")}
    profile_columns = {
        "farmer_name": "TEXT",
        "contact_number": "TEXT",
        "address": "TEXT",
        "state": "TEXT",
        "district": "TEXT",
        "locality": "TEXT",
        "pin_code": "TEXT",
        "preferred_language": "TEXT DEFAULT 'mr'",
    }
    for column, definition in profile_columns.items():
        if column not in columns:
            connection.execute(f"ALTER TABLE users ADD COLUMN {column} {definition}")
    health_columns = {row[1] for row in connection.execute("PRAGMA table_info(health_checks)")}
    if "user_id" not in health_columns:
        connection.execute("ALTER TABLE health_checks ADD COLUMN user_id INTEGER")
    connection.commit()
    return connection


def password_hash(password: str, salt: bytes | None = None) -> str:
    actual_salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), actual_salt, 120_000)
    return f"{actual_salt.hex()}${digest.hex()}"


def password_matches(password: str, stored_hash: str) -> bool:
    salt_hex, digest_hex = stored_hash.split("$", 1)
    candidate = password_hash(password, bytes.fromhex(salt_hex)).split("$", 1)[1]
    return hmac.compare_digest(candidate, digest_hex)


def display_name_for(email: str) -> str:
    name = re.sub(r"[._-]+", " ", email.split("@", 1)[0]).strip()
    return " ".join(part.capitalize() for part in name.split()) or "Farmer"


def validate_input(payload: dict) -> dict:
    name = str(payload.get("animalName", "")).strip()
    animal_type = str(payload.get("animalType", "")).strip().lower()
    appetite = str(payload.get("appetite", "")).strip().lower()
    behavior = str(payload.get("behavior", "")).strip().lower()
    symptoms = str(payload.get("symptoms", "")).strip()[:500]

    if not name or len(name) > 80:
        raise ValueError("Animal name is required and must be 80 characters or fewer")
    if not animal_type or len(animal_type) > 30:
        raise ValueError("Animal type is required and must be 30 characters or fewer")
    try:
        temperature = float(payload.get("temperature"))
    except (TypeError, ValueError) as error:
        raise ValueError("Temperature must be a number between 30 and 45 C") from error
    if not 30 <= temperature <= 45:
        raise ValueError("Temperature must be a number between 30 and 45 C")
    if appetite not in {"normal", "reduced", "none"}:
        raise ValueError("Appetite must be normal, reduced, or none")
    if behavior not in {"active", "quiet", "lethargic"}:
        raise ValueError("Behavior must be active, quiet, or lethargic")

    return {
        "animalName": name,
        "animalType": animal_type,
        "temperature": temperature,
        "appetite": appetite,
        "behavior": behavior,
        "symptoms": symptoms,
    }


def calculate_health_result(data: dict) -> dict:
    score = 0
    reasons = []
    if data["temperature"] >= 39.5:
        score += 45
        reasons.append("elevated temperature")
    elif data["temperature"] >= 39:
        score += 20
        reasons.append("slightly elevated temperature")
    if data["appetite"] == "reduced":
        score += 20
        reasons.append("reduced appetite")
    elif data["appetite"] == "none":
        score += 35
        reasons.append("loss of appetite")
    if data["behavior"] == "quiet":
        score += 10
        reasons.append("quiet behavior")
    elif data["behavior"] == "lethargic":
        score += 25
        reasons.append("lethargy")
    if data["symptoms"]:
        score += 20
        reasons.append("reported symptoms")

    risk_level = "High" if score >= 60 else "Medium" if score >= 25 else "Low"
    recommendations = {
        "High": "Contact a veterinarian promptly and keep the animal separated from the herd.",
        "Medium": "Monitor the animal closely and repeat the check within 24 hours.",
        "Low": "Continue routine care and monitor for any changes.",
    }
    return {
        "riskLevel": risk_level,
        "riskScore": min(score, 100),
        "recommendation": recommendations[risk_level],
        "reasons": reasons,
    }


def chat_response(message: str, language: str) -> str:
    normalized = message.lower()
    responses = {
        "en": {
            "health": "Open Health Check and enter the animal's temperature, appetite, behavior, and symptoms. I will assess the risk.",
            "emergency": "A high temperature, severe weakness, or inability to eat needs prompt veterinary attention. Keep the animal separated and contact a veterinarian.",
            "default": "I can help with health checks, symptoms, appetite, temperature, and contacting a veterinarian.",
        },
        "hi": {
            "health": "Health Check खोलें और पशु का तापमान, भूख, व्यवहार और लक्षण भरें। मैं जोखिम का आकलन करूंगा।",
            "emergency": "तेज बुखार, बहुत कमजोरी या खाना न खाना पशु चिकित्सक की तुरंत सहायता मांगता है। पशु को अलग रखें।",
            "default": "मैं स्वास्थ्य जांच, लक्षण, भूख, तापमान और पशु चिकित्सक की सहायता में मदद कर सकता हूं।",
        },
        "ta": {
            "health": "Health Check திறந்து வெப்பநிலை, பசி, நடத்தை மற்றும் அறிகுறிகளை உள்ளிடுங்கள். நான் அபாயத்தை மதிப்பிடுகிறேன்.",
            "emergency": "அதிக காய்ச்சல், கடுமையான பலவீனம் அல்லது உணவு உண்ணாமை இருந்தால் உடனடியாக கால்நடை மருத்துவரை தொடர்பு கொள்ளுங்கள்.",
            "default": "உடல்நல பரிசோதனை, அறிகுறிகள், பசி, வெப்பநிலை மற்றும் கால்நடை உதவியில் நான் உதவ முடியும்.",
        },
        "te": {
            "health": "Health Check తెరిచి ఉష్ణోగ్రత, ఆకలి, ప్రవర్తన మరియు లక్షణాలను నమోదు చేయండి. నేను ప్రమాదాన్ని అంచనా వేస్తాను.",
            "emergency": "అధిక జ్వరం, తీవ్రమైన బలహీనత లేదా ఆహారం తీసుకోకపోతే వెంటనే పశువైద్యుడిని సంప్రదించండి.",
            "default": "ఆరోగ్య పరీక్ష, లక్షణాలు, ఆకలి, ఉష్ణోగ్రత మరియు పశువైద్య సహాయంలో నేను సహాయం చేయగలను.",
        },
        "kn": {
            "health": "Health Check ತೆರೆಯಿರಿ ಮತ್ತು ತಾಪಮಾನ, ಹಸಿವು, ನಡವಳಿಕೆ ಹಾಗೂ ಲಕ್ಷಣಗಳನ್ನು ನಮೂದಿಸಿ. ನಾನು ಅಪಾಯವನ್ನು ಅಂದಾಜಿಸುತ್ತೇನೆ.",
            "emergency": "ಹೆಚ್ಚಿನ ಜ್ವರ, ತೀವ್ರ ದೌರ್ಬಲ್ಯ ಅಥವಾ ಆಹಾರ ಸೇವಿಸದಿರುವುದು ಕಂಡುಬಂದರೆ ತಕ್ಷಣ ಪಶುವೈದ್ಯರನ್ನು ಸಂಪರ್ಕಿಸಿ.",
            "default": "ಆರೋಗ್ಯ ತಪಾಸಣೆ, ಲಕ್ಷಣಗಳು, ಹಸಿವು, ತಾಪಮಾನ ಮತ್ತು ಪಶುವೈದ್ಯರ ಸಹಾಯದಲ್ಲಿ ನಾನು ನೆರವಾಗಬಹುದು.",
        },
        "bn": {
            "health": "Health Check খুলে পশুর তাপমাত্রা, ক্ষুধা, আচরণ এবং উপসর্গ লিখুন। আমি ঝুঁকি মূল্যায়ন করব।",
            "emergency": "উচ্চ জ্বর, অতিরিক্ত দুর্বলতা বা খাবার না খেলে দ্রুত পশুচিকিৎসকের সঙ্গে যোগাযোগ করুন।",
            "default": "আমি স্বাস্থ্য পরীক্ষা, উপসর্গ, ক্ষুধা, তাপমাত্রা এবং পশুচিকিৎসকের সহায়তায় সাহায্য করতে পারি।",
        },
        "mr": {
            "health": "Health Check उघडा आणि प्राण्याचे तापमान, भूक, वर्तन आणि लक्षणे भरा. मी प्राथमिक जोखीम तपासणी करतो.",
            "emergency": "जास्त ताप, तीव्र अशक्तपणा किंवा अन्न न खाणे असल्यास त्वरित पात्र पशुवैद्यकाशी संपर्क करा. प्राण्याला वेगळे ठेवा.",
            "default": "मी आरोग्य तपासणी, लक्षणे, भूक, तापमान आणि पशुवैद्यकीय मदतीबद्दल मार्गदर्शन करू शकतो.",
        },
        "gu": {"health": "Health Check ખોલો અને તાપમાન, ભૂખ, વર્તન અને લક્ષણો દાખલ કરો.", "emergency": "વધુ તાવ અથવા ગંભીર નબળાઈ હોય તો તરત પશુચિકિત્સકનો સંપર્ક કરો.", "default": "હું પ્રાણીની આરોગ્ય તપાસ અને પશુચિકિત્સકની મદદ અંગે માર્ગદર્શન આપી શકું છું."},
        "ml": {"health": "Health Check തുറന്ന് താപനില, വിശപ്പ്, പെരുമാറ്റം, ലക്ഷണങ്ങൾ എന്നിവ നൽകുക.", "emergency": "ഉയർന്ന പനി അല്ലെങ്കിൽ ഗുരുതരമായ ക്ഷീണം ഉണ്ടെങ്കിൽ ഉടൻ മൃഗഡോക്ടറെ ബന്ധപ്പെടുക.", "default": "മൃഗാരോഗ്യ പരിശോധനയിലും മൃഗഡോക്ടറുടെ സഹായത്തിലും ഞാൻ മാർഗനിർദ്ദേശം നൽകാം."},
        "or": {"health": "Health Check ଖୋଲି ତାପମାତ୍ରା, ଭୋକ, ବ୍ୟବହାର ଓ ଲକ୍ଷଣ ଦିଅନ୍ତୁ।", "emergency": "ଅଧିକ ଜ୍ୱର କିମ୍ବା ଗୁରୁତର ଦୁର୍ବଳତା ଥିଲେ ତୁରନ୍ତ ପଶୁ ଡାକ୍ତରଙ୍କୁ ଯୋଗାଯୋଗ କରନ୍ତୁ।", "default": "ମୁଁ ପଶୁ ସ୍ୱାସ୍ଥ୍ୟ ଯାଞ୍ଚ ଓ ପଶୁ ଡାକ୍ତରଙ୍କ ସହାୟତା ବିଷୟରେ କହିପାରିବି।"},
        "pa": {"health": "Health Check ਖੋਲ੍ਹੋ ਅਤੇ ਤਾਪਮਾਨ, ਭੁੱਖ, ਵਿਹਾਰ ਅਤੇ ਲੱਛਣ ਦਰਜ ਕਰੋ।", "emergency": "ਤੇਜ਼ ਬੁਖਾਰ ਜਾਂ ਗੰਭੀਰ ਕਮਜ਼ੋਰੀ ਹੋਵੇ ਤਾਂ ਤੁਰੰਤ ਪਸ਼ੂ ਡਾਕਟਰ ਨਾਲ ਸੰਪਰਕ ਕਰੋ।", "default": "ਮੈਂ ਪਸ਼ੂ ਦੀ ਸਿਹਤ ਜਾਂਚ ਅਤੇ ਪਸ਼ੂ ਡਾਕਟਰ ਦੀ ਮਦਦ ਬਾਰੇ ਦੱਸ ਸਕਦਾ ਹਾਂ।"},
        "as": {"health": "Health Check খুলি উষ্ণতা, ভোক, আচৰণ আৰু লক্ষণ লিখক।", "emergency": "বেছি জ্বৰ বা গুৰুতৰ দুৰ্বলতা থাকিলে সোনকালে পশু চিকিৎসকৰ সৈতে যোগাযোগ কৰক।", "default": "মই পশুৰ স্বাস্থ্য পৰীক্ষা আৰু পশু চিকিৎসকৰ সহায়ৰ বিষয়ে সহায় কৰিব পাৰোঁ।"},
    }
    selected = responses.get(language, responses["en"])
    if any(word in normalized for word in ("fever", "temperature", "health", "check", "बुखार", "तापमान", "ताप", "வெப்ப", "జ్వరం", "తాప", "ತಾಪಮಾನ", "તાવ", "പനി", "ଜ୍ୱର", "ਬੁਖਾਰ")):
        return selected["emergency"] if any(word in normalized for word in ("high", "severe", "उच्च", "तेज", "जास्त", "अधिक", "அதிக", "అధిక", "ಹೆಚ್ಚಿನ", "વધુ", "गंभीर")) else selected["health"]
    return selected["default"]


def save_health_check(user_id: int, data: dict, result: dict) -> int:
    connection = database_connection()
    cursor = connection.execute(
        """
        INSERT INTO health_checks
        (user_id, animal_name, animal_type, temperature, appetite, behavior, symptoms,
         risk_level, risk_score, recommendation, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            user_id, data["animalName"], data["animalType"], data["temperature"],
            data["appetite"], data["behavior"], data["symptoms"],
            result["riskLevel"], result["riskScore"], result["recommendation"],
            datetime.now(timezone.utc).isoformat(),
        ),
    )
    connection.commit()
    record_id = cursor.lastrowid
    connection.close()
    return record_id


class ApiHandler(BaseHTTPRequestHandler):
    def send_json(self, status: int, body: dict | list, cookie: str | None = None) -> None:
        encoded = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        if cookie:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()
        self.wfile.write(encoded)

    def do_GET(self) -> None:
        request_path = urlparse(self.path).path
        if request_path == "/api/health":
            self.send_json(200, {"status": "ok", "backend": "python"})
            return
        if request_path == "/api/auth/session":
            user = self.current_user()
            self.send_json(200, {"authenticated": bool(user), "user": user} if user else {"authenticated": False})
            return
        if request_path == "/api/profile":
            user = self.current_user_record()
            if not user:
                self.send_json(401, {"error": "Authentication required"})
                return
            self.send_json(200, {"profile": dict(user)})
            return
        if request_path == "/api/health-checks":
            user_id = self.current_user_id()
            if not user_id:
                self.send_json(401, {"error": "Authentication required"})
                return
            connection = database_connection()
            records = [dict(row) for row in connection.execute("SELECT * FROM health_checks WHERE user_id = ? ORDER BY id DESC", (user_id,))]
            connection.close()
            self.send_json(200, {"records": records})
            return
        if request_path == "/api/dashboard":
            user_id = self.current_user_id()
            if not user_id:
                self.send_json(401, {"error": "Authentication required"})
                return
            connection = database_connection()
            totals = connection.execute("SELECT COUNT(*) AS total, SUM(risk_level = 'Low') AS healthy, SUM(risk_level = 'Medium') AS medium, SUM(risk_level = 'High') AS high FROM health_checks WHERE user_id = ?", (user_id,)).fetchone()
            reports = [dict(row) for row in connection.execute("SELECT id, animal_name, animal_type, temperature, risk_level, created_at FROM health_checks WHERE user_id = ? ORDER BY created_at DESC LIMIT 8", (user_id,))]
            connection.close()
            total = totals["total"] or 0
            healthy = totals["healthy"] or 0
            medium = totals["medium"] or 0
            high = totals["high"] or 0
            percentage = lambda value: round(value / total * 100) if total else 0
            self.send_json(200, {"stats": {"total": total, "healthy": healthy, "medium": medium, "high": high}, "reports": reports, "chart": {"healthy": percentage(healthy), "medium": percentage(medium), "high": percentage(high)}})
            return
        if request_path == "/api/vets":
            query = urlparse(self.path).query
            filters = dict(item.split("=", 1) for item in query.split("&") if "=" in item)
            connection = database_connection()
            rows = [dict(row) for row in connection.execute("SELECT * FROM veterinary_clinics WHERE (? = '' OR state = ?) AND (? = '' OR district = ?) ORDER BY name", (filters.get("state", ""), filters.get("state", ""), filters.get("district", ""), filters.get("district", "")))]
            connection.close()
            self.send_json(200, {"verified": True, "results": rows, "message": "Only verified clinic records are shown. No matching verified listing is available yet." if not rows else "Verified veterinary listings found."})
            return
        self.serve_frontend(request_path)

    def current_user(self) -> dict | None:
        request_cookies = cookies.SimpleCookie(self.headers.get("Cookie", ""))
        token = request_cookies.get("pashuraksha_session")
        user_id = SESSIONS.get(token.value) if token else None
        if not user_id:
            return None
        connection = database_connection()
        row = connection.execute("SELECT email, display_name, farmer_name, preferred_language FROM users WHERE id = ?", (user_id,)).fetchone()
        connection.close()
        return {"email": row["email"], "displayName": row["farmer_name"] or row["display_name"], "language": row["preferred_language"] or "mr", "profileComplete": bool(row["farmer_name"])} if row else None

    def current_user_id(self) -> int | None:
        request_cookies = cookies.SimpleCookie(self.headers.get("Cookie", ""))
        token = request_cookies.get("pashuraksha_session")
        return SESSIONS.get(token.value) if token else None

    def current_user_record(self) -> sqlite3.Row | None:
        user_id = self.current_user_id()
        if not user_id:
            return None
        connection = database_connection()
        row = connection.execute("SELECT id, email, farmer_name, contact_number, address, state, district, locality, pin_code, preferred_language FROM users WHERE id = ?", (user_id,)).fetchone()
        connection.close()
        return row

    def serve_frontend(self, request_path: str) -> None:
        relative_path = unquote(request_path.lstrip("/")) or "login.html"
        requested_file = (Path(__file__).parent / relative_path).resolve()
        project_root = Path(__file__).parent.resolve()
        if project_root not in requested_file.parents or not requested_file.is_file():
            self.send_json(404, {"error": "Page not found"})
            return
        content = requested_file.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mimetypes.guess_type(requested_file.name)[0] or "application/octet-stream")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def do_POST(self) -> None:
        request_path = urlparse(self.path).path
        if request_path == "/api/profile":
            try:
                user_id = self.current_user_id()
                if not user_id:
                    self.send_json(401, {"error": "Authentication required"})
                    return
                length = int(self.headers.get("Content-Length", "0"))
                payload = json.loads(self.rfile.read(length))
                fields = {key: str(payload.get(key, "")).strip()[:160] for key in ("farmer_name", "contact_number", "address", "state", "district", "locality", "pin_code")}
                language = str(payload.get("preferred_language", "mr")).strip().lower()
                if not fields["farmer_name"] or not fields["contact_number"] or not fields["state"] or not language in SUPPORTED_LANGUAGES:
                    raise ValueError("Name, contact number, state, and preferred language are required.")
                connection = database_connection()
                connection.execute("UPDATE users SET farmer_name = ?, contact_number = ?, address = ?, state = ?, district = ?, locality = ?, pin_code = ?, preferred_language = ? WHERE id = ?", (*fields.values(), language, user_id))
                connection.commit()
                connection.close()
                self.send_json(200, {"ok": True, "profile": fields | {"preferred_language": language}})
            except (ValueError, json.JSONDecodeError) as error:
                self.send_json(400, {"error": str(error)})
            return
        if request_path == "/api/chat":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                payload = json.loads(self.rfile.read(length))
                message = str(payload.get("message", "")).strip()[:500]
                language = str(payload.get("language", "en")).strip().lower()
                if not message:
                    raise ValueError("Please enter or speak a message.")
                if language not in SUPPORTED_LANGUAGES:
                    language = "en"
                self.send_json(200, {"reply": chat_response(message, language), "language": language})
            except (ValueError, json.JSONDecodeError) as error:
                self.send_json(400, {"error": str(error)})
            return
        if request_path == "/api/auth/login":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                payload = json.loads(self.rfile.read(length))
                email = str(payload.get("email", "")).strip().lower()
                password = str(payload.get("password", ""))
                if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email) or not 6 <= len(password) <= 128:
                    raise ValueError("Enter a valid email and a password of at least 6 characters.")
                connection = database_connection()
                user = connection.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
                if user and not password_matches(password, user["password_hash"]):
                    connection.close()
                    self.send_json(401, {"error": "Incorrect email or password."})
                    return
                if not user:
                    name = display_name_for(email)
                    cursor = connection.execute("INSERT INTO users (email, password_hash, display_name, created_at) VALUES (?, ?, ?, ?)", (email, password_hash(password), name, datetime.now(timezone.utc).isoformat()))
                    user_id = cursor.lastrowid
                    display_name = name
                else:
                    user_id = user["id"]
                    display_name = user["display_name"]
                connection.commit()
                connection.close()
                token = secrets.token_urlsafe(32)
                SESSIONS[token] = user_id
                self.send_json(200, {"user": {"email": email, "displayName": display_name}}, f"pashuraksha_session={token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800")
            except (ValueError, json.JSONDecodeError) as error:
                self.send_json(400, {"error": str(error)})
            return
        if request_path == "/api/auth/logout":
            request_cookies = cookies.SimpleCookie(self.headers.get("Cookie", ""))
            token = request_cookies.get("pashuraksha_session")
            if token:
                SESSIONS.pop(token.value, None)
            self.send_json(200, {"ok": True}, "pashuraksha_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0")
            return
        if request_path != "/api/health-checks":
            self.send_json(404, {"error": "API route not found"})
            return
        try:
            user_id = self.current_user_id()
            if not user_id:
                self.send_json(401, {"error": "Authentication required"})
                return
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length))
            data = validate_input(payload)
            result = calculate_health_result(data)
            record_id = save_health_check(user_id, data, result)
            self.send_json(201, {"id": record_id, "input": data, "result": result})
        except (ValueError, json.JSONDecodeError) as error:
            self.send_json(400, {"error": str(error)})

    def log_message(self, format_string: str, *args: object) -> None:
        print(f"[python-backend] {format_string % args}")


def demo() -> None:
    sample = validate_input({
        "animalName": "Gauri",
        "animalType": "cow",
        "temperature": 39.7,
        "appetite": "reduced",
        "behavior": "quiet",
        "symptoms": "Less active than usual",
    })
    result = calculate_health_result(sample)
    print("PashuRaksha Python backend demo")
    print(json.dumps({"input": sample, "result": result}, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the PashuRaksha Python backend")
    parser.add_argument("--demo", action="store_true", help="calculate one sample health check and exit")
    parser.add_argument("--port", type=int, default=5000)
    args = parser.parse_args()
    if args.demo:
        demo()
        return
    database_connection().close()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), ApiHandler)
    print(f"PashuRaksha Python backend running at http://127.0.0.1:{args.port}")
    print("POST health checks to /api/health-checks")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nPython backend stopped")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()