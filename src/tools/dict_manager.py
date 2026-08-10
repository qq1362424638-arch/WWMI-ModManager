"""
词典管理器：记录所有ini文件中的英文key，按优先级自动翻译并记录来源
优先级：图片OCR > 文件上下文 > 联网查询
"""
import os, sys, re, json, time
sys.stdout.reconfigure(encoding='utf-8')

# ── 路径配置 ──
TOOLS_DIR = os.path.dirname(os.path.abspath(__file__))
DICT_FILE = os.path.join(TOOLS_DIR, "en_cn_dict.json")
MODS_ROOT = r"D:\0Temp\mingchao\WWMI\Mods"

# ── 翻译来源常量 ──
SRC_IMAGE = "image"
SRC_FILE_CONTEXT = "file_context"
SRC_WEB = "web"
SRC_MANUAL = "manual"
SRC_EMPTY = "empty"

# ── 来源优先级（数字越小优先级越高）──
SOURCE_PRIORITY = {
    SRC_IMAGE: 1,       # 图片OCR（最高优先级）
    SRC_MANUAL: 2,      # 用户手动翻译
    SRC_FILE_CONTEXT: 3, # 文件上下文
    SRC_WEB: 4,         # 联网查询
    SRC_EMPTY: 99,      # 无翻译
}


