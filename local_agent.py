#!/usr/bin/env python3
"""
KEETECH Local Agent
===================
Jalankan script ini di laptop untuk mengaktifkan kontrol lokal via dashboard.

Usage:
    python3 local_agent.py

Env vars (opsional, bisa juga edit DASHBOARD_URL di bawah):
    KEETECH_DASHBOARD_URL   - URL dashboard, default http://localhost:3000
    KEETECH_POLL_INTERVAL   - interval polling detik, default 2
    KEETECH_AGENT_SECRET    - secret key untuk auth (opsional, belum wajib)

Yang bisa dieksekusi:
    shell       - jalankan terminal command
    open_app    - buka aplikasi macOS
    screenshot  - ambil screenshot layar
    read_file   - baca isi file
    write_file  - tulis file
    system_info - info CPU/RAM/disk/uptime
    notify      - notifikasi desktop macOS
"""

import os
import sys
import json
import time
import signal
import platform
import subprocess
import traceback
import urllib.request
import urllib.error
from datetime import datetime
from pathlib import Path

# ---------------------------------------------------------------------------
# Konfigurasi
# ---------------------------------------------------------------------------

DASHBOARD_URL    = os.environ.get("KEETECH_DASHBOARD_URL", "http://localhost:3000").rstrip("/")
POLL_INTERVAL    = float(os.environ.get("KEETECH_POLL_INTERVAL", "2"))
COMMANDS_URL     = f"{DASHBOARD_URL}/api/agent/commands"
RESULT_URL       = f"{DASHBOARD_URL}/api/agent/result"
STATUS_URL       = f"{DASHBOARD_URL}/api/agent/status"
SCREENSHOT_DIR   = Path.home() / "Desktop" / "keetech_screenshots"
TIMEOUT_CONNECT  = 10   # detik timeout HTTP

# ---------------------------------------------------------------------------
# Helpers HTTP
# ---------------------------------------------------------------------------

def http_get(url: str) -> dict:
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=TIMEOUT_CONNECT) as resp:
        return json.loads(resp.read().decode())


def http_post(url: str, data: dict) -> dict:
    payload = json.dumps(data).encode()
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT_CONNECT) as resp:
        return json.loads(resp.read().decode())


def send_result(cmd_id: str, result: str = "", error: str = ""):
    payload: dict = {"id": cmd_id, "heartbeat": True}
    if error:
        payload["error"] = error
    else:
        payload["result"] = result
    try:
        http_post(RESULT_URL, payload)
    except Exception as e:
        log(f"[WARN] Gagal kirim result untuk {cmd_id}: {e}")

# ---------------------------------------------------------------------------
# Logger
# ---------------------------------------------------------------------------

def log(msg: str):
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)

# ---------------------------------------------------------------------------
# Action Handlers
# ---------------------------------------------------------------------------

def handle_shell(params: dict) -> str:
    """Jalankan shell command, kembalikan output."""
    command = str(params.get("command", "")).strip()
    if not command:
        raise ValueError("parameter 'command' kosong")

    # Safeguard: blokir perintah destruktif tanpa konfirmasi
    BLOCKED = ["rm -rf /", "rm -rf ~", "format", "mkfs", "dd if=", ":(){:|:&};:"]
    for b in BLOCKED:
        if b in command:
            raise PermissionError(f"Perintah diblokir karena berbahaya: {b}")

    log(f"[SHELL] Menjalankan: {command}")
    result = subprocess.run(
        command,
        shell=True,
        capture_output=True,
        text=True,
        timeout=30,
        cwd=Path.home(),
    )
    output = (result.stdout + result.stderr).strip()
    if not output:
        output = f"Selesai (exit code {result.returncode})"
    return output[:2000]  # batasi output


