#!/usr/bin/env python3
"""Configure Supabase Auth to send its emails through custom SMTP.

Reads credentials from a local file (default C:\\Users\\User\\smtp-credentials.txt)
with lines HOST=, PORT=, USER=, PASS=, FROM= and an optional NAME= for the sender
label, plus the project's access token from .env.local. The password is sent to
the API and never printed, logged, or stored anywhere else.

    python scripts/configure-smtp.py [path-to-credentials-file]

Supabase's built-in email service allows only a handful of messages per hour and
is not meant for production; without custom SMTP every sign-in link dies with
429 over_email_send_rate_limit once that allowance is gone. Custom SMTP raises
the ceiling to 30 messages/hour immediately.
"""
import json, re, sys, urllib.request, urllib.error

CREDS_DEFAULT = r"C:\Users\User\smtp-credentials.txt"
ENV_FILE = ".env.local"


def read_env():
    env = {}
    for line in open(ENV_FILE, encoding="utf-8"):
        m = re.match(r"^([A-Z_]+)=(.*)$", line.strip())
        if m:
            env[m.group(1)] = m.group(2).strip('"')
    return env


def read_creds(path):
    creds = {}
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if "=" in line:
            k, v = line.split("=", 1)
            creds[k.strip().upper()] = v.strip()
    missing = [k for k in ("HOST", "PORT", "USER", "PASS", "FROM") if not creds.get(k)]
    if missing:
        sys.exit("credentials file is missing: " + ", ".join(missing))
    return creds


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else CREDS_DEFAULT
    env = read_env()
    ref = re.match(r"https://([a-z0-9]+)\.supabase\.co", env["NEXT_PUBLIC_SUPABASE_URL"]).group(1)
    tok = env["SUPABASE_ACCESS_TOKEN"]
    creds = read_creds(path)

    body = {
        "external_email_enabled": True,
        "smtp_host": creds["HOST"],
        "smtp_port": creds["PORT"],
        "smtp_user": creds["USER"],
        "smtp_pass": creds["PASS"],
        "smtp_admin_email": creds["FROM"],
        "smtp_sender_name": creds.get("NAME", "PlatePilot"),
    }
    req = urllib.request.Request(
        "https://api.supabase.com/v1/projects/%s/config/auth" % ref,
        method="PATCH",
        data=json.dumps(body).encode(),
        headers={"Authorization": "Bearer " + tok, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            r.read()
        print("PATCH -> 200")
    except urllib.error.HTTPError as e:
        sys.exit("PATCH failed: %s %s" % (e.code, e.read().decode()[:300]))

    # Read back and confirm without echoing the password.
    check = urllib.request.Request(
        "https://api.supabase.com/v1/projects/%s/config/auth" % ref,
        headers={"Authorization": "Bearer " + tok},
    )
    with urllib.request.urlopen(check, timeout=90) as r:
        cfg = json.loads(r.read())
    print("smtp_host        :", cfg.get("smtp_host"))
    print("smtp_port        :", cfg.get("smtp_port"))
    print("smtp_admin_email :", cfg.get("smtp_admin_email"))
    print("smtp_sender_name :", cfg.get("smtp_sender_name"))
    print("smtp_user set    :", bool(cfg.get("smtp_user")))
    print("smtp_pass set    :", bool(cfg.get("smtp_pass")))


if __name__ == "__main__":
    main()
