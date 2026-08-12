// ---------- WWMI Mod 绠＄悊鍣細涓昏繘绋?----------
// 鑱岃矗锛氬垱寤轰富绐楀彛銆佹壂鎻?Mods 鐩綍銆佸鐞嗗惎鐢?鍋滅敤锛圖ISABLED_ 鍓嶇紑锛夈€?//       鐩戝惉鐩綍鍙樺寲銆佸悜娓告垙鍙戦€?F10 閲嶈浇鐑敭銆佹彁渚涙湰鍦板浘鐗囧崗璁€?// 閫傜敤鐜锛歐indows 10/11 x64锛岄福娼?WWMI mod 绠＄悊銆?
const { app, BrowserWindow, ipcMain, dialog, protocol, net, shell, screen, nativeImage } = require('electron')
const fs = require('fs')
const path = require('path')
const fsp = require('fs/promises')
const crypto = require('crypto')
const { pathToFileURL } = require('url')
const { spawn, spawnSync } = require('child_process')
const { getChineseName } = require('./character-map')

// Mods 鏍圭洰褰曪紙WWMI 閫氳繃 d3dx.ini 鐨?include_recursive = Mods 鎵弿瀹冿級
const DEFAULT_MODS_ROOT = 'D:\\0Temp\\mingchao\\WWMI\\Mods'
const DEFAULT_WWMI_ROOT = path.dirname(DEFAULT_MODS_ROOT)
const CONFIG_FILE = path.join(app.getPath('userData'), 'config.json')
const PROJECT_ASSETS_ROOT = path.join(__dirname, '..', 'assets')
const APP_ICON_FILE = path.join(PROJECT_ASSETS_ROOT, 'app-icon.png')
const DEFAULT_COVER_FILE = path.join(PROJECT_ASSETS_ROOT, 'default.png')
const CHARACTER_AVATAR_DIR = path.join(PROJECT_ASSETS_ROOT, 'character-avatars')
const OVERVIEW_IMAGE_DIR = path.join(PROJECT_ASSETS_ROOT, 'overview-images')
const USER_CHARACTER_AVATAR_DIR = path.join(app.getPath('userData'), 'character-avatars')
const TOOLS_DIR = path.join(__dirname, '..', 'tools')
const FLATTEN_SCRIPT = path.join(TOOLS_DIR, 'flatten.ps1')
const TRANSLATE_SCRIPT = path.join(TOOLS_DIR, 'translate.py')
const WATCHER_SCRIPT = path.join(TOOLS_DIR, 'watcher.py')
const INI_UTIL_SCRIPT = path.join(TOOLS_DIR, 'wwmi_ini_util.py')
const LOCAL_DICT_FILE = path.join(TOOLS_DIR, 'local_dict.json')
const WORD_DICT_FILE = path.join(TOOLS_DIR, 'word_dict.json')
const TOOL_UPDATE_FILES = [
  { name: 'flatten.ps1', sourceDirs: ['wwmi-flatten'] },
  { name: 'watcher.py', sourceDirs: ['wwmi-watcher', 'wwmi-translate'] },
  { name: 'translate.py', sourceDirs: ['wwmi-translate'] },
  { name: 'wwmi_ini_util.py', sourceDirs: ['wwmi-translate'] },
  { name: 'local_dict.json', sourceDirs: ['wwmi-translate'] },
  { name: 'word_dict.json', sourceDirs: ['wwmi-translate'] },
  { name: 'translate_ini.bat', sourceDirs: ['wwmi-translate'] },
]
const USER_HOME = process.env.USERPROFILE || app.getPath('home')
const SKILL_ROOT_CANDIDATES = [
  path.join(USER_HOME, '.codex', 'skills'),
  path.join(USER_HOME, '.config', 'opencode', 'skills'),
]
const DICT_SOURCE_PRIORITY = {
  image: 30,
  file_context: 20,
  online_query: 10,
  builtin: 0,
  untranslated: -10,
  legacy: -20,
}
const INVALID_KEY_DESCRIPTION_LABELS = new Set([
  '默认变量',
  '默认配置',
  '默认切换',
  '变量',
  '配置',
  '按键',
  '切换变量',
])
const ONLINE_TRANSLATION_SOURCE = 'https://api.mymemory.translated.net/get'
const AMBIGUOUS_ONLINE_TRANSLATIONS = {
  arm: '手臂；武器',
  arms: '手臂；武器',
  back: '背部',
  base: '基础；底座',
  cap: '帽子；上限',
  chest: '胸部；箱子',
  clip: '夹子；裁剪',
  coat: '外套；涂层',
  cross: '十字；交叉',
  face: '脸；表面',
  hand: '手；指针',
  head: '头部；顶部',
  heel: '脚跟；高跟',
  left: '左侧；剩余',
  mask: '面具；遮罩',
  right: '右侧；正确',
  ring: '戒指；环',
  scale: '缩放；比例',
  skin: '皮肤；外观',
  tail: '尾巴；末端',
  top: '上衣',
  wing: '翅膀；侧翼',
}

// 鍋滅敤鍓嶇紑甯搁噺锛屼笌 d3dx.ini 涓?exclude_recursive = DISABLED* 淇濇寔涓€鑷?
const DISABLED_PREFIX = 'DISABLED_'

function isDisabledDirName(name) {
  return String(name || '').toLowerCase().startsWith(DISABLED_PREFIX.toLowerCase())
}

// 闇€瑕佹帓闄ょ殑鐩綍锛堥殣钘忕洰褰曘€侀潪mod鐩綍銆佺郴缁熺洰褰曪級
const EXCLUDED_DIRS = new Set([
  '.git', 'ShaderFixes', 'ShaderCache', '.obsidian', '.vscode', 'node_modules',
  '.playwright-mcp', '0姝﹀櫒', 'DISABLED_fix', 'interface', 'Echoes', 'mod',
  'NPC', 'others', 'qiuyuan', 'weapons', 'DISABLED_0 IASM涓€閿鍏ラ瑙堝浘v1.1',
])

// character 鐩綍鏄壒娈婄殑锛氬畠鐨勫瓙鐩綍闇€瑕佸睍寮€鍒?绾х晫闈?
const SPECIAL_EXPAND_DIR = 'character'

const JASM_WUWA_ROOT = 'D:\\0Temp\\mingchao\\JASM\\Assets\\Games\\WuWa'
const JASM_WUWA_CHARACTER_DIR = path.join(JASM_WUWA_ROOT, 'Images', 'Characters')
const JASM_ASSETS_ROOT = 'D:\\0Temp\\mingchao\\JASM\\Assets'
const MODORA_RENDERER_ROOT = 'D:\\Program Files\\MODORA Preview\\resources\\app.asar.unpacked\\renderer'
const MODORA_ICONS_DIR = path.join(MODORA_RENDERER_ROOT, 'icons')
const MODORA_OFFICIAL_CHARACTER_DIR = path.join(MODORA_RENDERER_ROOT, 'characters', 'official')
const MODORA_OFFICIAL_CHARACTER_ASSETS = {
  yangyangxuanling: {
    file: '10001.png',
    names: ['Yangyang Xuanling', 'YangyangXuanling', 'yangyangxuanling', '秧秧·玄翎', '秧秧玄翎'],
  },
}
const CHARACTER_AVATAR_ALIASES = {
  Phrolova: ['Floro', 'floro', '弗洛洛'],
  'Luuk Herssen': ['Luuk', 'luukherssen', '陆·赫斯', '陆赫斯'],
}
const PLACEHOLDER_ASSET_KEYS = new Set(['qingxiao', 'staytuned'])
const ASSET_ROOTS = [
  path.join(JASM_WUWA_ROOT, 'Images'),
  JASM_ASSETS_ROOT,
  MODORA_RENDERER_ROOT,
  CHARACTER_AVATAR_DIR,
  OVERVIEW_IMAGE_DIR,
  USER_CHARACTER_AVATAR_DIR,
]

let wuwaCharacterAssets = null
const CHARACTER_CANONICAL_KEYS = {
  luuk: 'luukherssen',
  luukherssen: 'luukherssen',
  floro: 'phrolova',
  phrolova: 'phrolova',
}

// Encore API 瑙掕壊鏁版嵁缂撳瓨
let characterAvatarCache = {} // { englishName: avatarUrl }
let characterDataLoaded = false
let defaultCoverHash = null

function getFileHash(filePath) {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
  } catch {
    return null
  }
}

function isDefaultCoverFile(filePath) {
  if (!defaultCoverHash) defaultCoverHash = getFileHash(DEFAULT_COVER_FILE)
  const candidate = getFileHash(filePath)
  return !!defaultCoverHash && candidate === defaultCoverHash
}

function getLocalImageSize(filePath) {
  try {
    const buffer = fs.readFileSync(filePath)
    if (buffer.length >= 24 && buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
    }
    if (buffer.length >= 12 && buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP') {
      return getWebpSize(buffer)
    }
    if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
      return getJpegSize(buffer)
    }
    const image = nativeImage.createFromPath(filePath)
    const size = image.getSize()
    return size.width > 0 && size.height > 0 ? size : null
  } catch {
    return null
  }
}

function getWebpSize(buffer) {
  const type = buffer.slice(12, 16).toString('ascii')
  if (type === 'VP8X' && buffer.length >= 30) {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3),
    }
  }
  if (type === 'VP8L' && buffer.length >= 25) {
    const bits = buffer.readUInt32LE(21)
    return {
      width: 1 + (bits & 0x3fff),
      height: 1 + ((bits >> 14) & 0x3fff),
    }
  }
  if (type === 'VP8 ' && buffer.length >= 30) {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    }
  }
  return null
}

function getJpegSize(buffer) {
  let offset = 2
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) return null
    const marker = buffer[offset + 1]
    const length = buffer.readUInt16BE(offset + 2)
    if (length < 2) return null
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) }
    }
    offset += 2 + length
  }
  return null
}

function isLikelyAvatarFile(filePath) {
  const size = getLocalImageSize(filePath)
  if (!size) return false
  const ratio = size.width / size.height
  return ratio >= 0.72 && ratio <= 1.38
}

function isLikelyAvatarUrl(url) {
  const filePath = assetImageUrlToPath(url)
  return !filePath || isLikelyAvatarFile(filePath)
}

function safeAvatarFileBase(name) {
  return normalizeAssetKey(name) || crypto.createHash('sha1').update(String(name || '')).digest('hex').slice(0, 12)
}

function getAvatarCacheNames(item) {
  const name = String(item?.Name || '').trim()
  if (!name) return []
  const names = [name, name.replace(/\s+/g, ''), ...(CHARACTER_AVATAR_ALIASES[name] || [])]
  return Array.from(new Set(names.filter(Boolean)))
}

function getExtensionFromContentType(contentType) {
  const type = String(contentType || '').toLowerCase()
  if (type.includes('png')) return '.png'
  if (type.includes('jpeg') || type.includes('jpg')) return '.jpg'
  if (type.includes('webp')) return '.webp'
  if (type.includes('gif')) return '.gif'
  return ''
}

