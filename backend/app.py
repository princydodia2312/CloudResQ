from flask import Flask, request, jsonify
from flask_cors import CORS
import boto3
from boto3.dynamodb.conditions import Attr
import os
import json
import uuid
import datetime
import math
import bcrypt
from botocore.exceptions import ClientError
from functools import wraps

from dotenv import load_dotenv
load_dotenv()

app = Flask(__name__)
CORS(app)

AWS_REGION = os.environ.get("AWS_REGION", "ap-south-1")
S3_BUCKET  = os.environ.get("S3_BUCKET",  "disaster-response-uploads")
CLOUDFRONT_URL = os.environ.get("CLOUDFRONT_URL", "")

authority_pw = os.environ.get("AUTHORITY_PASSWORD")
rescue_pw = os.environ.get("RESCUE_PASSWORD")

if not authority_pw or not rescue_pw:
    raise ValueError("FATAL ERROR: AUTHORITY_PASSWORD and RESCUE_PASSWORD must be set in environment variables.")

# Hash passwords at startup — plain text never stored or compared directly
_AUTHORITY_PASSWORD_HASH = bcrypt.hashpw(
    authority_pw.encode(),
    bcrypt.gensalt()
)
_RESCUE_PASSWORD_HASH = bcrypt.hashpw(
    rescue_pw.encode(),
    bcrypt.gensalt()
)

def check_password(plain: str, hashed: bytes) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed)

dynamodb      = boto3.resource("dynamodb", region_name=AWS_REGION)
s3            = boto3.client("s3",         region_name=AWS_REGION)
lambda_client = boto3.client("lambda",     region_name=AWS_REGION)
rekognition   = boto3.client("rekognition", region_name=AWS_REGION)
comprehend    = boto3.client("comprehend",  region_name=AWS_REGION)

def send_realtime_update(message):
    try:
        lambda_client.invoke(
            FunctionName='messageHandler',
            InvocationType='Event',  # async
            Payload=json.dumps({
                "body": json.dumps({
                    "data": message
                })
            })
        )
    except Exception as e:
        print(f"Failed to send realtime update: {e}")

reports_table = dynamodb.Table("DisasterReports")
teams_table   = dynamodb.Table("RescueTeams")
submission_limits_table = dynamodb.Table("submission_limits")


# ─── image validation (Rekognition) ─────────────────────────────────────────

# Weighted keyword tiers — substring-matched against Rekognition labels
# HIGH (3 pts): unmistakable disaster / hazard signals
# MED  (2 pts): strongly suggestive objects / scenes
# LOW  (1 pt):  contextual clues that support a hazard when combined

_HIGH_KEYWORDS = [
    "fire", "smoke", "explosion", "flood", "tornado", "hurricane",
    "earthquake", "wildfire", "landslide", "avalanche", "tsunami",
    "collapse", "demolition", "destruction", "blaze", "inferno",
    "accident", "crash", "collision", "wreck", "ambulance",
    "hazard", "danger", "toxic", "hazmat", "biohazard",
    "emergency", "catastrophe", "disaster", "spill", "blast",
    "lpg", "metro", "derailment", "railway",
]

_MED_KEYWORDS = [
    "ruins", "debris", "rubble", "damage", "broken", "shattered",
    "barrel", "drum", "container", "cylinder", "tank",
    "chemical", "gas", "leak", "spill", "pollution",
    "industrial", "warehouse", "factory", "plant",
    "rescue", "evacuate", "evacuation", "siren",
    "storm", "lightning", "hail", "transport", "aircraft", "train",
    "flyover", "scaffold", "crushed",
]

_LOW_KEYWORDS = [
    "helmet", "hardhat", "worker", "safety", "vest", "protective",
    "crowd", "police", "firefighter", "paramedic", "military",
    "building", "structure", "bridge", "road", "highway",
    "water", "rain", "wind", "cloud",
    "injured", "wound", "blood", "stretcher", "structural",
    "sinkhole", "crack", "wall",
]

HAZARD_PASS_THRESHOLD = 2   # minimum score to accept the image


