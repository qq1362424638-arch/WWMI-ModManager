import re, os, sys, locale, threading, time

# ── 安全输出 ──
try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

_orig_print = print

def sp(*args, **kwargs):
    kwargs.setdefault("flush", True)
    try:
        _orig_print(*args, **kwargs)
    except UnicodeEncodeError:
        text = " ".join(str(a) for a in args)
        safe = text.encode("utf-8", errors="replace").decode("utf-8", errors="replace")
        _orig_print(safe, flush=True, **{k: v for k, v in kwargs.items() if k != "flush"})

# ── 文件读写 ──
def try_readlines(fp: str) -> list:
    encodings = ["utf-8", locale.getpreferredencoding()]
    for enc in encodings:
        try:
            with open(fp, "r", encoding=enc) as f:
                return f.readlines()
        except (UnicodeDecodeError, UnicodeError):
            continue
    with open(fp, "r", encoding=locale.getpreferredencoding(), errors="replace") as f:
        return f.readlines()

def try_write(fp: str, lines: list):
    """写文件，覆盖模式"""
    encodings = ["utf-8", locale.getpreferredencoding()]
    last_err = None
    for enc in encodings:
        try:
            with open(fp, "w", encoding=enc, newline="") as f:
                f.writelines(lines)
            return
        except (UnicodeEncodeError, PermissionError) as e:
            last_err = e
            continue
    if last_err is not None:
        raise last_err
    with open(fp, "w", encoding=locale.getpreferredencoding(), errors="replace", newline="") as f:
        f.writelines(lines)

# ── WWMI 按键映射 ──
NO_MAP = {"no_modifiers", "no_alt", "no_ctrl", "no_shift"}
MOD_MAP = {"alt": "alt", "ctrl": "ctrl", "control": "ctrl", "shift": "shift"}
VK_MAP = {
    "VK_UP": "up", "UP": "up",
    "VK_DOWN": "down", "DOWN": "down",
    "VK_LEFT": "left", "LEFT": "left",
    "VK_RIGHT": "right", "RIGHT": "right",
    "VK_SPACE": "space", "VK_ESCAPE": "esc", "VK_RETURN": "enter",
    "VK_TAB": "tab", "VK_BACK": "backspace", "VK_DELETE": "delete",
    "VK_HOME": "home", "VK_END": "end", "VK_PRIOR": "page up", "VK_NEXT": "page down",
    "VK_F1": "f1", "VK_F2": "f2", "VK_F3": "f3", "VK_F4": "f4",
    "VK_F5": "f5", "VK_F6": "f6", "VK_F7": "f7", "VK_F8": "f8",
    "VK_F9": "f9", "VK_F10": "f10", "VK_F11": "f11", "VK_F12": "f12",
    "VK_OEM_PERIOD": ".", "OEM_PERIOD": ".",
    "VK_OEM_COMMA": ",", "OEM_COMMA": ",",
    "VK_OEM_PLUS": "=", "OEM_PLUS": "=",
    "VK_OEM_4": "[", "OEM_4": "[",
    "VK_OEM_6": "]", "OEM_6": "]",
    "VK_OEM_5": "\\", "OEM_5": "\\",
    "VK_OEM_1": ";", "OEM_1": ";",
    "VK_OEM_7": "'", "OEM_7": "'",
    "VK_OEM_MINUS": "-", "OEM_MINUS": "-",
    "VK_OEM_2": "/", "OEM_2": "/",
    "VK_OEM_3": "`", "OEM_3": "`",
    "VK_OEM_8": "`", "OEM_8": "`",
    "VK_NUMPAD0": "0", "NUMPAD0": "0",
    "VK_NUMPAD1": "1", "NUMPAD1": "1",
    "VK_NUMPAD2": "2", "NUMPAD2": "2",
    "VK_NUMPAD3": "3", "NUMPAD3": "3",
    "VK_NUMPAD4": "4", "NUMPAD4": "4",
    "VK_NUMPAD5": "5", "NUMPAD5": "5",
    "VK_NUMPAD6": "6", "NUMPAD6": "6",
    "VK_NUMPAD7": "7", "NUMPAD7": "7",
    "VK_NUMPAD8": "8", "NUMPAD8": "8",
    "VK_NUMPAD9": "9", "NUMPAD9": "9",
}
SYM_MAP = {
    ",": "comma",
    "leftbracket": "[", "rightbracket": "]", "minus": "-", "equal": "=",
}