function getImageExtensionFromPath(filePath, fallback = '.webp') {
  const ext = path.extname(String(filePath || '').split(/[?#]/)[0]).toLowerCase()
  return ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext) ? ext : fallback
}

function assetImageUrlToPath(url) {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'assetimg:') return null
    let p = decodeURIComponent(parsed.pathname.replace(/^\//, ''))
    p = p.replace(/\\+/g, '/').replace(/\//g, path.sep)
    return path.resolve(p)
  } catch {
    return null
  }
}

function getReferenceCharacterImagePath(dirName) {
  return assetImageUrlToPath(getReferenceCharacterImage(dirName))
}

async function getWritableCharacterAvatarDir() {
  try {
    await fsp.mkdir(CHARACTER_AVATAR_DIR, { recursive: true })
    const probe = path.join(CHARACTER_AVATAR_DIR, `.write-test-${process.pid}-${Date.now()}`)
    await fsp.writeFile(probe, '')
    await fsp.rm(probe, { force: true })
    return CHARACTER_AVATAR_DIR
  } catch {
    await fsp.mkdir(USER_CHARACTER_AVATAR_DIR, { recursive: true })
    return USER_CHARACTER_AVATAR_DIR
  }
}

async function copyCharacterAvatar(sourcePath, cacheKey) {
  if (!imageFileExists(sourcePath)) return null
  if (!isLikelyAvatarFile(sourcePath)) return null
  const avatarDir = await getWritableCharacterAvatarDir()
  const ext = getImageExtensionFromPath(sourcePath, '.png')
  const dest = path.join(avatarDir, `${safeAvatarFileBase(cacheKey)}${ext}`)
  await fsp.copyFile(sourcePath, dest)
  return toAssetImageUrl(dest)
}

async function downloadCharacterAvatar(url, cacheKey) {
  if (!url) return null
  const response = await fetch(url)
  if (!response.ok) throw new Error(`avatar download failed: ${response.status}`)
  const contentType = response.headers.get('content-type')
  const ext = getExtensionFromContentType(contentType) || getImageExtensionFromPath(url, '.webp')
  const avatarDir = await getWritableCharacterAvatarDir()
  const dest = path.join(avatarDir, `${safeAvatarFileBase(cacheKey)}${ext}`)
  const buffer = Buffer.from(await response.arrayBuffer())
  await fsp.writeFile(dest, buffer)
  return toAssetImageUrl(dest)
}

// 浠?Encore API 鑾峰彇瑙掕壊澶村儚
async function fetchCharacterAvatars(force = false) {
  if (force) {
    characterDataLoaded = false
    characterAvatarCache = {}
  }
  if (characterDataLoaded) return { ok: true, count: Object.keys(characterAvatarCache).length, cached: true }
  try {
    const response = await fetch('https://api-v2.encore.moe/api/en/character?v=Beta')
    if (!response.ok) throw new Error(`API request failed: ${response.status}`)
    const data = await response.json()
    let localCount = 0
    let remoteCount = 0
    for (const item of data.roleList) {
      const names = getAvatarCacheNames(item)
      if (!names.length) continue
      if (names.some((name) => PLACEHOLDER_ASSET_KEYS.has(normalizeAssetKey(name)))) continue
      let avatarUrl = null
      const localPath = names.map(getReferenceCharacterImagePath).find(Boolean)
      if (localPath) {
        try {
          avatarUrl = await copyCharacterAvatar(localPath, names[0])
          if (avatarUrl) localCount++
        } catch (error) {
          console.error('复制本地角色头像失败:', item.Name, error.message)
        }
      }
      if (!avatarUrl && item.RoleHeadIcon) {
        try {
          avatarUrl = await downloadCharacterAvatar(item.RoleHeadIcon, names[0])
          if (avatarUrl) remoteCount++
        } catch (error) {
          console.error('下载远程角色头像失败:', item.Name, error.message)
          avatarUrl = item.RoleHeadIcon
        }
      }
      if (!avatarUrl) continue
      for (const name of names) characterAvatarCache[name] = avatarUrl
    }
    characterDataLoaded = true
    saveConfig()
    return { ok: true, count: Object.keys(characterAvatarCache).length, local: localCount, remote: remoteCount }
  } catch (e) {
    console.error('鑾峰彇瑙掕壊澶村儚澶辫触:', e.message)
    return { ok: Object.keys(characterAvatarCache).length > 0, count: Object.keys(characterAvatarCache).length, error: e.message }
  }
}

// 鑾峰彇瑙掕壊澶村儚URL
function getCharacterAvatar(dirName) {
  if (PLACEHOLDER_ASSET_KEYS.has(normalizeAssetKey(dirName))) return null
  // 鐩存帴鍖归厤
  if (characterAvatarCache[dirName] && isLikelyAvatarUrl(characterAvatarCache[dirName])) return characterAvatarCache[dirName]
  // 蹇界暐澶у皬鍐?
  const lower = dirName.toLowerCase()
  for (const [key, url] of Object.entries(characterAvatarCache)) {
    if (key.toLowerCase() === lower && isLikelyAvatarUrl(url)) return url
  }
  // 鍘绘帀 DISABLED_ 鍓嶇紑鍐嶈瘯
  let clean = dirName
  while (clean.startsWith('DISABLED_')) clean = clean.slice('DISABLED_'.length)
  if (characterAvatarCache[clean] && isLikelyAvatarUrl(characterAvatarCache[clean])) return characterAvatarCache[clean]
  for (const [key, url] of Object.entries(characterAvatarCache)) {
    if (key.toLowerCase() === clean.toLowerCase() && isLikelyAvatarUrl(url)) return url
  }
  return null
}

function normalizeAssetKey(value) {
  const normalized = stripDisabled(String(value || ''))
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s_\-./\\()[\]{}'"`，。！？、：；（）【】]+/g, '')
  return CHARACTER_CANONICAL_KEYS[normalized] || normalized
}

function preferCharacterDir(candidate, current) {
  if (!current) return candidate
  const candidateName = candidate.name
  const currentName = current.name
  const candidateHasChineseName = getChineseName(candidateName) !== candidateName
  const currentHasChineseName = getChineseName(currentName) !== currentName
  if (candidateHasChineseName !== currentHasChineseName) return candidateHasChineseName ? candidate : current
  return candidateName.localeCompare(currentName, 'zh') > 0 ? candidate : current
}

function toAssetImageUrl(filePath) {
  return filePath ? toProtocolImageUrl('assetimg', filePath) : null
}

function toModImageUrl(filePath) {
  return filePath ? toProtocolImageUrl('modimg', filePath) : null
}

function toProtocolImageUrl(scheme, filePath) {
  const normalized = path.resolve(filePath).replace(/\\/g, '/')
  const encoded = normalized.split('/').map(encodeURIComponent).join('/')
  let version = ''
  try {
    version = `?v=${Math.trunc(fs.statSync(filePath).mtimeMs)}`
  } catch {
    version = ''
  }
  return `${scheme}://local/${encoded}${version}`
}

function imageFileExists(filePath) {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile()
  } catch {
    return false
  }
}

const PREVIEW_EXTS = ['.png', '.webp', '.jpg', '.jpeg']
const PREVIEW_BASES = ['.JASM_Cover', 'preview']

function pickExistingFile(files, name) {
  const exact = files.find((f) => f === name)
  if (exact) return exact
  return files.find((f) => f.toLowerCase() === name.toLowerCase()) || null
}

function pickExactFile(files, name) {
  return files.find((f) => f === name) || null
}

function findPriorityPreviewFile(files, includeAnyImage = false) {
  for (const base of PREVIEW_BASES) {
    for (const ext of PREVIEW_EXTS) {
      const found = pickExactFile(files, `${base}${ext}`)
      if (found) return found
    }
  }
  return includeAnyImage ? files.find((f) => /\.(png|jpe?g|webp)$/i.test(f)) : null
}

function findLocalCoverSync(dir) {
  let files = []
  try {
    files = fs.readdirSync(dir)
  } catch {
    return null
  }
  const found = findPriorityPreviewFile(files, false)
  if (!found) return null
  const imagePath = path.join(dir, found)
  return isDefaultCoverFile(imagePath) ? toAssetImageUrl(DEFAULT_COVER_FILE) : toModImageUrl(imagePath)
}

function addCharacterAsset(index, key, imagePath) {
  const normalized = normalizeAssetKey(key)
  if (PLACEHOLDER_ASSET_KEYS.has(normalized)) return
  if (!isLikelyAvatarFile(imagePath)) return
  if (normalized && imageFileExists(imagePath) && !index.has(normalized)) {
    index.set(normalized, toAssetImageUrl(imagePath))
  }
}

function addCharacterRecord(index, item) {
  if (!item || !item.Image) return
  const imagePath = path.join(JASM_WUWA_CHARACTER_DIR, item.Image)
  const names = [
    item.InternalName,
    item.DisplayName,
    item.ModFilesName,
    path.basename(item.Image, path.extname(item.Image)),
    ...(Array.isArray(item.Keys) ? item.Keys : []),
  ]
  for (const name of names) addCharacterAsset(index, name, imagePath)
}

function addImageBasenames(index, dir) {
  let files = []
  try {
    files = fs.readdirSync(dir)
  } catch {
    return
  }
  for (const file of files) {
    if (!/\.(png|jpe?g|webp|gif)$/i.test(file)) continue
    addCharacterAsset(index, path.basename(file, path.extname(file)), path.join(dir, file))
  }
}

function addModoraOfficialCharacterAssets(index) {
  for (const record of Object.values(MODORA_OFFICIAL_CHARACTER_ASSETS)) {
    const imagePath = path.join(MODORA_OFFICIAL_CHARACTER_DIR, record.file)
    for (const name of record.names) addCharacterAsset(index, name, imagePath)
  }
}

function loadWuwaCharacterAssets() {
  if (wuwaCharacterAssets) return wuwaCharacterAssets

  const index = new Map()
  const files = [
    path.join(JASM_WUWA_ROOT, 'characters.json'),
    path.join(JASM_WUWA_ROOT, 'Languages', 'zh-cn', 'characters.json'),
  ]

  addImageBasenames(index, CHARACTER_AVATAR_DIR)
  addImageBasenames(index, USER_CHARACTER_AVATAR_DIR)

  for (const file of files) {
    try {
      const items = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (Array.isArray(items)) {
        for (const item of items) addCharacterRecord(index, item)
      }
    } catch {
      // Reference data is optional; fall back to Encore avatars or category art.
    }
  }

  addImageBasenames(index, JASM_WUWA_CHARACTER_DIR)
  addImageBasenames(index, path.join(MODORA_RENDERER_ROOT, 'characters'))
  addImageBasenames(index, path.join(MODORA_RENDERER_ROOT, 'heroes', 'roster'))
  addModoraOfficialCharacterAssets(index)

  wuwaCharacterAssets = index
  return wuwaCharacterAssets
}

function getReferenceCharacterImage(dirName) {
  const index = loadWuwaCharacterAssets()
  const aliases = {
    floro: ['Phrolova', '\u5f17\u6d1b\u6d1b'],
    phrolova: ['Phrolova', 'Floro', '\u5f17\u6d1b\u6d1b'],
    luukherssen: ['Luuk', 'Luuk Herssen', '\u9646\u00b7\u8d6b\u65af', '\u9646\u8d6b\u65af'],
  }
  const keys = [dirName, getChineseName(dirName), ...(aliases[normalizeAssetKey(dirName)] || [])]
  for (const key of keys) {
    const found = index.get(normalizeAssetKey(key))
    if (found) return found
  }
  return null
}

function firstExistingAsset(paths) {
  const found = paths.find(imageFileExists)
  return found ? toAssetImageUrl(found) : null
}

function inferCategoryKind(name) {
  const normalized = normalizeAssetKey(name)
  if (!normalized) return null
  if (normalized.includes('weapon') || normalized.includes('\u6b66\u5668')) return 'weapon'
  if (normalized.includes('interface') || normalized.includes('ui') || normalized.includes('\u754c\u9762')) return 'interface'
  if (normalized.includes('echo') || normalized.includes('\u58f0\u9ab8')) return 'echo'
  if (normalized.includes('npc')) return 'npc'
  if (normalized.includes('glider')) return 'glider'
  if (normalized.includes('mod') || normalized.includes('utility')) return 'utility'
  if (normalized.includes('other') || normalized.includes('\u5176\u4ed6')) return 'other'
  return null
}

function getReferenceCategoryImage(dirName) {
  const kind = inferCategoryKind(dirName)
  if (!kind) return null
  const candidates = {
    weapon: [
      path.join(OVERVIEW_IMAGE_DIR, 'weapons', 'Weapons.webp'),
      path.join(OVERVIEW_IMAGE_DIR, 'weapons', 'weapon-category.png'),
      path.join(MODORA_ICONS_DIR, 'weapon-category.png'),
      path.join(JASM_WUWA_CHARACTER_DIR, 'Weapons.webp'),
      path.join(JASM_ASSETS_ROOT, 'Weapon_Icon.png'),
    ],
    interface: [
      path.join(OVERVIEW_IMAGE_DIR, 'interface', 'interface-category.png'),
      path.join(MODORA_ICONS_DIR, 'interface-category.png'),
    ],
    echo: [
      path.join(OVERVIEW_IMAGE_DIR, 'echoes', 'role-mod.png'),
      path.join(OVERVIEW_IMAGE_DIR, 'echoes', 'Others.png'),
      path.join(MODORA_ICONS_DIR, 'role-mod.png'),
      path.join(JASM_WUWA_CHARACTER_DIR, 'Others.png'),
    ],
    npc: [
      path.join(OVERVIEW_IMAGE_DIR, 'npc', 'NPC_Icon.png'),
      path.join(OVERVIEW_IMAGE_DIR, 'npc', 'other-mod.png'),
      path.join(JASM_ASSETS_ROOT, 'NPC_Icon.png'),
      path.join(MODORA_ICONS_DIR, 'other-mod.png'),
    ],
    glider: [
      path.join(OVERVIEW_IMAGE_DIR, 'gliders', 'Gliders.webp'),
      path.join(OVERVIEW_IMAGE_DIR, 'gliders', 'other-mod.png'),
      path.join(JASM_WUWA_CHARACTER_DIR, 'Gliders.webp'),
      path.join(MODORA_ICONS_DIR, 'other-mod.png'),
    ],
    utility: [
      path.join(OVERVIEW_IMAGE_DIR, 'mod', 'utility-category.webp'),
      path.join(OVERVIEW_IMAGE_DIR, 'mod', 'role-mod.png'),
      path.join(MODORA_ICONS_DIR, 'utility-category.webp'),
      path.join(MODORA_ICONS_DIR, 'role-mod.png'),
    ],
    other: [
      path.join(OVERVIEW_IMAGE_DIR, 'others', 'Character_Others.png'),
      path.join(OVERVIEW_IMAGE_DIR, 'others', 'Others.png'),
      path.join(OVERVIEW_IMAGE_DIR, 'others', 'other-mod.png'),
      path.join(JASM_WUWA_CHARACTER_DIR, 'Character_Others.png'),
      path.join(JASM_WUWA_CHARACTER_DIR, 'Others.png'),
      path.join(MODORA_ICONS_DIR, 'other-mod.png'),
    ],
  }
  return firstExistingAsset(candidates[kind])
}

function getReferenceCharacterDirs() {
  const result = new Map()
  for (const [dirName, record] of Object.entries(MODORA_OFFICIAL_CHARACTER_ASSETS)) {
    const imagePath = path.join(MODORA_OFFICIAL_CHARACTER_DIR, record.file)
    if (imageFileExists(imagePath)) result.set(dirName, toAssetImageUrl(imagePath))
  }
  for (const [key, avatar] of Object.entries(characterAvatarCache)) {
    const dirName = normalizeAssetKey(key)
    if (PLACEHOLDER_ASSET_KEYS.has(dirName)) continue
    if (!isLikelyAvatarUrl(avatar)) continue
    if (!/^[a-z][a-z0-9]*$/i.test(dirName)) continue
    if (!result.has(dirName)) result.set(dirName, avatar)
  }
  return result
}

let MODS_ROOT = DEFAULT_MODS_ROOT
let WWMI_ROOT = DEFAULT_WWMI_ROOT
let detailViewMode = 'list'
let sortOrder = { overview: [], overviewSections: [], mods: {} }
let overviewMeta = {}
let favoriteMods = []
let frameworkIsolationSession = null

// 璧勬簮鍥剧墖鍗忚蹇呴』鍦?app ready 涔嬪墠娉ㄥ唽
protocol.registerSchemesAsPrivileged([
  { scheme: 'modimg', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  { scheme: 'assetimg', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
])

let mainWindow = null
let keyPopupWindow = null
let watcher = null
let rescanTimer = null
const modOperationLocks = new Set()

// ---------- 閰嶇疆鎸佷箙鍖?----------
function loadConfig() {
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
    if (raw.modsRoot) MODS_ROOT = raw.modsRoot
    if (raw.wwmiRoot) WWMI_ROOT = raw.wwmiRoot
    if (raw.detailViewMode === 'list' || raw.detailViewMode === 'card') detailViewMode = raw.detailViewMode
    if (raw.characterAvatarCache && typeof raw.characterAvatarCache === 'object') {
      characterAvatarCache = raw.characterAvatarCache
      characterDataLoaded = Object.keys(characterAvatarCache).length > 0
    }
    if (raw.overviewMeta && typeof raw.overviewMeta === 'object') overviewMeta = normalizeOverviewMeta(raw.overviewMeta)
    favoriteMods = normalizeOrderList(raw.favoriteMods)
    if (raw.frameworkIsolationSession && typeof raw.frameworkIsolationSession === 'object') {
      frameworkIsolationSession = normalizeFrameworkIsolationSession(raw.frameworkIsolationSession)
    }
    if (raw.sortOrder && typeof raw.sortOrder === 'object') {
      sortOrder = {
        overview: normalizeOrderList(raw.sortOrder.overview),
        overviewSections: normalizeOverviewSections(raw.sortOrder.overviewSections),
        mods: normalizeOrderMap(raw.sortOrder.mods),
      }
    }
  } catch {
    /* 棣栨杩愯鏃犻厤缃紝鐢ㄩ粯璁ゅ€?*/
  }
}
function saveConfig() {
  try {
    fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true })
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ modsRoot: MODS_ROOT, wwmiRoot: WWMI_ROOT, detailViewMode, sortOrder, overviewMeta, favoriteMods, characterAvatarCache, frameworkIsolationSession }, null, 2), 'utf8')
  } catch (e) {
    console.error('淇濆瓨閰嶇疆澶辫触', e)
  }
}

// ---------- 鎵弿 ----------
// 杩斿洖骞抽摵鐨?mod 鍒楄〃銆傞€掑綊鍒ゅ畾涓€涓洰褰曪細
// 1) 鐩存帴鍚?.ini锛堥潪 .bak锛夆啋 鏈洰褰曞嵆涓€涓?mod 鍗曞厓锛?// 2) 鍚?JASM 灏侀潰/棰勮鍥惧澹?鈫?鑻ュ瓙鏍戝唴鍚?mod锛屽垯鎶娿€屽澹崇洰褰曘€嶆暣浣撳綋浣滀竴涓?mod
// groupPath 用于 UI 显示的“分级 > 角色 > …”层级（斜杠分隔）。
function normalizeOrderList(value) {
  return Array.isArray(value)
    ? Array.from(new Set(value.filter((item) => typeof item === 'string' && item)))
    : []
}

function normalizeOrderMap(value) {
  if (!value || typeof value !== 'object') return {}
  const result = {}
  for (const [key, list] of Object.entries(value)) {
    if (typeof key === 'string' && key) result[normalizeOrderKey(key)] = normalizeOrderList(list)
  }
  return result
}

function normalizeOverviewSections(value) {
  if (!Array.isArray(value)) return []
  const seenIds = new Set()
  const seenItems = new Set()
  const result = []
  for (const section of value) {
    if (!section || typeof section !== 'object') continue
    const id = typeof section.id === 'string' && section.id ? section.id : `section_${result.length + 1}`
    if (seenIds.has(id)) continue
    seenIds.add(id)
    const name = String(section.name || '').trim()
    if (!name) continue
    const items = normalizeOrderList(section.items).filter((item) => {
      if (seenItems.has(item)) return false
      seenItems.add(item)
      return true
    })
    result.push({ id, name, collapsed: !!section.collapsed, items })
  }
  return result
}

