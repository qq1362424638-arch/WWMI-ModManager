import re, sys, os, json, urllib.parse, urllib.request
from wwmi_ini_util import sp, VK_MAP, MOD_MAP, NO_MAP, parse_key, normalize_key as _nk, binding_sort_key

# 鏈湴璇嶅吀璺緞锛堜笌鑴氭湰鍚岀洰褰曪級
LOCAL_DICT = os.environ.get("WWMI_LOCAL_DICT_FILE") or os.path.join(os.path.dirname(__file__), "local_dict.json")
SOURCE_PRIORITY = {
    "image": 30,
    "file_context": 20,
    "pinyin": 15,
    "online_query": 10,
    "builtin": 0,
    "untranslated": -10,
    "legacy": -20,
}
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}
EDGE_SYMBOLS = " \t\r\n;:：+-_—–`'\"“”‘’?,，。\\|!！?？*·"
WRAPPER_SYMBOLS = "[]【】{}<>《》"
INVALID_TRANSLATION_LABELS = {
    "榛樿鍙橀噺",
    "鍙橀噺",
    "鎸夐敭",
    "閿綅",
    "鏍峰紡",
    "鍒囨崲",
}
AMBIGUOUS_PINYIN_TRANSLATIONS = {
    "xiaban": "下半；下摆",
    "yinwen": "淫纹；阴纹",
}