def is_disaster_image(image_bytes: bytes, min_confidence: float = 70.0) -> bool:
    """Score the image using weighted keyword matching against Rekognition labels.

    Returns True if the cumulative hazard score meets the threshold.
    """
    try:
        response = rekognition.detect_labels(
            Image={"Bytes": image_bytes},
            MaxLabels=30,
            MinConfidence=min_confidence,
        )

        hazard_score = 0
        matched = []

        for label_obj in response.get("Labels", []):
            name = label_obj["Name"].lower()
            conf = label_obj["Confidence"]

            for kw in _HIGH_KEYWORDS:
                if kw in name:
                    hazard_score += 3
                    matched.append(f"{name}(+3, {conf:.0f}%)")
                    break
            else:
                for kw in _MED_KEYWORDS:
                    if kw in name:
                        hazard_score += 2
                        matched.append(f"{name}(+2, {conf:.0f}%)")
                        break
                else:
                    for kw in _LOW_KEYWORDS:
                        if kw in name:
                            hazard_score += 1
                            matched.append(f"{name}(+1, {conf:.0f}%)")
                            break

        all_labels = [f"{l['Name']}({l['Confidence']:.0f}%)"
                      for l in response.get("Labels", [])]
        print(f"REKOGNITION: labels={all_labels}")
        print(f"REKOGNITION: matched={matched}, score={hazard_score}, "
              f"threshold={HAZARD_PASS_THRESHOLD}")

        return hazard_score >= HAZARD_PASS_THRESHOLD

    except ClientError as e:
        # If Rekognition fails, allow the upload rather than blocking users
        print(f"Rekognition error (allowing upload): {e}")
        return True


# ─── description validation (Comprehend) ────────────────────────────────────

# Spam / gibberish indicators — reject immediately if description is ONLY these
_SPAM_PHRASES = [
    "test", "testing", "lol", "haha", "fake", "hello", "hi",
    "asdf", "qwerty", "abc", "xxx", "aaa", "123", "lorem ipsum",
    "just checking", "ignore", "nothing", "n/a", "na", "none",
]

# Disaster-relevance keywords (substring matched) — similar tier approach
_DESC_HIGH_KEYWORDS = [
    "fire", "smoke", "flood", "earthquake", "explosion", "collapse",
    "tornado", "hurricane", "landslide", "tsunami", "cyclone",
    "accident", "crash", "trapped", "injured", "casualt",
    "evacuate", "evacuation", "emergency", "disaster", "hazard",
    "gas leak", "chemical spill", "power outage", "blackout",
    "wildfire", "burning", "destroyed", "devastat",
]

_DESC_MED_KEYWORDS = [
    "damage", "debris", "rubble", "rescue", "relief", "aid",
    "victim", "survivor", "missing", "stranded", "stuck",
    "broken", "crack", "leak", "spill", "overflow",
    "ambulance", "hospital", "medical", "bleed", "wound",
    "danger", "risk", "warning", "alert", "urgent", "critical",
    "water level", "road block", "power line", "fallen tree",
    "building", "bridge", "structure", "roof", "wall",
    "help", "sos", "please send", "need assistance",
]

# Comprehend entity types that support disaster context
_RELEVANT_ENTITY_TYPES = {
    "LOCATION", "EVENT", "DATE", "ORGANIZATION", "QUANTITY",
}

DESC_PASS_THRESHOLD = 2  # minimum relevance score to accept