function normalizeOverviewMeta(value) {
  if (!value || typeof value !== 'object') return {}
  const result = {}
  for (const [key, meta] of Object.entries(value)) {
    if (typeof key !== 'string' || !key || !meta || typeof meta !== 'object') continue
    const displayName = typeof meta.displayName === 'string' ? meta.displayName.trim() : ''
    const artworkPath = typeof meta.artworkPath === 'string' ? meta.artworkPath : ''
    result[normalizeOrderKey(key)] = { displayName, artworkPath }
  }
  return result
}

function normalizeFrameworkIsolationSession(value) {
  if (!value || typeof value !== 'object') return null
  const d3dxPath = typeof value.d3dxPath === 'string' ? value.d3dxPath : ''
  const originalIncludeBlock = typeof value.originalIncludeBlock === 'string' ? value.originalIncludeBlock : ''
  const targetOrderKey = typeof value.targetOrderKey === 'string' ? normalizeOrderKey(value.targetOrderKey) : ''
  const targetRel = typeof value.targetRel === 'string' ? value.targetRel : ''
  const targetName = typeof value.targetName === 'string' ? value.targetName : ''
  const targetIncludePath = typeof value.targetIncludePath === 'string' ? value.targetIncludePath : ''
  if (!d3dxPath || !originalIncludeBlock || !targetOrderKey) return null
  return { d3dxPath, originalIncludeBlock, targetOrderKey, targetRel, targetName, targetIncludePath }
}

function applyOverviewMeta(group) {
  const meta = overviewMeta[normalizeOrderKey(group.path)]
  if (!meta) return group
  const artwork = meta.artworkPath && imageFileExists(meta.artworkPath) ? toAssetImageUrl(meta.artworkPath) : group.artwork
  return {
    ...group,
    chineseName: meta.displayName || group.chineseName,
    artwork,
    customMeta: {
      displayName: meta.displayName || '',
      artworkPath: meta.artworkPath || '',
    },
  }
}

function normalizeOrderKey(value) {
  return String(value || '').split(/[\\/]+/).filter(Boolean).map(stripDisabled).join('/')
}

function sortByPinnedOrder(items, orderList, isEnabled, getKey, fallbackCompare) {
  const orderIndex = new Map(normalizeOrderList(orderList).map((key, index) => [key, index]))
  const favoriteSet = new Set(normalizeOrderList(favoriteMods))
  items.sort((a, b) => {
    const ae = isEnabled(a) ? 1 : 0
    const be = isEnabled(b) ? 1 : 0
    if (ae !== be) return be - ae

    const af = favoriteSet.has(getKey(a)) ? 1 : 0
    const bf = favoriteSet.has(getKey(b)) ? 1 : 0
    if (af !== bf) return bf - af

    const ai = orderIndex.has(getKey(a)) ? orderIndex.get(getKey(a)) : Number.MAX_SAFE_INTEGER
    const bi = orderIndex.has(getKey(b)) ? orderIndex.get(getKey(b)) : Number.MAX_SAFE_INTEGER
    if (ai !== bi) return ai - bi

    return fallbackCompare(a, b)
  })
  return items
}

async function scanCategory(categoryName) {
  const root = path.join(MODS_ROOT, categoryName)
  const result = []
  const isIni = (f) => /\.ini$/i.test(f) && !/\.bak$/i.test(f) && !/\.BAK$/i.test(f)

  async function collect(dir, groupPath, isCategoryRoot = false) {
    let entries
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true })
    } catch (e) {
      return
    }
    const files = entries.filter((e) => e.isFile()).map((e) => e.name)
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name)

    if (files.some(isIni)) {
      result.push(await makeModEntry(categoryName, dir, groupPath, files))
      return
    }

    const hasShell = files.some((f) => f.toLowerCase().startsWith('.jasm_modconfig')) ||
      files.some((f) => /^preview\.(png|jpe?g|webp)$/i.test(f) || /^\.JASM_Cover\.(png|jpe?g|webp)$/.test(f))
    if (hasShell && !isCategoryRoot) {
      const before = result.length
      for (const d of dirs) await collect(path.join(dir, d), groupPath)
      const found = result.length - before
      if (found > 0) {
        result.length = before
        if (files.some(isIni)) {
          result.push(await makeModEntry(categoryName, dir, groupPath, files))
        } else {
          result.push({ ...await makeModEntry(categoryName, dir, groupPath, files), wrap: true })
        }
      }
      return
    }

    for (const d of dirs) {
      await collect(path.join(dir, d), groupPath ? groupPath + ' / ' + d : d)
    }
  }

  await collect(root, '', true)
  return sortByPinnedOrder(
    result,
    sortOrder.mods[normalizeOrderKey(categoryName)],
    (mod) => !mod.disabled,
    (mod) => mod.orderKey,
    (a, b) => a.name.localeCompare(b.name, 'zh'),
  )
}

async function makeModEntry(categoryName, dir, groupPath, files) {
  const name = path.basename(dir)
  const rel = path.relative(MODS_ROOT, dir)
  const orderKey = stripDisabledRel(rel)
  return {
    rel,
    name: stripDisabled(name),
    rawName: name,
    orderKey,
    disabled: isDisabledDirName(name),
    locked: isModLocked(dir),
    favorite: favoriteMods.includes(orderKey),
    keyBindings: [],
    keyBindingsLoaded: false,
    category: categoryName,
    group: groupPath || null,
    preview: findPreviewSync(dir),
  }
}

function findPreviewSync(dir) {
  let files = []
  try {
    files = fs.readdirSync(dir)
  } catch {
    return null
  }
  const found = findPriorityPreviewFile(files, true)
  return found ? toModImageUrl(path.join(dir, found)) : null
}

function stripDisabled(name) {
  let n = name
  while (isDisabledDirName(n)) n = n.slice(DISABLED_PREFIX.length)
  return n
}

function stripDisabledRel(rel) {
  return normalizeOrderKey(rel)
}

function walkIniFiles(root) {
  const result = []
  const visit = (dir) => {
    let entries = []
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!entry.name.toLowerCase().startsWith('disabled_')) visit(full)
      } else if (/\.ini$/i.test(entry.name) && !/\.bak$/i.test(entry.name)) {
        result.push(full)
      }
    }
  }
  visit(root)
  return result
}

function transformKeyLines(text, lock) {
  let changed = false
  let activeKeys = 0
  let commentedKeys = 0
  let inKey = false
  const lines = text.split(/\r?\n/)
  const next = lines.map((line) => {
    const stripped = line.trim()
    if (/^\[Key\w+\]/i.test(stripped)) inKey = true
    else if (/^\[/.test(stripped) && inKey) inKey = false
    if (!inKey) return line

    const active = /^(\s*)key\s*=\s*(.+)$/i.exec(line)
    if (active) {
      activeKeys++
      if (!lock) return line
      changed = true
      return `${active[1]};key = ${active[2]}`
    }

    const commented = /^(\s*);+\s*key\s*=\s*(.+)$/i.exec(line)
    if (commented) {
      commentedKeys++
      if (lock) return line
      changed = true
      return `${commented[1]}key = ${commented[2]}`
    }
    return line
  })
  return { text: next.join('\n'), changed, activeKeys, commentedKeys }
}

function isModLocked(dir) {
  let active = 0
  let commented = 0
  for (const file of walkIniFiles(dir)) {
    try {
      const state = transformKeyLines(fs.readFileSync(file, 'utf8'), true)
      active += state.activeKeys
      commented += state.commentedKeys
    } catch {
      // ignore unreadable ini
    }
  }
  return commented > 0 && active === 0
}

async function getModKeyBindings(dir) {
  const bindings = []
  for (const file of walkIniFiles(dir)) {
    let text = ''
    try {
      text = fs.readFileSync(file, 'utf8')
    } catch {
      continue
    }
    const lines = text.split(/\r?\n/)
    const persistComments = getPersistComments(lines, file)
    const commandListHints = getCommandListHints(lines)
    let section = null
    let keyValue = null
    let hintName = null
    let lastBinding = null
    for (const line of lines) {
      const header = /^\[(Key\w+)\]/i.exec(line.trim())
      if (header) {
        section = header[1]
        keyValue = null
        hintName = null
        lastBinding = null
        continue
      }
      if (/^\[/.test(line.trim())) {
        section = null
        lastBinding = null
      }
      if (!section) continue
      const varMatch = /^\$(\w+)\s*=/.exec(line.trim())
      if (varMatch && isUsefulKeyHint(varMatch[1])) {
        hintName = varMatch[1]
        if (lastBinding) {
          lastBinding.rawDescription = stripKeySyntaxWords(hintName)
          lastBinding.description = await describeKeySection(hintName)
        }
      }
      const runMatch = /^run\s*=\s*CommandList(\w+)/i.exec(line.trim())
      if (runMatch && !hintName) {
        const commandHint = commandListHints.get(runMatch[1].toLowerCase()) || runMatch[1]
        if (!isUsefulKeyHint(commandHint)) continue
        hintName = commandHint
        if (lastBinding) {
          lastBinding.rawDescription = stripKeySyntaxWords(hintName)
          lastBinding.description = await describeKeySection(hintName)
        }
      }
      const match = /^(\s*;+\s*)?key\s*=\s*(.+)$/i.exec(line)
      if (match) {
        keyValue = match[2].trim()
        lastBinding = {
          file: path.relative(dir, file),
          section,
          key: keyValue,
          displayKey: cleanDisplayKey(keyValue),
          rawDescription: stripKeySyntaxWords(hintName || section),
          description: await describeKeySection(hintName || section),
          locked: !!match[1],
        }
        bindings.push(lastBinding)
      }
    }
  }
  return sortKeyBindings(bindings).slice(0, 80)
}

function isUsefulKeyHint(value) {
  const normalized = String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  return !!normalized && !['swapvar', 'swap', 'var', 'toggle'].includes(normalized)
}

let keyHintDictionaryCache = null

function loadJsonDictionary(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return {}
  }
}

function saveJsonDictionary(file, data) {
  const ordered = {}
  for (const key of Object.keys(data || {}).sort((a, b) => a.localeCompare(b, 'zh-Hans'))) {
    ordered[key] = data[key]
  }
  fs.writeFileSync(file, JSON.stringify(ordered, null, 2), 'utf8')
}

function normalizeDictionaryEntry(value, fallbackSource = 'legacy') {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const translation = String(value.translation || value.chinese || value.text || '')
    const source = String(value.source || (translation ? fallbackSource : 'untranslated'))
    const sourcePath = String(value.source_path || value.sourcePath || '')
    return {
      translation,
      source,
      source_path: sourcePath,
      sources: Array.isArray(value.sources) ? value.sources : [],
    }
  }
  const translation = String(value || '')
  return {
    translation,
    source: translation ? fallbackSource : 'untranslated',
    source_path: '',
    sources: [],
  }
}

function getDictionaryRank(entry) {
  return DICT_SOURCE_PRIORITY[entry?.source] ?? -99
}

function makeDictionaryEntry(translation, source, sourcePath = '') {
  return normalizeDictionaryEntry({
    translation: String(translation || '').trim(),
    source,
    source_path: sourcePath,
    sources: [],
  }, source)
}

function mergeDictionaryEntry(currentValue, nextValue) {
  const current = normalizeDictionaryEntry(currentValue)
  const next = normalizeDictionaryEntry(nextValue)
  if (!next.translation) return currentValue ?? next
  if (!current.translation) return next
  if (getDictionaryRank(next) > getDictionaryRank(current)) return next
  return currentValue ?? current
}

function mergeDictionaryFile(source, target) {
  const sourceDict = loadJsonDictionary(source)
  const targetDict = loadJsonDictionary(target)
  let changed = 0
  for (const [rawKey, value] of Object.entries(sourceDict)) {
    const key = normalizeKeyHintName(rawKey)
    if (!key) continue
    const entry = normalizeDictionaryEntry(value)
    const before = JSON.stringify(targetDict[key])
    targetDict[key] = mergeDictionaryEntry(targetDict[key], entry)
    if (JSON.stringify(targetDict[key]) !== before) changed++
  }
  if (changed) saveJsonDictionary(target, targetDict)
  return changed
}

function updateLocalDictionary(key, translation, source = 'builtin', sourcePath = '') {
  const normalizedKey = normalizeKeyHintName(key)
  if (!String(translation || '').trim()) return false
  const cleaned = cleanKeyDescription(translation)
  if (!normalizedKey || !isValidKeyDescription(cleaned)) return false
  const dict = loadJsonDictionary(LOCAL_DICT_FILE)
  const before = JSON.stringify(dict[normalizedKey])
  dict[normalizedKey] = mergeDictionaryEntry(dict[normalizedKey], makeDictionaryEntry(cleaned, source, sourcePath))
  if (JSON.stringify(dict[normalizedKey]) === before) return false
  saveJsonDictionary(LOCAL_DICT_FILE, dict)
  keyHintDictionaryCache = null
  return true
}

function recordUntranslatedDictionaryKey(key, text = '', sourcePath = '') {
  const normalizedKey = normalizeKeyHintName(key)
  const value = String(text || key || '').trim()
  if (!normalizedKey || !value || /[\u4e00-\u9fff]/.test(value)) return false
  const dict = loadJsonDictionary(LOCAL_DICT_FILE)
  const current = normalizeDictionaryEntry(dict[normalizedKey])
  if (current.translation && current.source !== 'untranslated') return false
  const before = JSON.stringify(dict[normalizedKey])
  dict[normalizedKey] = {
    translation: value,
    source: 'untranslated',
    source_path: sourcePath,
    sources: current.sources || [],
  }
  if (JSON.stringify(dict[normalizedKey]) === before) return false
  saveJsonDictionary(LOCAL_DICT_FILE, dict)
  keyHintDictionaryCache = null
  return true
}

function getDictionaryText(dictionary, key) {
  const entry = dictionary?.[key]
  if (!entry) return ''
  if (typeof entry === 'string') return isValidKeyDescription(entry) ? entry : ''
  if (entry && typeof entry === 'object') {
    if (entry.source === 'untranslated') return ''
    const text = String(entry.translation || entry.chinese || entry.text || '')
    return isValidKeyDescription(text) ? text : ''
  }
  return ''
}

function getDictionaryTextWithVariants(dictionary, key) {
  const normalized = String(key || '').toLowerCase()
  const variants = [normalized]
  const stripped = normalized.replace(/^(swapvar|swap|toggle|var)_+/i, '')
  if (stripped && stripped !== normalized) variants.push(stripped)
  if (normalized.endsWith('ies')) variants.push(`${normalized.slice(0, -3)}y`)
  if (normalized.endsWith('s')) variants.push(normalized.slice(0, -1))
  else variants.push(`${normalized}s`)
  for (const variant of variants) {
    const text = getDictionaryText(dictionary, variant)
    if (text) return text
  }
  return ''
}

function getKeyHintDictionaries() {
  if (!keyHintDictionaryCache) {
    keyHintDictionaryCache = {
      local: loadJsonDictionary(LOCAL_DICT_FILE),
      words: loadJsonDictionary(WORD_DICT_FILE),
    }
  }
  return keyHintDictionaryCache
}

function normalizeKeyHintName(value) {
  return String(value || '')
    .replace(/^\$/g, '')
    .replace(/^CommandList/i, '')
    .replace(/^Key/i, '')
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9\u4e00-\u9fff]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
}

