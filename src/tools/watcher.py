import argparse
import ctypes
import json
import os
import sys
import time

from wwmi_ini_util import binding_sort_key, cycle_value, find_ini_files, load_ini, sp

all_bindings = []
EVENTS_FILE = ""
STOP_FILE = ""
STOP_TOKEN = ""
POLL_INTERVAL_SEC = 0.008

VK_CODES = {
    **{str(i): 0x30 + i for i in range(10)},
    **{chr(ord("a") + i): 0x41 + i for i in range(26)},
    **{f"numpad{i}": 0x60 + i for i in range(10)},
    "up": 0x26, "down": 0x28, "left": 0x25, "right": 0x27,
    "space": 0x20, "esc": 0x1B, "enter": 0x0D, "tab": 0x09,
    "backspace": 0x08, "delete": 0x2E, "home": 0x24, "end": 0x23,
    "page up": 0x21, "page down": 0x22,
    **{f"f{i}": 0x6F + i for i in range(1, 13)},
    ".": 0xBE, "period": 0xBE, ",": 0xBC, "comma": 0xBC, "=": 0xBB, "[": 0xDB, "]": 0xDD,
    "\\": 0xDC, ";": 0xBA, "'": 0xDE, "-": 0xBD, "/": 0xBF, "`": 0xC0,
}
MODIFIER_CODES = {"ctrl": 0x11, "alt": 0x12, "shift": 0x10}
user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32
WM_HOTKEY = 0x0312
MOD_ALT = 0x0001
MOD_CONTROL = 0x0002
MOD_SHIFT = 0x0004
MOD_NOREPEAT = 0x4000
MODIFIER_VKS = {
    MOD_CONTROL: (0x11, 0xA2, 0xA3),
    MOD_ALT: (0x12, 0xA4, 0xA5),
    MOD_SHIFT: (0x10, 0xA0, 0xA1),
}

class MSG(ctypes.Structure):
    _fields_ = [
        ("hwnd", ctypes.c_void_p),
        ("message", ctypes.c_uint),
        ("wParam", ctypes.c_ulonglong),
        ("lParam", ctypes.c_longlong),
        ("time", ctypes.c_ulong),
        ("pt_x", ctypes.c_long),
        ("pt_y", ctypes.c_long),
        ("lPrivate", ctypes.c_ulong),
    ]


def emit_event(payload: dict):
    if not EVENTS_FILE:
        return
    try:
        os.makedirs(os.path.dirname(EVENTS_FILE), exist_ok=True)
        with open(EVENTS_FILE, "a", encoding="utf-8") as handle:
            handle.write(json.dumps(payload, ensure_ascii=False) + "\n")
    except Exception:
        pass


def on_hotkey(var_name: str, filepath: str):
    value = cycle_value(var_name, filepath, all_bindings)
    if value:
        emit_event({
            "type": "change",
            "varName": var_name,
            "file": filepath,
            "value": value,
            "time": time.strftime("%H:%M:%S"),
        })


def load_all(folder_or_file: str) -> bool:
    all_bindings.clear()
    files = find_ini_files(folder_or_file)
    if not files:
        emit_event({"type": "error", "message": "no ini files"})
        return False

    total = 0
    for filepath in files:
        bindings = sorted(load_ini(filepath), key=lambda item: binding_sort_key(item[0]))
        for hotkey, var_name, values in bindings:
            all_bindings.append((hotkey, var_name, values, filepath))
        total += len(bindings)

    if total == 0:
        emit_event({"type": "error", "message": "no key bindings"})
        return False
    return True


def parse_hotkey(hotkey: str):
    parts = [part.strip().lower() for part in str(hotkey or "").replace("+", " ").split() if part.strip()]
    modifiers = 0
    key_code = None
    for part in parts:
        if part in {"no_modifiers", "no_alt", "no_ctrl", "no_shift"}:
            continue
        if part in {"alt", "ctrl", "control", "shift"}:
            modifiers |= {"alt": MOD_ALT, "ctrl": MOD_CONTROL, "control": MOD_CONTROL, "shift": MOD_SHIFT}[part]
            continue
        code = VK_CODES.get(part)
        if code is None:
            return None
        if key_code is not None:
            return None
        key_code = code
    if key_code is None:
        return None
    return modifiers, key_code


def register_hotkeys():
    registered = 0
    failed = 0
    watched = []
    for hotkey, var_name, _values, filepath in all_bindings:
        parsed = parse_hotkey(hotkey)
        if not parsed:
            failed += 1
            emit_event({
                "type": "registerError",
                "key": hotkey,
                "varName": var_name,
                "file": filepath,
                "message": "unsupported key",
            })
            continue
        watched.append((hotkey, parsed, var_name, filepath))
        registered += 1
    emit_event({"type": "ready", "registered": registered, "failed": failed, "stopToken": STOP_TOKEN})
    return watched


def should_stop() -> bool:
    if STOP_FILE and os.path.exists(STOP_FILE):
        if not STOP_TOKEN:
            return True
        try:
            with open(STOP_FILE, "r", encoding="utf-8", errors="ignore") as handle:
                return handle.read().strip() == STOP_TOKEN
        except Exception:
            return False
    return False


def register_native_hotkeys(watched):
    mapping = {}
    for index, (hotkey, (modifiers, vk), var_name, filepath) in enumerate(watched, start=1):
        if not user32.RegisterHotKey(None, index, modifiers | MOD_NOREPEAT, vk):
            emit_event({
                "type": "registerError",
                "key": hotkey,
                "varName": var_name,
                "file": filepath,
                "message": "RegisterHotKey failed",
            })
            continue
        mapping[index] = (var_name, filepath)
    return mapping


def is_key_down(vk: int) -> bool:
    return bool(user32.GetAsyncKeyState(vk) & 0x8000)


def is_modifier_down(modifier: int) -> bool:
    return any(is_key_down(vk) for vk in MODIFIER_VKS.get(modifier, ()))


def combo_pressed(modifiers: int, vk: int) -> bool:
    if not is_key_down(vk):
        return False
    for modifier in (MOD_CONTROL, MOD_ALT, MOD_SHIFT):
        required = bool(modifiers & modifier)
        if is_modifier_down(modifier) != required:
            return False
    return True


def hotkey_loop(watched):
    active = {}
    while not should_stop():
        for hotkey, (modifiers, vk), var_name, filepath in watched:
            key = (modifiers, vk, var_name, filepath)
            pressed = combo_pressed(modifiers, vk)
            if pressed and not active.get(key):
                on_hotkey(var_name, filepath)
            active[key] = pressed
        time.sleep(POLL_INTERVAL_SEC)


def main():
    global EVENTS_FILE, STOP_FILE, STOP_TOKEN

    parser = argparse.ArgumentParser()
    parser.add_argument("target")
    parser.add_argument("--events", default="")
    parser.add_argument("--stop-file", default="")
    parser.add_argument("--stop-token", default="")
    args = parser.parse_args()

    EVENTS_FILE = args.events
    STOP_FILE = args.stop_file
    STOP_TOKEN = args.stop_token

    if not load_all(os.path.abspath(args.target)):
        sys.exit(1)

    watched = register_hotkeys()
    try:
        hotkey_loop(watched)
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