def is_valid_description(text: str) -> tuple[bool, str]:
    """Validate a report description using keyword matching + AWS Comprehend.

    Returns (is_valid, reason) where reason explains rejection.
    """
    cleaned = text.strip()

    # ── Basic length check ──────────────────────────────────────
    if len(cleaned) < 10:
        return False, "Description is too short. Please provide at least 10 characters."

    lower = cleaned.lower()

    # ── Spam detection ──────────────────────────────────────────
    # Check if the entire description (after stripping) matches a spam phrase
    if lower in _SPAM_PHRASES:
        return False, "Description appears to be spam or a test. Please describe the disaster."

    # Check if description is mostly repeated characters
    unique_chars = set(lower.replace(" ", ""))
    if len(unique_chars) <= 3 and len(cleaned) > 5:
        return False, "Description appears to be gibberish. Please describe the disaster."

    # ── Keyword relevance scoring ───────────────────────────────
    relevance_score = 0
    matched_kw = []

    for kw in _DESC_HIGH_KEYWORDS:
        if kw in lower:
            relevance_score += 3
            matched_kw.append(f"{kw}(+3)")

    for kw in _DESC_MED_KEYWORDS:
        if kw in lower:
            relevance_score += 1
            matched_kw.append(f"{kw}(+1)")

    # ── AWS Comprehend: Sentiment ───────────────────────────────
    sentiment_label = "UNKNOWN"
    try:
        sent_resp = comprehend.detect_sentiment(
            Text=cleaned, LanguageCode="en"
        )
        sentiment_label = sent_resp.get("Sentiment", "UNKNOWN")
        scores = sent_resp.get("SentimentScore", {})

        # Overly positive text is suspicious for a disaster report
        if sentiment_label == "POSITIVE" and scores.get("Positive", 0) > 0.85:
            relevance_score -= 2  # penalise strongly positive text

        # NEGATIVE / MIXED sentiment is expected for disaster reports
        if sentiment_label in ("NEGATIVE", "MIXED"):
            relevance_score += 1

    except ClientError as e:
        print(f"Comprehend sentiment error (skipping): {e}")

    # ── AWS Comprehend: Entities ────────────────────────────────
    entity_bonus = 0
    detected_entities = []
    try:
        ent_resp = comprehend.detect_entities(
            Text=cleaned, LanguageCode="en"
        )
        for ent in ent_resp.get("Entities", []):
            if ent["Type"] in _RELEVANT_ENTITY_TYPES and ent["Score"] > 0.7:
                entity_bonus += 1
                detected_entities.append(f"{ent['Text']}({ent['Type']})")

        # Cap entity bonus at 3 to avoid over-weighting
        relevance_score += min(entity_bonus, 3)

    except ClientError as e:
        print(f"Comprehend entity error (skipping): {e}")

    print(f"COMPREHEND: keywords={matched_kw}, sentiment={sentiment_label}, "
          f"entities={detected_entities}, score={relevance_score}, "
          f"threshold={DESC_PASS_THRESHOLD}")

    if relevance_score >= DESC_PASS_THRESHOLD:
        return True, "ok"

    return False, (
        "Your description does not appear to be related to a disaster or emergency. "
        "Please provide a clear description of the incident."
    )


# ─── helpers ────────────────────────────────────────────────────────────────

def haversine_km(lat1, lon1, lat2, lon2):
    """Return distance in km between two lat/lon points."""
    R = 6371
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi  = math.radians(lat2 - lat1)
    dlam  = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlam/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def find_nearest_teams(lat, lon, limit=3):
    """Return up to `limit` available teams sorted by distance."""
    try:
        resp  = teams_table.scan(FilterExpression=Attr("available").eq(True))
        teams = resp.get("Items", [])
        print(f"DEBUG: Found {len(teams)} available teams")
        for t in teams:
            if t.get("latitude") and t.get("longitude"):
                t["distance_km"] = round(
                    haversine_km(float(lat), float(lon),
                                 float(t["latitude"]), float(t["longitude"])), 2)
            else:
                t["distance_km"] = 9999
        return sorted(teams, key=lambda x: x["distance_km"])[:limit]
    except ClientError:
        return []


def auto_assign_nearest(report_id, lat, lon):
    """For critical reports: assign closest available team automatically."""
    nearest = find_nearest_teams(lat, lon, limit=1)
    if not nearest:
        return None
    team = nearest[0]
    team_id   = team["id"]
    team_name = team["name"]
    try:
        reports_table.update_item(
            Key={"id": report_id},
            UpdateExpression="SET #s = :s, assigned_team_id = :tid, assigned_team_name = :tn, assigned_at = :at",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={
                ":s":  "assigned",
                ":tid": team_id,
                ":tn":  team_name,
                ":at":  datetime.datetime.utcnow().isoformat()
            }
        )
        teams_table.update_item(
            Key={"id": team_id},
            UpdateExpression="SET available = :f, current_incident = :rid",
            ExpressionAttributeValues={":f": False, ":rid": report_id}
        )
        return team_name
    except ClientError:
        return None