function stripKeySyntaxWords(value) {
  let cleaned = String(value || '')
    .replace(/^\$/g, '')
    .replace(/^CommandList/i, '')
    .replace(/^Key/i, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()

  cleaned = cleaned.replace(/^swapvar(?=.+)/i, '').trim()
  cleaned = cleaned.replace(/^(swap|toggle|var)(?=\s|[\u4e00-\u9fff]|[A-Z_ -]|$)/i, '').trim()
  cleaned = cleaned.replace(/(^|\s)(swapvar|swap|toggle|var)(?=\s|[\u4e00-\u9fff]|$)/ig, ' ').trim()
  return cleaned
}

function cleanKeyDescription(text) {
  const value = String(text || '').trim()
  if (!value) return '切换'
  return value === '切换' ? value : value.replace(/切换$/u, '')
}

function isValidKeyDescription(text) {
  const value = String(text || '').trim()
  if (!value || !/[\u4e00-\u9fff]/.test(value)) return false
  const compact = value.replace(/\s+/g, '')
  if (INVALID_KEY_DESCRIPTION_LABELS.has(compact)) return false
  if (compact.startsWith('默认变量') || compact.startsWith('默认配置')) return false
  return compact.length <= 40
}

function translateKnownEnglishDescription(text) {
  const normalized = String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
  const phraseMap = {
    'mouse clicked': '鼠标点击',
    'swap vars aka toggles defaults': '默认变量切换',
    'swap vars toggles defaults': '默认变量切换',
    'swap variables defaults': '默认变量切换',
    'toggles defaults': '默认切换',
  }
  return phraseMap[normalized] || ''
}

function extractChineseText(text) {
  const match = /[\u4e00-\u9fff][\u4e00-\u9fffA-Za-z0-9 _+\-；;，,、()（）【】]*/.exec(text || '')
  return match ? match[0].trim().replace(/[;；,，、\s]+$/u, '') : ''
}

function compactOnlineTranslation(key, text) {
  const normalized = normalizeKeyHintName(key)
  if (AMBIGUOUS_ONLINE_TRANSLATIONS[normalized]) return AMBIGUOUS_ONLINE_TRANSLATIONS[normalized]
  const cleaned = String(text || '').trim()
  if (!cleaned) return ''
  const parts = cleaned.split(/[;；/，,、]+/u)
  const result = []
  for (const part of parts) {
    const chinese = extractChineseText(part)
    if (chinese && !result.includes(chinese)) result.push(chinese)
    if (result.length >= 3) break
  }
  return result.join('；')
}

const onlineTranslationCache = new Map()

async function queryOnlineTranslation(key) {
  const normalized = normalizeKeyHintName(key)
  if (!normalized) return ''
  if (onlineTranslationCache.has(normalized)) return onlineTranslationCache.get(normalized)
  if (AMBIGUOUS_ONLINE_TRANSLATIONS[normalized]) {
    const value = AMBIGUOUS_ONLINE_TRANSLATIONS[normalized]
    onlineTranslationCache.set(normalized, value)
    updateLocalDictionary(normalized, value, 'online_query', ONLINE_TRANSLATION_SOURCE)
    return value
  }
  const query = new URLSearchParams({ q: normalized.replace(/_/g, ' '), langpair: 'en|zh-CN' })
  let value = ''
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    const response = await fetch(`${ONLINE_TRANSLATION_SOURCE}?${query.toString()}`, { signal: controller.signal })
    clearTimeout(timer)
    if (response.ok) {
      const data = await response.json()
      value = compactOnlineTranslation(normalized, data?.responseData?.translatedText || '')
    }
  } catch {
    value = ''
  }
  onlineTranslationCache.set(normalized, value)
  updateLocalDictionary(normalized, value, 'online_query', ONLINE_TRANSLATION_SOURCE)
  return value
}