IGNORE_PATTERNS = re.compile(
    r"(?:\\|^)(?:disabled_|DISABLED_)|\.bak", re.IGNORECASE
)

def convert_key(k: str) -> str:
    k = k.strip()
    if not k:
        return ""
    return VK_MAP.get(k, VK_MAP.get(k.upper(), SYM_MAP.get(k, k.lower())))

def parse_key(raw: str) -> str:
    raw = raw.strip()
    mods = []
    remaining = []
    for t in raw.split():
        tlow = t.lower()
        if tlow in MOD_MAP:
            mods.append(MOD_MAP[tlow])
        elif tlow in NO_MAP:
            continue
        else:
            remaining.append(t)
    key = convert_key(" ".join(remaining))
    if not mods:
        return key
    if not key:
        return ""
    mods = sorted(set(mods), key=lambda x: ["alt", "ctrl", "shift"].index(x))
    return "+".join(mods + [key])

def normalize_key(raw: str) -> str:
    """将 WWMI 按键名转为可读形式（VK_UP → up, ctrl left → ctrl left）"""
    raw = raw.strip().lower()
    out = []
    for t in raw.split():
        if t in MOD_MAP:
            out.append(MOD_MAP[t])
        elif t in NO_MAP:
            continue
        elif t.upper() in VK_MAP:
            out.append(VK_MAP[t.upper()])
        else:
            out.append(t)
    return " ".join(out)

# ── 正则 ──
PERSIST_RE = re.compile(
    r"^(global\s+persist\s+\$)(\w+)(\s*=\s*(-?\d+))?", re.IGNORECASE
)
KEY_SECTION_RE = re.compile(r"^\[[Kk]ey([^\]]+)\]")
KEY_LINE_RE = re.compile(r"^key\s*=\s*(.+)", re.IGNORECASE)
VAR_LINE_RE = re.compile(r"^\$(\w+)\s*=\s*([-\d, ]+)")
RUN_LINE_RE = re.compile(r"^run\s*=\s*CommandList(\w+)", re.IGNORECASE)
CMDLIST_SECTION_RE = re.compile(r"^\[CommandList(\w+)\]")
TOGGLE_INC_RE = re.compile(r"^\$(\w+)\s*=\s*\$\w+\s*\+\s*1")
TOGGLE_MAX_RE = re.compile(r"^if\s+\$(\w+)\s*>\s*(\d+)")

# ── 文件查找 ──
def find_ini_files(root: str) -> list:
    results = []
    if os.path.isfile(root):
        return [root]
    root = os.path.abspath(root)
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if not IGNORE_PATTERNS.search(d)]
        for fn in filenames:
            if not fn.lower().endswith(".ini"):
                continue
            if IGNORE_PATTERNS.search(fn):
                continue
            # 用相对路径检查，避免父目录名（如 DISABLED_xxx）误伤子文件
            rel = os.path.relpath(os.path.join(dirpath, fn), root)
            if IGNORE_PATTERNS.search(rel):
                continue
            results.append(os.path.join(dirpath, fn))
    return results