# ─── rate limiting (DynamoDB) ────────────────────────────────────────────────

def get_rate_limit_info(identifier, today):
    """Return the rate limit data (daily and burst) for a given identifier."""
    try:
        response = submission_limits_table.get_item(
            Key={'identifier': identifier, 'date': today}
        )
        return response.get('Item', {})
    except ClientError as e:
        print(f"DynamoDB error (get_rate_limit_info): {e}")
        return {}

def increment_submission(identifier, today, reset_burst=False):
    """
    Increment submission count. 
    If reset_burst is True, start a new 5-min window.
    Otherwise, increment burst_count in current window.
    """
    now = datetime.datetime.utcnow()
    now_iso = now.isoformat()
    
    update_exp = "SET #c = if_not_exists(#c, :start) + :inc, last_submission = :now"
    attr_names = {'#c': 'count'}
    attr_vals = {':inc': 1, ':start': 0, ':now': now_iso}

    if reset_burst:
        # Start new burst window
        reset_time = (now + datetime.timedelta(minutes=5)).isoformat()
        update_exp += ", burst_count = :one, burst_reset_time = :reset"
        attr_vals[':one'] = 1
        attr_vals[':reset'] = reset_time
    else:
        # Increment within current window
        update_exp += ", burst_count = if_not_exists(burst_count, :start) + :inc"

    try:
        submission_limits_table.update_item(
            Key={'identifier': identifier, 'date': today},
            UpdateExpression=update_exp,
            ExpressionAttributeNames=attr_names,
            ExpressionAttributeValues=attr_vals
        )
    except ClientError as e:
        print(f"DynamoDB error (increment_submission): {e}")


# ─── auth (simple token check via header) ───────────────────────────────────

def require_role(role):
    def decorator(f):
        @wraps(f)
        def wrapped(*args, **kwargs):
            token = request.headers.get("X-Role-Token", "")
            if role == "authority" and not check_password(token, _AUTHORITY_PASSWORD_HASH):
                return jsonify({"error": "Unauthorized"}), 401
            if role == "rescue" and not check_password(token, _RESCUE_PASSWORD_HASH):
                return jsonify({"error": "Unauthorized"}), 401
            return f(*args, **kwargs)
        return wrapped
    return decorator


# ─── auth endpoint ───────────────────────────────────────────────────────────

@app.route("/api/auth/login", methods=["POST"])
def login():
    data     = request.get_json()
    role     = data.get("role")
    password = data.get("password")
    team_id  = data.get("team_id")   # only for rescue teams

    if role == "authority" and check_password(password, _AUTHORITY_PASSWORD_HASH):
        # Return the plain password as the token so frontend can send it in headers
        # It is verified via bcrypt on every subsequent request
        return jsonify({"success": True, "role": "authority", "token": password})

    if role == "rescue":
        import sys
        raw_pwd = os.environ.get("RESCUE_PASSWORD")
        pwd_match = check_password(password, _RESCUE_PASSWORD_HASH) or (password == raw_pwd)
        sys.stderr.write(f"DEBUG: Login Attempt - Role: rescue, Team: {team_id}, PwdMatch: {pwd_match}\n")
        sys.stderr.flush()
        
        if not pwd_match:
            return jsonify({"error": "Wrong password"}), 401
        try:
            resp = teams_table.get_item(Key={"id": team_id})
            team = resp.get("Item")
            if not team:
                return jsonify({"error": "Team not found"}), 404
            return jsonify({"success": True, "role": "rescue",
                            "token": password, "team": team})
        except ClientError as e:
            return jsonify({"error": str(e)}), 500

    return jsonify({"error": "Invalid credentials"}), 401


# ─── health ──────────────────────────────────────────────────────────────────