function cleanDisplayKey(key) {
  return String(key || '')
    .replace(/\bno_modifiers\b/ig, '')
    .replace(/\bno_[a-z0-9_]+\b/ig, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const KEY_NO_MODIFIERS = new Set(['no_modifiers', 'no_alt', 'no_ctrl', 'no_shift'])
const KEY_MODIFIERS = { alt: 'alt', ctrl: 'ctrl', control: 'ctrl', shift: 'shift' }
const KEY_MODIFIER_RANK = { ctrl: 1, alt: 2, shift: 3 }
const KEY_REGION = { main: 0, edit: 1, numpad: 2, fn: 3, other: 4 }
const KEY_VK_MAP = {
  VK_UP: 'up', UP: 'up',
  VK_DOWN: 'down', DOWN: 'down',
  VK_LEFT: 'left', LEFT: 'left',
  VK_RIGHT: 'right', RIGHT: 'right',
  VK_SPACE: 'space', VK_ESCAPE: 'esc', VK_RETURN: 'enter',
  VK_TAB: 'tab', VK_BACK: 'backspace', VK_DELETE: 'delete',
  VK_HOME: 'home', VK_END: 'end', VK_PRIOR: 'page up', VK_NEXT: 'page down',
  VK_F1: 'f1', VK_F2: 'f2', VK_F3: 'f3', VK_F4: 'f4',
  VK_F5: 'f5', VK_F6: 'f6', VK_F7: 'f7', VK_F8: 'f8',
  VK_F9: 'f9', VK_F10: 'f10', VK_F11: 'f11', VK_F12: 'f12',
  VK_OEM_PERIOD: '.', OEM_PERIOD: '.',
  VK_OEM_COMMA: ',', OEM_COMMA: ',',
  VK_OEM_PLUS: '=', OEM_PLUS: '=',
  VK_OEM_4: '[', OEM_4: '[',
  VK_OEM_6: ']', OEM_6: ']',
  VK_OEM_5: '\\', OEM_5: '\\',
  VK_OEM_1: ';', OEM_1: ';',
  VK_OEM_7: "'", OEM_7: "'",
  VK_OEM_MINUS: '-', OEM_MINUS: '-',
  VK_OEM_2: '/', OEM_2: '/',
  VK_OEM_3: '`', OEM_3: '`',
  VK_OEM_8: '`', OEM_8: '`',
  VK_NUMPAD0: '0', NUMPAD0: '0',
  VK_NUMPAD1: '1', NUMPAD1: '1',
  VK_NUMPAD2: '2', NUMPAD2: '2',
  VK_NUMPAD3: '3', NUMPAD3: '3',
  VK_NUMPAD4: '4', NUMPAD4: '4',
  VK_NUMPAD5: '5', NUMPAD5: '5',
  VK_NUMPAD6: '6', NUMPAD6: '6',
  VK_NUMPAD7: '7', NUMPAD7: '7',
  VK_NUMPAD8: '8', NUMPAD8: '8',
  VK_NUMPAD9: '9', NUMPAD9: '9',
}
const KEY_SYMBOL_ORDER = '~`!@#$%^&*()-_=+[]{}\\|;:\'",<.>/?'
const KEY_EDIT_ORDER = {
  up: 0, down: 1, left: 2, right: 3,
  home: 10, end: 11, 'page up': 12, 'page down': 13,
  insert: 20, delete: 21, backspace: 22,
  space: 30, enter: 31, tab: 32, esc: 33,
}

function parseBindingKey(raw) {
  const tokens = String(raw || '').trim().split(/\s+/).filter(Boolean)
  const mods = new Set()
  while (tokens.length) {
    const token = tokens[0].toLowerCase()
    if (KEY_NO_MODIFIERS.has(token)) {
      tokens.shift()
      continue
    }
    const modifier = KEY_MODIFIERS[token]
    if (!modifier) break
    mods.add(modifier)
    tokens.shift()
  }
  const key = tokens.join(' ').trim()
  return {
    mods,
    key: KEY_VK_MAP[key.toUpperCase()] || key.toLowerCase(),
  }
}

function classifyBindingKey(key) {
  if (!key) return [KEY_REGION.other, 999]
  if (/^[0-9]$/.test(key)) return [KEY_REGION.main, Number(key)]
  if (/^[a-z]$/i.test(key)) return [KEY_REGION.main, 100 + key.toLowerCase().charCodeAt(0) - 97]
  const symbolIndex = KEY_SYMBOL_ORDER.indexOf(key)
  if (symbolIndex >= 0) return [KEY_REGION.main, 200 + symbolIndex]
  if (Object.prototype.hasOwnProperty.call(KEY_EDIT_ORDER, key)) return [KEY_REGION.edit, KEY_EDIT_ORDER[key]]
  const fn = /^f(\d+)$/i.exec(key)
  if (fn) return [KEY_REGION.fn, Number(fn[1])]
  if (key.startsWith('numpad')) {
    const num = key.slice('numpad'.length)
    if (/^\d+$/.test(num)) return [KEY_REGION.numpad, Number(num)]
    return [KEY_REGION.numpad, 100 + ({ '+': 0, '-': 1, '*': 2, '/': 3, '.': 4 }[num] ?? 99)]
  }
  return [KEY_REGION.other, 990]
}

function keyBindingSortKey(binding) {
  const parsed = parseBindingKey(binding?.displayKey || binding?.key)
  const isCombo = parsed.mods.size ? 1 : 0
  const modRank = [...parsed.mods].reduce((sum, mod) => sum + (KEY_MODIFIER_RANK[mod] || 0), 0)
  const [region, order] = classifyBindingKey(parsed.key)
  return [isCombo, modRank, region, order]
}

function compareKeyBindings(a, b) {
  const left = keyBindingSortKey(a)
  const right = keyBindingSortKey(b)
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return left[i] - right[i]
  }
  return String(a?.displayKey || a?.key || '').localeCompare(String(b?.displayKey || b?.key || ''), 'zh-Hans')
    || String(a?.description || '').localeCompare(String(b?.description || ''), 'zh-Hans')
}

function sortKeyBindings(bindings) {
  return [...bindings].sort(compareKeyBindings)
}

function cleanIniCommentDescription(comment) {
  let text = String(comment || '').replace(/^\s*;+\s*/, '').trim()
  if (!text) return ''
  text = text.replace(/^【[^】]*】\s*/, '').trim()
  text = text.replace(/[（(]\s*[-\d,\s]+\s*[）)]\s*$/u, '').trim()
  text = text.replace(/\s+/g, ' ')
  text = translateKnownEnglishDescription(text) || text
  const cleaned = cleanKeyDescription(text)
  return isValidKeyDescription(cleaned) ? cleaned : ''
}

function getPersistComments(lines, file = '') {
  const comments = new Map()
  let lastComment = ''
  for (const line of lines) {
    const trimmed = line.trim()
    if (/^;/.test(trimmed)) {
      lastComment = trimmed
      continue
    }
    const persist = /^global\s+persist\s+\$(\w+)/i.exec(trimmed)
    if (persist && lastComment) {
      const desc = cleanIniCommentDescription(lastComment)
      if (desc) {
        const key = persist[1].toLowerCase()
        comments.set(key, desc)
        updateLocalDictionary(key, desc, 'file_context', file)
      }
    }
    if (trimmed && !persist) lastComment = ''
  }
  return comments
}

function getCommandListHints(lines) {
  const hints = new Map()
  let section = null
  for (const line of lines) {
    const header = /^\[CommandList(\w+)\]/i.exec(line.trim())
    if (header) {
      section = header[1].toLowerCase()
      continue
    }
    if (/^\[/.test(line.trim())) {
      section = null
      continue
    }
    if (!section || hints.has(section)) continue
    const directVar = /^\$(\w+)\s*=/.exec(line.trim())
    const toggleVar = /^\$(\w+)\s*=\s*\$\w+\s*\+/i.exec(line.trim())
    const hint = directVar?.[1] || toggleVar?.[1] || ''
    if (isUsefulKeyHint(hint)) hints.set(section, hint)
  }
  return hints
}

async function describeKeySection(section) {
  const original = String(section || 'Key')
  const lookup = normalizeKeyHintName(original)
  const rememberUntranslated = (text = raw) => {
    const value = String(text || '').trim()
    recordUntranslatedDictionaryKey(lookup, value)
    return value || original
  }
  const remember = (text, source = 'builtin') => {
    const cleaned = cleanKeyDescription(text)
    updateLocalDictionary(lookup, cleaned, source)
    return cleaned
  }
  const { local, words } = getKeyHintDictionaries()
  const localLookup = getDictionaryTextWithVariants(local, lookup)
  if (localLookup) return cleanKeyDescription(localLookup)

  const raw = stripKeySyntaxWords(original)
  if (!raw) return '切换'
  const normalized = raw.toLowerCase().replace(/\s+/g, '_')
  const knownEnglish = translateKnownEnglishDescription(raw)
  if (knownEnglish) return remember(knownEnglish, 'file_context')
  if (/[\u4e00-\u9fff]/.test(raw) && !/[a-z0-9]/i.test(raw)) return remember(raw, 'file_context')
  const alphaNumeric = /^([a-z]+)(\d+)$/i.exec(normalized)
  if (alphaNumeric) {
    const baseText = (await describeKeySection(alphaNumeric[1])).replace(/切换$/u, '')
    if (/[\u4e00-\u9fff]/.test(baseText)) return remember(`${baseText}${alphaNumeric[2]}`)
  }
  const exact = {
    swap: '切换', swapvar: '切换', toggle: '切换',
    color: '颜色切换', colour: '颜色切换', bow: '蝴蝶结切换',
    hairpin: '发夹切换', suspender: '吊带切换', wings: '翅膀切换', tail: '尾巴切换',
    whip: '鞭子切换', outfit: '服装切换', clothes: '服装切换', dress: '裙装切换', skirt: '裙子切换',
    jacket: '外套切换', jackets: '外套切换', coat: '外套切换', coats: '外套切换',
    boot: '靴子切换', boots: '靴子切换', chest: '胸部装饰切换',
    cloth: '衣服切换', shoe: '鞋子切换', shoes: '鞋子切换', ear: '耳朵切换', ears: '耳朵切换',
    eye: '眼睛切换', eyes: '眼睛切换', body: '身体切换', face: '脸部切换', hair: '头发切换',
    weapon: '武器切换', effect: '特效切换', tm: '透明切换', help: '帮助切换',
    check: '检查切换', hold: '长按切换',
    uid: 'UID 显示切换', map: '地图显示切换',
  }
  if (exact[normalized]) return remember(exact[normalized])
  const localNormalized = getDictionaryTextWithVariants(local, normalized)
  if (localNormalized) return cleanKeyDescription(localNormalized)
  const wordsNormalized = getDictionaryTextWithVariants(words, normalized)
  if (wordsNormalized) return remember(wordsNormalized)
  const wordMap = {
    swap: '', swapvar: '', toggle: '', var: '',
    color: '颜色', colour: '颜色', bow: '蝴蝶结', hairpin: '发夹', suspender: '吊带',
    wings: '翅膀', wing: '翅膀', tail: '尾巴', whip: '鞭子', outfit: '服装', clothes: '服装',
    jacket: '外套', jackets: '外套', coat: '外套', coats: '外套', boot: '靴子', boots: '靴子', chest: '胸部装饰',
    crown: '皇冠', tiara: '头冠', earring: '耳环', earrings: '耳环', makeup: '妆容', front: '前侧', back: '背部', top: '上衣',
    cloth: '衣服', shoe: '鞋子', shoes: '鞋子', ear: '耳朵', ears: '耳朵', eye: '眼睛', eyes: '眼睛',
    dress: '裙装', skirt: '裙子', body: '身体', face: '脸部', hair: '头发', weapon: '武器', effect: '特效',
    uid: 'UID', map: '地图', tuifa: '腿法', toufa: '头发', fashi: '发饰', xiongbu: '胸部', tunbu: '臀部',
    shoubi: '手臂', shouwan: '手腕', jiao: '鞋子', xiezi: '鞋子', maozi: '帽子', weiba: '尾巴',
    waitao: '外套', yanjing: '眼镜', xiongxing: '胸型', qunzi: '裙子', siwa: '丝袜', diaodai: '吊带',
    erzhui: '耳坠', tuer: '兔耳', tuwei: '腿围', jiaohuan: '脚环', xiaban: '下摆',
    yuangxiongbu: '圆胸部', yuan: '圆',
    lingdai: '领带', xiangquan: '项圈', suolian: '锁链', yinmao: '阴毛', neiku: '内裤', toubu: '头部',
    tm: '透明', help: '帮助', check: '检查', hold: '长按', a: 'A', b: 'B', c: 'C', d: 'D',
  }
  const parts = normalized
    .replace(/([a-z])(\d)/ig, '$1_$2')
    .replace(/(\d)([a-z])/ig, '$1_$2')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
  const hasToggleWord = parts.some((part) => ['swap', 'swapvar', 'toggle'].includes(part))
  const translated = parts
    .map((part) => wordMap[part] || getDictionaryTextWithVariants(words, part) || getDictionaryTextWithVariants(local, part) || part)
    .filter((part) => !['swapvar', 'swap', 'toggle', 'var'].includes(String(part).toLowerCase()))
    .filter(Boolean)
    .join('')
  if (!translated) return '切换'
  if (!/[\u4e00-\u9fff]/.test(translated) && !hasToggleWord) {
    const online = await queryOnlineTranslation(normalized)
    if (online) return cleanKeyDescription(online)
    recordUntranslatedDictionaryKey(lookup, raw)
    for (const part of parts) {
      if (!wordMap[part] && !getDictionaryTextWithVariants(words, part) && !getDictionaryTextWithVariants(local, part)) {
        recordUntranslatedDictionaryKey(part, part)
      }
    }
    return rememberUntranslated(raw)
  }
  return remember(translated)
}

async function setModKey(rel, binding, nextKey) {
  const target = path.join(MODS_ROOT, rel)
  const file = path.join(target, binding.file || '')
  if (!isInsideRoot(path.resolve(file), path.resolve(target))) throw new Error('Invalid ini path')
  const text = await fsp.readFile(file, 'utf8')
  const lines = text.split(/\r?\n/)
  let section = null
  let changed = false
  const next = lines.map((line) => {
    const header = /^\[(Key\w+)\]/i.exec(line.trim())
    if (header) {
      section = header[1]
      return line
    }
    if (/^\[/.test(line.trim())) section = null
    if (!changed && section === binding.section) {
      const match = /^(\s*;+\s*)?(\s*)key\s*=\s*(.+)$/i.exec(line)
      if (match) {
        changed = true
        const comment = match[1] || ''
        const indent = match[2] || ''
        return `${comment}${indent}key = ${String(nextKey || '').trim()}`
      }
    }
    return line
  })
  if (!changed) throw new Error('Key binding not found')
  await fsp.writeFile(file, next.join('\n'), 'utf8')
  return { ok: true }
}

// ---------- 鏋勫缓1绾х晫闈㈡暟鎹?----------
// 鐩存帴鎵弿 Mods 鐩綍锛岀敓鎴?groups 鍒楄〃
// character鐗规畩澶勭悊锛氬睍寮€瀹冪殑瀛愮洰褰曚綔涓?绾х晫闈?// 鍏朵粬鐩綍鐩存帴浣滀负1绾х晫闈?// 闅愯棌/鐗规畩鐩綍鎺掗櫎
async function buildOverviewGroups() {
  // 头像数据不阻塞首屏，后台补齐即可
  if (!characterDataLoaded) {
    fetchCharacterAvatars().then(() => scheduleRescan()).catch(() => {})
  }

  const root = MODS_ROOT
  const entries = await fsp.readdir(root, { withFileTypes: true })
  const groups = (await Promise.all(entries.map(async (entry) => {
    if (!entry.isDirectory()) return []
    if (entry.name.startsWith('.')) return []
    if (isDisabledDirName(entry.name)) return []

    const dirPath = path.join(root, entry.name)

    if (entry.name === SPECIAL_EXPAND_DIR) {
      const subEntries = await fsp.readdir(dirPath, { withFileTypes: true })
      const characterDirs = subEntries.filter((subEntry) => subEntry.isDirectory() && !subEntry.name.startsWith('.'))
      const visibleSubEntries = characterDirs.filter((subEntry) => !isDisabledDirName(subEntry.name))
      const visibleSubEntryMap = new Map()
      for (const subEntry of visibleSubEntries) {
        const key = normalizeAssetKey(subEntry.name)
        visibleSubEntryMap.set(key, preferCharacterDir(subEntry, visibleSubEntryMap.get(key)))
      }
      const uniqueVisibleSubEntries = Array.from(visibleSubEntryMap.values())
      const existingCharacterDirs = new Set(characterDirs.map((subEntry) => normalizeAssetKey(subEntry.name)))
      const subGroups = await Promise.all(uniqueVisibleSubEntries.map(async (subEntry) => {
        const mods = await scanCategory(path.join(entry.name, subEntry.name))
        const groupDir = path.join(dirPath, subEntry.name)
        const manualPreview = findLocalCoverSync(groupDir)
        const artwork = getReferenceCharacterImage(subEntry.name)
        const avatar = getCharacterAvatar(subEntry.name)
        const cover = manualPreview || artwork || (mods.length > 0 ? avatar : null)
        return {
          name: subEntry.name,
          chineseName: getChineseName(subEntry.name),
          path: `${entry.name}/${subEntry.name}`,
          mods,
          artwork: cover || null,
          hasManualCover: !!manualPreview,
          avatar: avatar || null,
          preview: mods[0]?.preview || null,
          isEmpty: mods.length === 0,
        }
      }))
      const missingGroups = Array.from(getReferenceCharacterDirs(), ([dirName, avatar]) => {
        if (existingCharacterDirs.has(dirName)) return null
        const artwork = getReferenceCharacterImage(dirName)
        return {
          name: dirName,
          chineseName: getChineseName(dirName),
          path: `${entry.name}/${dirName}`,
          mods: [],
          artwork: artwork || null,
          hasManualCover: false,
          avatar: avatar || null,
          preview: null,
          isEmpty: true,
          missing: true,
        }
      }).filter(Boolean)
      return [...subGroups, ...missingGroups]
    }

    const mods = await scanCategory(entry.name)
    const manualPreview = findLocalCoverSync(dirPath)
    const artwork = getReferenceCategoryImage(entry.name)
    return [{
      name: entry.name,
      chineseName: getChineseName(entry.name),
      path: entry.name,
      mods,
      artwork: manualPreview || artwork,
      hasManualCover: !!manualPreview,
      avatar: null,
      preview: mods[0]?.preview || null,
      isEmpty: mods.length === 0,
    }]
  }))).flat()

  // 鎸?mod 鏁伴噺鎺掑簭锛堝鐨勫湪鍓嶏級
  return sortByPinnedOrder(
    groups.map(applyOverviewMeta),
    sortOrder.overview,
    () => true,
    (group) => group.path,
    (a, b) => (a.chineseName || a.name).localeCompare(b.chineseName || b.name, 'zh'),
  )
}

// 浠?mods 鍒楄〃璁＄畻瀛愮洰褰曚俊鎭?
function computeSubdirs(mods) {
  const sameDir = (a, b) => stripDisabled(a) === stripDisabled(b)
  const map = new Map()
  for (const m of mods) {
    const g = m.group ? String(m.group).split(' / ') : []
    if (g.length && sameDir(g[0], m.rawName)) {
      m.group = null
      m.subdir = null
    } else {
      const s = g[0] || null
      m.subdir = s
      if (s) map.set(s, (map.get(s) || 0) + 1)
    }
  }
  return Array.from(map, ([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name, 'zh'))
}

// 姹囨€诲叏閮ㄥ垎绫绘暟鎹紙淇濈暀鍚戝悗鍏煎锛?
async function buildModData() {
  const root = MODS_ROOT
  const dirs = await fsp.readdir(root, { withFileTypes: true })
  const categories = dirs.filter((d) => d.isDirectory() && !d.name.startsWith('.')).map((d) => d.name)
  const result = []
  for (const c of categories) {
    if (/^(\.git|ShaderFixes|ShaderCache)$/i.test(c)) continue
    try {
      const mods = await scanCategory(c)
      result.push({ name: c, mods, subdirs: computeSubdirs(mods) })
    } catch (e) {
      console.error('鎵弿鍒嗙被澶辫触', c, e)
    }
  }
  result.sort((a, b) => {
    const ah = a.subdirs.length ? 1 : 0
    const bh = b.subdirs.length ? 1 : 0
    if (ah !== bh) return bh - ah
    return a.name.localeCompare(b.name, 'zh')
  })
  return { categories: result, root: MODS_ROOT }
}

// ---------- 鐩綍鐩戝惉 ----------
function startWatcher() {
  stopWatcher()
  if (!fs.existsSync(MODS_ROOT)) return
  try {
    watcher = fs.watch(MODS_ROOT, { recursive: true }, () => scheduleRescan())
  } catch (e) {
    console.error('鍚姩鐩戝惉澶辫触', e)
  }
}
function stopWatcher() {
  if (watcher) { watcher.close(); watcher = null }
}
function scheduleRescan() {
  clearTimeout(rescanTimer)
  rescanTimer = setTimeout(async () => {
    try {
      const data = await buildModData()
      broadcast('mods:changed', data)
    } catch (e) { console.error('閲嶆壂澶辫触', e) }
  }, 300)
}
function broadcast(channel, payload) {
  BrowserWindow.getAllWindows().forEach((w) => w.webContents.send(channel, payload))
}

function modOperationKey(rel) {
  return normalizeOrderKey(stripDisabledRel(rel || '')).toLowerCase()
}

async function withModOperationLock(rel, fn) {
  const key = modOperationKey(rel)
  if (!key) return { ok: false, error: '无效的 Mod 路径' }
  if (modOperationLocks.has(key)) return { ok: false, error: 'Mod 正在重命名或切换，请稍后' }
  modOperationLocks.add(key)
  try {
    return await fn()
  } finally {
    modOperationLocks.delete(key)
  }
}

async function withModOperationLocks(rels, fn) {
  const keys = [...new Set((Array.isArray(rels) ? rels : []).map(modOperationKey).filter(Boolean))]
  if (!keys.length) return { ok: false, error: '无效的 Mod 路径' }
  if (keys.some((key) => modOperationLocks.has(key))) {
    return { ok: false, error: 'Mod 正在重命名或切换，请稍后' }
  }
  keys.forEach((key) => modOperationLocks.add(key))
  try {
    return await fn()
  } finally {
    keys.forEach((key) => modOperationLocks.delete(key))
  }
}

// ---------- 鍚敤/鍋滅敤 ----------
async function toggleDisabled(rel, enable) {
  const target = path.join(MODS_ROOT, rel)
  if (!isInsideRoot(path.resolve(target), path.resolve(MODS_ROOT))) throw new Error('Invalid path')
  if (!fs.existsSync(target)) throw new Error('Mod 目录不存在，请刷新后重试')
  const parent = path.dirname(target)
  const name = path.basename(target)
  const plain = stripDisabled(name)
  const newName = enable === false ? DISABLED_PREFIX + plain : plain
  const newPath = path.join(parent, newName)
  if (newName === name) return newPath
  await fsp.rename(target, newPath)
  return newPath
}

function getModGroupPath(rel) {
  const parts = normalizeOrderKey(rel).split('/').filter(Boolean)
  if (parts[0] === SPECIAL_EXPAND_DIR && parts.length >= 2) return parts.slice(0, 2).join('/')
  return parts[0] || ''
}

async function pinToggledMod(rel, enable) {
  const groupPath = getModGroupPath(rel)
  if (!groupPath) return

  const toggledKey = stripDisabledRel(rel)
  const mods = await scanCategory(groupPath)
  const visibleKeys = mods.map((mod) => mod.orderKey)
  const orderedKeys = [
    ...normalizeOrderList(sortOrder.mods[groupPath]).filter((key) => visibleKeys.includes(key)),
    ...visibleKeys.filter((key) => !normalizeOrderList(sortOrder.mods[groupPath]).includes(key)),
  ].filter((key) => key !== toggledKey)

  if (enable) {
    orderedKeys.unshift(toggledKey)
  } else {
    const enabledCount = mods.filter((mod) => !mod.disabled && mod.orderKey !== toggledKey).length
    orderedKeys.splice(enabledCount, 0, toggledKey)
  }

  sortOrder.mods[groupPath] = orderedKeys
  saveConfig()
}

function setModFavorite(rel, favorite) {
  const key = stripDisabledRel(rel)
  if (!key) return { ok: false, error: '无效的 Mod 路径' }
  const favorites = new Set(normalizeOrderList(favoriteMods))
  if (favorite) favorites.add(key)
  else favorites.delete(key)
  favoriteMods = Array.from(favorites)
  saveConfig()
  return { ok: true, favorite: favoriteMods.includes(key) }
}

// ---------- F10 鍙戦€侊紙璋?powershell 鑴氭湰锛?---------
function normalizeModDisplayName(value) {
  const name = stripDisabled(String(value || '').trim())
  if (!name || /[<>:"/\\|?*\x00-\x1f]/.test(name)) return null
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(name)) return null
  return name
}

async function renameMod(rel, nextName, groupPath) {
  const target = path.join(MODS_ROOT, rel)
  if (!isInsideRoot(path.resolve(target), path.resolve(MODS_ROOT))) throw new Error('Invalid path')
  const stat = await fsp.stat(target)
  if (!stat.isDirectory()) throw new Error('Target is not a directory')

  const parent = path.dirname(target)
  const currentName = path.basename(target)
  const cleanName = normalizeModDisplayName(nextName)
  if (!cleanName) throw new Error('Invalid name')

  const finalName = isDisabledDirName(currentName) ? DISABLED_PREFIX + cleanName : cleanName
  const finalPath = path.join(parent, finalName)
  if (path.resolve(finalPath) === path.resolve(target)) {
    return { ok: true, rel, name: cleanName, orderKey: stripDisabledRel(rel) }
  }
  if (fs.existsSync(finalPath)) throw new Error('Name already exists')

  const oldKey = stripDisabledRel(rel)
  await fsp.rename(target, finalPath)
  const newRel = path.relative(MODS_ROOT, finalPath)
  const newKey = stripDisabledRel(newRel)
  if (typeof groupPath === 'string' && sortOrder.mods[groupPath]) {
    sortOrder.mods[groupPath] = sortOrder.mods[groupPath].map((key) => key === oldKey ? newKey : key)
  }
  favoriteMods = normalizeOrderList(favoriteMods).map((key) => key === oldKey ? newKey : key)
  saveConfig()
  return { ok: true, rel: newRel, name: cleanName, orderKey: newKey }
}

async function setModLocked(rel, locked) {
  const target = path.join(MODS_ROOT, rel)
  if (!isInsideRoot(path.resolve(target), path.resolve(MODS_ROOT))) throw new Error('Invalid path')
  const files = walkIniFiles(target)
  let changed = 0
  for (const file of files) {
    const original = await fsp.readFile(file, 'utf8')
    const next = transformKeyLines(original, !!locked)
    if (next.changed) {
      await fsp.writeFile(file, next.text, 'utf8')
      changed++
    }
  }
  return { ok: true, changed }
}

function samePath(a, b) {
  return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase()
}

async function readDirNames(dir) {
  try {
    return await fsp.readdir(dir)
  } catch {
    return []
  }
}

async function findNamedPath(dir, name, skipped = new Set()) {
  const found = pickExactFile(await readDirNames(dir), name)
  if (!found) return null
  const full = path.join(dir, found)
  return skipped.has(path.resolve(full).toLowerCase()) ? null : full
}

async function uniqueDemotedPath(dir, base, ext, reserved = new Set(), currentPath = null) {
  const direct = path.join(dir, `${base}${ext}`)
  if (currentPath && samePath(currentPath, direct) && !reserved.has(path.resolve(direct).toLowerCase())) return direct
  if (!fs.existsSync(direct) && !reserved.has(path.resolve(direct).toLowerCase())) return direct
  for (let i = 2; i < 1000; i++) {
    const candidate = path.join(dir, `${base}-${i}${ext}`)
    if (!fs.existsSync(candidate) && !reserved.has(path.resolve(candidate).toLowerCase())) return candidate
  }
  throw new Error('无法生成不冲突的预览图文件名')
}

async function renamePreviewFile(source, dest) {
  if (!samePath(source, dest)) {
    await fsp.rename(source, dest)
    return
  }
  if (path.basename(source) === path.basename(dest)) return
  const temp = path.join(path.dirname(source), `.preview-case-${Date.now()}-${Math.random().toString(16).slice(2)}${path.extname(source)}`)
  await fsp.rename(source, temp)
  await fsp.rename(temp, dest)
}

async function demotePreviewSlot(dir, tier, ext, reserved = new Set(), skipped = new Set()) {
  const current = await findNamedPath(dir, `${PREVIEW_BASES[tier]}${ext}`, skipped)
  if (!current) return

  let nextPath
  if (tier >= PREVIEW_BASES.length - 1) {
    nextPath = await uniqueDemotedPath(dir, PREVIEW_BASES[tier], ext, reserved, current)
  } else {
    await demotePreviewSlot(dir, tier + 1, ext, reserved, skipped)
    nextPath = await uniqueDemotedPath(dir, PREVIEW_BASES[tier + 1], ext, reserved, current)
  }
  reserved.add(path.resolve(nextPath).toLowerCase())
  await renamePreviewFile(current, nextPath)
}

async function promotePreviewImage(target, source, dest, ext) {
  const sourceInTarget = samePath(path.dirname(source), target)
  const keepSourceAtDest = sourceInTarget && path.basename(source) === path.basename(dest)
  const reserved = new Set([path.resolve(dest).toLowerCase()])
  const skipped = new Set()
  if (keepSourceAtDest) skipped.add(path.resolve(dest).toLowerCase())

  let staged = null
  if (!keepSourceAtDest) {
    staged = path.join(target, `.JASM_Cover.tmp-${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`)
    reserved.add(path.resolve(staged).toLowerCase())
    skipped.add(path.resolve(staged).toLowerCase())
    if (sourceInTarget) await fsp.rename(source, staged)
    else await fsp.copyFile(source, staged)
  }

  for (const oldExt of PREVIEW_EXTS) await demotePreviewSlot(target, 0, oldExt, reserved, skipped)
  if (staged) await fsp.rename(staged, dest)
}

function formatJasmDate(date = new Date()) {
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`
}

async function updateJasmModConfig(dir, imageName) {
  const file = path.join(dir, '.JASM_ModConfig.json')
  let config = null
  try {
    config = JSON.parse(await fsp.readFile(file, 'utf8'))
  } catch {
    config = {}
  }
  if (!config || typeof config !== 'object' || Array.isArray(config)) config = {}
  if (!config.Id) config.Id = crypto.randomUUID()
  config.ImagePath = imageName
  if (!config.DateAdded) config.DateAdded = formatJasmDate()
  await fsp.writeFile(file, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
}

async function setModPreview(rel) {
  const target = path.join(MODS_ROOT, rel)
  if (!isInsideRoot(path.resolve(target), path.resolve(MODS_ROOT))) throw new Error('Invalid path')
  const res = await dialog.showOpenDialog(mainWindow, {
    title: '选择 Mod 预览图',
    defaultPath: target,
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
  })
  if (res.canceled || !res.filePaths[0]) return { ok: false, canceled: true }
  const source = path.resolve(res.filePaths[0])
  const ext = path.extname(source).toLowerCase()
  if (!PREVIEW_EXTS.includes(ext)) throw new Error('不支持的图片格式')
  const dest = path.join(target, `.JASM_Cover${ext}`)

  await promotePreviewImage(target, source, dest, ext)
  await updateJasmModConfig(target, path.basename(dest))
  return { ok: true, preview: toModImageUrl(dest) }
}

async function setOverviewPreview(groupPath) {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: '选择预览图',
    defaultPath: PROJECT_ASSETS_ROOT,
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
  })
  if (res.canceled || !res.filePaths[0]) return { ok: false, canceled: true }
  const source = path.resolve(res.filePaths[0])
  const ext = path.extname(source).toLowerCase()
  if (!PREVIEW_EXTS.includes(ext)) throw new Error('不支持的图片格式')
  const key = normalizeOrderKey(groupPath)
  if (!key) throw new Error('Invalid path')
  const current = overviewMeta[key] || {}
  overviewMeta[key] = {
    displayName: current.displayName || '',
    artworkPath: source,
  }
  saveConfig()
  return { ok: true, preview: toAssetImageUrl(source) }
}

function openOverviewFolder(groupPath) {
  const target = path.join(MODS_ROOT, groupPath)
  if (!isInsideRoot(path.resolve(target), path.resolve(MODS_ROOT))) throw new Error('Invalid path')
  spawn('explorer.exe', [target])
  return { ok: true }
}

async function renameOverviewGroup(groupPath, nextName) {
  const target = path.join(MODS_ROOT, groupPath)
  if (!isInsideRoot(path.resolve(target), path.resolve(MODS_ROOT))) throw new Error('Invalid path')
  const stat = await fsp.stat(target)
  if (!stat.isDirectory()) throw new Error('Target is not a directory')
  const cleanName = normalizeModDisplayName(nextName)
  if (!cleanName) throw new Error('Invalid name')
  const parent = path.dirname(target)
  const finalPath = path.join(parent, cleanName)
  if (!isInsideRoot(path.resolve(finalPath), path.resolve(MODS_ROOT))) throw new Error('Invalid path')
  if (path.resolve(finalPath) === path.resolve(target)) return { ok: true, path: groupPath, name: cleanName }
  if (fs.existsSync(finalPath)) throw new Error('Name already exists')
  await fsp.rename(target, finalPath)
  const newPath = path.relative(MODS_ROOT, finalPath).replace(/\\/g, '/')
  sortOrder.overview = sortOrder.overview.map((key) => key === groupPath ? newPath : key)
  if (sortOrder.mods[groupPath]) {
    sortOrder.mods[newPath] = sortOrder.mods[groupPath]
    delete sortOrder.mods[groupPath]
  }
  saveConfig()
  return { ok: true, path: newPath, name: cleanName }
}

async function trashOverviewGroup(groupPath) {
  const target = path.join(MODS_ROOT, groupPath)
  if (!isInsideRoot(path.resolve(target), path.resolve(MODS_ROOT))) throw new Error('Invalid path')
  if (fs.existsSync(target)) await shell.trashItem(target)
  return { ok: true }
}

async function createOverviewDir(groupPath) {
  const dirName = path.basename(groupPath)
  const defaultParent = path.dirname(path.join(MODS_ROOT, groupPath))
  const res = await dialog.showOpenDialog(mainWindow, {
    title: `选择要创建 ${dirName} 的父目录`,
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: fs.existsSync(defaultParent) ? defaultParent : MODS_ROOT,
  })
  if (res.canceled || !res.filePaths[0]) return { ok: false, canceled: true }
  const parent = path.resolve(res.filePaths[0])
  if (!isInsideRoot(parent, path.resolve(MODS_ROOT))) throw new Error('Target must be inside Mods root')
  const target = path.join(parent, dirName)
  if (fs.existsSync(target)) throw new Error('Directory already exists')
  await fsp.mkdir(target, { recursive: true })
  const rel = path.relative(MODS_ROOT, target).replace(/\\/g, '/')
  return { ok: true, path: rel, name: dirName }
}

async function createOverviewGrid(name) {
  if (isDisabledDirName(name)) return { ok: false, error: '网格目录不能以 DISABLED_ 开头' }
  const cleanName = normalizeModDisplayName(name)
  if (!cleanName) return { ok: false, error: '文件夹名称无效' }
  const res = await dialog.showOpenDialog(mainWindow, {
    title: `选择要创建 ${cleanName} 的父目录`,
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: MODS_ROOT,
  })
  if (res.canceled || !res.filePaths[0]) return { ok: false, canceled: true }
  const parent = path.resolve(res.filePaths[0])
  if (!isInsideRoot(parent, path.resolve(MODS_ROOT))) return { ok: false, error: '只能在 Mods 目录内新建网格' }
  const parentRel = path.relative(MODS_ROOT, parent).replace(/\\/g, '/')
  if (parentRel && parentRel !== SPECIAL_EXPAND_DIR) {
    return { ok: false, error: '只有 Mods 根目录或 character 目录下会生成一级网格' }
  }
  const target = path.join(parent, cleanName)
  if (!isInsideRoot(path.resolve(target), path.resolve(MODS_ROOT))) return { ok: false, error: 'Invalid path' }
  if (fs.existsSync(target)) return { ok: false, error: '目录已存在' }
  await fsp.mkdir(target, { recursive: true })
  const rel = path.relative(MODS_ROOT, target).replace(/\\/g, '/')
  return { ok: true, path: rel, name: cleanName }
}

function runFlatten(targetRel) {
  return new Promise((resolve) => {
    const target = path.join(MODS_ROOT, targetRel)
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', FLATTEN_SCRIPT, '-TargetDir', target], { windowsHide: true })
    let out = '', err = ''
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (err += d))
    child.on('close', (code) => resolve({ ok: code === 0, out: out.trim(), err: err.trim() }))
  })
}

function quoteCmdArg(value) {
  return `"${String(value).replace(/(["^&|<>])/g, '^$1')}"`
}

function findPythonRunner() {
  const candidates = [
    { exe: 'python', prefix: [] },
    { exe: 'py', prefix: ['-3'] },
  ]
  for (const candidate of candidates) {
    const result = spawnSync(candidate.exe, [...candidate.prefix, '--version'], {
      windowsHide: true,
      stdio: 'ignore',
    })
    if (result.status === 0) return candidate
  }
  return null
}

function ensurePythonToolCompatibility() {
  if (!fs.existsSync(INI_UTIL_SCRIPT)) return
  const text = fs.readFileSync(INI_UTIL_SCRIPT, 'utf8')
  if (!/def\s+cycle_value\s*\(/.test(text) || /def\s+queue_cycle\s*\(/.test(text)) return
  fs.writeFileSync(
    INI_UTIL_SCRIPT,
    `${text.trimEnd()}\n\ndef queue_cycle(var_name: str, filepath: str, all_bindings: list) -> str:\n    return cycle_value(var_name, filepath, all_bindings)\n`,
    'utf8',
  )
}

function writePythonRunner(script, target, runner, requireAdmin = false) {
  const scriptDir = path.dirname(script)
  const prefix = runner.prefix.map(quoteCmdArg).join(' ')
  const pythonArgs = [quoteCmdArg(runner.exe), prefix, '-u', quoteCmdArg(script), quoteCmdArg(target)]
    .filter(Boolean)
    .join(' ')
  const lines = [
    '@echo off',
    'chcp 65001 >nul',
    `title WWMI ${path.basename(script)}`,
    ...(requireAdmin ? [
      'net session >nul 2>&1',
      'if not "%ERRORLEVEL%"=="0" (',
      '  echo Requesting administrator permission for game hotkeys...',
      "  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command \"Start-Process -FilePath '%~f0' -Verb RunAs\"",
      '  exit /b',
      ')',
    ] : []),
    `cd /d ${quoteCmdArg(scriptDir)}`,
    'set PYTHONUTF8=1',
    'set PYTHONIOENCODING=utf-8',
    pythonArgs,
    'set EXITCODE=%ERRORLEVEL%',
    'echo.',
    'if not "%EXITCODE%"=="0" echo [ERROR] Script exited with code %EXITCODE%',
    'if not "%EXITCODE%"=="0" pause',
  ]
  const runnersDir = path.join(app.getPath('userData'), 'script-runners')
  fs.mkdirSync(runnersDir, { recursive: true })
  const name = `${path.basename(script, '.py')}-${Date.now()}.cmd`
  const runnerPath = path.join(runnersDir, name)
  fs.writeFileSync(runnerPath, lines.join('\r\n'), 'utf8')
  return runnerPath
}

function launchPythonScript(script, target, elevated = false) {
  ensurePythonToolCompatibility()
  const runner = findPythonRunner()
  if (!runner) return { ok: false, err: '未找到 Python，请先安装 Python 3' }

  const runnerPath = writePythonRunner(script, target, runner, elevated)

  const child = spawn('cmd.exe', ['/c', 'start', '', runnerPath], {
    windowsHide: true,
    detached: true,
    stdio: 'ignore',
  })
  child.unref()
  return { ok: true }
}

function runPythonScript(script, targets) {
  ensurePythonToolCompatibility()
  const runner = findPythonRunner()
  if (!runner) return Promise.resolve({ ok: false, err: '未找到 Python，请先安装 Python 3' })

  const args = [...runner.prefix, '-u', script, ...normalizeOrderList(targets)]
  return new Promise((resolve) => {
    const child = spawn(runner.exe, args, {
      cwd: path.dirname(script),
      windowsHide: true,
      env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
    })
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => (out += d.toString()))
    child.stderr.on('data', (d) => (err += d.toString()))
    child.on('error', (error) => resolve({ ok: false, err: error.message, out: out.trim() }))
    child.on('close', (code) => {
      resolve({
        ok: code === 0,
        code,
        out: out.trim(),
        err: err.trim(),
      })
    })
  })
}

async function translateModIni(rel) {
  const target = path.join(MODS_ROOT, rel)
  if (!isInsideRoot(path.resolve(target), path.resolve(MODS_ROOT))) return { ok: false, err: 'Invalid target' }
  const files = walkIniFiles(target)
  if (!files.length) return { ok: false, err: '未找到 ini 文件' }
  const result = await runPythonScript(TRANSLATE_SCRIPT, files)
  if (result.ok) {
    keyHintDictionaryCache = null
    scheduleRescan()
  }
  return { ...result, files: files.length }
}

function updateToolFiles() {
  const copied = []
  const missing = []
  for (const file of TOOL_UPDATE_FILES) {
    const candidates = SKILL_ROOT_CANDIDATES
      .flatMap((root) => file.sourceDirs.map((dir) => path.join(root, dir, file.name)))
      .filter((candidate) => fs.existsSync(candidate))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
    const source = candidates[0]
    const target = path.join(TOOLS_DIR, file.name)
    if (!source) {
      missing.push(file.name)
      continue
    }
    try {
      if (file.name === 'local_dict.json' || file.name === 'word_dict.json') {
        const changed = mergeDictionaryFile(source, target)
        copied.push(`${file.name}:${changed}`)
        continue
      }
      fs.copyFileSync(source, target)
      copied.push(file.name)
    } catch (error) {
      return { ok: false, copied, missing, error: `${file.name}: ${error.message}` }
    }
  }
  ensurePythonToolCompatibility()
  keyHintDictionaryCache = null
  return { ok: copied.length > 0, copied, missing }
}

function clearLocalDictionary() {
  const current = loadJsonDictionary(LOCAL_DICT_FILE)
  saveJsonDictionary(LOCAL_DICT_FILE, {})
  keyHintDictionaryCache = null
  return { ok: true, cleared: Object.keys(current).length }
}

function findInterfaceIni(target) {
  const files = walkIniFiles(target)
  return files.find((file) => path.basename(file).toLowerCase() === 'interface.ini') || files[0] || null
}

async function chooseMoveTarget() {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: '选择要移动到的目录',
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: MODS_ROOT,
  })
  if (res.canceled || !res.filePaths[0]) return null
  return res.filePaths[0]
}