# ── 解析 CommandList 节：提取自增变量和上限 ──
def _parse_cmdlist_toggles(lines: list) -> dict:
    """返回 {CommandList名小写: [(varname小写, max_val), ...]}"""
    cmd = {}
    cur_name = None
    cur_vars = {}  # var → max_val
    for s in lines:
        s = s.strip()
        m = CMDLIST_SECTION_RE.match(s)
        if m:
            # 保存上一个
            if cur_name and cur_vars:
                cmd[cur_name.lower()] = list(cur_vars.items())
            cur_name = m.group(1)
            cur_vars = {}
            continue
        if cur_name and s.startswith("["):
            if cur_vars:
                cmd[cur_name.lower()] = list(cur_vars.items())
            cur_name = None
            cur_vars = {}
            continue
        if cur_name:
            im = TOGGLE_INC_RE.match(s)
            if im:
                vn = im.group(1).lower()
                if vn not in cur_vars:
                    cur_vars[vn] = None
                continue
            mm = TOGGLE_MAX_RE.match(s)
            if mm:
                vn = mm.group(1).lower()
                maxv = int(mm.group(2))
                if vn in cur_vars:
                    cur_vars[vn] = maxv
    if cur_name and cur_vars:
        cmd[cur_name.lower()] = list(cur_vars.items())
    return cmd

# ── INI 解析 ──
def load_ini(fp: str) -> list:
    """返回 [(hotkey_str, varname_lower, values_list), ...]"""
    bindings = []
    if not os.path.isfile(fp):
        return bindings
    lines = try_readlines(fp)
    # 预解析 CommandList 节
    cmd_map = _parse_cmdlist_toggles(lines)
    in_key = False
    cur_key = None
    cur_var = None
    for line in lines:
        s = line.strip()
        if KEY_SECTION_RE.match(s):
            cur_var = _try_register(bindings, cur_key, cur_var)
            in_key = True
            cur_key = None
            cur_var = None
            continue
        if in_key and s.startswith("["):
            cur_var = _try_register(bindings, cur_key, cur_var)
            in_key = False
            cur_key = None
            cur_var = None
            continue
        if in_key:
            km = KEY_LINE_RE.match(s)
            if km and cur_key is None:
                cur_key = km.group(1).strip()
                cur_var = _try_register(bindings, cur_key, cur_var)
                continue
            vm = VAR_LINE_RE.match(s)
            if vm:
                vals = [v.strip() for v in vm.group(2).split(",") if v.strip()]
                cur_var = (vm.group(1).lower(), vals)
                cur_var = _try_register(bindings, cur_key, cur_var)
                continue
            rm = RUN_LINE_RE.match(s)
            if rm and cur_key is not None:
                cl_name = rm.group(1).lower()
                if cl_name in cmd_map:
                    for vn, maxv in cmd_map[cl_name]:
                        vals = [str(i) for i in range((maxv or 0) + 1)]
                        cur_var = (vn, vals)
                        cur_var = _try_register(bindings, cur_key, cur_var)

    return bindings

def _try_register(bindings, cur_key, cur_var):
    """当 key 和 var 都收集到时注册绑定，返回更新后的 cur_var"""
    if cur_key is not None and cur_var is not None:
        bindings.append((parse_key(cur_key), cur_var[0], cur_var[1]))
        return None  # 注册成功，清除 var 避免重复
    return cur_var  # 未注册成功，保留 var 等待后续 key

# ── 全局串行锁：所有 cycle 操作排队执行 ──
_GLOBAL_LOCK = threading.Lock()

# 防抖：(var_name, filepath) -> 上次执行时间
_debounce = {}
DEBOUNCE_MS = 300  # 同一变量 300ms 内忽略重复触发

def _cycle_allowed(var_name: str, filepath: str) -> bool:
    """锁内部调用（已持有 _GLOBAL_LOCK）"""
    key = (var_name, os.path.normcase(os.path.normpath(filepath)))
    now = time.time()
    last = _debounce.get(key, 0)
    if (now - last) * 1000 < DEBOUNCE_MS:
        return False
    _debounce[key] = now
    return True

