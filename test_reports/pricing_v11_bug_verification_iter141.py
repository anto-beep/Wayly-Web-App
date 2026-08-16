"""
Pricing v11 bug verification test case (iteration 141).
Executed via MCP browser automation against:
https://mobile-exact-parity.preview.emergentagent.com/pricing

Scope: top pricing cards only; lower comparison table intentionally excluded per review request.
"""

EXPECTED = {
    "guest": {
        "solo_cta": "Start 7-day free trial",
        "family_cta": "Start 7-day free trial",
        "adviser_cta": "Talk to us",
    },
    "logged_in": {
        "solo_cta": "Buy Solo",
        "family_cta": "Buy Family",
        "adviser_cta": "Talk to us",
    },
    "cards": {
        "solo": {
            "price": "$24.50",
            "cadence": "per fortnight",
            "tagline": "For the family member handling things alone.",
            "required_phrases": [
                "All nine Wayly tools",
                "Statement Decoder for monthly statements",
                "Invoice Checker for contribution invoices",
                "Budget Calculator with forecast alerts",
                "Ask Wayly conversational assistant",
                "Data stays in Australia",
                "Billed every 14 days · 26 charges a year · $637 a year",
            ],
        },
        "family": {
            "price": "$49.50",
            "cadence": "per fortnight",
            "tagline": "For families sharing the load.",
            "required_phrases": [
                "Everything in Solo",
                "Two full participants: shared care plan, statements, invoices, decisions",
                "Three caregiver seats",
                "Family Coordinator with notification routing",
                "Additional participants at $24.50 per fortnight each",
                "Billed every 14 days · 26 charges a year · $1,287 a year",
            ],
        },
        "adviser": {
            "price": "$699",
            "cadence": "per month",
            "tagline": "financial advisers and aged care specialists",
            "required_phrases": [
                "Up to 20 client households",
                "Adviser dashboard with client summary views",
                "Scenario modeller",
                "Branded PDF exports for client meetings",
                "Monthly billing · GST inclusive",
            ],
        },
    },
    "forbidden_top_card_phrases": [
        "$27", "$299", "Unlimited Statement Decoder", "All 9 AI Tools",
        "Priority support response within one business day",
        "1 participant, 1 caregiver seat",
        "Billed monthly · Cancel anytime · AUD inc. GST",
    ],
}

# This file records the deterministic checklist used by browser automation.