@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "services": {"db": "DynamoDB", "storage": "S3"}})


# ─── reports (public) ────────────────────────────────────────────────────────

@app.route("/api/reports", methods=["POST"])
def create_report():
    data  = request.form
    image = request.files.get("image")

    # ── Rate limiting ────────────────────────────────────────────
    identifier = data.get("reporter_phone") or request.remote_addr
    today = datetime.datetime.utcnow().date().isoformat()
    now_iso = datetime.datetime.utcnow().isoformat()

    rl_data = get_rate_limit_info(identifier, today)
    daily_count = rl_data.get('count', 0)
    burst_count = rl_data.get('burst_count', 0)
    burst_reset = rl_data.get('burst_reset_time', "")

    # 1. Daily Limit Check
    if daily_count >= 10:
        return jsonify({"error": "Daily report limit reached. Please try again tomorrow."}), 429
    
    # 2. Burst Limit Check
    reset_burst = False
    if not burst_reset or now_iso > burst_reset:
        reset_burst = True
    elif burst_count >= 5:
        return jsonify({"error": "You're reporting too fast. Please wait 5 minutes."}), 429

    for field in ["disaster_type", "location", "severity", "description"]:
        if not data.get(field):
            return jsonify({"error": f"'{field}' is required"}), 400

    # ── Comprehend description validation ────────────────────────
    desc_valid, desc_reason = is_valid_description(data.get("description", ""))
    if not desc_valid:
        return jsonify({"error": desc_reason}), 400

    report_id = str(uuid.uuid4())[:8].upper()
    image_url = None

    if image and image.filename:
        # ── Rekognition validation ───────────────────────────────
        image_bytes = image.read()
        image.seek(0)  # reset pointer so S3 upload can re-read the stream

        if not is_disaster_image(image_bytes):
            return jsonify({
                "error": "The uploaded image does not appear to be related "
                         "to a disaster. Please upload a relevant photo."
            }), 400

        # ── S3 upload ────────────────────────────────────────────
        ext = image.filename.rsplit(".", 1)[-1].lower()
        s3_key = f"uploads/{report_id}.{ext}"
        try:
            s3.upload_fileobj(image, S3_BUCKET, s3_key,
                              ExtraArgs={"ContentType": image.content_type})
            if CLOUDFRONT_URL:
                image_url = f"https://{CLOUDFRONT_URL}/{s3_key}"
            else:
                image_url = f"https://{S3_BUCKET}.s3.{AWS_REGION}.amazonaws.com/{s3_key}"
        except ClientError as e:
            print(f"S3 upload error: {e}")

    item = {
        "id":               report_id,
        "disaster_type":    data.get("disaster_type"),
        "location":         data.get("location"),
        "latitude":         data.get("latitude", ""),
        "longitude":        data.get("longitude", ""),
        "description":      data.get("description"),
        "severity":         data.get("severity"),
        "reporter_name":    data.get("reporter_name", "Anonymous"),
        "reporter_phone":   data.get("reporter_phone", ""),
        "status":           "pending",
        "image_url":        image_url or "",
        "assigned_team_id":   "",
        "assigned_team_name": "",
        "assigned_at":        "",
        "created_at":       datetime.datetime.utcnow().isoformat()
    }

    try:
        reports_table.put_item(Item=item)
        # Increment the counts only after successful report creation
        increment_submission(identifier, today, reset_burst=reset_burst)
    except ClientError as e:
        return jsonify({"error": str(e)}), 500

    # Auto-assign for critical reports if coordinates are provided
    assigned_team = None
    severity = data.get("severity", "").lower()
    
    # Robust coordinate check
    lat_raw = data.get("latitude")
    lon_raw = data.get("longitude")
    
    if severity == "critical" and lat_raw and lon_raw:
        try:
            lat = float(lat_raw)
            lon = float(lon_raw)
            print(f"DEBUG: Triggering auto-assign for {report_id} at {lat}, {lon}")
            assigned_team = auto_assign_nearest(report_id, lat, lon)
            print(f"DEBUG: Auto-assign result: {assigned_team}")
        except ValueError:
            print(f"DEBUG: Skipping auto-assign - Invalid coordinates: {lat_raw}, {lon_raw}")

    # Send real-time update via WebSocket API
    if severity in ["high", "critical"]:
        send_realtime_update({
            "type": "DISASTER_ALERT",
            "severity": severity.upper(),
            "location": data.get("location", "Unknown location"),
            "message": f"{str(data.get('disaster_type', 'Emergency')).replace('_', ' ').title()} reported",
            "target": "authority"
        })

    return jsonify({
        "message":       "Report submitted successfully",
        "report_id":     report_id,
        "status":        "assigned" if assigned_team else "pending",
        "assigned_team": assigned_team
    }), 201


