"""Product-wide constants. Keep everything tunable here to prevent drift."""

# Trial & billing
TRIAL_DAYS = 7

# Household seats (primary caregiver + 4 invitees = 5 total)
HOUSEHOLD_MAX_MEMBERS = 5

# Rate limiting — public AI tools
RATE_LIMIT_WINDOW_HOURS = 1
RATE_LIMIT_MAX_PER_IP = 5

# Password reset
PASSWORD_RESET_EXPIRY_MINUTES = 60

# Invite
INVITE_EXPIRY_DAYS = 14

# Digest
DIGEST_FREQUENCY_DEFAULT = "weekly"  # weekly | off

# Notification categories — what the user can opt in/out of
NOTIFICATION_CATEGORIES = [
    "anomaly_alerts",
    "wellbeing_concerns",
    "family_messages",
    "weekly_digest",
    "product_updates",
]

# Default notification preferences (all on)
DEFAULT_NOTIFICATION_PREFS = {c: True for c in NOTIFICATION_CATEGORIES}
