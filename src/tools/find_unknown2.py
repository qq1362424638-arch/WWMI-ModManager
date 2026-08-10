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

# Also add common non-translatable patterns
skip_patterns = re.compile(r'^(value|variable|vk_|img_|window_|x_|y_|z_|xx|yy|zz|\d+[a-z]*|[a-z]\d*)$', re.IGNORECASE)

root = r'D:\0Temp\mingchao\WWMI\Mods'
word_usage = {}

for dirpath, dirnames, filenames in os.walk(root):
    for fn in filenames:
        if not fn.lower().endswith('.ini') or fn.lower().endswith('.bak'):
            continue
        fpath = os.path.join(dirpath, fn)
        try:
            with open(fpath, 'r', encoding='utf-8', errors='ignore') as f:
                for line in f:
                    line = line.strip()
                    # Extract variable names from $var patterns
                    for m in re.finditer(r'\$(\w+)', line):
                        var = m.group(1).lower()
                        if var in known or skip_patterns.match(var) or var.startswith('wwmi'):
                            continue
                        # Split by underscore to get individual words
                        parts = var.split('_')
                        for p in parts:
                            if len(p) >= 3 and p not in known and not skip_patterns.match(p):
                                if p not in word_usage:
                                    word_usage[p] = set()
                                rel = os.path.relpath(fpath, root).split('\\')[0]
                                word_usage[p].add(rel)
        except:
            pass

# Sort by number of categories used
sorted_words = sorted(word_usage.items(), key=lambda x: (-len(x[1]), x[0]))

print('=== 词典中缺少的英文单词（按使用范围排序）===')
print()
for word, categories in sorted_words:
    cats = ', '.join(sorted(categories))
    print(f'  {word:25s} <- {cats}')
print(f'\n共 {len(sorted_words)} 个未知单词')
