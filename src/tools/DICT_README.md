# 词典管理系统说明

## 概述

词典管理系统用于记录所有ini文件中的英文变量名，并按优先级自动翻译。

## 文件结构

- `en_cn_dict.json` - 主词典文件，包含所有英文单词及其翻译
- `dict_manager.py` - 词典管理器，提供扫描、查询、更新等功能
- `initial_scan.py` - 初始扫描脚本，从所有ini文件构建词典
- `add_translation.py` - 添加翻译脚本
- `sync_dict_to_skills.py` - 同步词典到skills目录

## 翻译来源优先级

1. **image** (优先级1) - 从图片文件名提取的翻译
2. **manual** (优先级2) - 用户手动添加的翻译
3. **file_context** (优先级3) - 从ini文件上下文提取的翻译
4. **web** (优先级4) - 联网查询的翻译
5. **empty** (优先级99) - 无翻译

## 使用方法

### 1. 初始扫描构建词典

```bash
python initial_scan.py
```

扫描所有ini文件，提取英文变量名并记录到词典。

### 2. 查看词典统计

```bash
python dict_manager.py stats
```

显示词典统计信息，包括总单词数、有/无翻译数量、按来源分布等。

### 3. 添加翻译

```bash
python add_translation.py add <word> <chinese> [--source manual|--image|--file_context|--web] [--path <来源路径>]
```

添加翻译到词典。如果单词已有翻译，只有更高优先级的来源才能覆盖。

### 4. 查找单词

```bash
python add_translation.py lookup <word>
```

查看单词的翻译信息。

### 5. 列出无翻译的单词

```bash
python add_translation.py list-no
```

列出所有无翻译的单词。

### 6. 同步到skills目录

```bash
python sync_dict_to_skills.py
```

将词典同步到skills目录，供translate.py使用。

## 词典格式

```json
{
  "word": {
    "chinese": "中文翻译",
    "source": "file_context",
    "source_path": "relative/path/to/file.ini",
    "found_in_files": ["file1.ini", "file2.ini"],
    "created": "2026-08-09 12:00:00",
    "updated": "2026-08-09 12:00:00"
  }
}
```

## 优先级更新规则

- 如果单词无翻译，任何来源都会记录
- 如果单词已有翻译，只有更高优先级的来源才能覆盖
- 优先级顺序：image > manual > file_context > web > empty

## 示例

### 添加图片翻译

```bash
python add_translation.py add hair 头发样式 --source image --path "character/camellya/说明.png"
```

### 添加手动翻译

```bash
python add_translation.py add skirt 裙子样式 --source manual
```

### 从ini文件上下文提取

系统会自动从ini文件的注释中提取翻译线索。

## 注意事项

1. 词典文件按单词首字母排序
2. 同一单词在不同mod中可能有不同的翻译
3. 优先级机制确保高质量翻译不会被低质量翻译覆盖
4. 定期运行 `sync_dict_to_skills.py` 同步到skills目录
