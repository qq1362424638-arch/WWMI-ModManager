import os, sys, re, json
sys.stdout.reconfigure(encoding='utf-8')

with open(os.path.join(os.path.dirname(__file__), 'word_dict.json'), 'r', encoding='utf-8') as f:
    word_dict = json.load(f)
with open(os.path.join(os.path.dirname(__file__), 'local_dict.json'), 'r', encoding='utf-8') as f:
    local_dict = json.load(f)

known = set()
for k in word_dict:
    known.add(k.lower())
for k in local_dict:
    known.add(k.lower())

# Common English words that appear in mod variable names
# Filter: only words that are purely alphabetic, >= 3 chars, and look English
english_words = {}
root = r'D:\0Temp\mingchao\WWMI\Mods'

for dirpath, dirnames, filenames in os.walk(root):
    for fn in filenames:
        if not fn.lower().endswith('.ini') or fn.lower().endswith('.bak'):
            continue
        fpath = os.path.join(dirpath, fn)
        try:
            with open(fpath, 'r', encoding='utf-8', errors='ignore') as f:
                for line in f:
                    line = line.strip()
                    for m in re.finditer(r'\$(\w+)', line):
                        var = m.group(1).lower()
                        if var in known or var.startswith('wwmi'):
                            continue
                        # Split by underscore
                        for part in var.split('_'):
                            if len(part) < 3:
                                continue
                            # Check if it looks like English (not pinyin)
                            # English words typically don't start with common pinyin initials
                            # and have specific patterns
                            if part in known:
                                continue
                            # Skip if it's all numbers or has numbers mixed in
                            if re.match(r'^[a-z]+$', part):
                                # This is a pure alphabetic word
                                if part not in english_words:
                                    english_words[part] = set()
                                rel = os.path.relpath(fpath, root).split('\\')[0]
                                english_words[part].add(rel)
        except:
            pass

# Filter to words that appear in multiple categories (more likely to be real English)
multi_cat = {w: cats for w, cats in english_words.items() if len(cats) >= 2}
single_cat = {w: cats for w, cats in english_words.items() if len(cats) == 1}

print('=== 出现在多个类别的英文单词 ===')
for word, cats in sorted(multi_cat.items(), key=lambda x: (-len(x[1]), x[0])):
    cats_str = ', '.join(sorted(cats))
    print(f'  {word:25s} ({len(cats)} categories) <- {cats_str}')

print(f'\n共 {len(multi_cat)} 个多类别英文单词')
print(f'共 {len(single_cat)} 个单类别英文单词')
