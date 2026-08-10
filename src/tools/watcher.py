import sys, os, time
import keyboard
from wwmi_ini_util import sp, try_readlines, try_write, find_ini_files, load_ini
from wwmi_ini_util import parse_key, VK_MAP, MOD_MAP, NO_MAP
from wwmi_ini_util import PERSIST_RE, KEY_SECTION_RE, KEY_LINE_RE, VAR_LINE_RE
from wwmi_ini_util import queue_cycle

# ── 全局绑定列表 ──
all_bindings = []

# ── 按键 → 队列更新（连按不丢，后台批量落盘） ──
def on_hotkey(var_name: str, filepath: str):
    sp(f"  [{time.strftime('%H:%M:%S')}] hotkey fired: ${var_name}  <- {os.path.basename(filepath)}")
    queue_cycle(var_name, filepath, all_bindings)

# ── 热键注册 ──
def load_all(folder_or_file: str) -> bool:
    global all_bindings
    all_bindings.clear()
    files = find_ini_files(folder_or_file)
    if not files:
        sp("[ERR] 未找到 .ini 文件")
        return False
    total = 0
    for fp in files:
        binds = load_ini(fp)
        if binds:
            rel = os.path.relpath(fp, folder_or_file) if os.path.isdir(folder_or_file) else os.path.basename(fp)
            sp(f"  {rel}")
            for kb, vn, vals in binds:
                all_bindings.append((kb, vn, vals, fp))
                sp(f"    {kb:20s} -> ${vn}  {vals}")
            total += len(binds)
    if total == 0:
        sp("[WARN] 所有文件中均未找到 [Key*] 节")
        return False
    sp(f"\n总计 {total} 个快捷键，来自 {len(files)} 个文件")
    return True

def register_hotkeys():
    UNSAFE_KEYS = {"vk_lbutton"}
    registered = 0
    failed = 0
    for kb, vn, vals, fp in all_bindings:
        if kb.lower().replace("+", "").replace(" ", "") in UNSAFE_KEYS:
            sp(f"  [SKIP] {kb:20s} -> ${vn}  ({os.path.basename(fp)}): 不支持（如鼠标按键）")
            failed += 1
            continue
        if not kb:
            sp(f"  [SKIP] {'':20s} -> ${vn}  ({os.path.basename(fp)}): 空热键")
            failed += 1
            continue
        try:
            # timeout=0: 禁用 keyboard 库自带 1s 节流，连按由 queue 计数累加，不丢更新
            keyboard.add_hotkey(kb, on_hotkey, args=(vn, fp), timeout=0)
            registered += 1
        except Exception as e:
            sp(f"  [FAIL] {kb:20s} -> ${vn}  ({os.path.basename(fp)}): {e}")
            failed += 1
    sp(f"已注册 {registered} 个热键{'，'+str(failed)+' 个失败' if failed else ''}")

def main():
    if len(sys.argv) < 2:
        sp("用法: python watcher.py <mod.ini 或 mod文件夹>")
        sp("示例: python watcher.py D:\\path\\to\\mod.ini")
        sp("       python watcher.py D:\\path\\to\\mod_folder\\")
        sys.exit(1)
    target = os.path.abspath(sys.argv[1])
    if not load_all(target):
        sys.exit(1)
    sp("\n注册全局热键...")
    register_hotkeys()
    sp(f"\n监听中，直接关闭本窗口即可退出。")
    sp("=" * 50)
    sys.stdout.flush()
    try:
        # 不再用 esc 退出：主线程保持存活，由用户手动关闭控制台窗口结束
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        pass
    finally:
        from wwmi_ini_util import flush_pending
        flush_pending(3.0)  # 退出前把队列里残留的更新全部落盘
        sp("\n已退出")

if __name__ == "__main__":
    main()
