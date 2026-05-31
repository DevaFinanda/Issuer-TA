#!/usr/bin/env python3
"""
Fix Nginx config to add auth endpoints location block
"""

content = open('/etc/nginx/sites-available/issuer.identia.my.id').read()
marker = '    # ── 3. OID4VCI Public Endpoints -> Backend port 3001'

if marker in content and '# ── 2.5 Auth Endpoints' not in content:
    auth = """    # ── 2.5 Auth Endpoints -> Backend port 3001 ──────────────
    # Login, register, authorize, bootstrap flows
    location ~ ^/(login|register|authorize|bootstrap|oid4vci/authorize)(\/|$) {
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
    content = content.replace(marker, auth + marker)
    open('/etc/nginx/sites-available/issuer.identia.my.id', 'w').write(content)
    print("✅ Auth endpoints location block added successfully")
else:
    if '# ── 2.5 Auth Endpoints' in content:
        print("ℹ️  Already patched")
    else:
        print("⚠️  Marker not found - nginx config may have changed")