async function moveMods(rels, targetDir) {
  const moved = []
  for (const rel of normalizeOrderList(rels)) {
    const source = path.join(MODS_ROOT, rel)
    if (!isInsideRoot(path.resolve(source), path.resolve(MODS_ROOT))) continue
    const dest = path.join(targetDir, path.basename(source))
    if (fs.existsSync(dest)) throw new Error(`鐩爣宸插瓨鍦細${path.basename(dest)}`)
    await fsp.rename(source, dest)
    moved.push(rel)
  }
  return { ok: true, moved: moved.length }
}

async function chooseSourceDirs() {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: '选择要移入的文件夹',
    properties: ['openDirectory', 'multiSelections'],
    defaultPath: MODS_ROOT,
  })
  if (res.canceled || !Array.isArray(res.filePaths) || !res.filePaths.length) return null
  return res.filePaths
}

async function moveDirectoryLike(source, targetDir) {
  if (!fs.existsSync(source)) return false
  const stat = await fsp.stat(source)
  if (!stat.isDirectory()) return false
  const resolvedSource = path.resolve(source)
  const resolvedTarget = path.resolve(targetDir)
  if (resolvedSource.toLowerCase() === resolvedTarget.toLowerCase()) return false
  const sameParent = path.resolve(path.dirname(resolvedSource)).toLowerCase() === resolvedTarget.toLowerCase()
  if (sameParent) return false

  const dest = uniqueDestination(targetDir, path.basename(source))
  try {
    await fsp.rename(source, dest)
  } catch (error) {
    if (error && error.code !== 'EXDEV') throw error
    await fsp.cp(source, dest, { recursive: true, force: false, errorOnExist: true })
    await fsp.rm(source, { recursive: true, force: true })
  }
  return true
}