# ── 同步到 d3dx_user.ini（WWMI 真实 persist 存储） ──
def _sync_d3dx_user(var_name: str, new_val: str, filepath: str):
    """在 d3dx_user.ini 中更新对应变量的 persist 值"""
    # 找 Mods 根目录：从 filepath 往上找到包含 Mods 的父目录
    fp = os.path.normpath(filepath)
    parts = fp.split(os.sep)
    try:
        # 找到 \Mods\ 的位置
        mods_idx = next(i for i, p in enumerate(parts) if p.lower() == "mods")
    except StopIteration:
        return  # 不在 Mods 下，跳过
    # 构建 d3dx_user.ini 路径：Mods 的父目录下的 d3dx_user.ini
    wwmi_root = os.sep.join(parts[:mods_idx])
    user_ini = os.path.join(wwmi_root, "d3dx_user.ini")
    if not os.path.isfile(user_ini):
        return
    # 相对路径（从 Mods 开始），全小写
    rel = os.sep.join(parts[mods_idx + 1:]).lower()
    key = f"$\\mods\\{rel}\\{var_name}"
    try:
        lines = try_readlines(user_ini)
    except Exception:
        return
    found = False
    for i, line in enumerate(lines):
        if line.lstrip().startswith(key):
            # $\path\to\mod.ini\var = old_val
            eq = line.find("=")
            if eq >= 0:
                lines[i] = f"{key} = {new_val}\r\n"
            else:
                lines[i] = f"{key} = {new_val}\r\n"
            found = True
            break
    if not found:
        lines.append(f"{key} = {new_val}\r\n")
    try:
        try_write(user_ini, lines)
    except Exception:
        pass

# ── 核心：循环切换 ──
def _build_var_re(var_name: str) -> re.Pattern:
    return re.compile(
        r"^(global\s+persist\s+\$" + re.escape(var_name) + r")\s*=\s*(-?\d+)\s*$",
        re.IGNORECASE | re.MULTILINE,
    )

def cycle_value(var_name: str, filepath: str, all_bindings: list) -> str:
    """读取文件全文，用正则替换 persist 行的值，写入后验证。"""
    # 找绑定的可选值
    vals = None
    for b in all_bindings:
        if b[1] == var_name and b[3] == filepath:
            vals = b[2]
            break
    if not vals:
        return ""

    with _GLOBAL_LOCK:
        # 防抖在全局锁内部（完全串行），消除所有竞态
        if not _cycle_allowed(var_name, filepath):
            return ""

        try:
            lines = try_readlines(filepath)
        except Exception as e:
            sp(f"  [ERR] 读取失败 {os.path.basename(filepath)}: {e}")
            return ""
        text = "".join(lines)

        # 找当前值
        vr = _build_var_re(var_name)
        m = vr.search(text)
        if not m:
            return ""
        current = m.group(2)

        try:
            idx = vals.index(current)
            idx = (idx + 1) % len(vals)
        except ValueError:
            idx = 0
        new_val = vals[idx]

        # 替换
        new_text = vr.sub(
            lambda mr: f"{mr.group(1)} = {new_val}",
            text,
            count=1,
        )

        try:
            try_write(filepath, new_text.splitlines(keepends=True))
        except Exception as e:
            sp(f"  [ERR] 写入失败 {os.path.basename(filepath)}: {e}")
            return ""

        # 写入后验证
        try:
            verify = try_readlines(filepath)
            verify_text = "".join(verify)
            vm = vr.search(verify_text)
            if vm and vm.group(2) != new_val:
                sp(f"  [WARN] 写入验证不匹配: 期望 {new_val}, 实际 {vm.group(2)}")
        except Exception:
            pass

        # 同步到 d3dx_user.ini，确保重载 Mod 后 persist 值不丢失
        _sync_d3dx_user(var_name, new_val, filepath)

        return new_val

def queue_cycle(var_name: str, filepath: str, all_bindings: list) -> str:
    return cycle_value(var_name, filepath, all_bindings)
