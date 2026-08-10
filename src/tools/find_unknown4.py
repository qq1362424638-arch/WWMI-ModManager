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

# Framework/technical words that don't need translation
skip_words = {
    'count', 'enabled', 'guid', 'mesh', 'mod', 'required', 'state', 'version',
    'vertex', 'wwmi', 'creditinfo', 'frameend', 'framestart', 'activea',
    'mods', 'status', 'time', 'bak', 'blend', 'call', 'counter', 'delay',
    'draw', 'end', 'first', 'height', 'initialized', 'last', 'load', 'max',
    'merge', 'min', 'now', 'offset', 'offsetx', 'offsety', 'out', 'remaps',
    'scalex', 'scaley', 'seed', 'size', 'slot', 'start', 'temp', 'variant',
    'width', 'hash', 'run', 'if', 'else', 'endif', 'ref', 'global', 'type',
    'data', 'format', 'stride', 'filename', 'array', 'resource', 'texture',
    'override', 'check', 'priority', 'match', 'handling', 'skip', 'drawindexed',
    'post', 'backbuffer', 'depthstencil', 'vs', 'ps', 'cs', 'gs', 'hs', 'ds',
    'vb0', 'vb1', 'vb2', 'vb3', 'vb4', 'ib', 'ps_t0', 'ps_t1', 'ps_t2',
    'ps_t3', 'ps_t4', 'ps_t5', 'ps_t6', 'ps_t7', 'cs_t0', 'cs_t1', 'cs_t2',
    'cs_t3', 'cs_u0', 'cs_u1', 'cs_u2', 'cs_u3', 'rwbuffer', 'buffer',
    'texture2d', 'sampler', 'filter', 'addressu', 'addressv', 'addressw',
    'bordercolor', 'miplevels', 'mostdetailedmip', 'firstaireslice',
    'firstsurface slice', 'planefirstslice', 'planesliceoccupiedcount',
    'resourcetype', 'dimension', 'bufferflags', 'byte width', 'structurebytestride',
    'counteroffset', 'hidden', 'append', 'consumed', 'output',
}

root = r'D:\0Temp\mingchao\WWMI\Mods'
english_words = {}

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
                        if var in known or var.startswith('wwmi') or var in skip_words:
                            continue
                        for part in var.split('_'):
                            if len(part) < 3 or part in known or part in skip_words:
                                continue
                            if re.match(r'^[a-z]+$', part):
                                if part not in english_words:
                                    english_words[part] = {'count': 0, 'files': set()}
                                english_words[part]['count'] += 1
                                rel = os.path.relpath(fpath, root)
                                english_words[part]['files'].add(rel.split('\\')[0])
        except:
            pass

# Sort by frequency
sorted_words = sorted(english_words.items(), key=lambda x: (-x[1]['count'], x[0]))

print('=== 需要翻译的英文单词（按出现频率排序）===')
print()
for word, info in sorted_words[:200]:
    cats = ', '.join(sorted(info['files']))[:60]
    print(f'  {word:25s} {info["count"]:4d}x  {cats}')
print(f'\n共 {len(sorted_words)} 个英文单词')