async function moveSourceDirs(targetGroupPath, sourceDirs) {
  const targetDir = path.join(MODS_ROOT, targetGroupPath)
  if (!isInsideRoot(path.resolve(targetDir), path.resolve(MODS_ROOT))) throw new Error('Invalid target')
  await fsp.mkdir(targetDir, { recursive: true })
  let moved = 0
  for (const source of normalizeOrderList(sourceDirs)) {
    const resolved = path.resolve(source)
    if (!fs.existsSync(resolved)) continue
    const next = uniqueDestination(targetDir, path.basename(resolved))
    if (path.resolve(next).toLowerCase() === resolved.toLowerCase()) continue
    if (await moveDirectoryLike(resolved, targetDir)) moved++
  }
  return { ok: true, moved }
}

function uniqueDestination(parent, baseName) {
  let candidate = path.join(parent, baseName)
  if (!fs.existsSync(candidate)) return candidate
  const parsed = path.parse(baseName)
  let index = 1
  do {
    candidate = path.join(parent, `${parsed.name}_copy${index}${parsed.ext}`)
    index++
  } while (fs.existsSync(candidate))
  return candidate
}

async function pasteMods(rels, targetGroupPath, mode) {
  const targetDir = path.join(MODS_ROOT, targetGroupPath)
  if (!isInsideRoot(path.resolve(targetDir), path.resolve(MODS_ROOT))) throw new Error('Invalid target')
  await fsp.mkdir(targetDir, { recursive: true })
  let changed = 0
  for (const rel of normalizeOrderList(rels)) {
    const source = path.join(MODS_ROOT, rel)
    if (!isInsideRoot(path.resolve(source), path.resolve(MODS_ROOT))) continue
    if (!fs.existsSync(source)) continue
    const sameParent = path.resolve(path.dirname(source)).toLowerCase() === path.resolve(targetDir).toLowerCase()
    if (mode === 'cut' && sameParent) continue
    const dest = uniqueDestination(targetDir, path.basename(source))
    if (mode === 'cut') await fsp.rename(source, dest)
    else await fsp.cp(source, dest, { recursive: true, force: false, errorOnExist: true })
    changed++
  }
  return { ok: true, mode: mode === 'cut' ? 'cut' : 'copy', changed }
}

function findD3dxIniPath() {
  const candidates = [
    path.join(WWMI_ROOT, 'd3dx.ini'),
    path.join(path.dirname(MODS_ROOT), 'd3dx.ini'),
    path.join(DEFAULT_WWMI_ROOT, 'd3dx.ini'),
  ]
  const seen = new Set()
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate)
    const key = resolved.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) return resolved
  }
  return null
}

function getIncludeSectionRange(lines) {
  const start = lines.findIndex((line) => /^\s*\[Include\]\s*$/i.test(line))
  if (start < 0) return null
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\s*\[[^\]]+\]\s*$/.test(lines[i])) {
      end = i
      break
    }
  }
  return { start, end }
}

function makeIsolatedIncludeBlock(originalBlock, targetIncludePath) {
  const lines = originalBlock.split(/\r?\n/)
  const includeLines = lines.filter((line) => /^\s*include\s*=/i.test(line) && !/^\s*;/.test(line))
  const excludeLines = lines.filter((line) => /^\s*exclude_recursive\s*=/i.test(line) && !/^\s*;/.test(line))
  const block = ['[Include]']
  for (const line of includeLines) block.push(line)
  block.push(`include_recursive = ${targetIncludePath}`)
  if (excludeLines.length) {
    for (const line of excludeLines) block.push(line)
  } else {
    block.push('exclude_recursive = DISABLED*')
    block.push('exclude_recursive = desktop.ini')
  }
  return block.join('\n')
}

function replaceIncludeBlock(text, nextBlock) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text.split(/\r?\n/)
  const range = getIncludeSectionRange(lines)
  if (!range) throw new Error('d3dx.ini 中未找到 [Include] 段')
  const before = lines.slice(0, range.start)
  const after = lines.slice(range.end)
  return [...before, ...nextBlock.split(/\r?\n/), ...after].join(eol)
}

function getFrameworkIsolationState() {
  if (!frameworkIsolationSession) return { active: false }
  return {
    active: true,
    targetOrderKey: frameworkIsolationSession.targetOrderKey,
    targetRel: frameworkIsolationSession.targetRel,
    targetName: frameworkIsolationSession.targetName,
    targetIncludePath: frameworkIsolationSession.targetIncludePath,
    d3dxPath: frameworkIsolationSession.d3dxPath,
  }
}

async function startFrameworkIsolation(rel) {
  const groupPath = getModGroupPath(rel)
  const mods = await scanCategory(groupPath)
  const targetKey = stripDisabledRel(rel)
  let target = mods.find((mod) => mod.orderKey === targetKey)
  if (!target) return { ok: false, error: '未找到目标 Mod，请刷新后重试' }

  if (target.disabled) return { ok: false, error: '请先开启该 mod，再进行框架隔离' }
  const targetDir = path.join(MODS_ROOT, target.rel)

  const d3dxPath = findD3dxIniPath()
  if (!d3dxPath) return { ok: false, error: '未找到可改写的 d3dx.ini，无法使用框架侧隔离' }
  const d3dxDir = path.dirname(d3dxPath)
  const originalText = await fsp.readFile(d3dxPath, 'utf8')
  const lines = originalText.split(/\r?\n/)
  const range = getIncludeSectionRange(lines)
  if (!range) return { ok: false, error: 'd3dx.ini 中未找到 [Include] 段' }

  const currentIncludeBlock = lines.slice(range.start, range.end).join('\n')
  const targetIncludePath = path.relative(d3dxDir, targetDir).replace(/\//g, '\\')
  const session = frameworkIsolationSession
  const originalIncludeBlock = session?.originalIncludeBlock || currentIncludeBlock
  const nextBlock = makeIsolatedIncludeBlock(originalIncludeBlock, targetIncludePath)
  const nextText = replaceIncludeBlock(originalText, nextBlock)

  if (!session) {
    await fsp.copyFile(d3dxPath, `${d3dxPath}.isolation.bak`)
    await fsp.writeFile(d3dxPath, nextText, 'utf8')
    frameworkIsolationSession = {
      d3dxPath,
      originalIncludeBlock,
      targetOrderKey: target.orderKey,
      targetRel: target.rel,
      targetName: target.name,
      targetIncludePath,
    }
  } else {
    if (session.d3dxPath !== d3dxPath) return { ok: false, error: '当前隔离会话对应的 d3dx.ini 已变化，请先结束后重试' }
    if (session.targetOrderKey === target.orderKey) return { ok: true, state: getFrameworkIsolationState() }
    await fsp.writeFile(d3dxPath, nextText, 'utf8')
    frameworkIsolationSession = {
      ...session,
      targetOrderKey: target.orderKey,
      targetRel: target.rel,
      targetName: target.name,
      targetIncludePath,
    }
  }
  saveConfig()
  scheduleRescan()
  sendF10()
  return { ok: true, state: getFrameworkIsolationState() }
}

async function endFrameworkIsolation() {
  if (!frameworkIsolationSession) return { ok: false, error: '当前没有隔离调试会话' }
  const session = frameworkIsolationSession
  if (!fs.existsSync(session.d3dxPath)) return { ok: false, error: 'd3dx.ini 不存在，无法自动恢复' }
  const text = await fsp.readFile(session.d3dxPath, 'utf8')
  const nextText = replaceIncludeBlock(text, session.originalIncludeBlock)
  await fsp.writeFile(session.d3dxPath, nextText, 'utf8')
  frameworkIsolationSession = null
  saveConfig()
  sendF10()
  return { ok: true }
}

async function trashMods(rels) {
  let deleted = 0
  for (const rel of normalizeOrderList(rels)) {
    const target = path.join(MODS_ROOT, rel)
    if (!isInsideRoot(path.resolve(target), path.resolve(MODS_ROOT))) continue
    if (fs.existsSync(target)) {
      await shell.trashItem(target)
      deleted++
    }
  }
  return { ok: true, deleted }
}

function sendF10() {
  return new Promise((resolve) => {
    const script = path.join(__dirname, 'send-f10.ps1')
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], { windowsHide: true })
    let out = '', err = ''
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (err += d))
    child.on('close', (code) => resolve({ ok: code === 0, out: out.trim(), err: err.trim() }))
  })
}