@app.route("/api/reports/<report_id>", methods=["GET"])
def get_report(report_id):
    try:
        resp = reports_table.get_item(Key={"id": report_id})
        item = resp.get("Item")
        if not item:
            return jsonify({"error": "Report not found"}), 404
        return jsonify(item)
    except ClientError as e:
        return jsonify({"error": str(e)}), 500


# ─── reports (authority only) ────────────────────────────────────────────────

@app.route("/api/reports", methods=["GET"])
@require_role("authority")
def get_reports():
    status_filter = request.args.get("status")
    try:
        if status_filter:
            resp = reports_table.scan(
                FilterExpression=Attr("status").eq(status_filter))
        else:
            resp = reports_table.scan()
        reports = sorted(resp.get("Items", []),
                         key=lambda x: x.get("created_at", ""), reverse=True)
        return jsonify(reports)
    except ClientError as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/reports/<report_id>/assign", methods=["POST"])
@require_role("authority")
def assign_team(report_id):
    """Authority manually assigns a rescue team to a report."""
    data    = request.get_json()
    team_id = data.get("team_id")
    if not team_id:
        return jsonify({"error": "team_id is required"}), 400
    try:
        team_resp = teams_table.get_item(Key={"id": team_id})
        team = team_resp.get("Item")
        if not team:
            return jsonify({"error": "Team not found"}), 404

        reports_table.update_item(
            Key={"id": report_id},
            UpdateExpression="SET #s = :s, assigned_team_id = :tid, assigned_team_name = :tn, assigned_at = :at",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={
                ":s":  "assigned",
                ":tid": team_id,
                ":tn":  team["name"],
                ":at":  datetime.datetime.utcnow().isoformat()
            }
        )
        teams_table.update_item(
            Key={"id": team_id},
            UpdateExpression="SET available = :f, current_incident = :rid",
            ExpressionAttributeValues={":f": False, ":rid": report_id}
        )
        return jsonify({"message": f"Team {team['name']} assigned to {report_id}"})
    except ClientError as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/reports/<report_id>/status", methods=["PATCH"])
@require_role("authority")
def update_status(report_id):
    data       = request.get_json()
    new_status = data.get("status")
    if new_status not in ["pending", "assigned", "active", "resolved"]:
        return jsonify({"error": "Invalid status"}), 400
    try:
        reports_table.update_item(
            Key={"id": report_id},
            UpdateExpression="SET #s = :s",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={":s": new_status}
        )
        return jsonify({"message": "Status updated", "status": new_status})
    except ClientError as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/reports/<report_id>/nearby-teams", methods=["GET"])
@require_role("authority")
def nearby_teams(report_id):
    """Return 3 nearest available teams for a given report."""
    try:
        resp   = reports_table.get_item(Key={"id": report_id})
        report = resp.get("Item")
        if not report:
            return jsonify({"error": "Report not found"}), 404
        lat = report.get("latitude")
        lon = report.get("longitude")
        if not lat or not lon:
            return jsonify({"error": "Report has no coordinates"}), 400
        teams = find_nearest_teams(float(lat), float(lon), limit=5)
        return jsonify(teams)
    except ClientError as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/stats", methods=["GET"])
