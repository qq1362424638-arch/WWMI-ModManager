import json, sys
sys.stdout.reconfigure(encoding='utf-8')

with open(r'D:\WWMI-ModManager\src\tools\en_cn_dict.json', 'r', encoding='utf-8') as f:
    d = json.load(f)

# 显示有翻译的单词
print('=== 有翻译的单词 ===')
for word, info in d.items():
    if info.get('chinese'):
        cn = info['chinese']
        src = info['source']
        print(f'  {word}: {cn} (来源: {src})')

print(f'\n共 {len(d)} 个单词')
has_cn = sum(1 for v in d.values() if v.get('chinese'))
no_cn = sum(1 for v in d.values() if not v.get('chinese'))
print(f'有翻译: {has_cn}')
print(f'无翻译: {no_cn}')