def load_local_dict() -> dict:
    try:
        with open(LOCAL_DICT, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def normalize_dict_entry(value) -> dict:
    if isinstance(value, dict):
        translation = sanitize_translation(value.get("translation", ""))
        sources = []
        raw_sources = value.get("sources", [])
        if isinstance(raw_sources, list):
            for source in raw_sources:
                if not isinstance(source, dict):
                    continue
                source_translation = sanitize_translation(source.get("translation", ""))
                if not source_translation:
                    continue
                sources.append({
                    "translation": source_translation,
                    "source": str(source.get("source", "") or ""),
                    "source_path": str(source.get("source_path", "") or ""),
                })
        entry = {
            "translation": translation,
            "source": str(value.get("source", "") or ""),
            "source_path": str(value.get("source_path", "") or ""),
            "sources": sources,
        }
        if not translation and entry["source"] not in ("untranslated", ""):
            entry["source"] = "untranslated"
            entry["source_path"] = ""
        return entry
    translation = sanitize_translation(value)
    return {
        "translation": translation,
        "source": "legacy" if translation else "untranslated",
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
            "translation": sanitize_translation(candidate.get("translation", "")),
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
    m = re.search(r"[\u4e00-\u9fff][\u4e00-\u9fffA-Za-z0-9 _+\-锛堬級()銆愩€慮*", text or "")
    return sanitize_translation(m.group(0)) if m else ""


def sanitize_translation(text: str) -> str:
    text = re.sub(r"\s+", " ", str(text or "")).strip(EDGE_SYMBOLS)
    text = text.strip(WRAPPER_SYMBOLS).strip(EDGE_SYMBOLS)
    text = re.sub(r"^(?:璇存槑|鎻忚堪|缈昏瘧|涓枃|鍚嶇О|閫夐」)\s*[:锛?]\s*", "", text).strip(EDGE_SYMBOLS)
    text = re.sub(r"^[锛?]\s*[\d\s,锛屻€?|;锛?-]+\s*[)锛塢\s*", "", text).strip(EDGE_SYMBOLS)
    text = re.sub(r"\s*[锛?]\s*[\d\s,锛屻€?|;锛?-]+\s*[)锛塢\s*$", "", text).strip(EDGE_SYMBOLS)
    text = text.strip(WRAPPER_SYMBOLS).strip(EDGE_SYMBOLS)
    text = re.sub(r"\s*(?:#|//).*$", "", text).strip(EDGE_SYMBOLS)
    return text if is_valid_translation(text) else ""


def is_valid_translation(text: str) -> bool:
    if not text or not re.search(r"[\u4e00-\u9fff]", text):
        return False
    compact = re.sub(r"\s+", "", text)
    if compact in INVALID_TRANSLATION_LABELS:
        return False
    if compact.startswith("榛樿鍙橀噺"):
        return False
    if re.search(r"\b(?:global|persist|key|type|condition|namespace)\b\s*=", text, re.IGNORECASE):
        return False
    if len(text) > 40:
        return False
    return True


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
                return sanitize_translation(value)
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
    m = re.search(pattern + r"\s*[:锛?\-]\s*([^\r\n]+)", text, re.IGNORECASE)
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


# 鈹€鈹€ 鎷奸煶/甯歌鍙橀噺鍚?鈫?涓枃閲婁箟 鈹€鈹€
PINYIN_MAP = {
    "xiongbu": "鑳搁儴", "xiong": "鑳搁儴", "ru": "涔虫埧",
    "shoubi": "鎵嬭噦", "shouwan": "鎵嬭厱",
    "lingdai": "椤瑰湀", "xiangquan": "椤瑰湀",
    "neiku": "鍐呰￥", "waiku": "澶栬￥",
    "xiezi": "闉嬪瓙", "tunv": "鑷€閮?,
    "maozi": "甯藉瓙", "tuer": "鍏旇€?,
    "erzhui": "鑰冲潬", "fashi": "鍙戦グ",
    "jiaohuan": "鑴氱幆", "tuwei": "鑵垮洿",
    "suolian": "閿侀摼", "shangban": "涓婂崐", "xiaban": "涓嬫憜",
    "yuan": "鍦?, "yuang": "鍦?, "yuangxiongbu": "鍦嗚兏閮?,
    "lingzi": "棰嗗瓙",
    "yousi": "娌逛笣", "youguang": "娌瑰厜",
    "siwa": "涓濊", "dingziku": "涓佸瓧瑁?,
    "xiangzi": "绠卞瓙", "shoutao": "鎵嬪",
    "yanjing": "鐪肩潧", "toufa": "澶村彂",
    "weiba": "灏惧反", "chibang": "缈呰唨",
    "mianju": "闈㈠叿", "hudiejie": "铦磋澏缁?,
    "bozi": "鑴栧瓙", "jingquan": "棰堝湀",
    "yaobu": "鑵伴儴", "yaodai": "鑵板甫",
    "datui": "澶ц吙", "xiaotui": "灏忚吙",
    "jiaomo": "鑴氶儴", "jiaozhi": "鑴氳毒",
    "toujin": "澶村肪", "weijin": "鍥村肪",
    "yumao": "缇芥瘺", "erhuan": "鑰崇幆",
    "xianglian": "椤归摼", "jie": "鎴掓寚",
    "yangju": "闃冲叿", "yindi": "闃磋拏",
    "yinchun": "闃村攪", "yindao": "闃撮亾",
    "gangmen": "鑲涢棬", "ruyun": "涔虫檿",
    "maofa": "姣涘彂", "gongbu": "宸ラ儴",
    "xiongzhao": "鑳哥僵", "kuzi": "瑁ゅ瓙",
    "qunzi": "瑁欏瓙", "changqun": "闀胯",
    "duanqun": "鐭", "neiyi": "鍐呰。",
    "waiyi": "澶栬。", "waitao": "澶栧",
    "maoyi": "姣涜。", "chenshan": "琛～",
    "xifu": "瑗挎湇", "tongzhuang": "绔ヨ",
    "lianshenyi": "杩炰綋琛?, "yongzhuang": "娉宠",
    "kuzhao": "瑁よ", "huoban": "浼欎即",
    "zhua": "鐖?, "long": "榫?,
    "hu": "铏?, "laohu": "铏?,
    "gou": "鐙?, "mao": "鐚?,
    "tu": "鍏?, "huli": "鐙?,
    "lu": "楣?, "niao": "楦?,
    "yu": "楸?, "chong": "铏?,
    # 甯歌澶嶅悎璇嶏紙鎷奸煶杩炲啓锛?    "datuibangdai": "澶ц吙缁戝甫",
    "maozituer": "甯藉瓙鍏旇€?,
    "lingdaixiangquan": "棰嗗甫椤瑰湀",
    "jiaohuantuwei": "鑴氱幆鑵垮洿",
    "erzhuifashi": "鑰冲潬鍙戦グ",
    "jiantou": "鑲╁ご",
    "jianbu": "鑲╅儴",
    "yaobu": "鑵伴儴",
    "dantian": "涓圭敯",
    "fubu": "鑵归儴",
    "beibu": "鑳岄儴",
    "gezhiwo": "鑵嬬獫",
    "tuiwan": "鑵垮集",
    "xigai": "鑶濈洊",
    "jiaohuai": "鑴氳笣",
    "yinmao": "闃存瘺",
    "ys": "澶栧",
    "yx": "瑁欐憜",
}
# 鈹€鈹€ 鍙橀噺鍚嶁啋涓枃閲婁箟锛堢簿纭尮閰嶄紭鍏堬級 鈹€鈹€
VAR_GLOSSARY = {
    "bodytex": "韬綋鐨偆绾圭悊", "skin": "鐨偆绾圭悊", "body": "韬綋绾圭悊",
    "head": "澶撮儴绾圭悊", "face": "闈㈤儴绾圭悊", "facepaint": "闈㈠",
    "e": "鐪肩潧鏍峰紡", "eyes": "鐪肩潧鏍峰紡", "f": "闈㈤儴鏍峰紡", "h": "澶村彂鏍峰紡",
    "hair": "澶村彂鏍峰紡", "eyebrow": "鐪夋瘺鏍峰紡", "brow": "鐪夋瘺鏍峰紡",
    "eyelash": "鐫瘺鏍峰紡", "lash": "鐫瘺鏍峰紡", "iris": "铏硅啘鏍峰紡", "pupil": "鐬冲瓟鏍峰紡",
    "boobsize": "鑳搁儴澶у皬", "breast": "鑳搁儴澶у皬", "bust": "鑳搁儴澶у皬",
    "butt": "鑷€閮ㄥぇ灏?, "ass": "鑷€閮ㄥぇ灏?, "hip": "鑷€閮ㄥぇ灏?,
    "waist": "鑵伴儴绮楃粏", "thicc": "澶ц吙绮楃粏", "thigh": "澶ц吙绮楃粏",
    "legs": "鑵块儴绮楃粏", "leg": "鑵块儴鏍峰紡", "armsize": "鎵嬭噦绮楃粏",
    "arm": "鎵嬭噦鏍峰紡", "arms": "鎵嬭噦鏍峰紡", "muscle": "鑲岃倝绾挎潯",
    "pubes": "涓嬩綋姣涘彂鏍峰紡", "pubic": "涓嬩綋姣涘彂鏍峰紡",
    "shine": "鐨偆鍏夋辰搴?, "gloss": "鐨偆鍏夋辰搴?,
    "wet": "婀挎鼎鏁堟灉", "sweat": "姹楁恫鏁堟灉", "oily": "娌瑰厜鏁堟灉",
    "tattoos": "绾硅韩鏍峰紡", "tattoo": "绾硅韩鏍峰紡", "scar": "浼ょ枻鏍峰紡",
    "nails": "鎸囩敳鏍峰紡", "nail": "鎸囩敳鏍峰紡", "toenail": "鑴氭寚鐢叉牱寮?,
    "tail": "灏惧反鏍峰紡", "ears": "鑰虫湹鏍峰紡", "horn": "瑙掓牱寮?,
    "wing": "缈呰唨鏍峰紡", "halo": "鍏夌幆鏍峰紡",
    "headacc": "澶撮グ鏍峰紡", "headwear": "澶撮グ鏍峰紡", "hat": "甯藉瓙鏍峰紡",
    "glasses": "鐪奸暅鏍峰紡", "eyepatch": "鐪肩僵",
    "choker": "椤瑰湀鏍峰紡", "necklace": "椤归摼鏍峰紡", "collar": "椤瑰湀鏍峰紡",
    "diaodai": "鍚婂甫鏍峰紡",
    "earring": "鑰崇幆鏍峰紡", "earrings": "鑰崇幆鏍峰紡",
    "anklet": "鑴氶摼鏍峰紡", "bracelet": "鎵嬮摼鏍峰紡", "ring": "鎴掓寚鏍峰紡",
    "belt": "鑵板甫鏍峰紡", "charm": "鎸傞グ鏍峰紡", "mask": "闈㈠叿鏍峰紡",
    "top": "涓婅。鏍峰紡", "front": "鍓嶄晶鏍峰紡", "back": "鑳岄儴鏍峰紡",
    "mouse_clicked": "榧犳爣鐐瑰嚮",
    "makeup": "濡嗗鏍峰紡", "bra": "鑳哥僵鏍峰紡", "shirt": "琛～鏍峰紡",
    "blouse": "涓婅。鏍峰紡", "jacket": "澶栧鏍峰紡", "coat": "澶栧鏍峰紡",
    "cloak": "鎶鏍峰紡", "cape": "鎶鏍峰紡", "sweater": "姣涜。鏍峰紡",
    "vest": "鑳屽績鏍峰紡", "corset": "鏉熻叞鏍峰紡",
    "panties": "鍐呰￥鏍峰紡", "underwear": "鍐呰￥鏍峰紡", "bottom": "涓嬭鏍峰紡",
    "pants": "瑁ゅ瓙鏍峰紡", "skirt": "瑁欏瓙鏍峰紡", "shorts": "鐭￥鏍峰紡",
    "leotard": "杩炰綋琛ｆ牱寮?, "bodysuit": "杩炰綋琛ｆ牱寮?,
    "garter": "鍚婅甯︽牱寮?, "straps": "鑲╁甫鏍峰紡",
    "stockings": "涓濊鏍峰紡", "socks": "琚滃瓙鏍峰紡",
    "tights": "杩炶￥琚滄牱寮?, "pantyhose": "杩炶￥琚滄牱寮?,
    "thong": "涓佸瓧瑁ゆ牱寮?, "gstring": "涓佸瓧瑁ゆ牱寮?,
    "sleeve": "琚栧瓙鏍峰紡", "sleeves": "琚栧瓙鏍峰紡",
    "glove": "鎵嬪鏍峰紡", "gloves": "鎵嬪鏍峰紡",
    "cuffs": "琚栧鏍峰紡", "cuff": "琚栧鏍峰紡",
    "bracer": "鎶よ厱鏍峰紡", "gauntlet": "鑷傞摖鏍峰紡",
    "armlet": "鑷傜幆鏍峰紡", "armband": "鑷傜幆鏍峰紡",
    "dress": "杩炶。瑁欐牱寮?, "uniform": "鍒舵湇鏍峰紡",
    "swimsuit": "娉宠鏍峰紡", "bikini": "姣斿熀灏兼牱寮?,
    "lingerie": "鍐呰。鏍峰紡", "armor": "鐩旂敳鏍峰紡", "armour": "鐩旂敳鏍峰紡",
    "robe": "闀胯鏍峰紡",
    "shoes": "闉嬪瓙鏍峰紡", "boot": "闈村瓙鏍峰紡", "boots": "闈村瓙鏍峰紡",
    "heel": "楂樿窡闉嬫牱寮?, "heels": "楂樿窡闉嬫牱寮?,
    "sandals": "鍑夐瀷鏍峰紡", "slipper": "鎷栭瀷鏍峰紡", "slippers": "鎷栭瀷鏍峰紡",
    "nipples": "涔冲ご鏍峰紡", "nipple": "涔冲ご鏍峰紡",
    "penis": "闃磋寧鏍峰紡", "vagina": "闃撮亾鏍峰紡",
    "labia": "闃村攪鏍峰紡", "anus": "鑲涢棬鏍峰紡",
    "piercing": "绌垮瓟鏍峰紡", "piercings": "绌垮瓟鏍峰紡",
    "tentacle": "瑙︽墜鏍峰紡",
    "cum": "浣撴恫鏁堟灉", "sperm": "绮炬恫鏁堟灉", "semen": "绮炬恫鏁堟灉",
    "drool": "鍙ｆ按鏁堟灉", "slime": "榛忔恫鏁堟灉",
    "alpha": "閫忔槑搴?, "opacity": "涓嶉€忔槑搴?,
    "color": "棰滆壊閫夋嫨", "pattern": "鍥炬鏍峰紡",
    "style": "椋庢牸鏍峰紡", "variant": "鍙樹綋閫夋嫨",
    "version": "鐗堟湰閫夋嫨", "detail": "缁嗚妭绋嬪害",
    "quality": "璐ㄩ噺绛夌骇", "lod": "缁嗚妭绾у埆",
    "veil": "闈㈢罕鏍峰紡", "cross": "鍗佸瓧鏋舵牱寮?,
    "shangyi": "涓婅。鏍峰紡", "liushui": "娴佹按鏁堟灉", "youguang": "娌瑰厜鏁堟灉",
    "youguangsiwa": "娌瑰厜涓濊鏍峰紡", "zhuangrong": "濡嗗鏍峰紡", "jiaohuan": "鑴氱幆鏍峰紡",
    "toushi": "閫忚鏍峰紡", "toufa": "澶村彂鏍峰紡", "yanjing": "鐪奸暅鏍峰紡",
    "texiao": "鐗规晥鏍峰紡", "siwa": "涓濊鏍峰紡", "qunbai": "瑁欐憜鏍峰紡",
    "xiezi": "闉嬪瓙鏍峰紡", "waitao": "澶栧鏍峰紡", "qunzi": "瑁欏瓙鏍峰紡", "bozi": "鑴栧瓙鏍峰紡", "xiuzi": "琚栧瓙鏍峰紡",
    "xiongxing": "鑳稿瀷鏍峰紡", "hudiejie": "铦磋澏缁撴牱寮?, "fashi": "鍙戦グ鏍峰紡",
    "mianju": "闈㈠叿鏍峰紡", "lian": "鑴稿瀷鏍峰紡", "meimao": "鐪夋瘺鏍峰紡",
    "jie": "鎴掓寚鏍峰紡", "xianglian": "椤归摼鏍峰紡", "erhuan": "鑰崇幆鏍峰紡",
    "bao": "鍖呮牱寮?, "weijin": "鍥村肪鏍峰紡", "maozi": "甯藉瓙鏍峰紡",
    "cloth": "甯冩枡鏍峰紡", "fabric": "甯冩枡鏍峰紡",
    "weiba": "灏惧反鏍峰紡", "fubu": "鑵归儴鏍峰紡", "toujin": "澶村肪鏍峰紡",
    "jingji": "棰堥グ鏍峰紡", "kuijia": "鐩旂敳鏍峰紡", "xiongyi": "鑳歌。鏍峰紡",
    "chibang": "缈呰唨鏍峰紡", "huan": "鐜グ鏍峰紡", "lian": "閾鹃グ鏍峰紡",
    "lace": "钑句笣鏍峰紡", "ribbon": "涓濆甫鏍峰紡",
    "bow": "铦磋澏缁撴牱寮?, "flower": "鑺辨湹鏍峰紡",
    "crown": "鐨囧啝鏍峰紡", "tiara": "澶村啝鏍峰紡",
    "bell": "閾冮摏鏍峰紡", "heart": "鐖卞績鏍峰紡",
    "star": "鏄熸槦鏍峰紡", "moon": "鏈堜寒鏍峰紡",
    "cat": "鐚€虫牱寮?, "bear": "鐔婅€虫牱寮?,
    "bunny": "鍏旇€虫牱寮?, "fox": "鐙愯€虫牱寮?,
    "devil": "鎭堕瓟鏍峰紡", "angel": "澶╀娇鏍峰紡",
    "demon": "鎭堕瓟鏍峰紡", "gothic": "鍝ョ壒鏍峰紡",
    "plain": "绱犱綋鏍峰紡", "nude": "瑁镐綋鏍峰紡",
    "t5": "涓濊鏉愯川鏍峰紡",
    "swapvar_a": "涓濊鍥炬鏍峰紡",
}

FALLBACK = {
    "body": "韬綋", "head": "澶撮儴", "face": "闈㈤儴", "hair": "澶村彂",
    "eye": "鐪肩潧", "ear": "鑰虫湹", "nose": "榧诲瓙", "mouth": "鍢村反",
    "lip": "鍢村攪", "tongue": "鑸屽ご", "neck": "鑴栧瓙", "chest": "鑳搁儴",
    "breast": "鑳搁儴", "bust": "鑳搁儴", "back": "鑳岄儴", "shoulder": "鑲╄唨",
    "arm": "鎵嬭噦", "hand": "鎵?, "finger": "鎵嬫寚", "nail": "鎸囩敳",
    "waist": "鑵伴儴", "hip": "鑷€閮?, "butt": "鑷€閮?, "leg": "鑵?,
    "thigh": "澶ц吙", "knee": "鑶濈洊", "calf": "灏忚吙", "foot": "鑴?,
    "ankle": "鑴氳笣", "wrist": "鎵嬭厱",
    "top": "涓婅。", "front": "鍓嶄晶", "bottom": "涓嬭", "pantie": "鍐呰￥", "bra": "鑳哥僵",
    "waitao": "澶栧", "qunzi": "瑁欏瓙", "siwa": "涓濊", "yanjing": "鐪奸暅", "xiongxing": "鑳稿瀷", "diaodai": "鍚婂甫",
    "shirt": "琛～", "blouse": "涓婅。", "jacket": "澶栧", "coat": "澶栧",
    "vest": "鑳屽績", "sweater": "姣涜。", "hoodie": "杩炲附琛?,
    "dress": "杩炶。瑁?, "skirt": "瑁欏瓙", "pants": "瑁ゅ瓙", "short": "鐭￥",
    "tight": "绱ц韩", "legging": " leggings", "stocking": "涓濊",
    "sock": "琚滃瓙", "shoe": "闉嬪瓙", "boot": "闈村瓙", "sandal": "鍑夐瀷",
    "slipper": "鎷栭瀷", "glove": "鎵嬪", "hat": "甯藉瓙", "cap": "甯藉瓙",
    "hood": "鍏滃附", "belt": "鑵板甫", "collar": "棰嗗瓙", "necklace": "椤归摼",
    "choker": "椤瑰湀", "ring": "鎴掓寚", "earring": "鑰崇幆", "bracelet": "鎵嬮摼",
    "garter": "鍚婅甯?, "strap": "甯﹀瓙", "lace": "钑句笣",
    "ribbon": "涓濆甫", "bow": "铦磋澏缁?, "veil": "闈㈢罕", "mask": "闈㈠叿",
    "crown": "鐨囧啝", "tiara": "澶村啝",
    "tail": "灏惧反", "wing": "缈呰唨", "horn": "瑙?, "halo": "鍏夌幆",
    "piercing": "绌垮瓟", "tattoo": "绾硅韩", "scar": "浼ょ枻", "cross": "鍗佸瓧鏋?,
    "shine": "鍏夋辰", "gloss": "鍏夋辰", "wet": "婀挎鼎", "sweat": "姹楁恫",
    "oily": "娌瑰厜", "pube": "闃存瘺", "nipple": "涔冲ご",
    "penis": "闃磋寧", "vagina": "闃撮亾", "anus": "鑲涢棬",
    "makeup": "濡嗗", "size": "澶у皬", "color": "棰滆壊", "style": "鏍峰紡", "type": "绫诲瀷",
    "mode": "妯″紡", "tex": "绾圭悊", "skin": "鐨偆",
    "alpha": "閫忔槑搴?, "detail": "缁嗚妭",
}


def split_var(name: str) -> list:
    """灏嗗彉閲忓悕鎷嗗垎涓烘湁鎰忎箟鐨勫皬鍐欒瘝鏉?""
    # 鍘婚櫎甯歌鍓嶇紑
    for prefix in ["swapvar_", "swap_", "var_", "tex_"]:
        if name.startswith(prefix):
            name = name[len(prefix):]
            break
    return re.findall(r"[a-z]+", name, re.IGNORECASE)


def strip_var_prefix(name: str) -> str:
    name = name.lower()
    for prefix in ["swapvar_", "swap_", "var_", "tex_"]:
        if name.startswith(prefix):
            return name[len(prefix):]
    return name


def split_known_terms(text: str) -> list:
    keys = sorted(set(PINYIN_MAP) | set(VAR_GLOSSARY) | set(FALLBACK), key=len, reverse=True)
    result = []
    i = 0
    while i < len(text):
        if not text[i].isalpha():
            i += 1
            continue
        hit = ""
        for key in keys:
            if text.startswith(key, i):
                hit = key
                break
        if hit:
            result.append(hit)
            i += len(hit)
        else:
            j = i + 1
            while j < len(text) and text[j].isalpha() and not any(text.startswith(k, j) for k in keys):
                j += 1
            result.append(text[i:j])
            i = j
    return result


def query_pinyin_translation(var_name: str) -> str:
    v = strip_var_prefix(var_name)
    if v in AMBIGUOUS_PINYIN_TRANSLATIONS:
        return AMBIGUOUS_PINYIN_TRANSLATIONS[v]
    if v in VAR_GLOSSARY:
        return VAR_GLOSSARY[v]
    if v in PINYIN_MAP:
        return PINYIN_MAP[v] + "鏍峰紡"
    if v in FALLBACK:
        return FALLBACK[v] + "鏍峰紡"

    tokens = [t for t in re.split(r"[_\W]+", v) if t]
    if len(tokens) > 1 and all(t in PINYIN_MAP for t in tokens):
        result = "".join(PINYIN_MAP[t] for t in tokens)
        return result if result.endswith("鏍峰紡") else result + "鏍峰紡"

    parts = split_known_terms(v)
    if len(parts) > 1 and any(p in PINYIN_MAP for p in parts):
        cn_parts = []
        for part in parts:
            if part in PINYIN_MAP:
                cn_parts.append(PINYIN_MAP[part])
            elif part in VAR_GLOSSARY:
                cn_parts.append(VAR_GLOSSARY[part])
            elif part in FALLBACK:
                cn_parts.append(FALLBACK[part])
            else:
                return ""
        result = "".join(cn_parts)
        return result if result.endswith("鏍峰紡") else result + "鏍峰紡"
    return ""


def guess_chinese(var_name: str) -> str:
    v = strip_var_prefix(var_name)

    # 0. 鏈湴璇嶅吀浼樺厛
    local = get_local_translation(v)
    if local:
        return local

    # 1. 绮剧‘鍖归厤
    if v in VAR_GLOSSARY:
        return VAR_GLOSSARY[v]
    if v in PINYIN_MAP:
        return PINYIN_MAP[v] + "鏍峰紡"

    # 2. 鎷嗗垎鍖归厤
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
        if not result.endswith("鏍峰紡"):
            result += "鏍峰紡"
        return result

    # 3. 閮ㄥ垎鍖归厤锛氭贩鍚堜腑鑻辨枃锛坲ntranslated words kept as-is锛?    if unknown:
        label = " + ".join(unknown) + "鏍峰紡"
        return label

    # 4. 瀹屽叏鏃犳硶缈昏瘧 鈫?鐢ㄥ彉閲忓悕鏈韩
    return v + "鏍峰紡"


from wwmi_ini_util import PERSIST_RE as PERSIST_PATTERN, KEY_SECTION_RE as KEY_SECTION, KEY_LINE_RE as KEY_LINE, VAR_LINE_RE as VAR_LINE

EXISTING_COMMENT = re.compile(r"^;\s*[^\r\n]*(?:\u3010|\u6837\u5f0f)")

def parse_binding(raw: str) -> tuple:
    """瑙ｆ瀽 WWMI 缁戝畾瀛楃涓?-> (modifiers_set, base_key)"""
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
    # 濡傛灉娉ㄩ噴闄や簡"; "娌℃湁鏈夋剰涔夌殑鍐呭锛岃烦杩?    if comment.strip() in (";", "; "):
        return ""
    return comment + "\n"


normalize_key = _nk


def scan_key_sections(lines: list) -> tuple:
    """杩斿洖 (var鈫?key,vals), key鈫抳ar) 涓や釜鏄犲皠"""
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


# 閿洏鍖哄煙缂栧彿
REGION_MAIN = 0       # 涓婚敭鐩樺尯锛堟暟瀛椻啋瀛楁瘝鈫掔鍙凤級
REGION_EDIT = 1       # 缂栬緫鎺у埗閿尯
REGION_NUMPAD = 4     # 鏁板瓧閿尯
REGION_FN = 2         # 鍔熻兘閿尯
REGION_OTHER = 3      # 鍏朵粬

# 淇グ绗︽潈閲嶏紙瓒婂皬瓒婇潬鍓嶏級
MOD_RANK = {"ctrl": 1, "alt": 2, "shift": 3}

# 涓婚敭鐩樼鍙烽『搴忥紙鍗婅鈫掑叏瑙掓尐鐫€锛?MAIN_SYMBOL_ORDER = "~`锛?@锛?锛?锛?锛區锛?锛?锛?锛?锛塤-锛?锛?锛媅銆怾銆憑锝泒锝潀锝淺\銆?锛?锛?锛嘰"锛?锛?锛?銆?锛?锛?  "

# 缂栬緫鎺у埗閿『搴?EDIT_ORDER = {
    "up": 0, "down": 1, "left": 2, "right": 3,
    "home": 10, "end": 11, "page up": 12, "page down": 13,
    "insert": 20, "delete": 21, "backspace": 22,
    "space": 30, "enter": 31, "tab": 32, "esc": 33,
}

# 鍔熻兘閿『搴?FN_ORDER = {f"f{i}": i for i in range(1, 25)}


def classify_key(key: str) -> tuple:
    """杩斿洖 (region, order)"""
    if not key:
        return (REGION_OTHER, 999)

    # 鏁板瓧閿?鈫?main鍖哄煙
    if key in "0123456789":
        return (REGION_MAIN, int(key))

    # 瀛楁瘝閿?鈫?main鍖哄煙
    if key.isalpha() and len(key) == 1:
        return (REGION_MAIN, 100 + (ord(key.lower()) - ord("a")))

    # 涓婚敭鐩樼鍙?    idx = MAIN_SYMBOL_ORDER.find(key)
    if idx >= 0:
        return (REGION_MAIN, 200 + idx)

    # 缂栬緫鎺у埗閿?    if key in EDIT_ORDER:
        return (REGION_EDIT, EDIT_ORDER[key])

    # 鍔熻兘閿?    if key in FN_ORDER:
        return (REGION_FN, FN_ORDER[key])

    # 鏁板瓧閿尯锛坣umpad锛?    if key.startswith("numpad"):
        num = key[len("numpad"):]
        if num.isdigit():
            return (REGION_NUMPAD, int(num))
        # numpad 绗﹀彿
        sym_order = {"+": 0, "-": 1, "*": 2, "/": 3, ".": 4}
        return (REGION_NUMPAD, 100 + sym_order.get(num, 99))

    return (REGION_OTHER, 990)


def persist_sort_key(item: tuple) -> tuple:
    """鎺掑簭閿細(鏄惁缁勫悎, 淇グ绗︽潈閲? 鍖哄煙, 鍖哄唴搴忓彿)"""
    var_name, persist_line, comment_line, binding, values = item
    return binding_sort_key(binding)


# 涓枃鏂瑰悜绠ご 鈫?鑻辨枃
DIR_MAP = {"鈫?: "up", "鈫?: "down", "鈫?: "left", "鈫?: "right"}


def normalize_readme_key(raw: str) -> str:
    """灏嗚鏄庢枃浠朵腑鐨勬寜閿弿杩拌浆涓烘爣鍑嗘牸寮?    "ctrl + 鈫? 鈫?"ctrl up"
    "shift + 鈫? 鈫?"shift right"
    "ctrl+R"   鈫?"ctrl r"
    """
    raw = raw.strip()
    for cn, en in DIR_MAP.items():
        raw = raw.replace(cn, en)
    raw = raw.replace("+", " ")
    raw = raw.replace("  ", " ")
    return normalize_key(raw)


def read_text_with_fallback(filepath: str) -> str:
    for enc in ("utf-8-sig", "utf-8", "gbk", "gb18030"):
        try:
            with open(filepath, "r", encoding=enc) as f:
                return f.read()
        except Exception:
            pass
    return ""


def scan_readme(filepath: str) -> tuple:
    """鎵弿鐩綍鍙婄埗鐩綍涓嬬殑 readme/璇存槑 鏂囦欢锛岃繑鍥?(var鈫抍n, key鈫抍n) 涓や釜鏄犲皠"""
    var_map = {}
    key_map = {}
    candidates = []
    base = os.path.dirname(filepath)
    # 褰撳墠鐩綍 + 鐖剁洰褰?    for d in (base, os.path.dirname(base)):
        if d == os.path.dirname(d):
            continue  # 鏍圭洰褰曡烦杩?        try:
            for fn in os.listdir(d):
                low = fn.lower()
                if "璇存槑" in low or "readme" in low:
                    candidates.append(os.path.join(d, fn))
        except Exception:
            pass
    # 鍘婚噸
    seen = set()
    unique = []
    for fp in candidates:
        if fp not in seen:
            seen.add(fp)
            unique.append(fp)
    for fp in unique:
        try:
            content = read_text_with_fallback(fp)
            if not content:
                continue
            # $var : / = 涓枃
            for m in re.finditer(r'[锛?](\w+)\s*[:锛?]\s*([^\n\r]+)', content):
                desc = sanitize_translation(m.group(2))
                if desc:
                    var_map[m.group(1).lower()] = desc
            # "key" description  (both Chinese and ASCII quotes)
            # 鍙繚鐣欑涓€鏉″尮閰嶏紙涓枃璇存槑鍦ㄥ墠锛夛紝璺宠繃鍚庣画閲嶅
            key_patterns = [
                r'[\u201c"]([^"\u201d]+)[\u201d"]\s*([^\n\r]+)',
                r"['\u2018]([^'\u2019]+)['\u2019]\s*([^\n\r]+)",
                r"^\s*([A-Za-z0-9_+ ]+)\s*[:锛?\-鈥斺€揮\s*([^\n\r]+)",
            ]
            for pattern in key_patterns:
                for m in re.finditer(pattern, content, re.MULTILINE):
                    key_raw = m.group(1).strip()
                    desc = m.group(2).strip()
                    if desc and key_raw:
                        nk = normalize_readme_key(key_raw)
                        desc = sanitize_translation(desc)
                        if nk and desc and nk not in key_map:
                            key_map[nk] = desc
        except Exception:
            pass
    return (var_map, key_map)


def resolve_dict_translation(filepath: str, var_name: str, binding: str, readme_var: dict, readme_key: dict) -> str:
    candidates = []

    image_chinese, image_path = scan_image_translation(filepath, var_name)
    image_chinese = sanitize_translation(image_chinese)
    candidates.append({
        "translation": image_chinese,
        "source": "image",
        "source_path": image_path,
    })

    context_chinese = sanitize_translation(readme_var.get(var_name, "") or readme_key.get(binding, ""))
    candidates.append({
        "translation": context_chinese,
        "source": "file_context",
        "source_path": filepath,
    })

    online_chinese = ""
    pinyin_chinese = ""
    if not image_chinese and not context_chinese:
        pinyin_chinese = query_pinyin_translation(var_name)
        candidates.append({
            "translation": pinyin_chinese,
            "source": "pinyin",
            "source_path": __file__,
        })

    if not image_chinese and not context_chinese and not pinyin_chinese:
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
        sp(f"[ERR] 鏂囦欢涓嶅瓨鍦?- {os.path.basename(filepath)}")
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

        # 鏃犺鑳藉惁缈昏瘧锛屽厛娓呯悊鏃ф敞閲?        if i > 0 and EXISTING_COMMENT.match(lines[i - 1].rstrip()):
            removed.add(i - 1)

        if not chinese:
            # 鏃ф敞閲婂凡娓呯悊鎺夛紝淇濈暀鍘?persist 琛岋紙涓嶆坊鍔犱腑鏂囨敞閲婏級
            continue

        new_comment = make_comment(chinese, binding, values)

        blocks.append((var_name, line, new_comment, binding, values))
        removed.add(i)

    if not blocks:
        sp(f"[--] 鏃犲緟缈昏瘧琛屾垨宸插叏閮ㄦ敞閲?-> {os.path.basename(filepath)}")
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
    sp(f"[OK] 宸茬炕璇?{len(blocks)} 琛?-> {os.path.basename(filepath)}")
    return len(blocks)


def main():
    args = sys.argv[1:]
    if not args:
        sp("鐢ㄦ硶: python translate.py <file1> [file2 ...]")
        sp("绀轰緥: python translate.py D:\\path\\to\\Interface.ini")
        sys.exit(1)
    for fp in args:
        process_file(fp)


if __name__ == "__main__":
    main()