@require_role("authority")
def get_stats():
    try:
        resp    = reports_table.scan()
        reports = resp.get("Items", [])
        total    = len(reports)
        pending  = sum(1 for r in reports if r.get("status") == "pending")
        assigned = sum(1 for r in reports if r.get("status") == "assigned")
        active   = sum(1 for r in reports if r.get("status") == "active")
        resolved = sum(1 for r in reports if r.get("status") == "resolved")
        type_counts = {}
        for r in reports:
            t = r.get("disaster_type", "other")
            type_counts[t] = type_counts.get(t, 0) + 1
        return jsonify({"total": total, "pending": pending, "assigned": assigned,
                        "active": active, "resolved": resolved,
                        "by_type": [{"disaster_type": k, "count": v}
                                    for k, v in type_counts.items()]})
    except ClientError as e:
        return jsonify({"error": str(e)}), 500


# ─── rescue teams ────────────────────────────────────────────────────────────

@app.route("/api/teams", methods=["GET"])
@require_role("authority")
def get_teams():
    try:
        resp = teams_table.scan()
        return jsonify(resp.get("Items", []))
    except ClientError as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/teams", methods=["POST"])
@require_role("authority")
def create_team():
    data = request.get_json()
    for field in ["name", "area"]:
        if not data.get(field):
            return jsonify({"error": f"'{field}' is required"}), 400
    team = {
        "id":               str(uuid.uuid4())[:8].upper(),
        "name":             data["name"],
        "area":             data["area"],
        "phone":            data.get("phone", ""),
        "latitude":         data.get("latitude", ""),
        "longitude":        data.get("longitude", ""),
        "available":        True,
        "current_incident": "",
        "created_at":       datetime.datetime.utcnow().isoformat()
    }
    try:
        teams_table.put_item(Item=team)
        return jsonify({"message": "Team created", "team": team}), 201
    except ClientError as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/teams/<team_id>/location", methods=["PATCH"])
@require_role("rescue")
def update_team_location(team_id):
    """Rescue team app calls this to update their GPS coordinates."""
    data = request.get_json()
    lat  = data.get("latitude")
    lon  = data.get("longitude")
    if not lat or not lon:
        return jsonify({"error": "latitude and longitude required"}), 400
    try:
        teams_table.update_item(
            Key={"id": team_id},
            UpdateExpression="SET latitude = :lat, longitude = :lon",
            ExpressionAttributeValues={":lat": str(lat), ":lon": str(lon)}
        )
        return jsonify({"message": "Location updated"})
    except ClientError as e:
        return jsonify({"error": str(e)}), 500


# ─── rescue team incident endpoints ──────────────────────────────────────────

@app.route("/api/teams/<team_id>/incidents", methods=["GET"])
@require_role("rescue")
def get_team_incidents(team_id):
    """All reports assigned to this specific team."""
    try:
        resp = reports_table.scan(
            FilterExpression=Attr("assigned_team_id").eq(team_id))
        reports = sorted(resp.get("Items", []),
                         key=lambda x: x.get("created_at", ""), reverse=True)
        return jsonify(reports)
    except ClientError as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/teams/<team_id>/incidents/<report_id>/accept", methods=["POST"])
@require_role("rescue")
def accept_incident(team_id, report_id):
    """Rescue team confirms they are en route — moves status to active."""
    try:
        reports_table.update_item(
            Key={"id": report_id},
            UpdateExpression="SET #s = :s",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={":s": "active"}
        )
        return jsonify({"message": "Incident accepted, status → active"})
    except ClientError as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/teams/<team_id>/incidents/<report_id>/resolve", methods=["POST"])
@require_role("rescue")
def resolve_incident(team_id, report_id):
    """Rescue team marks the incident as resolved and frees themselves."""
    try:
        reports_table.update_item(
            Key={"id": report_id},
            UpdateExpression="SET #s = :s",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={":s": "resolved"}
        )
        teams_table.update_item(
            Key={"id": team_id},
            UpdateExpression="SET available = :t, current_incident = :empty",
            ExpressionAttributeValues={":t": True, ":empty": ""}
        )
        return jsonify({"message": "Incident resolved, team is now available"})
    except ClientError as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)