def handle_open_app(params: dict) -> str:
    """Buka aplikasi macOS via 'open -a'."""
    app = str(params.get("app", "")).strip()
    if not app:
        raise ValueError("parameter 'app' kosong")

    # Normalisasi alias nama aplikasi
    APP_ALIASES = {
        "wa": "WhatsApp",
        "whatsapp": "WhatsApp",
        "chrome": "Google Chrome",
        "google chrome": "Google Chrome",
        "safari": "Safari",
        "firefox": "Firefox",
        "spotify": "Spotify",
        "vscode": "Visual Studio Code",
        "vs code": "Visual Studio Code",
        "code": "Visual Studio Code",
        "terminal": "Terminal",
        "finder": "Finder",
        "slack": "Slack",
        "telegram": "Telegram",
        "zoom": "zoom.us",
        "discord": "Discord",
        "figma": "Figma",
        "notion": "Notion",
        "notes": "Notes",
        "musik": "Music",
        "music": "Music",
    }
    resolved = APP_ALIASES.get(app.lower(), app)

    log(f"[OPEN] Membuka aplikasi: {resolved} (dari: {app})")
    variants = [resolved, resolved.title(), app, app.title()]
    seen = []
    for v in variants:
        if v not in seen:
            seen.append(v)

    for variant in seen:
        result = subprocess.run(
            ["open", "-a", variant],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode == 0:
            return f"Aplikasi '{variant}' berhasil dibuka."

    # Fallback osascript
    script = f'tell application "{resolved}" to activate'
    result = subprocess.run(
        ["osascript", "-e", script],
        capture_output=True, text=True, timeout=10
    )
    if result.returncode == 0:
        return f"Aplikasi '{resolved}' berhasil diaktifkan."
    raise RuntimeError(f"Tidak bisa membuka '{app}': {result.stderr.strip()}")


def handle_close_app(params: dict) -> str:
    """Tutup aplikasi macOS — coba graceful quit via osascript dulu, lalu pkill."""
    app = str(params.get("app", "")).strip()
    if not app:
        raise ValueError("parameter 'app' kosong")

    log(f"[CLOSE] Menutup aplikasi: {app}")

    # Normalisasi nama aplikasi yang sering disingkat saat bicara
    APP_ALIASES = {
        "wa": "WhatsApp",
        "whatsapp": "WhatsApp",
        "chrome": "Google Chrome",
        "google chrome": "Google Chrome",
        "safari": "Safari",
        "firefox": "Firefox",
        "spotify": "Spotify",
        "vscode": "Visual Studio Code",
        "vs code": "Visual Studio Code",
        "code": "Visual Studio Code",
        "terminal": "Terminal",
        "finder": "Finder",
        "slack": "Slack",
        "telegram": "Telegram",
        "zoom": "zoom.us",
        "discord": "Discord",
        "figma": "Figma",
        "notion": "Notion",
        "notes": "Notes",
        "musik": "Music",
        "music": "Music",
    }
    resolved = APP_ALIASES.get(app.lower(), app.title())

    # 1. Graceful quit via osascript (paling bersih)
    script = f'tell application "{resolved}" to quit'
    result = subprocess.run(
        ["osascript", "-e", script],
        capture_output=True, text=True, timeout=10
    )
    if result.returncode == 0:
        return f"Aplikasi '{resolved}' berhasil ditutup."

    # 2. Fallback: pkill berdasarkan nama proses
    for name in [resolved, app, app.title()]:
        result = subprocess.run(
            ["pkill", "-x", name],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            return f"Proses '{name}' berhasil dihentikan."

    # 3. Fallback: pkill -f (partial match nama proses)
    result = subprocess.run(
        ["pkill", "-fi", app],
        capture_output=True, text=True, timeout=5
    )
    if result.returncode == 0:
        return f"Proses yang mengandung '{app}' berhasil dihentikan."

    raise RuntimeError(f"Tidak bisa menutup '{app}' — mungkin sudah tertutup atau nama berbeda.")


def handle_screenshot(params: dict) -> str:
    """Ambil screenshot layar penuh dan simpan ke Desktop."""
    SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = SCREENSHOT_DIR / f"screenshot_{ts}.png"

    log(f"[SCREENSHOT] Menyimpan ke: {filename}")
    result = subprocess.run(
        ["screencapture", "-x", str(filename)],  # -x = tanpa suara shutter
        capture_output=True, text=True, timeout=10
    )
    if result.returncode != 0:
        raise RuntimeError(f"screencapture gagal: {result.stderr.strip()}")
    return f"Screenshot disimpan: {filename}"


def handle_read_file(params: dict) -> str:
    """Baca isi file."""
    path_str = str(params.get("path", "")).strip()
    if not path_str:
        raise ValueError("parameter 'path' kosong")

    path = Path(path_str).expanduser()
    if not path.exists():
        raise FileNotFoundError(f"File tidak ditemukan: {path}")
    if path.stat().st_size > 100_000:  # max 100KB
        raise ValueError(f"File terlalu besar (>{100}KB): {path}")

    content = path.read_text(errors="replace")
    log(f"[READ] Membaca file: {path} ({len(content)} chars)")
    return content[:3000]  # batasi output ke 3000 char


def handle_write_file(params: dict) -> str:
    """Tulis konten ke file."""
    path_str = str(params.get("path", "")).strip()
    content  = str(params.get("content", ""))
    if not path_str:
        raise ValueError("parameter 'path' kosong")

    path = Path(path_str).expanduser()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)
    log(f"[WRITE] Menulis file: {path} ({len(content)} chars)")
    return f"File berhasil ditulis: {path}"


def handle_system_info(_params: dict) -> str:
    """Ambil info sistem: CPU, RAM, disk, uptime."""
    try:
        import psutil  # sudah terinstall

        cpu_pct    = psutil.cpu_percent(interval=1)
        mem        = psutil.virtual_memory()
        disk       = psutil.disk_usage("/")
        boot_ts    = psutil.boot_time()
        uptime_sec = time.time() - boot_ts

        hours   = int(uptime_sec // 3600)
        minutes = int((uptime_sec % 3600) // 60)

        info = (
            f"CPU Usage   : {cpu_pct:.1f}%\n"
            f"RAM         : {mem.used / 1e9:.1f} GB / {mem.total / 1e9:.1f} GB ({mem.percent:.1f}%)\n"
            f"Disk (/)    : {disk.used / 1e9:.1f} GB / {disk.total / 1e9:.1f} GB ({disk.percent:.1f}%)\n"
            f"Uptime      : {hours}j {minutes}m\n"
            f"Platform    : {platform.platform()}\n"
            f"Python      : {sys.version.split()[0]}"
        )
        log("[SYSINFO] Berhasil mengambil info sistem")
        return info

    except ImportError:
        # Fallback tanpa psutil
        result = subprocess.run(
            ["vm_stat"], capture_output=True, text=True, timeout=5
        )
        return result.stdout[:1000] or "psutil tidak terinstall, fallback ke vm_stat"


def handle_notify(params: dict) -> str:
    """Kirim notifikasi desktop macOS via osascript."""
    message = str(params.get("message", "Notifikasi dari KEETECH")).strip()
    title   = str(params.get("title", "KEETECH Agent")).strip()

    log(f"[NOTIFY] Mengirim notifikasi: {message}")
    script = (
        f'display notification "{message}" '
        f'with title "{title}" '
        f'sound name "Glass"'
    )
    result = subprocess.run(
        ["osascript", "-e", script],
        capture_output=True, text=True, timeout=10
    )
    if result.returncode != 0:
        raise RuntimeError(f"Notifikasi gagal: {result.stderr.strip()}")
    return f"Notifikasi terkirim: {message}"

# ---------------------------------------------------------------------------
# Dispatcher
# ---------------------------------------------------------------------------

ACTION_HANDLERS = {
    "shell":       handle_shell,
    "open_app":    handle_open_app,
    "close_app":   handle_close_app,
    "screenshot":  handle_screenshot,
    "read_file":   handle_read_file,
    "write_file":  handle_write_file,
    "system_info": handle_system_info,
    "notify":      handle_notify,
}


def dispatch(command: dict):
    cmd_id  = command.get("id", "")
    action  = command.get("action", "")
    params  = command.get("params", {}) or {}

    log(f"[CMD] {cmd_id} action={action} params={json.dumps(params)[:120]}")

    handler = ACTION_HANDLERS.get(action)
    if not handler:
        send_result(cmd_id, error=f"Action tidak dikenal: '{action}'")
        return

    try:
        result = handler(params)
        log(f"[OK]  {cmd_id} → {str(result)[:80]}")
        send_result(cmd_id, result=result)
    except Exception as e:
        err_msg = f"{type(e).__name__}: {e}"
        log(f"[ERR] {cmd_id} → {err_msg}")
        send_result(cmd_id, error=err_msg)

# ---------------------------------------------------------------------------
# Main polling loop
# ---------------------------------------------------------------------------

_running = True

def _handle_signal(sig, frame):
    global _running
    log("\n[STOP] Menerima sinyal keluar. Agent berhenti.")
    _running = False

signal.signal(signal.SIGINT,  _handle_signal)
signal.signal(signal.SIGTERM, _handle_signal)


def check_dashboard_reachable() -> bool:
    try:
        http_get(STATUS_URL)
        return True
    except Exception:
        return False


def main():
    log("=" * 55)
    log("  KEETECH Local Agent")
    log(f"  Dashboard  : {DASHBOARD_URL}")
    log(f"  Poll setiap: {POLL_INTERVAL}s")
    log(f"  Platform   : {platform.platform()}")
    log("=" * 55)
    log("Menunggu koneksi ke dashboard...")

    # Tunggu dashboard ready
    while _running:
        if check_dashboard_reachable():
            log("[OK] Dashboard terhubung. Agent aktif dan polling...")
            break
        log("[WAIT] Dashboard belum tersedia, coba lagi 5s...")
        time.sleep(5)

    consecutive_errors = 0

    while _running:
        try:
            data = http_get(COMMANDS_URL)
            commands = data.get("commands", [])
            consecutive_errors = 0  # reset error counter

            if commands:
                log(f"[POLL] {len(commands)} command diterima")
                for cmd in commands:
                    dispatch(cmd)
            # else: tidak ada command, diam saja

        except urllib.error.URLError as e:
            consecutive_errors += 1
            if consecutive_errors == 1 or consecutive_errors % 10 == 0:
                log(f"[WARN] Tidak bisa reach dashboard ({e}) — pastikan Next.js running")
        except Exception:
            consecutive_errors += 1
            if consecutive_errors <= 3:
                log(f"[ERR] Polling error:\n{traceback.format_exc()}")

        time.sleep(POLL_INTERVAL)

    log("[EXIT] Local Agent berhenti.")


if __name__ == "__main__":
    main()
