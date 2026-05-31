#!/usr/bin/env python3
"""
Patch Nginx to route /login & /register to frontend (NOT backend) for web UI.
/api/auth/* already routes to frontend via existing config.
"""

import re

path = "/etc/nginx/sites-available/issuer.identia.my.id"

with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# Add map block after upstreams if not already present
if "map $request_method $auth_login_upstream" not in content:
    insert_after = "upstream issuer_frontend {\n    server 127.0.0.1:3000;\n    keepalive 32;\n}\n\n"
    if insert_after in content:
        # Remove old map if exists
        content = re.sub(
            r'map \$request_method \$auth_login_upstream \{[^}]*\}\n\n',
            '',
            content
        )
        # Then add fresh map
        content = content.replace(insert_after, insert_after)

# Find and replace the auth location block
# Pattern: search for "# ── 2.5 Auth Endpoints" and replace until "# ── 2.6 or # ── 3"
start_marker = "    # ── 2.5 Auth Endpoints"
end_marker = "    # ── 2.6 OID4VCI Auth"

pattern = re.compile(
    re.escape(start_marker) + r"[\s\S]*?" + re.escape(end_marker),
    re.DOTALL
)

replacement = """    # ── 2.5 Auth & Login Routes -> Frontend port 3000 ────────
    # /login and /register are ALWAYS frontend (GET for UI, POST for /api/auth/)
    # They are NOT backend endpoints for web admin UI
    location ~ ^/(login|register)(/|$) {
        proxy_pass         http://issuer_frontend;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade           $http_upgrade;
        proxy_set_header   Connection        "upgrade";
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $http_x_forwarded_proto;
        proxy_set_header   X-Forwarded-Host  $host;
        proxy_hide_header  X-Powered-By;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout    30s;
        proxy_connect_timeout 10s;
    }

    # ── 2.6 OID4VCI Auth"""

if pattern.search(content):
    content = pattern.sub(replacement, content, count=1)
    print("✅ Patched /login & /register to route to frontend")
else:
    # Fallback: just add it before "# ── 3"
    fallback_marker = "    # ── 3. OID4VCI Public Endpoints -> Backend port 3001"
    if fallback_marker in content:
        new_block = """    # ── 2.5 Auth & Login Routes -> Frontend port 3000 ────────
    # /login and /register are ALWAYS frontend (GET for UI, POST for /api/auth/)
    location ~ ^/(login|register)(/|$) {
        proxy_pass         http://issuer_frontend;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade           $http_upgrade;
        proxy_set_header   Connection        "upgrade";
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $http_x_forwarded_proto;
        proxy_set_header   X-Forwarded-Host  $host;
        proxy_hide_header  X-Powered-By;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout    30s;
        proxy_connect_timeout 10s;
    }

    # ── 2.6 OID4VCI Auth (direct backend calls) ──────────────
    # /authorize and /oid4vci/authorize for wallet OAuth flow
    location ~ ^/(authorize|bootstrap|oid4vci/authorize)(/|$) {
        proxy_pass         http://issuer_backend;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade           $http_upgrade;
        proxy_set_header   Connection        "upgrade";
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $http_x_forwarded_proto;
        proxy_set_header   X-Forwarded-Host  $host;
        proxy_hide_header  X-Powered-By;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout    86400s;
        proxy_connect_timeout 60s;
        proxy_send_timeout    60s;
        proxy_buffering       off;
        client_max_body_size  10m;
    }

    """
        content = content.replace(fallback_marker, new_block + fallback_marker)
        print("✅ Added /login & /register route (fallback)")
    else:
        raise SystemExit("Could not find insertion point in Nginx config")

with open(path, "w", encoding="utf-8") as f:
    f.write(content)
