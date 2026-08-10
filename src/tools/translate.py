import re, sys, os, json, urllib.parse, urllib.request
from wwmi_ini_util import sp, VK_MAP, MOD_MAP, NO_MAP, parse_key, normalize_key as _nk

# 本地词典路径（与脚本同目录）
LOCAL_DICT = os.path.join(os.path.dirname(__file__), "local_dict.json")
SOURCE_PRIORITY = {
    "image": 30,
    "file_context": 20,
    "online_query": 10,
    "builtin": 0,
    "untranslated": -10,
    "legacy": -20,
}
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}


def load_local_dict() -> dict:
    try:
        with open(LOCAL_DICT, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def normalize_dict_entry(value) -> dict:
    if isinstance(value, dict):
        entry = {
            "translation": str(value.get("translation", "") or ""),
            "source": str(value.get("source", "") or ""),
            "source_path": str(value.get("source_path", "") or ""),
            "sources": value.get("sources", []),
        }
        if not isinstance(entry["sources"], list):
            entry["sources"] = []
        return entry
    return {
        "translation": str(value or ""),
        "source": "legacy" if value else "untranslated",
        "source_path": "",
        "sources": [],
    }


def get_local_translation(var_name: str) -> str:
    entry = normalize_dict_entry(load_local_dict().get(var_name.lower(), ""))
    return entry.get("translation", "")


def save_local_dict(d: dict):
    ordered = {k: d[k] for k in sorted(d, key=lambda x: x.lower())}
    try:
        with open(LOCAL_DICT, "w", encoding="utf-8") as f:
            json.dump(ordered, f, ensure_ascii=False, indent=2)
    except Exception:
        pass


def source_identity(candidate: dict) -> tuple:
    return (
        candidate.get("source", ""),
        candidate.get("source_path", ""),
        candidate.get("translation", ""),
    )


def save_to_local_dict(var_name: str, chinese: str, source: str = "file_context", source_path: str = ""):
    update_local_dict(var_name, [{
        "translation": chinese,
        "source": source,
        "source_path": source_path,
    }])


def update_local_dict(var_name: str, candidates: list) -> str:
    key = var_name.lower()
    d = load_local_dict()
    entry = normalize_dict_entry(d.get(key, ""))
    seen = {source_identity(s) for s in entry["sources"] if isinstance(s, dict)}

    for candidate in candidates:
        candidate = {
            "translation": str(candidate.get("translation", "") or "").strip(),
            "source": str(candidate.get("source", "") or "untranslated"),
            "source_path": str(candidate.get("source_path", "") or ""),
        }
        ident = source_identity(candidate)
        if ident not in seen:
            entry["sources"].append(candidate)
            seen.add(ident)

        current_rank = SOURCE_PRIORITY.get(entry.get("source", ""), -99)
        candidate_rank = SOURCE_PRIORITY.get(candidate["source"], -99)
        current_text = entry.get("translation", "")
        candidate_text = candidate.get("translation", "")
        if candidate_text and (not current_text or candidate_rank > current_rank):
            entry["translation"] = candidate_text
            entry["source"] = candidate["source"]
            entry["source_path"] = candidate["source_path"]

    if not entry.get("source"):
        entry["source"] = "untranslated"
    d[key] = entry
    save_local_dict(d)
    return entry.get("translation", "")


def iter_context_dirs(filepath: str) -> list:
    base = os.path.dirname(filepath)
    dirs = []
    for d in (base, os.path.dirname(base)):
        if d and d != os.path.dirname(d) and d not in dirs:
            dirs.append(d)
    return dirs


def extract_chinese(text: str) -> str:
    m = re.search(r"[\u4e00-\u9fff][\u4e00-\u9fffA-Za-z0-9 _+\-（）()【】]*", text or "")
    return m.group(0).strip(" _-") if m else ""


def scan_image_sidecar(image_path: str, var_name: str) -> str:
    key = var_name.lower()
    for sidecar in (image_path + ".json", os.path.splitext(image_path)[0] + ".json"):
        if not os.path.isfile(sidecar):
            continue
        try:
            data = json.load(open(sidecar, "r", encoding="utf-8"))
        except Exception:
            continue
        maps = data.get("mappings", data) if isinstance(data, dict) else {}
        if isinstance(maps, dict):
            value = maps.get(key) or maps.get(var_name)
            if isinstance(value, dict):
                value = value.get("translation") or value.get("chinese")
            if value:
                return str(value).strip()
    return ""


def scan_image_ocr(image_path: str, var_name: str) -> str:
    try:
        import pytesseract
        from PIL import Image
    except Exception:
        return ""
    try:
        text = pytesseract.image_to_string(Image.open(image_path), lang="chi_sim+eng")
    except Exception:
        return ""
    pattern = re.escape(var_name)
    m = re.search(pattern + r"\s*[:：=\-]\s*([^\r\n]+)", text, re.IGNORECASE)
    return extract_chinese(m.group(1)) if m else ""


def scan_image_translation(filepath: str, var_name: str) -> tuple:
    key = var_name.lower()
    for d in iter_context_dirs(filepath):
        try:
            names = os.listdir(d)
        except Exception:
            continue
        for fn in names:
            image_path = os.path.join(d, fn)
            stem, ext = os.path.splitext(fn)
            if ext.lower() not in IMAGE_EXTS:
                continue
            chinese = scan_image_sidecar(image_path, key)
            if not chinese and key in stem.lower():
                chinese = extract_chinese(stem)
            if not chinese:
                chinese = scan_image_ocr(image_path, key)
            if chinese:
                return (chinese, image_path)
    return ("", "")


def query_online_translation(var_name: str) -> str:
    query = urllib.parse.urlencode({
        "q": var_name,
        "langpair": "en|zh-CN",
    })
    url = "https://api.mymemory.translated.net/get?" + query
    try:
        with urllib.request.urlopen(url, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8", "ignore"))
        text = data.get("responseData", {}).get("translatedText", "")
        return text.strip() if extract_chinese(text) else ""
    except Exception:
        return ""


# ── 拼音/常见变量名 → 中文释义 ──
PINYIN_MAP = {
    "xiongbu": "胸部", "xiong": "胸部", "ru": "乳房",
    "shoubi": "手臂", "shouwan": "手腕",
    "lingdai": "项圈", "xiangquan": "项圈",
    "neiku": "内裤", "waiku": "外裤",
    "xiezi": "鞋子", "tunv": "臀部",
    "maozi": "帽子", "tuer": "兔耳",
    "erzhui": "耳坠", "fashi": "发饰",
    "jiaohuan": "脚环", "tuwei": "腿围",
    "suolian": "锁链", "xiaban": "下摆",
    "lingzi": "领子",
    "yousi": "油丝", "youguang": "油光",
    "siwa": "丝袜", "dingziku": "丁字裤",
    "xiangzi": "箱子", "shoutao": "手套",
    "yanjing": "眼睛", "toufa": "头发",
    "weiba": "尾巴", "chibang": "翅膀",
    "mianju": "面具", "hudiejie": "蝴蝶结",
    "bozi": "脖子", "jingquan": "颈圈",
    "yaobu": "腰部", "yaodai": "腰带",
    "datui": "大腿", "xiaotui": "小腿",
    "jiaomo": "脚部", "jiaozhi": "脚趾",
    "toujin": "头巾", "weijin": "围巾",
    "yumao": "羽毛", "erhuan": "耳环",
    "xianglian": "项链", "jie": "戒指",
    "yangju": "阳具", "yindi": "阴蒂",
    "yinchun": "阴唇", "yindao": "阴道",
    "gangmen": "肛门", "ruyun": "乳晕",
    "maofa": "毛发", "gongbu": "工部",
    "xiongzhao": "胸罩", "kuzi": "裤子",
    "qunzi": "裙子", "changqun": "长裙",
    "duanqun": "短裙", "neiyi": "内衣",
    "waiyi": "外衣", "waitao": "外套",
    "maoyi": "毛衣", "chenshan": "衬衫",
    "xifu": "西服", "tongzhuang": "童装",
    "lianshenyi": "连体衣", "yongzhuang": "泳装",
    "kuzhao": "裤袜", "huoban": "伙伴",
    "zhua": "爪", "long": "龙",
    "hu": "虎", "laohu": "虎",
    "gou": "狗", "mao": "猫",
    "tu": "兔", "huli": "狐",
    "lu": "鹿", "niao": "鸟",
    "yu": "鱼", "chong": "虫",
    # 常见复合词（拼音连写）
    "datuibangdai": "大腿绑带",
    "maozituer": "帽子兔耳",
    "lingdaixiangquan": "领带项圈",
    "jiaohuantuwei": "脚环腿围",
    "erzhuifashi": "耳坠发饰",
    "jiantou": "肩头",
    "jianbu": "肩部",
    "yaobu": "腰部",
    "dantian": "丹田",
    "fubu": "腹部",
    "beibu": "背部",
    "gezhiwo": "腋窝",
    "tuiwan": "腿弯",
    "xigai": "膝盖",
    "jiaohuai": "脚踝",
    "yinmao": "阴毛",
    "ys": "外套",
    "yx": "裙摆",
}
# ── 变量名→中文释义（精确匹配优先） ──
VAR_GLOSSARY = {
    "bodytex": "身体皮肤纹理", "skin": "皮肤纹理", "body": "身体纹理",
    "head": "头部纹理", "face": "面部纹理", "facepaint": "面妆",
    "e": "眼睛样式", "eyes": "眼睛样式", "f": "面部样式", "h": "头发样式",
    "hair": "头发样式", "eyebrow": "眉毛样式", "brow": "眉毛样式",
    "eyelash": "睫毛样式", "lash": "睫毛样式", "iris": "虹膜样式", "pupil": "瞳孔样式",
    "boobsize": "胸部大小", "breast": "胸部大小", "bust": "胸部大小",
    "butt": "臀部大小", "ass": "臀部大小", "hip": "臀部大小",
    "waist": "腰部粗细", "thicc": "大腿粗细", "thigh": "大腿粗细",
    "legs": "腿部粗细", "leg": "腿部样式", "armsize": "手臂粗细",
    "arm": "手臂样式", "arms": "手臂样式", "muscle": "肌肉线条",
    "pubes": "下体毛发样式", "pubic": "下体毛发样式",
    "shine": "皮肤光泽度", "gloss": "皮肤光泽度",
    "wet": "湿润效果", "sweat": "汗液效果", "oily": "油光效果",
    "tattoos": "纹身样式", "tattoo": "纹身样式", "scar": "伤疤样式",
    "nails": "指甲样式", "nail": "指甲样式", "toenail": "脚指甲样式",
    "tail": "尾巴样式", "ears": "耳朵样式", "horn": "角样式",
    "wing": "翅膀样式", "halo": "光环样式",
    "headacc": "头饰样式", "headwear": "头饰样式", "hat": "帽子样式",
    "glasses": "眼镜样式", "eyepatch": "眼罩",
    "choker": "项圈样式", "necklace": "项链样式", "collar": "项圈样式",
    "earring": "耳环样式", "earrings": "耳环样式",
    "anklet": "脚链样式", "bracelet": "手链样式", "ring": "戒指样式",
    "belt": "腰带样式", "charm": "挂饰样式", "mask": "面具样式",
    "top": "上衣样式", "bra": "胸罩样式", "shirt": "衬衫样式",
    "blouse": "上衣样式", "jacket": "外套样式", "coat": "外套样式",
    "cloak": "披风样式", "cape": "披风样式", "sweater": "毛衣样式",
    "vest": "背心样式", "corset": "束腰样式",
    "panties": "内裤样式", "underwear": "内裤样式", "bottom": "下装样式",
    "pants": "裤子样式", "skirt": "裙子样式", "shorts": "短裤样式",
    "leotard": "连体衣样式", "bodysuit": "连体衣样式",
    "garter": "吊袜带样式", "straps": "肩带样式",
    "stockings": "丝袜样式", "socks": "袜子样式",
    "tights": "连裤袜样式", "pantyhose": "连裤袜样式",
    "thong": "丁字裤样式", "gstring": "丁字裤样式",
    "sleeve": "袖子样式", "sleeves": "袖子样式",
    "glove": "手套样式", "gloves": "手套样式",
    "cuffs": "袖套样式", "cuff": "袖套样式",
    "bracer": "护腕样式", "gauntlet": "臂铠样式",
    "armlet": "臂环样式", "armband": "臂环样式",
    "dress": "连衣裙样式", "uniform": "制服样式",
    "swimsuit": "泳装样式", "bikini": "比基尼样式",
    "lingerie": "内衣样式", "armor": "盔甲样式", "armour": "盔甲样式",
    "robe": "长袍样式",
    "shoes": "鞋子样式", "boot": "靴子样式", "boots": "靴子样式",
    "heel": "高跟鞋样式", "heels": "高跟鞋样式",
    "sandals": "凉鞋样式", "slipper": "拖鞋样式", "slippers": "拖鞋样式",
    "nipples": "乳头样式", "nipple": "乳头样式",
    "penis": "阴茎样式", "vagina": "阴道样式",
    "labia": "阴唇样式", "anus": "肛门样式",
    "piercing": "穿孔样式", "piercings": "穿孔样式",
    "tentacle": "触手样式",
    "cum": "体液效果", "sperm": "精液效果", "semen": "精液效果",
    "drool": "口水效果", "slime": "黏液效果",
    "alpha": "透明度", "opacity": "不透明度",
    "color": "颜色选择", "pattern": "图案样式",
    "style": "风格样式", "variant": "变体选择",
    "version": "版本选择", "detail": "细节程度",
    "quality": "质量等级", "lod": "细节级别",
    "veil": "面纱样式", "cross": "十字架样式",
    "shangyi": "上衣样式", "liushui": "流水效果", "youguang": "油光效果",
    "youguangsiwa": "油光丝袜样式", "zhuangrong": "妆容样式", "jiaohuan": "脚环样式",
    "toushi": "透视样式", "toufa": "头发样式", "yanjing": "眼镜样式",
    "texiao": "特效样式", "siwa": "丝袜样式", "qunbai": "裙摆样式",
    "xiezi": "鞋子样式", "bozi": "脖子样式", "xiuzi": "袖子样式",
    "xiongxing": "胸型样式", "hudiejie": "蝴蝶结样式", "fashi": "发饰样式",
    "mianju": "面具样式", "lian": "脸型样式", "meimao": "眉毛样式",
    "jie": "戒指样式", "xianglian": "项链样式", "erhuan": "耳环样式",
    "bao": "包样式", "weijin": "围巾样式", "maozi": "帽子样式",
    "cloth": "布料样式", "fabric": "布料样式",
    "weiba": "尾巴样式", "fubu": "腹部样式", "toujin": "头巾样式",
    "jingji": "颈饰样式", "kuijia": "盔甲样式", "xiongyi": "胸衣样式",
    "chibang": "翅膀样式", "huan": "环饰样式", "lian": "链饰样式",
    "lace": "蕾丝样式", "ribbon": "丝带样式",
    "bow": "蝴蝶结样式", "flower": "花朵样式",
    "crown": "皇冠样式", "tiara": "头冠样式",
    "bell": "铃铛样式", "heart": "爱心样式",
    "star": "星星样式", "moon": "月亮样式",
    "cat": "猫耳样式", "bear": "熊耳样式",
    "bunny": "兔耳样式", "fox": "狐耳样式",
    "devil": "恶魔样式", "angel": "天使样式",
    "demon": "恶魔样式", "gothic": "哥特样式",
    "plain": "素体样式", "nude": "裸体样式",
    "t5": "丝袜材质样式",
    "swapvar_a": "丝袜图案样式",
}

FALLBACK = {
    "body": "身体", "head": "头部", "face": "面部", "hair": "头发",
    "eye": "眼睛", "ear": "耳朵", "nose": "鼻子", "mouth": "嘴巴",
    "lip": "嘴唇", "tongue": "舌头", "neck": "脖子", "chest": "胸部",
    "breast": "胸部", "bust": "胸部", "back": "背部", "shoulder": "肩膀",
    "arm": "手臂", "hand": "手", "finger": "手指", "nail": "指甲",
    "waist": "腰部", "hip": "臀部", "butt": "臀部", "leg": "腿",
    "thigh": "大腿", "knee": "膝盖", "calf": "小腿", "foot": "脚",
    "ankle": "脚踝", "wrist": "手腕",
    "top": "上衣", "bottom": "下装", "pantie": "内裤", "bra": "胸罩",
    "shirt": "衬衫", "blouse": "上衣", "jacket": "外套", "coat": "外套",
    "vest": "背心", "sweater": "毛衣", "hoodie": "连帽衫",
    "dress": "连衣裙", "skirt": "裙子", "pants": "裤子", "short": "短裤",
    "tight": "紧身", "legging": " leggings", "stocking": "丝袜",
    "sock": "袜子", "shoe": "鞋子", "boot": "靴子", "sandal": "凉鞋",
    "slipper": "拖鞋", "glove": "手套", "hat": "帽子", "cap": "帽子",
    "hood": "兜帽", "belt": "腰带", "collar": "领子", "necklace": "项链",
    "choker": "项圈", "ring": "戒指", "earring": "耳环", "bracelet": "手链",
    "garter": "吊袜带", "strap": "带子", "lace": "蕾丝",
    "ribbon": "丝带", "bow": "蝴蝶结", "veil": "面纱", "mask": "面具",
    "crown": "皇冠", "tiara": "头冠",
    "tail": "尾巴", "wing": "翅膀", "horn": "角", "halo": "光环",
    "piercing": "穿孔", "tattoo": "纹身", "scar": "伤疤", "cross": "十字架",
    "shine": "光泽", "gloss": "光泽", "wet": "湿润", "sweat": "汗液",
    "oily": "油光", "pube": "阴毛", "nipple": "乳头",
    "penis": "阴茎", "vagina": "阴道", "anus": "肛门",
    "size": "大小", "color": "颜色", "style": "样式", "type": "类型",
    "mode": "模式", "tex": "纹理", "skin": "皮肤",
    "alpha": "透明度", "detail": "细节",
}


def split_var(name: str) -> list:
    """将变量名拆分为有意义的小写词条"""
    # 去除常见前缀
    for prefix in ["swapvar_", "var_", "tex_"]:
        if name.startswith(prefix):
            name = name[len(prefix):]
            break
    return re.findall(r"[a-z]+", name, re.IGNORECASE)


def guess_chinese(var_name: str) -> str:
    v = var_name.lower()

    # 0. 本地词典优先
    local = get_local_translation(v)
    if local:
        return local

    # 1. 精确匹配
    if v in VAR_GLOSSARY:
        return VAR_GLOSSARY[v]
    if v in PINYIN_MAP:
        return PINYIN_MAP[v] + "样式"

    # 2. 拆分匹配
    words = split_var(v)
    if not words:
        return ""

    cn_parts = []
    unknown = []
    for w in words:
        wl = w.lower()
        if wl in PINYIN_MAP:
            cn_parts.append(PINYIN_MAP[wl])
        elif wl in VAR_GLOSSARY:
            cn_parts.append(VAR_GLOSSARY[wl])
        elif wl in FALLBACK:
            cn_parts.append(FALLBACK[wl])
        else:
            unknown.append(w)

    if cn_parts:
        result = "".join(cn_parts)
        if not result.endswith("样式"):
            result += "样式"
        return result

    # 3. 部分匹配：混合中英文（untranslated words kept as-is）
    if unknown:
        label = " + ".join(unknown) + "样式"
        return label

    # 4. 完全无法翻译 → 用变量名本身
    return v + "样式"


from wwmi_ini_util import PERSIST_RE as PERSIST_PATTERN, KEY_SECTION_RE as KEY_SECTION, KEY_LINE_RE as KEY_LINE, VAR_LINE_RE as VAR_LINE

EXISTING_COMMENT = re.compile(r"^;\s*[^\r\n]*(?:\u3010|\u6837\u5f0f)")

def parse_binding(raw: str) -> tuple:
    """解析 WWMI 绑定字符串 -> (modifiers_set, base_key)"""
    if not raw:
        return (set(), "")
    raw = raw.strip()
    mods = set()
    tokens = raw.split()
    while tokens and (tokens[0].lower() in NO_MAP or tokens[0].lower() in MOD_MAP):
        token = tokens.pop(0)
        if token.lower() in MOD_MAP:
            mods.add(MOD_MAP[token.lower()])
    key = " ".join(tokens).strip()
    key = VK_MAP.get(key.upper(), key.lower())
    return (mods, key)


def make_comment(chinese: str, binding: str = "", values: str = "") -> str:
    parts = ["; "]
    if binding:
        parts.append(f"\u3010{binding}\u3011 ")
    parts.append(chinese)
    if values:
        parts.append(f" \uff08{values}\uff09")
    comment = "".join(parts)
    # 如果注释除了"; "没有有意义的内容，跳过
    if comment.strip() in (";", "; "):
        return ""
    return comment + "\n"


normalize_key = _nk


def scan_key_sections(lines: list) -> tuple:
    """返回 (var→(key,vals), key→var) 两个映射"""
    result = {}
    key_to_var = {}
    current_var = None
    in_key_section = False
    for line in lines:
        s = line.strip()
        if KEY_SECTION.match(s):
            in_key_section = True
            current_var = None
            result.pop("__key__", None)
            continue
        if in_key_section and s.startswith("["):
            in_key_section = False
            current_var = None
            result.pop("__key__", None)
            continue
        if in_key_section:
            km = KEY_LINE.match(s)
            if km and current_var is None:
                current_var = "__waiting__"
                result["__key__"] = normalize_key(km.group(1))
                continue
            vm = VAR_LINE.match(s)
            if vm and "__key__" in result:
                vname = vm.group(1).lower()
                vals = vm.group(2).replace(" ", "")
                key = result["__key__"]
                result[vname] = (key, vals)
                key_to_var[key] = vname
                current_var = vname
                continue
            if current_var == "__waiting__":
                current_var = None
    return (result, key_to_var)


# 键盘区域编号
REGION_MAIN = 0       # 主键盘区（数字→字母→符号）
REGION_EDIT = 1       # 编辑控制键区
REGION_NUMPAD = 2     # 数字键区
REGION_FN = 3         # 功能键区
REGION_OTHER = 4      # 其他

# 修饰符权重（越小越靠前）
MOD_RANK = {"ctrl": 1, "alt": 2, "shift": 3}

# 主键盘符号顺序（半角→全角挨着）
MAIN_SYMBOL_ORDER = "~`！!@＠#＃$＄%％^＾&＆*＊(（)）_-－=＝+＋[【]】{｛}｝|｜\\、;；:：'＇\"＂,，<＜.。>＞/？?  "

# 编辑控制键顺序
EDIT_ORDER = {
    "up": 0, "down": 1, "left": 2, "right": 3,
    "home": 10, "end": 11, "page up": 12, "page down": 13,
    "insert": 20, "delete": 21, "backspace": 22,
    "space": 30, "enter": 31, "tab": 32, "esc": 33,
}

# 功能键顺序
FN_ORDER = {f"f{i}": i for i in range(1, 25)}


def classify_key(key: str) -> tuple:
    """返回 (region, order)"""
    if not key:
        return (REGION_OTHER, 999)

    # 数字键 → main区域
    if key in "0123456789":
        return (REGION_MAIN, int(key))

    # 字母键 → main区域
    if key.isalpha() and len(key) == 1:
        return (REGION_MAIN, 100 + (ord(key.lower()) - ord("a")))

    # 主键盘符号
    idx = MAIN_SYMBOL_ORDER.find(key)
    if idx >= 0:
        return (REGION_MAIN, 200 + idx)

    # 编辑控制键
    if key in EDIT_ORDER:
        return (REGION_EDIT, EDIT_ORDER[key])

    # 功能键
    if key in FN_ORDER:
        return (REGION_FN, FN_ORDER[key])

    # 数字键区（numpad）
    if key.startswith("numpad"):
        num = key[len("numpad"):]
        if num.isdigit():
            return (REGION_NUMPAD, int(num))
        # numpad 符号
        sym_order = {"+": 0, "-": 1, "*": 2, "/": 3, ".": 4}
        return (REGION_NUMPAD, 100 + sym_order.get(num, 99))

    return (REGION_OTHER, 990)


def persist_sort_key(item: tuple) -> tuple:
    """排序键：(是否组合, 修饰符权重, 区域, 区内序号)"""
    var_name, persist_line, comment_line, binding, values = item
    mods, key = parse_binding(binding)

    is_combo = 1 if mods else 0
    mod_rank = sum(MOD_RANK.get(m, 0) for m in mods)
    region, order = classify_key(key)

    return (is_combo, mod_rank, region, order)


# 中文方向箭头 → 英文
DIR_MAP = {"↑": "up", "↓": "down", "←": "left", "→": "right"}


def normalize_readme_key(raw: str) -> str:
    """将说明文件中的按键描述转为标准格式
    "ctrl + ↑" → "ctrl up"
    "shift + →" → "shift right"
    "ctrl+R"   → "ctrl r"
    """
    raw = raw.strip()
    for cn, en in DIR_MAP.items():
        raw = raw.replace(cn, en)
    raw = raw.replace("+", " ")
    raw = raw.replace("  ", " ")
    return normalize_key(raw)


def scan_readme(filepath: str) -> tuple:
    """扫描目录及父目录下的 readme/说明 文件，返回 (var→cn, key→cn) 两个映射"""
    var_map = {}
    key_map = {}
    candidates = []
    base = os.path.dirname(filepath)
    # 当前目录 + 父目录
    for d in (base, os.path.dirname(base)):
        if d == os.path.dirname(d):
            continue  # 根目录跳过
        try:
            for fn in os.listdir(d):
                low = fn.lower()
                if low.startswith("说明") or "readme" in low:
                    candidates.append(os.path.join(d, fn))
        except Exception:
            pass
    # 去重
    seen = set()
    unique = []
    for fp in candidates:
        if fp not in seen:
            seen.add(fp)
            unique.append(fp)
    for fp in unique:
        try:
            with open(fp, "r", encoding="utf-8") as f:
                content = f.read()
            # $var : / = 中文
            for m in re.finditer(r'[＄$](\w+)\s*[:：=]\s*([^\n\r]+)', content):
                var_map[m.group(1).lower()] = m.group(2).strip()
            # "key" description  (both Chinese and ASCII quotes)
            # 只保留第一条匹配（中文说明在前），跳过后续重复
            for m in re.finditer(r'[\u201c"]([^"\u201d]+)[\u201d"]\s*([^\n\r]+)', content):
                key_raw = m.group(1).strip()
                desc = m.group(2).strip()
                if desc and key_raw:
                    nk = normalize_readme_key(key_raw)
                    if nk and nk not in key_map:
                        key_map[nk] = desc
        except Exception:
            pass
    return (var_map, key_map)


def resolve_dict_translation(filepath: str, var_name: str, binding: str, readme_var: dict, readme_key: dict) -> str:
    candidates = []

    image_chinese, image_path = scan_image_translation(filepath, var_name)
    candidates.append({
        "translation": image_chinese,
        "source": "image",
        "source_path": image_path,
    })

    context_chinese = readme_var.get(var_name, "") or readme_key.get(binding, "")
    candidates.append({
        "translation": context_chinese,
        "source": "file_context",
        "source_path": filepath,
    })

    online_chinese = ""
    if not image_chinese and not context_chinese:
        online_chinese = query_online_translation(var_name)
        candidates.append({
            "translation": online_chinese,
            "source": "online_query",
            "source_path": "https://api.mymemory.translated.net/get",
        })

    chosen = update_local_dict(var_name, candidates)
    if chosen:
        return chosen

    builtin = guess_chinese(var_name)
    update_local_dict(var_name, [{
        "translation": builtin,
        "source": "builtin" if builtin else "untranslated",
        "source_path": __file__ if builtin else filepath,
    }])
    return builtin


def process_file(filepath: str) -> int:
    if not os.path.isfile(filepath):
        sp(f"[ERR] 文件不存在 - {os.path.basename(filepath)}")
        return -1
    readme_var, readme_key = scan_readme(filepath)

    with open(filepath, "r", encoding="utf-8") as f:
        lines = f.readlines()
    key_map, key_to_var = scan_key_sections(lines)

    blocks = []
    removed = set()

    for i, line in enumerate(lines):
        stripped = line.rstrip()
        m = PERSIST_PATTERN.search(stripped)
        if not m:
            continue
        var_name = m.group(2).lower()

        binding, values = key_map.get(var_name, ("", ""))
        chinese = resolve_dict_translation(filepath, var_name, binding, readme_var, readme_key)

        # 无论能否翻译，先清理旧注释
        if i > 0 and EXISTING_COMMENT.match(lines[i - 1].rstrip()):
            removed.add(i - 1)

        if not chinese:
            # 旧注释已清理掉，保留原 persist 行（不添加中文注释）
            continue

        new_comment = make_comment(chinese, binding, values)

        blocks.append((var_name, line, new_comment, binding, values))
        removed.add(i)

    if not blocks:
        sp(f"[--] 无待翻译行或已全部注释 -> {os.path.basename(filepath)}")
        return 0

    blocks.sort(key=persist_sort_key)
    insert_pos = min(removed)

    output = []
    blocks_written = False
    for i, line in enumerate(lines):
        if i in removed:
            continue
        if not blocks_written and i > insert_pos:
            for _, persist_line, new_comment, _, _ in blocks:
                output.append(new_comment)
                output.append(persist_line)
            blocks_written = True
        output.append(line)

    # if insert_pos was at the very end
    if not blocks_written:
        for _, persist_line, new_comment, _, _ in blocks:
            output.append(new_comment)
            output.append(persist_line)

    with open(filepath, "w", encoding="utf-8") as f:
        f.writelines(output)
    sp(f"[OK] 已翻译 {len(blocks)} 行 -> {os.path.basename(filepath)}")
    return len(blocks)


def main():
    args = sys.argv[1:]
    if not args:
        sp("用法: python translate.py <file1> [file2 ...]")
        sp("示例: python translate.py D:\\path\\to\\Interface.ini")
        sys.exit(1)
    for fp in args:
        process_file(fp)


if __name__ == "__main__":
    main()