def load_dict() -> dict:
    """加载词典"""
    try:
        with open(DICT_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except:
        return {}


def save_dict(d: dict):
    """保存词典（按key字母排序）"""
    sorted_dict = dict(sorted(d.items(), key=lambda x: x[0].lower()))
    with open(DICT_FILE, "w", encoding="utf-8") as f:
        json.dump(sorted_dict, f, ensure_ascii=False, indent=2)


def get_source_priority(source: str) -> int:
    """获取来源优先级"""
    return SOURCE_PRIORITY.get(source, 99)


def should_update(old_source: str, new_source: str) -> bool:
    """判断是否应该更新翻译（新来源优先级更高时更新）"""
    return get_source_priority(new_source) < get_source_priority(old_source)


def record_word(word: str, chinese: str = "", source: str = SRC_EMPTY, source_path: str = ""):
    """记录一个英文单词到词典"""
    d = load_dict()
    word_lower = word.lower()
    
    if word_lower not in d:
        # 新单词，直接记录
        d[word_lower] = {
            "chinese": chinese,
            "source": source,
            "source_path": source_path,
            "created": time.strftime("%Y-%m-%d %H:%M:%S"),
            "updated": time.strftime("%Y-%m-%d %H:%M:%S"),
        }
    else:
        # 已存在，检查是否需要更新
        old = d[word_lower]
        old_source = old.get("source", SRC_EMPTY)
        
        if chinese and should_update(old_source, source):
            # 新翻译有内容且优先级更高，更新
            d[word_lower] = {
                "chinese": chinese,
                "source": source,
                "source_path": source_path,
                "created": old.get("created", ""),
                "updated": time.strftime("%Y-%m-%d %H:%M:%S"),
            }
        elif not old.get("chinese") and chinese:
            # 旧翻译为空，新翻译有内容，更新
            d[word_lower] = {
                "chinese": chinese,
                "source": source,
                "source_path": source_path,
                "created": old.get("created", ""),
                "updated": time.strftime("%Y-%m-%d %H:%M:%S"),
            }
    
    save_dict(d)


def extract_english_keys_from_ini(filepath: str) -> list:
    """从ini文件提取所有英文变量名"""
    keys = set()
    try:
        with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                # 匹配 $variable 模式
                for m in re.finditer(r'\$(\w+)', line):
                    var = m.group(1).lower()
                    # 过滤掉wwmi系统变量和纯数字
                    if var.startswith("wwmi") or var.isdigit():
                        continue
                    # 拆分下划线连接的单词
                    for part in var.split("_"):
                        if len(part) >= 3 and part.isalpha():
                            keys.add(part)
    except:
        pass
    return list(keys)


def scan_all_ini_files() -> dict:
    """扫描所有ini文件，提取英文key"""
    all_keys = {}  # word -> [file_paths]
    
    for dirpath, dirnames, filenames in os.walk(MODS_ROOT):
        for fn in filenames:
            if not fn.lower().endswith(".ini") or fn.lower().endswith(".bak"):
                continue
            fpath = os.path.join(dirpath, fn)
            keys = extract_english_keys_from_ini(fpath)
            rel_path = os.path.relpath(fpath, MODS_ROOT)
            for key in keys:
                if key not in all_keys:
                    all_keys[key] = []
                all_keys[key].append(rel_path)
    
    return all_keys


def extract_context_from_ini(filepath: str, target_word: str) -> str:
    """从ini文件上下文提取翻译线索"""
    try:
        with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()
        
        # 查找包含目标单词的注释行
        pattern = re.compile(r';\s*.*?' + re.escape(target_word) + r'.*?[\u4e00-\u9fff]', re.IGNORECASE)
        matches = pattern.findall(content)
        if matches:
            # 返回第一个匹配的中文部分
            for m in matches:
                cn = re.search(r'[\u4e00-\u9fff]+', m)
                if cn:
                    return cn.group(0)
        
        # 查找同行注释
        for line in content.split('\n'):
            if target_word.lower() in line.lower():
                # 提取分号后的中文
                comment_match = re.search(r';\s*([\u4e00-\u9fff]+)', line)
                if comment_match:
                    return comment_match.group(1)
    except:
        pass
    return ""


def check_images_for_translation(mod_dir: str) -> dict:
    """检查目录中的图片文件名是否包含翻译线索"""
    translations = {}
    try:
        for fn in os.listdir(mod_dir):
            if fn.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp', '.gif')):
                # 从图片文件名提取中文
                name_without_ext = os.path.splitext(fn)[0]
                cn_match = re.search(r'[\u4e00-\u9fff]+', name_without_ext)
                if cn_match:
                    # 可能包含多个中文词，用下划线分割
                    cn_parts = re.findall(r'[\u4e00-\u9fff]+', name_without_ext)
                    translations[fn] = ''.join(cn_parts)
    except:
        pass
    return translations


def build_dict_from_ini_files():
    """从所有ini文件构建词典"""
    print("正在扫描所有ini文件...")
    all_keys = scan_all_ini_files()
    print(f"共找到 {len(all_keys)} 个英文单词")
    
    print("正在初始化词典...")
    d = load_dict()
    
    count_new = 0
    count_updated = 0
    
    for word, files in sorted(all_keys.items(), key=lambda x: x[0]):
        if word in d and d[word].get("chinese"):
            # 已有翻译，跳过
            continue
        
        # 尝试从文件上下文提取翻译
        chinese = ""
        source = SRC_EMPTY
        source_path = ""
        
        for fpath in files[:3]:  # 只检查前3个文件
            full_path = os.path.join(MODS_ROOT, fpath)
            ctx = extract_context_from_ini(full_path, word)
            if ctx:
                chinese = ctx
                source = SRC_FILE_CONTEXT
                source_path = fpath
                break
        
        if word not in d:
            count_new += 1
        else:
            count_updated += 1
        
        record_word(word, chinese, source, source_path)
    
    print(f"新增 {count_new} 个单词，更新 {count_updated} 个单词")
    print(f"词典已保存到 {DICT_FILE}")


def update_dict_priority():
    """按优先级重新处理词典中的所有单词"""
    print("正在按优先级重新处理词典...")
    d = load_dict()
    
    count_updated = 0
    for word, info in d.items():
        chinese = info.get("chinese", "")
        source = info.get("source", SRC_EMPTY)
        
        # 如果已经有高优先级翻译，跳过
        if source in (SRC_IMAGE, SRC_MANUAL):
            continue
        
        # 尝试从文件上下文提取
        # 这里需要知道单词出现在哪些文件中，简化处理：
        # 如果当前翻译来源是空或web，尝试从ini文件上下文查找
        if source in (SRC_EMPTY, SRC_WEB):
            # 搜索mods目录中的ini文件
            for dirpath, dirnames, filenames in os.walk(MODS_ROOT):
                for fn in filenames:
                    if not fn.lower().endswith(".ini") or fn.lower().endswith(".bak"):
                        continue
                    fpath = os.path.join(dirpath, fn)
                    ctx = extract_context_from_ini(fpath, word)
                    if ctx:
                        rel_path = os.path.relpath(fpath, MODS_ROOT)
                        if should_update(source, SRC_FILE_CONTEXT):
                            record_word(word, ctx, SRC_FILE_CONTEXT, rel_path)
                            count_updated += 1
                            break
                else:
                    continue
                break
    
    print(f"更新了 {count_updated} 个单词的翻译")


def get_dict_stats():
    """获取词典统计信息"""
    d = load_dict()
    stats = {
        "total": len(d),
        "by_source": {},
        "has_translation": 0,
        "no_translation": 0,
    }
    
    for word, info in d.items():
        source = info.get("source", SRC_EMPTY)
        stats["by_source"][source] = stats["by_source"].get(source, 0) + 1
        
        if info.get("chinese"):
            stats["has_translation"] += 1
        else:
            stats["no_translation"] += 1
    
    return stats


def export_dict_for_translate():
    """导出词典为translate.py可用的格式"""
    d = load_dict()
    
    # 生成local_dict格式
    local_dict = {}
    for word, info in d.items():
        chinese = info.get("chinese", "")
        if chinese:
            local_dict[word] = chinese
    
    output_path = os.path.join(TOOLS_DIR, "local_dict.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(local_dict, f, ensure_ascii=False, indent=2)
    
    print(f"已导出 {len(local_dict)} 个翻译到 {output_path}")


def main():
    import argparse
    parser = argparse.ArgumentParser(description="词典管理器")
    subparsers = parser.add_subparsers(dest="command")
    
    # 子命令：扫描ini文件构建词典
    subparsers.add_parser("scan", help="扫描所有ini文件构建词典")
    
    # 子命令：按优先级重新处理
    subparsers.add_parser("priority", help="按优先级重新处理词典")
    
    # 子命令：统计信息
    subparsers.add_parser("stats", help="显示词典统计信息")
    
    # 子命令：导出为translate.py格式
    subparsers.add_parser("export", help="导出词典为local_dict.json格式")
    
    # 子命令：记录单个单词
    record_parser = subparsers.add_parser("record", help="记录单个单词")
    record_parser.add_argument("word", help="英文单词")
    record_parser.add_argument("--chinese", "-c", default="", help="中文翻译")
    record_parser.add_argument("--source", "-s", default=SRC_MANUAL, 
                               choices=[SRC_IMAGE, SRC_FILE_CONTEXT, SRC_WEB, SRC_MANUAL],
                               help="翻译来源")
    record_parser.add_argument("--path", "-p", default="", help="来源文件路径")
    
    # 子命令：查看单词
    lookup_parser = subparsers.add_parser("lookup", help="查看单词翻译")
    lookup_parser.add_argument("word", help="英文单词")
    
    args = parser.parse_args()
    
    if args.command == "scan":
        build_dict_from_ini_files()
    elif args.command == "priority":
        update_dict_priority()
    elif args.command == "stats":
        stats = get_dict_stats()
        print(f"词典统计:")
        print(f"  总单词数: {stats['total']}")
        print(f"  有翻译: {stats['has_translation']}")
        print(f"  无翻译: {stats['no_translation']}")
        print(f"  按来源分布:")
        for src, count in sorted(stats['by_source'].items()):
            print(f"    {src}: {count}")
    elif args.command == "export":
        export_dict_for_translate()
    elif args.command == "record":
        record_word(args.word, args.chinese, args.source, args.path)
        print(f"已记录: {args.word} -> {args.chinese or '(空)'} ({args.source})")
    elif args.command == "lookup":
        d = load_dict()
        if args.word.lower() in d:
            info = d[args.word.lower()]
            print(f"单词: {args.word}")
            print(f"  中文: {info.get('chinese', '(空)')}")
            print(f"  来源: {info.get('source', SRC_EMPTY)}")
            print(f"  来源路径: {info.get('source_path', '')}")
            print(f"  创建时间: {info.get('created', '')}")
            print(f"  更新时间: {info.get('updated', '')}")
        else:
            print(f"未找到单词: {args.word}")
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