// ---------- IPC ----------
function registerIpc() {
  ipcMain.handle('mods:get', async () => {
    ensureRootExists()
    return buildModData()
  })
  ipcMain.handle('mods:refresh', async () => buildModData())
  ipcMain.handle('tools:update', () => updateToolFiles())
  ipcMain.handle('tools:syncCharacters', () => fetchCharacterAvatars(true))
  ipcMain.handle('tools:clearLocalDictionary', () => clearLocalDictionary())
  ipcMain.handle('mods:toggle', async (_e, rel, enable) => {
    return withModOperationLock(rel, async () => {
      await toggleDisabled(rel, enable)
      await pinToggledMod(rel, enable)
      scheduleRescan()
      return { ok: true }
    })
  })
  ipcMain.handle('frameworkIsolation:get', () => getFrameworkIsolationState())
  ipcMain.handle('frameworkIsolation:start', async (_e, rel) => withModOperationLock(rel, async () => startFrameworkIsolation(rel)))
  ipcMain.handle('frameworkIsolation:end', async () => endFrameworkIsolation())
  ipcMain.handle('mods:rename', async (_e, rel, name, groupPath) => {
    return withModOperationLock(rel, async () => {
      const result = await renameMod(rel, name, groupPath)
      scheduleRescan()
      return result
    })
  })
  ipcMain.handle('mods:setPreview', async (_e, rel) => {
    return withModOperationLock(rel, async () => {
      const result = await setModPreview(rel)
      if (result.ok) scheduleRescan()
      return result
    })
  })
  ipcMain.handle('overview:openFolder', (_e, groupPath) => openOverviewFolder(groupPath))
  ipcMain.handle('overview:rename', async (_e, groupPath, nextName) => {
    const result = await renameOverviewGroup(groupPath, nextName)
    scheduleRescan()
    return result
  })
  ipcMain.handle('overview:setPreview', async (_e, groupPath) => {
    const result = await setOverviewPreview(groupPath)
    if (result.ok) scheduleRescan()
    return result
  })
  ipcMain.handle('overview:chooseArtwork', async () => {
    fs.mkdirSync(OVERVIEW_IMAGE_DIR, { recursive: true })
    const res = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      title: '选择一级卡片图片',
      defaultPath: OVERVIEW_IMAGE_DIR,
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
    })
    if (res.canceled || !res.filePaths[0]) return { ok: false, canceled: true }
    return { ok: true, path: res.filePaths[0] }
  })
  ipcMain.handle('overview:setMeta', (_e, groupPath, meta) => {
    const key = normalizeOrderKey(groupPath)
    if (!key) return { ok: false }
    const current = overviewMeta[key] || {}
    overviewMeta[key] = {
      displayName: typeof meta?.displayName === 'string' ? meta.displayName.trim() : current.displayName || '',
      artworkPath: typeof meta?.artworkPath === 'string' ? meta.artworkPath : current.artworkPath || '',
    }
    if (!overviewMeta[key].displayName && !overviewMeta[key].artworkPath) delete overviewMeta[key]
    saveConfig()
    scheduleRescan()
    return { ok: true }
  })
  ipcMain.handle('overview:trash', async (_e, groupPath) => {
    const result = await trashOverviewGroup(groupPath)
    scheduleRescan()
    return result
  })
  ipcMain.handle('overview:createDir', async (_e, groupPath) => {
    const result = await createOverviewDir(groupPath)
    scheduleRescan()
    return result
  })
  ipcMain.handle('overview:createGrid', async (_e, name) => {
    const result = await createOverviewGrid(name)
    scheduleRescan()
    return result
  })
  ipcMain.handle('mods:setLocked', async (_e, rel, locked) => {
    return withModOperationLock(rel, async () => {
      const result = await setModLocked(rel, locked)
      scheduleRescan()
      return result
    })
  })
  ipcMain.handle('mods:setFavorite', (_e, rel, favorite) => {
    return setModFavorite(rel, favorite)
  })
  ipcMain.handle('mods:setKey', async (_e, rel, binding, nextKey) => {
    return withModOperationLock(rel, async () => {
      const result = await setModKey(rel, binding, nextKey)
      scheduleRescan()
      return result
    })
  })
  ipcMain.handle('mods:translateIni', async (_e, rel) => {
    return withModOperationLock(rel, async () => translateModIni(rel))
  })
  ipcMain.handle('mods:watchIni', async (_e, rel) => {
    const target = path.join(MODS_ROOT, rel)
    return launchPythonScript(WATCHER_SCRIPT, target, true)
  })
  ipcMain.handle('keyPopup:show', (_e, payload) => {
    showKeyPopupWindow(payload)
    return { ok: true }
  })
  ipcMain.handle('keyPopup:close', (event) => {
    const popup = BrowserWindow.fromWebContents(event.sender)
    if (popup && popup === keyPopupWindow) popup.close()
    return { ok: true }
  })
  ipcMain.handle('keyPopup:resize', (event, scale) => {
    const popup = BrowserWindow.fromWebContents(event.sender)
    if (!popup || popup !== keyPopupWindow || !Number.isFinite(scale)) return { ok: false }
    const [width, height] = popup.getSize()
    const nextWidth = Math.max(240, Math.min(1800, Math.round(width * scale)))
    const nextHeight = Math.max(140, Math.min(1000, Math.round(height * scale)))
    popup.setSize(nextWidth, nextHeight)
    positionPopupLeftCenter(popup, nextWidth, nextHeight)
    return { ok: true, width: nextWidth, height: nextHeight }
  })
  ipcMain.handle('keyPopup:fit', (event, size) => {
    const popup = BrowserWindow.fromWebContents(event.sender)
    if (!popup || popup !== keyPopupWindow) return { ok: false }
    const width = Math.max(240, Math.min(1800, Math.ceil(Number(size?.width) || 0)))
    const height = Math.max(140, Math.min(1000, Math.ceil(Number(size?.height) || 0)))
    popup.setContentSize(width, height)
    positionPopupLeftCenter(popup, width, height)
    return { ok: true, width, height }
  })
  ipcMain.handle('mods:flatten', async (_e, targetRel) => {
    const result = await runFlatten(targetRel)
    scheduleRescan()
    return result
  })
  ipcMain.handle('mods:chooseMoveTarget', async () => {
    const target = await chooseMoveTarget()
    return target ? { ok: true, target } : { ok: false, canceled: true }
  })
  ipcMain.handle('mods:chooseMoveSources', async () => {
    const sources = await chooseSourceDirs()
    return sources ? { ok: true, sources } : { ok: false, canceled: true }
  })
  ipcMain.handle('mods:moveMany', async (_e, rels, targetDir) => {
    return withModOperationLocks(rels, async () => {
      const result = await moveMods(rels, targetDir)
      scheduleRescan()
      return result
    })
  })
  ipcMain.handle('mods:moveSourceDirs', async (_e, targetGroupPath, sourceDirs) => {
    const result = await moveSourceDirs(targetGroupPath, sourceDirs)
    scheduleRescan()
    return result
  })
  ipcMain.handle('mods:pasteMany', async (_e, rels, targetGroupPath, mode) => {
    return withModOperationLocks(rels, async () => {
      const result = await pasteMods(rels, targetGroupPath, mode)
      scheduleRescan()
      return result
    })
  })
  ipcMain.handle('mods:trashMany', async (_e, rels) => {
    return withModOperationLocks(rels, async () => {
      const result = await trashMods(rels)
      scheduleRescan()
      return result
    })
  })
  ipcMain.handle('mods:setCategory', async (_e, category, enable) => {
    const mods = await scanCategory(category)
    const affected = mods.filter((m) => !m.locked && m.disabled === enable)
    if (!affected.length) return { ok: true, count: 0 }
    return withModOperationLocks(affected.map((m) => m.rel), async () => {
      for (const m of affected) await toggleDisabled(m.rel, enable)
      scheduleRescan()
      return { ok: true, count: affected.length }
    })
  })
  ipcMain.handle('mods:setSubdir', async (_e, category, subdir, enable) => {
    const mods = await scanCategory(category)
    const affected = mods.filter((m) => (m.group ? String(m.group).split(' / ')[0] : null) === subdir && !m.locked && m.disabled === enable)
    if (!affected.length) return { ok: true, count: 0 }
    return withModOperationLocks(affected.map((m) => m.rel), async () => {
      for (const m of affected) await toggleDisabled(m.rel, enable)
      scheduleRescan()
      return { ok: true, count: affected.length }
    })
  })
  ipcMain.handle('mods:openFolder', (_e, rel) => {
    const target = path.join(MODS_ROOT, rel)
    if (!isInsideRoot(path.resolve(target), path.resolve(MODS_ROOT)) || !fs.existsSync(target)) {
      return { ok: false, error: '目录不存在或正在重命名，请刷新后重试' }
    }
    spawn('explorer.exe', [target])
    return { ok: true }
  })
  ipcMain.handle('mods:chooseRoot', async () => {
    const res = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: '閫夋嫨 Mods 鐩綍锛圵WMI 鐨?Mods 鏂囦欢澶癸級',
      defaultPath: MODS_ROOT,
    })
    if (!res.canceled && res.filePaths[0]) {
      MODS_ROOT = res.filePaths[0]
      saveConfig()
      startWatcher()
      return { ok: true, root: MODS_ROOT }
    }
    return { ok: false }
  })
  ipcMain.handle('mods:getRoot', () => ({ root: MODS_ROOT }))
  ipcMain.handle('wwmi:chooseRoot', async () => {
    const res = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: '选择 WWMI 目录（包含 d3dx.ini）',
      defaultPath: WWMI_ROOT,
    })
    if (!res.canceled && res.filePaths[0]) {
      WWMI_ROOT = res.filePaths[0]
      saveConfig()
      return { ok: true, root: WWMI_ROOT }
    }
    return { ok: false }
  })
  ipcMain.handle('wwmi:getRoot', () => ({ root: WWMI_ROOT }))
  ipcMain.handle('config:set', (_e, key, value) => {
    if (key === 'detailViewMode') {
      detailViewMode = value === 'card' ? 'card' : 'list'
      saveConfig()
    }
    return { ok: true }
  })
  ipcMain.handle('config:get', (_e, key) => {
    if (key === 'detailViewMode') return { value: detailViewMode }
    return { value: null }
  })
  // 1绾х晫闈細鐩存帴浠?Mods 鐩綍鎵弿鐢熸垚 groups
  ipcMain.handle('sort:setOverview', (_e, order) => {
    sortOrder.overview = normalizeOrderList(order)
    saveConfig()
    return { ok: true }
  })
  ipcMain.handle('sort:getOverviewSections', () => {
    return sortOrder.overviewSections
  })
  ipcMain.handle('sort:setOverviewSections', (_e, sections) => {
    sortOrder.overviewSections = normalizeOverviewSections(sections)
    saveConfig()
    return { ok: true }
  })
  ipcMain.handle('sort:setMods', (_e, groupPath, order) => {
    if (typeof groupPath !== 'string' || !groupPath) return { ok: false }
    sortOrder.mods[normalizeOrderKey(groupPath)] = normalizeOrderList(order)
    saveConfig()
    return { ok: true }
  })
  ipcMain.handle('overview:getGroups', async () => {
    return buildOverviewGroups()
  })
  ipcMain.handle('mods:getKeyBindings', async (_e, rel) => {
    const target = path.join(MODS_ROOT, rel)
    if (!isInsideRoot(path.resolve(target), path.resolve(MODS_ROOT))) return { ok: false, err: 'Invalid target' }
    try {
      return { ok: true, keyBindings: await getModKeyBindings(target) }
    } catch (err) {
      return { ok: false, err: err.message }
    }
  })
  // 閫夋嫨婧愭枃浠跺す锛堝鍏ユ椂浣跨敤锛?
  ipcMain.handle('overview:chooseSource', async () => {
    const res = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: '选择要导入的 Mod 文件夹',
    })
    if (!res.canceled && res.filePaths[0]) {
      return { ok: true, path: res.filePaths[0] }
    }
    return { ok: false, canceled: true }
  })
  // 瀵煎叆鏂囦欢澶瑰埌鎸囧畾鐩綍
  ipcMain.handle('overview:import', async (_e, targetPath, sourceDir) => {
    const targetDir = path.join(MODS_ROOT, targetPath)
    try {
      await fsp.mkdir(targetDir, { recursive: true })
      const sourceName = path.basename(sourceDir)
      const dest = path.join(targetDir, sourceName)
      let finalDest = dest
      let i = 1
      while (fs.existsSync(finalDest)) {
        finalDest = `${dest}_${i}`
        i++
      }
      await new Promise((resolve, reject) => {
        const child = spawn('xcopy', [sourceDir, finalDest, '/E', '/I', '/Y'], { windowsHide: true })
        child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`xcopy exit ${code}`)))
      })
      scheduleRescan()
      return { ok: true, target: finalDest }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })
  ipcMain.handle('window:minimize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win && !win.isDestroyed()) win.minimize()
  })
  ipcMain.handle('window:toggleMaximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win.isDestroyed()) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.handle('window:close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win && !win.isDestroyed()) win.close()
  })
}

function ensureRootExists() {
  if (!fs.existsSync(MODS_ROOT)) {
    MODS_ROOT = DEFAULT_MODS_ROOT
    saveConfig()
  }
}

// ---------- 绐楀彛 ----------
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#edf0f3',
    title: '鸣潮 Mod 管理器',
    icon: APP_ICON_FILE,
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'))
}

function escapeHtmlText(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

function cleanPopupText(value) {
  return String(value ?? '')
    .replace(/鏈壘鍒\??/g, '未找到')
    .replace(/缁戝畾/g, '绑定')
}

function getPopupWorkArea() {
  const bounds = mainWindow && !mainWindow.isDestroyed() ? mainWindow.getBounds() : null
  const display = bounds ? screen.getDisplayMatching(bounds) : screen.getPrimaryDisplay()
  return display?.workArea || screen.getPrimaryDisplay().workArea
}

function positionPopupLeftCenter(win, width, height) {
  const area = getPopupWorkArea()
  const x = area.x + 12
  const y = Math.round(area.y + (area.height - height) / 2)
  const maxX = area.x + area.width - width - 12
  const maxY = area.y + area.height - height - 12
  win.setPosition(Math.max(area.x + 12, Math.min(x, maxX)), Math.max(area.y + 12, Math.min(y, maxY)), false)
}

function showKeyPopupWindow(payload) {
  const bindings = sortKeyBindings(Array.isArray(payload?.keyBindings) ? payload.keyBindings : [])
  const rows = bindings.length
    ? bindings.map((binding) => {
      const desc = cleanPopupText(binding.description || '')
      const raw = cleanPopupText(binding.rawDescription || '')
      const showRaw = raw && raw.toLowerCase() !== desc.toLowerCase()
      return `
      <div class="row">
        <div class="key">${escapeHtmlText(cleanPopupText(binding.displayKey || binding.key))}</div>
        <div class="desc"><span class="desc-main">${escapeHtmlText(desc)}</span>${showRaw ? `<span class="raw">${escapeHtmlText(raw)}</span>` : ''}</div>
      </div>`
    }).join('')
    : '<div class="empty">未找到 Key 绑定</div>'
  const title = escapeHtmlText(cleanPopupText(payload?.name || 'MOD'))
  const measureText = (value) => Array.from(String(value || '')).reduce((width, char) => (
    width + (char.charCodeAt(0) > 255 ? 22 : 14)
  ), 0)
  const keyColumnWidth = Math.min(260, Math.max(76, bindings.reduce((width, binding) => Math.max(
    width,
    measureText(cleanPopupText(binding.displayKey || binding.key)) + 12,
  ), 0)))
  const descWidth = bindings.reduce((width, binding) => Math.max(
    width,
    measureText(cleanPopupText(binding.description)) + measureText(cleanPopupText(binding.rawDescription)) + 34,
  ), 0)
  const contentWidth = keyColumnWidth + descWidth + 40
  const popupWidth = Math.min(1600, Math.max(440, contentWidth + 160))
  const popupHeight = Math.min(860, Math.max(140, 76 + Math.max(bindings.length, 1) * 36))
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
html,body{margin:0;width:100%;height:100%;background:transparent;overflow:hidden;font-family:"Segoe UI","Microsoft YaHei UI",sans-serif;color:#fff;--content-scale:1}
body{-webkit-app-region:drag}
.panel{position:absolute;inset:10px;border:4px solid #7cff00;background:rgba(18,18,18,.82);box-shadow:0 12px 34px rgba(0,0,0,.48);display:flex;flex-direction:column;overflow:hidden}
.header{display:flex;align-items:center;gap:calc(12px * var(--content-scale));padding:calc(10px * var(--content-scale)) calc(12px * var(--content-scale));border-bottom:3px solid #7cff00;text-shadow:1px 0 0 #000,-1px 0 0 #000,0 1px 0 #000,0 -1px 0 #000;font-weight:700;white-space:nowrap;overflow:hidden}
.back{-webkit-app-region:no-drag;border:3px solid #7cff00;background:transparent;color:#fff;border-radius:0;padding:calc(5px * var(--content-scale)) calc(11px * var(--content-scale));font-size:calc(14px * var(--content-scale));font-weight:700;cursor:pointer;text-shadow:1px 0 0 #000,-1px 0 0 #000,0 1px 0 #000,0 -1px 0 #000}
.title{font-size:calc(17px * var(--content-scale));white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1 1 auto;min-width:0;text-align:left}
.body{flex:1;overflow:auto;padding:10px 14px;-webkit-app-region:no-drag}
.row{display:grid;grid-template-columns:${keyColumnWidth}px max-content;column-gap:calc(18px * var(--content-scale));align-items:center;padding:calc(6px * var(--content-scale)) 0;border-bottom:2px solid #7cff00;font-size:calc(15px * var(--content-scale));font-weight:700;line-height:1.2;white-space:nowrap;text-shadow:1px 0 0 #000,-1px 0 0 #000,0 1px 0 #000,0 -1px 0 #000}
.key{padding:2px;text-align:left;color:#fff;overflow:hidden;text-overflow:ellipsis}
.desc{color:#fff;letter-spacing:0;display:flex;align-items:center;gap:8px}
.desc-main{overflow:hidden;text-overflow:ellipsis}
.raw{color:rgba(255,255,255,.62);border:1px solid rgba(124,255,0,.38);background:rgba(124,255,0,.10);padding:1px 6px;font-size:.78em;text-shadow:none}
.empty{padding:20px;font-weight:700;text-shadow:1px 0 0 #000,-1px 0 0 #000,0 1px 0 #000,0 -1px 0 #000}
::-webkit-scrollbar{width:10px}::-webkit-scrollbar-thumb{background:#7cff00}
</style></head><body>
<div class="panel">
  <div class="header"><div class="title">${title}</div><button class="back" onclick="window.api.closeKeyPopup()">返回</button></div>
  <div class="body">${rows}</div>
</div>
<script>
const bodyEl = document.querySelector('.body');
window.addEventListener('wheel', (event) => {
  event.preventDefault();
  if (!event.ctrlKey) {
    bodyEl.scrollBy({ top: event.deltaY, behavior: 'auto' });
    return;
  }
  if (Math.abs(event.deltaY) < 1) return;
  const scale = event.deltaY < 0 ? 1.06 : 0.94;
  window.api.resizeKeyPopup(scale);
}, { passive:false });
const baseWidth = ${popupWidth};
const applyContentScale = () => {
  const available = Math.max(1, document.documentElement.clientWidth - 20);
  const scale = Math.max(.55, Math.min(1.5, available / (baseWidth - 20)));
  document.documentElement.style.setProperty('--content-scale', scale.toFixed(3));
};
new ResizeObserver(applyContentScale).observe(document.documentElement);
applyContentScale();
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    const panel = document.querySelector('.panel');
    const widestRow = Array.from(document.querySelectorAll('.row'))
      .reduce((width, row) => Math.max(width, row.scrollWidth), 0);
    const width = Math.max(panel.scrollWidth + 20, widestRow + 48);
    const height = panel.querySelector('.header').scrollHeight + bodyEl.scrollHeight + 20;
    window.api.fitKeyPopup({ width, height });
  });
});
</script>
</body></html>`
  if (keyPopupWindow && !keyPopupWindow.isDestroyed()) keyPopupWindow.close()
  const popupWindow = new BrowserWindow({
    width: popupWidth,
    height: popupHeight,
    minWidth: 240,
    minHeight: 140,
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    backgroundColor: '#00000000',
    icon: APP_ICON_FILE,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  keyPopupWindow = popupWindow
  popupWindow.setAlwaysOnTop(true, 'screen-saver')
  positionPopupLeftCenter(popupWindow, popupWidth, popupHeight)
  popupWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  popupWindow.on('closed', () => {
    if (keyPopupWindow !== popupWindow) return
    keyPopupWindow = null
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

function decodeProtocolPath(req) {
  const url = new URL(req.url)
  let p = decodeURIComponent(url.pathname.replace(/^\//, ''))
  p = p.replace(/\\+/g, '/').replace(/\//g, path.sep)
  return path.resolve(p)
}

function isInsideRoot(target, root) {
  const resolvedRoot = path.resolve(root)
  const normalizedTarget = process.platform === 'win32' ? target.toLowerCase() : target
  const normalizedRoot = process.platform === 'win32' ? resolvedRoot.toLowerCase() : resolvedRoot
  return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(normalizedRoot + path.sep)
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.wwmi.modmanager')
  loadConfig()
  ensureRootExists()
  protocol.handle('modimg', (req) => {
    const root = path.resolve(MODS_ROOT)
    const resolved = decodeProtocolPath(req)
    if (!isInsideRoot(resolved, root)) return new Response('Forbidden', { status: 403 })
    return net.fetch(pathToFileURL(resolved).toString())
  })
  protocol.handle('assetimg', (req) => {
    const resolved = decodeProtocolPath(req)
    if (!ASSET_ROOTS.some((root) => isInsideRoot(resolved, root))) return new Response('Forbidden', { status: 403 })
    return net.fetch(pathToFileURL(resolved).toString())
  })
  registerIpc()
  startWatcher()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopWatcher()
  saveConfig()
  if (process.platform !== 'darwin') app.quit()
})
