#!/usr/bin/env python3
"""Mint the Sign in with Apple WEB client secret for Supabase.

Usage: mint_apple_secret.py <path-to-AuthKey.p8> <KEY_ID> <TEAM_ID>

Emits an ES256 JWT valid ~179 days (Apple's max is 6 months). Paste the
output into Supabase -> Auth -> Providers -> Apple -> Secret Key (OAuth).
Rotation chore: rerun this before expiry; web sign-in dies quietly at
expiry with invalid_client while the iOS app keeps working.
"""
import sys
import time

import jwt

SERVICES_ID = "com.aweapp.awe.web"

p8_path, key_id, team_id = sys.argv[1], sys.argv[2], sys.argv[3]
with open(p8_path) as f:
    private_key = f.read()

now = int(time.time())
token = jwt.encode(
    {
        "iss": team_id,
        "iat": now,
        "exp": now + 179 * 24 * 3600,
        "aud": "https://appleid.apple.com",
        "sub": SERVICES_ID,
    },
    private_key,
    algorithm="ES256",
    headers={"kid": key_id},
)
print(token)
