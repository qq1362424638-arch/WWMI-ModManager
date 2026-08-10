"""
添加翻译到词典
支持从图片文件名、手动输入等方式添加翻译
"""
import os, sys, re, json, time
sys.stdout.reconfigure(encoding='utf-8')

TOOLS_DIR = os.path.dirname(os.path.abspath(__file__))
DICT_FILE = os.path.join(TOOLS_DIR, "en_cn_dict.json")
MODS_ROOT = r"D:\0Temp\mingchao\WWMI\Mods"


def load_dict():
    try:
        with open(DICT_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except:
        return {}


def save_dict(d):
    sorted_dict = dict(sorted(d.items(), key=lambda x: x[0].lower()))
    with open(DICT_FILE, "w", encoding="utf-8") as f:
        json.dump(sorted_dict, f, ensure_ascii=False, indent=2)


def add_translation(word: str, chinese: str, source: str = "manual", source_path: str = ""):
    """添加翻译到词典"""
    d = load_dict()
    word_lower = word.lower()
    
    if word_lower not in d:
        d[word_lower] = {
            "chinese": chinese,
            "source": source,
            "source_path": source_path,
            "created": time.strftime("%Y-%m-%d %H:%M:%S"),
            "updated": time.strftime("%Y-%m-%d %H:%M:%S"),
        }
    else:
        old = d[word_lower]
        old_source = old.get("source", "empty")
        
        # 只有更高优先级才能覆盖
        priority = {"image": 1, "manual": 2, "file_context": 3, "web": 4, "empty": 99}
        if priority.get(source, 99) < priority.get(old_source, 99):
            d[word_lower]["chinese"] = chinese
            d[word_lower]["source"] = source
            d[word_lower]["source_path"] = source_path
            d[word_lower]["updated"] = time.strftime("%Y-%m-%d %H:%M:%S")
        elif not old.get("chinese") and chinese:
            d[word_lower]["chinese"] = chinese
            d[word_lower]["source"] = source
            d[word_lower]["source_path"] = source_path
            d[word_lower]["updated"] = time.strftime("%Y-%m-%d %H:%M:%S")
    
    save_dict(d)
    print(f"已添加: {word} -> {chinese} (来源: {source})")


def scan_images_for_translations():
    """扫描所有mod目录中的图片文件名，提取可能的翻译"""
    print("正在扫描图片文件名...")
    
    translations = []
    
    for dirpath, dirnames, filenames in os.walk(MODS_ROOT):
        for fn in filenames:
            if fn.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp', '.gif')):
                # 提取文件名中的中文
                name_without_ext = os.path.splitext(fn)[0]
                cn_parts = re.findall(r'[\u4e00-\u9fff]+', name_without_ext)
                if cn_parts:
                    cn_text = ''.join(cn_parts)
                    rel_path = os.path.relpath(dirpath, MODS_ROOT)
                    translations.append({
                        "file": fn,
                        "dir": rel_path,
                        "chinese": cn_text,
                    })
    
    print(f"共找到 {len(translations)} 个包含中文的图片文件")
    return translations


def batch_add_from_images():
    """批量从图片文件名添加翻译"""
    translations = scan_images_for_translations()
    
    print("\n以下图片文件名包含中文，可能包含翻译:")
    for i, t in enumerate(translations[:50], 1):
        print(f"  {i:3d}. {t['chinese']:20s} <- {t['dir']}/{t['file']}")
    
    print(f"\n... 共 {len(translations)} 个")
    print("\n使用方法: python add_translation.py add <word> <chinese> [--source image --path <图片路径>]")


def main():
    import argparse
    parser = argparse.ArgumentParser(description="添加翻译到词典")
    
    subparsers = parser.add_subparsers(dest="command")
    
    # add 命令
    add_parser = subparsers.add_parser("add", help="添加翻译")
    add_parser.add_argument("word", help="英文单词")
    add_parser.add_argument("chinese", help="中文翻译")
    add_parser.add_argument("--source", "-s", default="manual", 
                           choices=["image", "manual", "file_context", "web"])
    add_parser.add_argument("--path", "-p", default="", help="来源路径")
    
    # scan-images 命令
    subparsers.add_parser("scan-images", help="扫描图片文件名")
    
    # lookup 命令
    lookup_parser = subparsers.add_parser("lookup", help="查找单词")
    lookup_parser.add_argument("word", help="英文单词")
    
    # list-no-translation 命令
    subparsers.add_parser("list-no", help="列出无翻译的单词")
    
    args = parser.parse_args()
    
    if args.command == "add":
        add_translation(args.word, args.chinese, args.source, args.path)
    elif args.command == "scan-images":
        batch_add_from_images()
    elif args.command == "lookup":
        d = load_dict()
        if args.word.lower() in d:
            info = d[args.word.lower()]
            print(f"单词: {args.word}")
            print(f"  中文: {info.get('chinese', '(空)')}")
            print(f"  来源: {info.get('source', 'empty')}")
            print(f"  路径: {info.get('source_path', '')}")
        else:
            print(f"未找到: {args.word}")
    elif args.command == "list-no":
        d = load_dict()
        no_cn = [(w, i) for w, i in d.items() if not i.get('chinese')]
        print(f"无翻译的单词 ({len(no_cn)} 个):")
        for w, i in no_cn[:100]:
            files = i.get('found_in_files', [])[:2]
            print(f"  {w:25s} <- {', '.join(files)}")
        if len(no_cn) > 100:
            print(f"  ... 共 {len(no_cn)} 个")
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
