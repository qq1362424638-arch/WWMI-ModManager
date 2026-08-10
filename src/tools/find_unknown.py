import os, sys, re, json
sys.stdout.reconfigure(encoding='utf-8')

with open(os.path.join(os.path.dirname(__file__), 'word_dict.json'), 'r', encoding='utf-8') as f:
    word_dict = json.load(f)
with open(os.path.join(os.path.dirname(__file__), 'local_dict.json'), 'r', encoding='utf-8') as f:
    local_dict = json.load(f)

known = set()
for k in word_dict:
    for w in k.lower().split():
        known.add(w)
for k in local_dict:
    known.add(k.lower())

root = r'D:\0Temp\mingchao\WWMI\Mods'
unknown_vars = set()
var_usage = {}

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
                        if var not in known and not var.startswith('wwmi'):
                            unknown_vars.add(var)
                            if var not in var_usage:
                                var_usage[var] = []
                            if fpath not in var_usage[var]:
                                var_usage[var].append(fpath)
        except:
            pass

for v in sorted(unknown_vars):
    rels = [os.path.relpath(p, root) for p in var_usage[v][:2]]
    print(f'{v}  <-- {", ".join(rels)}')
print(f'\n共 {len(unknown_vars)} 个未知变量名')
