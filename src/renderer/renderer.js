// ---------- 渲染进程：三级导航 ----------
// 一级：Mods 目录下的目录（character展开子目录）
// 二级：mod列表
// 三级：mod预览
// 支持批量移入文件夹

const $ = (sel) => document.querySelector(sel)

let overviewGroups = [] // 1级界面的 groups
let overviewSections = []
let activeGroup = null // 当前选中的目录组（进入 detail 时设置）
let searchTerm = ''
let detailSearchTerm = ''
let detailSearchGlobal = false
let selectedModRel = null
let suppressNextClick = false
let detailViewMode = 'list'
let selectedModRels = new Set()
let lastSelectedRel = null
let contextMenuRel = null
let overviewContextPath = null
let modClipboard = null
let overviewDraggedPath = null
let overviewDraggedSectionId = null
let frameworkIsolation = { active: false }
const busyModRels = new Set()
const preloadedImages = new Set()
let previewRenderToken = 0
let dataLoadInFlight = null
let dataLoadQueued = false
let loadingMessage = ''
let lastDetailTabAt = 0

const SHORTCUTS = [
  { key: 'Ctrl+C', scope: '二级', desc: '复制所选 mod' },
  { key: 'Ctrl+V', scope: '二级', desc: '粘贴 mod' },
  { key: 'Ctrl+X', scope: '二级', desc: '剪切所选 mod' },
  { key: 'Delete', scope: '全局', desc: '删除当前所选项到回收站' },
  { key: 'Enter', scope: '一级', desc: '聚焦搜索框' },
  { key: 'Enter', scope: '输入框', desc: '确认当前编辑' },
  { key: 'Esc', scope: '二级', desc: '返回一级界面' },
  { key: 'Esc', scope: '输入框', desc: '取消当前编辑' },
  { key: 'F2', scope: '二级', desc: '切换全局搜索' },
  { key: 'Shift+点击', scope: '二级', desc: '连续多选 mod' },
  { key: 'Tab', scope: '一级', desc: '聚焦搜索框' },
  { key: 'Tab', scope: '二级', desc: '搜索当前页并聚焦搜索框' },
  { key: 'Tab Tab', scope: '二级', desc: '开启全局搜索并聚焦搜索框' },
  { key: 'Ctrl+点击', scope: '二级', desc: '增减多选 mod' },
]

const SHORTCUT_KEY_ORDER = ['Tab', 'Tab Tab', 'Enter', 'Esc', 'F2', 'Delete', 'Ctrl+C', 'Ctrl+V', 'Ctrl+X', 'Ctrl+点击', 'Shift+点击']

function getSortedShortcuts() {
  const weight = (key) => {
    const index = SHORTCUT_KEY_ORDER.indexOf(key)
    return index < 0 ? 999 : index
  }
  return [...SHORTCUTS].sort((a, b) => {
    const byKey = weight(a.key) - weight(b.key) || a.key.localeCompare(b.key, 'zh-Hans')
    if (byKey) return byKey
    return a.scope.localeCompare(b.scope, 'zh-Hans')
  })
}

const dom = {
  // overview
  overviewPage: $('#page-overview'),
  overviewGrid: $('#overviewGrid'),
  overviewEmpty: $('#overviewEmpty'),
  search: $('#search'),
  btnF10: $('#btnF10'),
  btnRefresh: $('#btnRefresh'),
  autoF10: $('#autoF10'),
  rootPath: $('#rootPath'),
  overviewTitle: $('#overviewTitle'),
  btnUpdateTools: $('#btnUpdateTools'),
  btnAddOverviewSection: $('#btnAddOverviewSection'),
  // detail
  detailPage: $('#page-detail'),
  btnBack: $('#btnBack'),
  detailGridImage: $('#detailGridImage'),
  detailTitle: $('#detailTitle'),
  detailCount: $('#detailCount'),
  detailSearchWrap: $('.detail-search-wrap'),
  detailSearch: $('#detailSearch'),
  detailSearchGlobal: $('#detailSearchGlobal'),
  detailSearchResults: $('#detailSearchResults'),
  detailPreview: $('#detailPreview'),
  modList: $('#modList'),
  detailEmpty: $('#detailEmpty'),
  previewImg: $('#previewImg'),
  previewName: $('#previewName'),
  overviewLoading: $('#overviewLoading'),
  overviewLoadingText: $('#overviewLoadingText'),
  detailLoading: $('#detailLoading'),
  detailLoadingText: $('#detailLoadingText'),
  btnListView: $('#btnListView'),
  btnCardView: $('#btnCardView'),
  btnBatchMove: $('#btnBatchMove'),
  btnFlatten: $('#btnFlatten'),
  btnRefreshb: $('#btnRefreshb'),
  toast: $('#toast'),
}

function isModBusy(rel) {
  return busyModRels.has(rel)
}

function setLoadingState(active, message = '') {
  loadingMessage = message
  const overviewVisible = !dom.overviewPage.classList.contains('hidden')
  const detailVisible = !dom.detailPage.classList.contains('hidden')
  if (dom.overviewLoading) {
    dom.overviewLoading.classList.toggle('hidden', !active || !overviewVisible)
    if (dom.overviewLoadingText) dom.overviewLoadingText.textContent = message || '请稍候'
  }
  if (dom.detailLoading) {
    dom.detailLoading.classList.toggle('hidden', !active || !detailVisible)
    if (dom.detailLoadingText) dom.detailLoadingText.textContent = message || '请稍候'
  }
  dom.overviewPage.classList.toggle('loading', active && overviewVisible)
  dom.detailPage.classList.toggle('loading', active && detailVisible)
}

function renderShortcutHelp() {
  const html = getSortedShortcuts().map((item) => `
    <div class="shortcut-row">
      <kbd>${escapeHtml(item.key)}</kbd>
      <span>${escapeHtml(item.scope)}：${escapeHtml(item.desc)}</span>
    </div>
  `).join('')
  const card = dom.overviewLoading?.querySelector('.loading-card')
  if (!card) return
  let panel = card.querySelector('.shortcut-help')
  if (!panel) {
    panel = document.createElement('div')
    panel.className = 'shortcut-help'
    card.appendChild(panel)
  }
  panel.innerHTML = html
}

function clearShortcutHelp() {
  dom.overviewLoading?.querySelector('.shortcut-help')?.remove()
  const title = dom.overviewLoading?.querySelector('.loading-title')
  if (title) title.textContent = '正在加载'
}

function waitNextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

function setModBusy(rel, busy) {
  if (!rel) return
  if (busy) busyModRels.add(rel)
  else busyModRels.delete(rel)
  dom.modList.querySelectorAll('.mod-item').forEach((item) => {
    if (item.dataset.rel !== rel) return
    item.classList.toggle('busy', busy)
    item.querySelectorAll('.mod-check, .btn-lock, .btn-favorite').forEach((el) => {
      el.disabled = busy
    })
  })
  if (busy) hideBatchMenu()
}

function blockBusyMod(rel) {
  if (!isModBusy(rel)) return false
  showToast('请等当前操作完成', 'err')
  return true
}

function normalizeClientOrderKey(value) {
  return String(value || '').split(/[\\/]+/).filter(Boolean).map((part) => {
    let name = part
    while (name.startsWith('DISABLED_')) name = name.slice('DISABLED_'.length)
    return name
  }).join('/')
}

function getClientModOrderKey(rel) {
  if (!activeGroup?.mods) return normalizeClientOrderKey(rel)
  const mod = activeGroup.mods.find((item) => item.rel === rel || item.orderKey === normalizeClientOrderKey(rel))
  return mod?.orderKey || normalizeClientOrderKey(rel)
}

function sortCurrentModsByFavorite() {
  if (!activeGroup?.mods) return
  activeGroup.mods.sort((a, b) => {
    const ae = a.disabled ? 0 : 1
    const be = b.disabled ? 0 : 1
    if (ae !== be) return be - ae
    const af = a.favorite ? 1 : 0
    const bf = b.favorite ? 1 : 0
    return bf - af
  })
}

function isIsolationBlockedMod(rel) {
  return !!frameworkIsolation?.active && getClientModOrderKey(rel) !== frameworkIsolation.targetOrderKey
}

function blockIsolationMod(rel) {
  if (!isIsolationBlockedMod(rel)) return false
  showToast('框架隔离调试中，其他 mod 暂不可操作', 'err')
  return true
}

function blockIsolationRels(rels) {
  return (rels || []).some((rel) => blockIsolationMod(rel))
}

function applyFrameworkIsolationUi() {
  dom.modList.querySelectorAll('.mod-item').forEach((item) => {
    const blocked = isIsolationBlockedMod(item.dataset.rel)
    item.classList.toggle('isolation-blocked', blocked)
    item.querySelectorAll('.mod-check, .btn-lock').forEach((el) => {
      el.disabled = blocked || isModBusy(item.dataset.rel)
    })
  })
}

// ==================== 一级界面：总纲网格 ====================

const DEFAULT_OVERVIEW_SECTION = '__default'
const DEFAULT_COVER_SRC = 'default-cover.svg'

function renderOverview() {
  const term = normalizeSearchText(searchTerm)
  const filtered = term
    ? overviewGroups.filter((g) => getGroupSearchText(g).includes(term))
    : overviewGroups

  if (filtered.length === 0) {
    dom.overviewGrid.innerHTML = ''
    dom.overviewEmpty.classList.remove('hidden')
    return
  }
  dom.overviewEmpty.classList.add('hidden')

  dom.overviewGrid.innerHTML = getOverviewRenderSections(filtered, !!term).map((section) => {
    const expanded = !!term ? section.groups.length > 0 : (!section.collapsed && section.groups.length > 0)
    const header = section.showHeader
      ? `<div class="overview-section-header" data-section-id="${escapeAttr(section.id)}" draggable="${section.custom ? 'true' : 'false'}">
          <button class="section-toggle" data-section-action="toggle">${expanded ? '⌄' : '›'}</button>
          <span class="section-name">${escapeHtml(section.name)}</span>
          <span class="section-count">${section.groups.length}</span>
          ${section.custom ? '<button class="section-action" data-section-action="rename">重命名</button><button class="section-action" data-section-action="delete">删除</button>' : ''}
        </div>`
      : ''
    const cards = !expanded
      ? ''
      : `<div class="overview-section-grid" data-section-id="${escapeAttr(section.id)}">${section.groups.map((g) => renderOverviewCard(g, !term, section.id)).join('')}</div>`
    return `<section class="overview-section">${header}${cards}</section>`
  }).join('')

  // 绑定事件
  dom.overviewGrid.querySelectorAll('.folder-card').forEach((card) => {
    const path = card.dataset.path
    card.addEventListener('click', () => {
      if (suppressNextClick) return
      const group = filtered.find((g) => g.path === path)
      if (!group) return
      openOverviewGroup(group)
    })
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      overviewContextPath = path
      showOverviewMenu(e.clientX, e.clientY)
    })
    card.addEventListener('mouseenter', () => {
      overviewContextPath = path
    })
  })
  bindOverviewSectionHeaders()
  setupOverviewDrag(!term)
}

function renderOverviewCard(g, canDrag, sectionId) {
  const en = g.mods.filter((m) => !m.disabled).length
  const tot = g.mods.length
  const isCharacterGroup = String(g.path || '').startsWith('character/')
  const artwork = (tot > 0 || isCharacterGroup) ? (g.artwork || g.avatar || null) : null
  const thumb = artwork
    ? `<img src="${escapeAttr(imageSrc(artwork))}" loading="lazy" alt="" />`
    : `<img class="default-cover" src="${DEFAULT_COVER_SRC}" loading="lazy" alt="" />`
  const countText = `<div class="count-badge">${en}/${tot}</div>`
  const displayName = g.chineseName || g.name || g.path || '未命名'
  const artworkClass = ''
  const countTextFinal = g.missing
    ? `<div class="count-badge" title="配置：点击后新建本地目录">配置</div>`
    : countText
  const title = g.missing ? '配置：点击后新建本地目录' : ''
  return `<div class="folder-card ${tot === 0 ? 'empty' : ''} ${artwork ? 'has-artwork' : ''} ${artworkClass} ${g.missing ? 'missing' : ''}" title="${escapeAttr(title)}" data-path="${escapeAttr(g.path)}" data-order-key="${escapeAttr(g.path)}" data-section-id="${escapeAttr(sectionId)}" draggable="${canDrag && !g.missing ? 'true' : 'false'}">
      <div class="thumb">${thumb}${countTextFinal}</div>
      <div class="card-label">${escapeHtml(displayName)}</div>
    </div>`
}

function getOverviewRenderSections(filtered, isSearching) {
  const byPath = new Map(filtered.map((group) => [group.path, group]))
  const knownPaths = new Set(overviewGroups.map((group) => group.path))
  const assigned = new Set()
  const custom = overviewSections.map((section) => {
    const items = (section.items || []).filter((path) => knownPaths.has(path))
    items.forEach((path) => assigned.add(path))
    return { ...section, items, groups: items.map((path) => byPath.get(path)).filter(Boolean), custom: true, showHeader: true }
  }).filter((section) => !isSearching || section.groups.length)

  const ungrouped = filtered.filter((group) => !assigned.has(group.path))
  if (!overviewSections.length) {
    return [{ id: DEFAULT_OVERVIEW_SECTION, name: '', groups: filtered, collapsed: false, custom: false, showHeader: false }]
  }
  const result = custom
  if (ungrouped.length || !isSearching) {
    result.push({ id: DEFAULT_OVERVIEW_SECTION, name: '未分组', groups: ungrouped, collapsed: false, custom: false, showHeader: true })
  }
  return result
}

function bindOverviewSectionHeaders() {
  dom.overviewGrid.querySelectorAll('.overview-section-header').forEach((header) => {
    const sectionId = header.dataset.sectionId
    header.addEventListener('dragstart', (e) => {
      if (sectionId === DEFAULT_OVERVIEW_SECTION || e.target.closest('button,input')) {
        e.preventDefault()
        return
      }
      overviewDraggedSectionId = sectionId
      suppressNextClick = true
      header.classList.add('dragging')
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', sectionId)
    })
    header.addEventListener('dragover', (e) => {
      if (!overviewDraggedPath && !overviewDraggedSectionId) return
      if (overviewDraggedSectionId && sectionId === DEFAULT_OVERVIEW_SECTION) return
      e.preventDefault()
      header.classList.add('drag-over')
    })
    header.addEventListener('dragleave', () => header.classList.remove('drag-over'))
    header.addEventListener('drop', async (e) => {
      e.preventDefault()
      header.classList.remove('drag-over')
      if (overviewDraggedSectionId) {
        await moveOverviewSection(overviewDraggedSectionId, sectionId)
        return
      }
      if (!overviewDraggedPath) return
      await moveOverviewCard(overviewDraggedPath, null, sectionId)
    })
    header.addEventListener('dragend', () => {
      overviewDraggedSectionId = null
      header.classList.remove('dragging')
      dom.overviewGrid.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'))
      setTimeout(() => { suppressNextClick = false }, 0)
    })
    header.querySelectorAll('[data-section-action]').forEach((button) => {
      button.addEventListener('click', async (e) => {
        e.stopPropagation()
        const action = button.dataset.sectionAction
        const section = overviewSections.find((item) => item.id === sectionId)
        if (action === 'toggle') {
          if (section) section.collapsed = !section.collapsed
          await saveOverviewLayout()
          renderOverview()
        }
        if (action === 'rename' && section) await renameOverviewSection(section)
        if (action === 'delete' && section) await deleteOverviewSection(section)
      })
    })
  })
}

const SEARCH_ALIASES = {
  changli: ['cl'],
  yangyang: ['yy'],
}

const PINYIN_INITIALS = {
  秧: 'y', 长: 'c', 离: 'l', 绯: 'f', 雪: 'x', 奥: 'a', 古: 'g', 斯: 's', 塔: 't',
  卡: 'k', 提: 't', 希: 'x', 娅: 'y', 赞: 'z', 妮: 'n', 今: 'j', 汐: 'x',
  爱: 'a', 弥: 'm', 露: 'l', 帕: 'p', 漂: 'p', 泊: 'b', 者: 'z',
  坎: 'k', 特: 't', 蕾: 'l', 拉: 'l', 椿: 'c', 尤: 'y', 诺: 'n',
  维: 'w', 里: 'l', 珂: 'k', 莱: 'l', 嘉: 'j', 贝: 'b', 莉: 'l',
  菲: 'f', 比: 'b', 散: 's', 华: 'h', 丹: 'd', 瑾: 'j', 安: 'a',
  可: 'k', 洛: 'l', 可: 'k', 折: 'z', 枝: 'z', 吟: 'y', 霖: 'l',
  灯: 'd', 莫: 'm', 宁: 'n', 守: 's', 岸: 'a', 人: 'r', 夏: 'x',
  空: 'k', 千: 'q', 咲: 'x', 琳: 'l', 奈: 'n', 达: 'd',
  鉴: 'j', 心: 'x', 相: 'x', 要: 'y', 炽: 'c', 霞: 'x',
}

const PINYIN_COLLATOR = new Intl.Collator('zh-Hans-u-co-pinyin')
const PINYIN_BOUNDARIES = [
  ['a', '阿'], ['b', '八'], ['c', '嚓'], ['d', '咑'], ['e', '妸'], ['f', '发'],
  ['g', '旮'], ['h', '哈'], ['j', '丌'], ['k', '咔'], ['l', '垃'], ['m', '妈'],
  ['n', '拿'], ['o', '噢'], ['p', '啪'], ['q', '七'], ['r', '然'], ['s', '仨'],
  ['t', '他'], ['w', '哇'], ['x', '夕'], ['y', '丫'], ['z', '匝'],
]

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, '')
}

function getInitialSearchText(value) {
  const text = String(value || '').normalize('NFKC')
  return text
    .split(/[\s_\-\/\\]+/)
    .filter(Boolean)
    .map((part) => {
      if (/[\u4e00-\u9fff]/.test(part)) {
        return Array.from(part).map((char) => {
          if (PINYIN_INITIALS[char]) return PINYIN_INITIALS[char]
          if (/[a-z0-9]/i.test(char)) return char.toLowerCase()
          return getChineseInitial(char)
        }).join('')
      }
      return part[0]?.toLowerCase() || ''
    })
    .join('')
}

function getChineseInitial(char) {
  if (!/[\u4e00-\u9fff]/.test(char)) return ''
  let result = ''
  for (const [letter, sample] of PINYIN_BOUNDARIES) {
    if (PINYIN_COLLATOR.compare(char, sample) >= 0) result = letter
  }
  return result
}

function getGroupSearchText(group) {
  const values = [group.name, group.chineseName, group.path]
  const aliases = values
    .filter(Boolean)
    .flatMap((value) => {
      const normalized = normalizeSearchText(value)
      return [normalized, getInitialSearchText(value), ...(SEARCH_ALIASES[normalized] || [])]
    })
  return aliases.join('|')
}

async function openOverviewGroup(group) {
  overviewContextPath = group.path
  if (!group.missing) {
    openDetail(group)
    return
  }
  const label = group.chineseName || group.name || group.path
  const dirName = group.name || group.path.split(/[\\/]/).pop()
  if (!confirm(`目录「${label}」尚未创建，是否选择位置并新建英文目录「${dirName}」？`)) return
  const result = await window.api.createOverviewDir(group.path)
  if (!result.ok) return
  showToast(`已创建目录：${result.path}`, 'ok')
  await loadData({ quiet: true })
  const created = overviewGroups.find((item) => item.path === result.path)
  if (created) openDetail(created)
}

function ensureOverviewMenu() {
  let menu = document.querySelector('#overviewMenu')
  if (menu) return menu
  menu = document.createElement('div')
  menu.id = 'overviewMenu'
  menu.className = 'batch-menu hidden'
  menu.innerHTML = `
    <button data-action="open">打开目录</button>
    <button data-action="configure">显示配置</button>
    <button data-action="rename">重命名</button>
    <button data-action="preview">重新设置预览图</button>
    <button data-action="delete">删除到回收站</button>
  `
  document.body.appendChild(menu)
  menu.addEventListener('click', async (e) => {
    const action = e.target?.dataset?.action
    if (!action || !overviewContextPath) return
    const group = overviewGroups.find((item) => item.path === overviewContextPath)
    try {
      if (frameworkIsolation?.active && action !== 'open') {
        showToast('框架隔离调试中，暂不可修改目录', 'err')
        return
      }
      if (action === 'open') {
        if (group?.missing) await openOverviewGroup(group)
        else await window.api.openOverviewFolder(overviewContextPath)
      }
      if (action === 'configure') await configureOverviewMeta(group)
      if (action === 'rename') await renameOverviewGroup(group)
      if (action === 'preview') await setOverviewPreview(group)
      if (action === 'delete') await trashOverviewGroup(group)
    } catch (error) {
      showToast('操作失败：' + error.message, 'err')
    } finally {
      hideOverviewMenu()
    }
  })
  return menu
}

function showOverviewMenu(x, y) {
  const menu = ensureOverviewMenu()
  menu.style.left = `${x}px`
  menu.style.top = `${y}px`
  menu.classList.remove('hidden')
}

function hideOverviewMenu() {
  const menu = document.querySelector('#overviewMenu')
  if (menu) menu.classList.add('hidden')
  overviewContextPath = null
}

async function renameOverviewGroup(group) {
  if (!group) return
  const currentName = group.name
  const label = group.chineseName && group.chineseName !== group.name ? `（显示：${group.chineseName}）` : ''
  const nextName = prompt(`重命名实际目录名${label}`, currentName)
  if (!nextName || nextName.trim() === currentName) return
  const result = await window.api.renameOverview(group.path, nextName.trim())
  if (!result.ok) throw new Error(result.error || 'rename failed')
  showToast('目录已重命名')
  await loadData({ quiet: true })
}

async function setOverviewPreview(group) {
  if (!group) return
  const result = await window.api.setOverviewPreview(group.path)
  if (result.ok) {
    showToast('一级预览图已更新')
    await loadData({ quiet: true })
  }
}

function configureOverviewMeta(group) {
  if (!group) return Promise.resolve()
  return new Promise((resolve) => {
    const modal = document.createElement('div')
    modal.className = 'text-modal'
    modal.innerHTML = `
      <div class="text-dialog meta-dialog">
        <div class="text-dialog-title">显示配置</div>
        <label class="meta-field">
          <span>显示名称</span>
          <input class="text-dialog-input" data-meta-name type="text" value="${escapeAttr(group.customMeta?.displayName || group.chineseName || group.name || '')}" />
        </label>
        <label class="meta-field">
          <span>图片路径</span>
          <input class="text-dialog-input" data-meta-artwork type="text" value="${escapeAttr(group.customMeta?.artworkPath || '')}" placeholder="未设置则自动匹配或使用默认图" />
        </label>
        <div class="text-dialog-actions">
          <button class="btn btn-ghost" data-meta-action="choose">选择图片</button>
          <button class="btn btn-ghost" data-meta-action="clear">清除图片</button>
          <button class="btn btn-ghost" data-meta-action="cancel">取消</button>
          <button class="btn btn-primary" data-meta-action="save">保存</button>
        </div>
      </div>
    `
    const nameInput = modal.querySelector('[data-meta-name]')
    const artworkInput = modal.querySelector('[data-meta-artwork]')
    const close = () => {
      modal.remove()
      resolve()
    }
    modal.addEventListener('click', async (e) => {
      const action = e.target?.dataset?.metaAction
      if (e.target === modal || action === 'cancel') close()
      if (action === 'clear') artworkInput.value = ''
      if (action === 'choose') {
        const picked = await window.api.chooseOverviewArtwork()
        if (picked.ok) artworkInput.value = picked.path
      }
      if (action === 'save') {
        const result = await window.api.setOverviewMeta(group.path, {
          displayName: nameInput.value,
          artworkPath: artworkInput.value,
        })
        if (!result.ok) showToast('保存显示配置失败', 'err')
        else {
          showToast('显示配置已保存')
          await loadData({ quiet: true })
        }
        close()
      }
    })
    document.body.appendChild(modal)
    nameInput.focus()
    nameInput.select()
  })
}

async function trashOverviewGroup(group) {
  if (!group) return
  if (group.missing) {
    showToast('该项只是内置配置，尚无目录可删除', 'err')
    return
  }
  const label = group.chineseName || group.name
  if (!confirm(`将一级目录「${label}」及其中所有 mod 放入回收站。\n此操作可在系统回收站恢复，是否继续？`)) return
  const result = await window.api.trashOverview(group.path)
  if (result.ok) {
    showToast('目录已放入回收站')
    await loadData({ quiet: true })
  }
}

// ==================== 批量移入 ====================

async function handleBatchMove(targetPath) {
  if (frameworkIsolation?.active) {
    showToast('框架隔离调试中，暂不可批量移入', 'err')
    return
  }
  if (!targetPath) return
  const src = await window.api.chooseMoveSources()
  if (!src.ok || src.canceled) return
  const result = await window.api.moveSourceDirs(targetPath, src.sources)
  if (result.ok) {
    showToast(`已移入 ${result.moved} 个文件夹`, 'ok')
    await loadData({ quiet: true })
  } else {
    showToast('移入失败：' + result.error, 'err')
  }
}

// ==================== detail界面：mod 列表 ====================

function openDetail(group, focusRel = null) {
  activeGroup = group
  detailSearchTerm = ''
  dom.detailSearch.value = ''
  setDetailSearchGlobal(false, false)
  selectedModRel = null
  selectedModRels.clear()
  lastSelectedRel = null

  // 切换页面
  dom.overviewPage.classList.add('hidden')
  dom.detailPage.classList.remove('hidden')

  updateDetailHeader(group)

  // 右栏：清除预览
  dom.detailPreview.classList.add('hidden')
  dom.previewImg.innerHTML = ''
  dom.previewName.textContent = ''

  // 渲染 mod 表
  renderModTable()
  if (focusRel) {
    const selectedItem = Array.from(dom.modList.querySelectorAll('.mod-item'))
      .find((item) => item.dataset.rel === focusRel)
    if (selectedItem) {
      selectedModRels = new Set([focusRel])
      lastSelectedRel = focusRel
      updateBatchSelection()
      selectMod(selectedItem, focusRel)
    }
  }
}

function updateDetailHeader(group) {
  dom.detailTitle.textContent = group.name
  const enabled = group.mods.filter((m) => !m.disabled).length
  const total = group.mods.length
  dom.detailCount.textContent = `${enabled}/${total}`
  const artwork = group.artwork || group.avatar || group.preview || ''
  const src = artwork ? imageSrc(artwork) : DEFAULT_COVER_SRC
  const img = document.createElement('img')
  img.alt = ''
  img.src = src
  img.addEventListener('error', () => {
    if (img.src.endsWith(DEFAULT_COVER_SRC)) return
    img.src = DEFAULT_COVER_SRC
  }, { once: true })
  dom.detailGridImage.replaceChildren(img)
}

function setDetailSearchGlobal(enabled, rerender = true) {
  detailSearchGlobal = !!enabled
  dom.detailSearchWrap?.classList?.toggle('global', detailSearchGlobal)
  dom.detailSearchGlobal.classList.toggle('active', detailSearchGlobal)
  dom.detailSearchGlobal.setAttribute('aria-pressed', detailSearchGlobal ? 'true' : 'false')
  dom.detailSearch.title = detailSearchGlobal
    ? 'Tab 搜当前页，连按 Tab 搜全局，F2 关闭全局，Esc 返回'
    : 'Tab 搜当前页，连按 Tab 搜全局，F2 开启全局，Esc 返回'
  dom.detailSearchGlobal.title = detailSearchGlobal ? 'F2 关闭全局搜索' : 'F2 开启全局搜索'
  if (rerender && activeGroup) renderModTable()
}

function renderModTable() {
  const term = normalizeSearchText(detailSearchTerm)
  if (detailSearchGlobal && term) {
    renderGlobalSearchResults(term)
    return
  }
  dom.detailSearchResults.classList.add('hidden')
  dom.modList.classList.remove('hidden')
  const allMods = activeGroup.mods || []
  const mods = term
    ? allMods.filter((mod) => getModSearchText(mod).includes(term))
    : allMods
  if (allMods.length > 0 && mods.length === 0) {
    dom.modList.className = 'mod-list list-view'
    dom.modList.innerHTML = '<div class="empty-mods"><div>没有匹配的 mod</div></div>'
    dom.detailEmpty.classList.add('hidden')
    return
  }
  if (mods.length === 0) {
    dom.modList.innerHTML = `<div class="empty-mods">
        <div class="empty-icon">📥</div>
        <div>该目录下暂无 mod</div>
        <button class="btn-import-detail" id="btnBatchMoveEmpty">批量移入</button>
      </div>`
    dom.detailEmpty.classList.add('hidden')
    const importBtn = dom.modList.querySelector('#btnBatchMoveEmpty')
    if (importBtn) {
      importBtn.addEventListener('click', () => handleBatchMove(activeGroup.path))
    }
    return
  }
  dom.detailEmpty.classList.add('hidden')
  dom.modList.className = `mod-list ${detailViewMode === 'card' ? 'card-view' : 'list-view'}`

  const separatorIndex = mods.findIndex((m, index) => m.disabled && index > 0 && !mods[index - 1].disabled)
  dom.modList.innerHTML = mods.map((m, index) => {
    const extraClass = index === separatorIndex ? 'state-separator' : ''
    return detailViewMode === 'card' ? renderModCard(m, extraClass) : renderModRow(m, extraClass)
  }).join('')
  bindModItems()
  setupModDrag()
  preloadModImages(mods)
  applyFrameworkIsolationUi()
}

function getModSearchText(mod) {
  return [mod.name, mod.rel, mod.group]
    .filter(Boolean)
    .map((value) => {
      const normalized = normalizeSearchText(value)
      return `${normalized}|${getInitialSearchText(value)}`
    })
    .join('|')
}

function renderGlobalSearchResults(term) {
  dom.modList.innerHTML = ''
  dom.modList.classList.add('hidden')
  dom.detailEmpty.classList.add('hidden')

  const groups = overviewGroups.filter((group) => getGroupSearchText(group).includes(term))
  const modResults = overviewGroups.flatMap((group) => (group.mods || [])
    .filter((mod) => getModSearchText(mod).includes(term))
    .map((mod) => ({ group, mod })))

  if (!groups.length && !modResults.length) {
    dom.detailSearchResults.innerHTML = '<div class="empty-mods"><div>没有匹配的网格或 mod</div></div>'
    dom.detailSearchResults.classList.remove('hidden')
    return
  }

  const groupHtml = groups.length
    ? `<section class="global-search-section">
        <div class="global-search-title">网格（${groups.length}）</div>
        ${groups.map((group) => {
          const image = group.artwork || group.avatar
          const thumb = image
            ? `<img src="${escapeAttr(imageSrc(image))}" loading="lazy" alt="" />`
            : '<span>网格</span>'
          return `<button class="global-search-item" data-search-group="${escapeAttr(group.path)}" type="button">
              <div class="global-search-thumb">${thumb}</div>
              <div>
                <div class="global-search-name">${escapeHtml(group.chineseName || group.name || group.path)}</div>
                <div class="global-search-meta">${escapeHtml(group.path)} · ${group.mods.length} 个 mod</div>
              </div>
              <span class="global-search-type">进入</span>
            </button>`
        }).join('')}
      </section>`
    : ''
  const modHtml = modResults.length
    ? `<section class="global-search-section">
        <div class="global-search-title">mod（${modResults.length}）</div>
        ${modResults.map(({ group, mod }) => {
          const preview = getModPreviewSrc(mod)
          const thumb = preview
            ? `<img src="${escapeAttr(preview)}" loading="lazy" alt="" />`
            : '<span>MOD</span>'
          return `<button class="global-search-item" data-search-group="${escapeAttr(group.path)}" data-search-mod="${escapeAttr(mod.rel)}" type="button">
              <div class="global-search-thumb">${thumb}</div>
              <div>
                <div class="global-search-name">${escapeHtml(mod.name)}</div>
                <div class="global-search-meta">${escapeHtml(group.chineseName || group.name || group.path)}${displayGroup(mod) ? ` · ${escapeHtml(displayGroup(mod))}` : ''}</div>
              </div>
              <span class="global-search-type">进入</span>
            </button>`
        }).join('')}
      </section>`
    : ''

  dom.detailSearchResults.innerHTML = groupHtml + modHtml
  dom.detailSearchResults.classList.remove('hidden')
  dom.detailSearchResults.querySelectorAll('[data-search-group]').forEach((button) => {
    button.addEventListener('click', () => {
      const group = overviewGroups.find((item) => item.path === button.dataset.searchGroup)
      if (!group) return
      openDetail(group, button.dataset.searchMod || null)
    })
  })
}

function renderModRow(m, extraClass = '') {
  const previewSrc = getModPreviewSrc(m)
  const thumb = previewSrc
    ? `<img src="${escapeAttr(previewSrc)}" loading="lazy" alt="" />`
    : ''
  const group = displayGroup(m)
  return `<div class="mod-row mod-item ${m.disabled ? 'disabled' : ''} ${extraClass}" data-rel="${escapeAttr(m.rel)}" data-order-key="${escapeAttr(m.orderKey || m.rel)}" data-preview-src="${escapeAttr(previewSrc)}" draggable="true">
      <input type="checkbox" class="mod-check" ${m.disabled ? '' : 'checked'} />
      <button class="btn-lock ${m.locked ? 'locked' : ''}" title="${m.locked ? '取消锁定配置' : '锁定配置'}">${m.locked ? '🔒' : '🔓'}</button>
      <div class="mod-thumb">${thumb}</div>
      <div class="mod-info">
        <div class="mod-name" data-edit-name title="${escapeAttr(m.name)}">${escapeHtml(m.name)}</div>
        ${group ? `<div class="mod-group">${escapeHtml(group)}</div>` : ''}
      </div>
      <button class="btn-favorite ${m.favorite ? 'favorited' : ''}" title="${m.favorite ? '取消收藏' : '收藏'}" aria-pressed="${m.favorite ? 'true' : 'false'}">${m.favorite ? '★' : '☆'}</button>
    </div>`
}

function renderModCard(m, extraClass = '') {
  const previewSrc = getModPreviewSrc(m)
  const thumb = previewSrc
    ? `<img src="${escapeAttr(previewSrc)}" loading="lazy" alt="" />`
    : `<div class="no-thumb">MOD</div>`
  const group = displayGroup(m)
  return `<div class="mod-card mod-item ${m.disabled ? 'disabled' : ''} ${extraClass}" data-rel="${escapeAttr(m.rel)}" data-order-key="${escapeAttr(m.orderKey || m.rel)}" data-preview-src="${escapeAttr(previewSrc)}" draggable="true">
      <div class="mod-card-image">
        ${thumb}
        <label class="mod-card-toggle">
          <input type="checkbox" class="mod-check" ${m.disabled ? '' : 'checked'} />
          <span>${m.disabled ? 'OFF' : 'ON'}</span>
        </label>
        <button class="btn-lock ${m.locked ? 'locked' : ''}" title="${m.locked ? '取消锁定配置' : '锁定配置'}">${m.locked ? '🔒' : '🔓'}</button>
        <button class="btn-favorite ${m.favorite ? 'favorited' : ''}" title="${m.favorite ? '取消收藏' : '收藏'}" aria-pressed="${m.favorite ? 'true' : 'false'}">${m.favorite ? '★' : '☆'}</button>
      </div>
      <div class="mod-card-body">
        <div class="mod-name" data-edit-name title="${escapeAttr(m.name)}">${escapeHtml(m.name)}</div>
        ${group ? `<div class="mod-card-meta">${escapeHtml(group)}</div>` : ''}
      </div>
    </div>`
}

function bindModItems() {
  dom.modList.querySelectorAll('.mod-item').forEach((item) => {
    const rel = item.dataset.rel
    const check = item.querySelector('.mod-check')
    const lockBtn = item.querySelector('.btn-lock')
    const favoriteBtn = item.querySelector('.btn-favorite')
    const nameEl = item.querySelector('[data-edit-name]')
    const isolationBlocked = isIsolationBlockedMod(rel)
    if (isModBusy(rel)) {
      item.classList.add('busy')
      check.disabled = true
      lockBtn.disabled = true
      favoriteBtn.disabled = true
    }
    if (isolationBlocked) {
      item.classList.add('isolation-blocked')
      check.disabled = true
      lockBtn.disabled = true
      favoriteBtn.disabled = true
    }

    item.addEventListener('click', (e) => {
      if (suppressNextClick) return
      if (e.target === check || e.target === lockBtn || e.target === favoriteBtn || e.target.closest('.rename-input')) return
      if (blockIsolationMod(rel)) return
      if (blockBusyMod(rel)) return
      applySelection(item, rel, e)
      selectMod(item, rel)
    })

    item.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      if (blockIsolationMod(rel)) return
      if (blockBusyMod(rel)) return
      contextMenuRel = rel
      if (!selectedModRels.has(rel)) {
        selectedModRels = new Set([rel])
        lastSelectedRel = rel
        updateBatchSelection()
        selectMod(item, rel)
      }
      showBatchMenu(e.clientX, e.clientY)
    })

    nameEl.addEventListener('dblclick', (e) => {
      e.stopPropagation()
      if (blockIsolationMod(rel)) return
      if (blockBusyMod(rel)) return
      startRename(nameEl, rel)
    })

    check.addEventListener('change', async () => {
      const enable = check.checked
      if (frameworkIsolation?.active) {
        check.checked = !enable
        showToast('框架隔离调试中，请先结束隔离再启停 mod', 'err')
        return
      }
      if (blockIsolationMod(rel)) {
        check.checked = !enable
        return
      }
      if (blockBusyMod(rel)) {
        check.checked = !enable
        return
      }
      setModBusy(rel, true)
      try {
        const result = await window.api.toggleMod(rel, enable)
        if (!result.ok) throw new Error(result.error || 'toggle failed')
        await loadData({ quiet: true })
      } catch (err) {
        showToast('操作失败：' + err.message, 'err')
        check.checked = !enable
      } finally {
        setModBusy(rel, false)
      }
    })

    lockBtn.addEventListener('click', async (e) => {
      e.stopPropagation()
      if (blockIsolationMod(rel)) return
      if (blockBusyMod(rel)) return
      const mod = activeGroup.mods.find((m) => m.rel === rel)
      if (!mod) return
      setModBusy(rel, true)
      try {
        const result = await window.api.setModLocked(rel, !mod.locked)
        if (!result.ok) throw new Error(result.error || 'lock failed')
        showToast(!mod.locked ? '配置已锁定' : '配置已解锁')
        await loadData({ quiet: true })
      } catch (err) {
        showToast('操作失败：' + err.message, 'err')
      } finally {
        setModBusy(rel, false)
      }
    })

    favoriteBtn.addEventListener('click', async (e) => {
      e.stopPropagation()
      if (blockBusyMod(rel)) return
      const mod = activeGroup.mods.find((m) => m.rel === rel)
      if (!mod) return
      setModBusy(rel, true)
      try {
        const result = await window.api.setModFavorite(rel, !mod.favorite)
        if (!result.ok) throw new Error(result.error || 'favorite failed')
        mod.favorite = result.favorite
        sortCurrentModsByFavorite()
        renderModTable()
        if (selectedModRel) {
          const selectedItem = Array.from(dom.modList.querySelectorAll('.mod-item'))
            .find((item) => item.dataset.rel === selectedModRel)
          if (selectedItem) selectMod(selectedItem, selectedModRel)
        }
        showToast(result.favorite ? '已收藏' : '已取消收藏')
      } catch (err) {
        showToast('操作失败：' + err.message, 'err')
      } finally {
        setModBusy(rel, false)
      }
    })
  })
  updateBatchSelection()
}

function applySelection(item, rel, event) {
  if (event.shiftKey && lastSelectedRel) {
    const items = Array.from(dom.modList.querySelectorAll('.mod-item'))
    const from = items.findIndex((el) => el.dataset.rel === lastSelectedRel)
    const to = items.findIndex((el) => el.dataset.rel === rel)
    if (from >= 0 && to >= 0) {
      const [start, end] = from < to ? [from, to] : [to, from]
      selectedModRels = new Set(items.slice(start, end + 1).map((el) => el.dataset.rel))
    }
  } else if (event.ctrlKey || event.metaKey) {
    if (selectedModRels.has(rel)) selectedModRels.delete(rel)
    else selectedModRels.add(rel)
    lastSelectedRel = rel
  } else {
    selectedModRels = new Set([rel])
    lastSelectedRel = rel
  }
  updateBatchSelection()
}

function updateBatchSelection() {
  const items = Array.from(dom.modList.querySelectorAll('.mod-item'))
  items.forEach((item) => {
    item.classList.remove('batch-selected', 'batch-start', 'batch-middle', 'batch-end', 'batch-single')
    if (!selectedModRels.has(item.dataset.rel)) return
    item.classList.add('batch-selected')
  })

  let index = 0
  while (index < items.length) {
    if (!selectedModRels.has(items[index].dataset.rel)) {
      index++
      continue
    }
    const start = index
    while (index + 1 < items.length && selectedModRels.has(items[index + 1].dataset.rel)) index++
    const end = index
    if (start === end) items[start].classList.add('batch-single')
    else {
      items[start].classList.add('batch-start')
      items[end].classList.add('batch-end')
      for (let i = start + 1; i < end; i++) items[i].classList.add('batch-middle')
    }
    index++
  }
}

function getSelectedModRels() {
  return selectedModRels.size ? Array.from(selectedModRels) : (selectedModRel ? [selectedModRel] : [])
}

function hasBusyMod(rels) {
  return rels.some((rel) => isModBusy(rel))
}

function ensureBatchMenu() {
  let menu = document.querySelector('#batchMenu')
  if (menu) return menu
  menu = document.createElement('div')
  menu.id = 'batchMenu'
  menu.className = 'batch-menu hidden'
  menu.innerHTML = `
    <button data-action="open">打开目录</button>
    <button data-action="preview">指定预览图</button>
    <button data-action="enable">启用所选</button>
    <button data-action="disable">停用所选</button>
    <button data-action="move">移动到...</button>
    <button data-action="delete">删除到回收站</button>
  `
  document.body.appendChild(menu)
  menu.addEventListener('click', async (e) => {
    const action = e.target?.dataset?.action
    if (!action) return
    if (action === 'open') await openSelectedModFolder()
    if (action === 'preview') await setSelectedPreview()
    if (action === 'enable') await applySelectedEnabled(true)
    if (action === 'disable') await applySelectedEnabled(false)
    if (action === 'framework-isolate') await startContextFrameworkIsolation()
    if (action === 'framework-restore') await endContextFrameworkIsolation()
    if (action === 'move') await moveSelectedMods()
    if (action === 'delete') await trashSelectedMods()
    hideBatchMenu()
  })
  return menu
}

function syncBatchMenu() {
  const menu = ensureBatchMenu()
  const isolateBtn = menu.querySelector('[data-action="framework-isolate"]')
  const restoreBtn = menu.querySelector('[data-action="framework-restore"]')
  if (frameworkIsolation?.active) {
    if (!restoreBtn) {
      const btn = document.createElement('button')
      btn.dataset.action = 'framework-restore'
      btn.textContent = '结束框架隔离'
      menu.insertBefore(btn, menu.querySelector('[data-action="move"]'))
    }
    if (isolateBtn) isolateBtn.remove()
  } else {
    if (!isolateBtn) {
      const btn = document.createElement('button')
      btn.dataset.action = 'framework-isolate'
      btn.textContent = '框架隔离调试此项'
      menu.insertBefore(btn, menu.querySelector('[data-action="move"]'))
    }
    if (restoreBtn) restoreBtn.remove()
  }
}

function showBatchMenu(x, y) {
  const menu = ensureBatchMenu()
  syncBatchMenu()
  menu.style.left = `${x}px`
  menu.style.top = `${y}px`
  menu.classList.remove('hidden')
}

function hideBatchMenu() {
  const menu = document.querySelector('#batchMenu')
  if (menu) menu.classList.add('hidden')
  contextMenuRel = null
}

async function moveSelectedMods() {
  const rels = getSelectedModRels()
  if (!rels.length) return
  if (blockIsolationRels(rels)) return
  if (hasBusyMod(rels)) {
    showToast('请等当前操作完成', 'err')
    return
  }
  const target = await window.api.chooseMoveTarget()
  if (!target.ok || target.canceled) return
  const result = await window.api.moveMods(rels, target.target)
  if (result.ok) {
    showToast(`已移动 ${result.moved} 个 mod`)
    selectedModRels.clear()
    selectedModRel = null
    await loadData({ quiet: true })
  }
}

async function openSelectedModFolder() {
  const rel = contextMenuRel || getSelectedModRels()[0]
  if (!rel || blockIsolationMod(rel) || blockBusyMod(rel)) return
  const result = await window.api.openFolder(rel)
  if (result && !result.ok) showToast(result.error || '打开目录失败', 'err')
}

async function startContextFrameworkIsolation() {
  const rel = contextMenuRel || getSelectedModRels()[0]
  if (!rel || blockBusyMod(rel)) return
  if (frameworkIsolation?.active) {
    showToast('请先结束当前框架隔离', 'err')
    return
  }
  const targetOrderKey = getClientModOrderKey(rel)
  frameworkIsolation = { active: true, pending: true, targetOrderKey, targetRel: rel }
  applyFrameworkIsolationUi()
  hideBatchMenu()
  showToast('正在进入框架隔离...')
  setModBusy(rel, true)
  try {
    const result = await window.api.startFrameworkIsolation(rel)
    if (!result.ok) {
      frameworkIsolation = { active: false }
      applyFrameworkIsolationUi()
      showToast(result.error || '框架隔离失败', 'err')
      return
    }
    frameworkIsolation = result.state || { active: true }
    selectedModRel = rel
    applyFrameworkIsolationUi()
    showToast('已进入框架隔离调试，其他 mod 已禁止互动')
  } catch (err) {
    frameworkIsolation = { active: false }
    applyFrameworkIsolationUi()
    showToast('框架隔离失败：' + err.message, 'err')
  } finally {
    setModBusy(rel, false)
  }
}

async function endContextFrameworkIsolation() {
  if (!frameworkIsolation?.active) return
  const previous = frameworkIsolation
  frameworkIsolation = { active: false }
  applyFrameworkIsolationUi()
  hideBatchMenu()
  showToast('正在结束框架隔离...')
  try {
    const result = await window.api.endFrameworkIsolation()
    if (!result.ok) {
      frameworkIsolation = previous
      applyFrameworkIsolationUi()
      showToast(result.error || '结束隔离失败', 'err')
      return
    }
    showToast('已结束框架隔离并恢复加载范围')
  } catch (err) {
    frameworkIsolation = previous
    applyFrameworkIsolationUi()
    showToast('结束隔离失败：' + err.message, 'err')
  }
}

async function setSelectedPreview() {
  const rels = contextMenuRel ? [contextMenuRel] : getSelectedModRels()
  if (blockIsolationRels(rels)) return
  if (hasBusyMod(rels)) {
    showToast('请等当前操作完成', 'err')
    return
  }
  if (rels.length !== 1) {
    showToast('请只选择一个 mod 指定预览图', 'err')
    return
  }
  await setModPreview(rels[0])
}

async function setModPreview(rel) {
  if (blockIsolationMod(rel)) return
  if (blockBusyMod(rel)) return
  setModBusy(rel, true)
  try {
    const result = await window.api.setModPreview(rel)
    if (!result.ok) throw new Error(result.error || 'preview failed')
    showToast('预览图已更新')
    await loadData({ quiet: true })
  } catch (err) {
    showToast('操作失败：' + err.message, 'err')
  } finally {
    setModBusy(rel, false)
  }
}

async function trashSelectedMods() {
  const rels = getSelectedModRels()
  if (!rels.length) return
  if (blockIsolationRels(rels)) return
  if (hasBusyMod(rels)) {
    showToast('请等当前操作完成', 'err')
    return
  }
  if (!confirm(`将选中的 ${rels.length} 个 mod 放入回收站。\n此操作可在系统回收站恢复，是否继续？`)) return
  const result = await window.api.trashMods(rels)
  if (!result.ok) {
    showToast('删除失败：' + (result.error || result.err || '未知错误'), 'err')
    return
  }
  if (result.ok) {
    showToast(`已放入回收站 ${result.deleted} 个 mod`)
    selectedModRels.clear()
    selectedModRel = null
    await loadData({ quiet: true })
  }
}

async function applySelectedEnabled(enable) {
  const rels = getSelectedModRels()
  if (!rels.length) return
  if (frameworkIsolation?.active) {
    showToast('框架隔离调试中，暂不可批量启停', 'err')
    return
  }
  if (blockIsolationRels(rels)) return
  if (hasBusyMod(rels)) {
    showToast('请等当前操作完成', 'err')
    return
  }
  const targets = rels
    .map((rel) => activeGroup?.mods?.find((mod) => mod.rel === rel))
    .filter((mod) => mod && !mod.locked && mod.disabled === enable)
  if (!targets.length) {
    showToast(enable ? '所选 mod 已启用' : '所选 mod 已停用')
    return
  }
  showToast(enable ? '正在启用所选…' : '正在停用所选…')
  for (const mod of targets) {
    setModBusy(mod.rel, true)
    const result = await window.api.toggleMod(mod.rel, enable)
    setModBusy(mod.rel, false)
    if (!result.ok) {
      showToast('操作失败：' + (result.error || '未知错误'), 'err')
      await loadData({ quiet: true })
      return
    }
  }
  await loadData({ quiet: true })
  showToast('操作完成')
}

function isTextEditingTarget(target) {
  return target?.closest?.('input, textarea, [contenteditable="true"], .rename-input')
}

function isOverviewVisible() {
  return !dom.overviewPage.classList.contains('hidden')
}

function isDetailVisible() {
  return !dom.detailPage.classList.contains('hidden')
}

async function deleteOverviewSelection() {
  const group = overviewGroups.find((item) => item.path === overviewContextPath)
  if (!group) {
    showToast('请先右键选择要删除的一级目录', 'err')
    return
  }
  await trashOverviewGroup(group)
}

function copyOrCutSelectedMods(mode) {
  if (!isDetailVisible() || !activeGroup) return
  const rels = getSelectedModRels()
  if (!rels.length) {
    showToast('请先选择 mod', 'err')
    return
  }
  if (blockIsolationRels(rels)) return
  if (hasBusyMod(rels)) {
    showToast('请等当前操作完成', 'err')
    return
  }
  modClipboard = { mode: mode === 'cut' ? 'cut' : 'copy', rels, sourceGroupPath: activeGroup.path }
  showToast(`${mode === 'cut' ? '已剪切' : '已复制'} ${rels.length} 个 mod`)
}

async function pasteSelectedMods() {
  if (!isDetailVisible() || !activeGroup || !modClipboard?.rels?.length) return
  if (frameworkIsolation?.active) {
    showToast('框架隔离调试中，暂不可粘贴 mod', 'err')
    return
  }
  if (hasBusyMod(modClipboard.rels)) {
    showToast('请等当前操作完成', 'err')
    return
  }
  const result = await window.api.pasteMods(modClipboard.rels, activeGroup.path, modClipboard.mode)
  if (!result.ok) {
    showToast('粘贴失败：' + (result.error || result.err || '未知错误'), 'err')
    return
  }
  if (modClipboard.mode === 'cut') modClipboard = null
  showToast(`已粘贴 ${result.changed} 个 mod`)
  await loadData({ quiet: true })
}

function setupOverviewDrag(canDrag = true) {
  if (!canDrag) return
  dom.overviewGrid.querySelectorAll('.overview-section-grid').forEach((grid) => {
    grid.addEventListener('dragover', (e) => {
      if (!overviewDraggedPath) return
      e.preventDefault()
      grid.classList.add('drag-over')
    })
    grid.addEventListener('dragleave', (e) => {
      if (!grid.contains(e.relatedTarget)) grid.classList.remove('drag-over')
    })
    grid.addEventListener('drop', async (e) => {
      e.preventDefault()
      grid.classList.remove('drag-over')
      if (!overviewDraggedPath || e.target.closest('.folder-card')) return
      await moveOverviewCard(overviewDraggedPath, null, grid.dataset.sectionId || DEFAULT_OVERVIEW_SECTION)
    })
  })
  dom.overviewGrid.querySelectorAll('.folder-card').forEach((item) => {
    item.addEventListener('dragstart', (e) => {
      if (e.target.closest('button,input') || item.draggable === false) {
        e.preventDefault()
        return
      }
      overviewDraggedPath = item.dataset.path
      suppressNextClick = true
      item.classList.add('dragging')
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', overviewDraggedPath)
    })

    item.addEventListener('dragover', (e) => {
      if (!overviewDraggedPath || overviewDraggedPath === item.dataset.path) return
      e.preventDefault()
      item.classList.add('drag-over')
    })

    item.addEventListener('dragleave', () => item.classList.remove('drag-over'))

    item.addEventListener('drop', async (e) => {
      e.preventDefault()
      item.classList.remove('drag-over')
      if (!overviewDraggedPath || overviewDraggedPath === item.dataset.path) return
      await moveOverviewCard(overviewDraggedPath, item.dataset.path, item.dataset.sectionId || DEFAULT_OVERVIEW_SECTION)
    })

    item.addEventListener('dragend', () => {
      overviewDraggedPath = null
      item.classList.remove('dragging')
      dom.overviewGrid.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'))
      setTimeout(() => { suppressNextClick = false }, 0)
    })
  })
}

async function moveOverviewCard(draggedPath, targetPath, sectionId) {
  const dragged = overviewGroups.find((group) => group.path === draggedPath)
  if (!dragged || dragged.missing) return

  overviewSections.forEach((section) => {
    section.items = (section.items || []).filter((path) => path !== draggedPath)
  })

  if (sectionId !== DEFAULT_OVERVIEW_SECTION) {
    const section = overviewSections.find((item) => item.id === sectionId)
    if (!section) return
    const targetIndex = targetPath ? section.items.indexOf(targetPath) : -1
    if (targetIndex >= 0) section.items.splice(targetIndex, 0, draggedPath)
    else section.items.push(draggedPath)
  }

  if (targetPath) moveItem(overviewGroups, draggedPath, targetPath, (group) => group.path)
  applyOverviewOrderFromSections()
  renderOverview()
  try {
    await saveOverviewLayout()
    showToast('分组已保存，重启后仍会保留')
  } catch (err) {
    showToast('保存分组失败：' + err.message, 'err')
  }
}

async function moveOverviewSection(draggedId, targetId) {
  if (!draggedId || !targetId || draggedId === targetId || targetId === DEFAULT_OVERVIEW_SECTION) return
  moveItem(overviewSections, draggedId, targetId, (section) => section.id)
  renderOverview()
  try {
    await saveOverviewLayout()
    showToast('分类顺序已保存')
  } catch (err) {
    showToast('保存分类顺序失败：' + err.message, 'err')
  }
}

function applyOverviewOrderFromSections() {
  const byPath = new Map(overviewGroups.map((group) => [group.path, group]))
  const ordered = []
  const used = new Set()
  overviewSections.forEach((section) => {
    section.items = (section.items || []).filter((path) => byPath.has(path))
    section.items.forEach((path) => {
      if (!used.has(path)) {
        ordered.push(byPath.get(path))
        used.add(path)
      }
    })
  })
  overviewGroups.forEach((group) => {
    if (!used.has(group.path)) ordered.push(group)
  })
  overviewGroups = ordered
}

async function saveOverviewLayout() {
  applyOverviewOrderFromSections()
  await window.api.setOverviewSections(overviewSections)
  await window.api.setOverviewOrder(overviewGroups.map((group) => group.path))
}

async function addOverviewSection() {
  const name = await askText({
    title: '新建一级分类',
    placeholder: '例如：武器',
    confirmText: '创建',
  })
  const cleanName = String(name || '').trim()
  if (!cleanName) return
  overviewSections.push({
    id: `section_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    name: cleanName,
    collapsed: false,
    items: [],
  })
  try {
    await saveOverviewLayout()
    renderOverview()
    showToast('分组已创建')
  } catch (err) {
    showToast('创建分组失败：' + err.message, 'err')
  }
}

async function renameOverviewSection(section) {
  const name = await askText({
    title: '重命名一级分类',
    value: section.name,
    confirmText: '保存',
  })
  const cleanName = String(name || '').trim()
  if (!cleanName || cleanName === section.name) return
  section.name = cleanName
  await saveOverviewLayout()
  renderOverview()
}

function askText({ title, value = '', placeholder = '', confirmText = '确定' }) {
  return new Promise((resolve) => {
    const modal = document.createElement('div')
    modal.className = 'text-modal'
    modal.innerHTML = `
      <div class="text-dialog">
        <div class="text-dialog-title">${escapeHtml(title)}</div>
        <input class="text-dialog-input" type="text" value="${escapeAttr(value)}" placeholder="${escapeAttr(placeholder)}" />
        <div class="text-dialog-actions">
          <button class="btn btn-ghost" data-dialog-action="cancel">取消</button>
          <button class="btn btn-primary" data-dialog-action="confirm">${escapeHtml(confirmText)}</button>
        </div>
      </div>
    `
    const close = (result) => {
      modal.remove()
      resolve(result)
    }
    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.dataset.dialogAction === 'cancel') close(null)
      if (e.target.dataset.dialogAction === 'confirm') close(input.value)
    })
    const input = modal.querySelector('.text-dialog-input')
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') close(input.value)
      if (e.key === 'Escape') close(null)
    })
    document.body.appendChild(modal)
    input.focus()
    input.select()
  })
}

async function deleteOverviewSection(section) {
  if (!confirm(`删除分类「${section.name}」？\n分类里的目录会回到“未分组”，不会删除文件。`)) return
  const releasedCount = Array.isArray(section.items) ? section.items.length : 0
  overviewSections = overviewSections.filter((item) => item.id !== section.id)
  await saveOverviewLayout()
  renderOverview()
  showToast(releasedCount ? `分类已删除，${releasedCount} 个目录已回到未分组` : '分类已删除')
}

function setupModDrag() {
  if (!activeGroup) return
  setupDragSort({
    container: dom.modList,
    itemSelector: '.mod-item',
    getItem: (key) => activeGroup.mods.find((mod) => (mod.orderKey || mod.rel) === key),
    isEnabled: (mod) => mod && !mod.disabled,
    isFavorite: (mod) => mod && mod.favorite,
    move: async (draggedKey, targetKey) => {
      moveItem(activeGroup.mods, draggedKey, targetKey, (mod) => mod.orderKey || mod.rel)
      renderModTable()
      await window.api.setModOrder(activeGroup.path, activeGroup.mods.map((mod) => mod.orderKey || mod.rel))
    },
  })
}

function setupDragSort({ container, itemSelector, getItem, isEnabled, isFavorite = () => false, move }) {
  let draggedKey = null
  container.querySelectorAll(itemSelector).forEach((item) => {
    item.addEventListener('dragstart', (e) => {
      if (e.target.closest('button,input')) {
        e.preventDefault()
        return
      }
      draggedKey = item.dataset.orderKey
      suppressNextClick = true
      item.classList.add('dragging')
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', draggedKey)
    })

    item.addEventListener('dragover', (e) => {
      if (!draggedKey || draggedKey === item.dataset.orderKey) return
      e.preventDefault()
      item.classList.add('drag-over')
    })

    item.addEventListener('dragleave', () => item.classList.remove('drag-over'))

    item.addEventListener('drop', async (e) => {
      e.preventDefault()
      item.classList.remove('drag-over')
      const targetKey = item.dataset.orderKey
      if (!draggedKey || draggedKey === targetKey) return

      const dragged = getItem(draggedKey)
      const target = getItem(targetKey)
      if (isEnabled(dragged) !== isEnabled(target)) {
        showToast('已启用项会始终排在前面')
        return
      }
      if (isFavorite(dragged) !== isFavorite(target)) {
        showToast('收藏项会始终排在同状态前面')
        return
      }

      try {
        await move(draggedKey, targetKey)
      } catch (err) {
        showToast('保存排序失败：' + err.message, 'err')
      }
    })

    item.addEventListener('dragend', () => {
      draggedKey = null
      item.classList.remove('dragging', 'drag-over')
      container.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'))
      setTimeout(() => { suppressNextClick = false }, 0)
    })
  })
}

function moveItem(items, draggedKey, targetKey, getKey) {
  const from = items.findIndex((item) => getKey(item) === draggedKey)
  const to = items.findIndex((item) => getKey(item) === targetKey)
  if (from < 0 || to < 0 || from === to) return
  const [item] = items.splice(from, 1)
  items.splice(to, 0, item)
}

function selectMod(item, rel) {
  const renderToken = ++previewRenderToken
  dom.modList.querySelectorAll('.mod-item.selected').forEach((el) => el.classList.remove('selected'))
  item.classList.add('selected')
  selectedModRel = rel

  const mod = activeGroup.mods.find((m) => m.rel === rel)
  if (!mod) return

  dom.detailPreview.classList.remove('hidden')
  const sourceImg = item.querySelector('img')
  const sourcePreviewSrc = sourceImg?.naturalWidth > 0
    ? (sourceImg.currentSrc || sourceImg.src)
    : ''
  const previewSrc = sourcePreviewSrc || item.dataset.previewSrc || getModPreviewSrc(mod)
  if (previewSrc || sourceImg) {
    const img = sourceImg ? sourceImg.cloneNode(false) : document.createElement('img')
    img.removeAttribute('loading')
    img.decoding = 'async'
    img.dataset.previewRenderToken = String(renderToken)
    img.alt = ''
    img.src = previewSrc
    img.dataset.fallbackIndex = '0'
    img.dataset.fallbacks = JSON.stringify(getModPreviewFallbacks(mod).filter((src) => src && src !== previewSrc))
    img.addEventListener('error', handlePreviewImageError)
    img.addEventListener('load', () => {
      if (img.dataset.previewRenderToken !== String(previewRenderToken)) return
      dom.previewImg.classList.remove('preview-error')
    }, { once: true })
    dom.previewImg.replaceChildren(img)
  } else {
    dom.previewImg.innerHTML = `<div class="no-thumb">无预览图</div>`
  }
  bindPreviewZoom()
  renderDetailPanel(mod)
}

function handlePreviewImageError(event) {
  const img = event.currentTarget
  if (img.dataset.previewRenderToken !== String(previewRenderToken) || !dom.previewImg.contains(img)) return
  const fallbacks = JSON.parse(img.dataset.fallbacks || '[]')
  const index = Number(img.dataset.fallbackIndex || '0')
  const next = fallbacks[index]
  if (next) {
    img.dataset.fallbackIndex = String(index + 1)
    img.src = next
  } else {
    dom.previewImg.classList.add('preview-error')
    dom.previewImg.innerHTML = `<div class="no-thumb">预览图加载失败</div>`
  }
}

function bindPreviewZoom() {
  const img = dom.previewImg.querySelector('img')
  if (!img) return
  img.addEventListener('dblclick', () => showImageModal(img.src))
}

function showImageModal(src) {
  let modal = document.querySelector('#imageModal')
  if (!modal) {
    modal = document.createElement('div')
    modal.id = 'imageModal'
    modal.className = 'image-modal hidden'
    modal.innerHTML = `<button class="image-modal-close" title="关闭">×</button><img alt="" />`
    document.body.appendChild(modal)
    modal.querySelector('.image-modal-close').addEventListener('click', () => modal.classList.add('hidden'))
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden')
    })
  }
  modal.querySelector('img').src = src
  modal.classList.remove('hidden')
}

function renderDetailPanel(mod) {
  const status = mod.disabled ? '已停用' : '已启用'
  const keys = Array.isArray(mod.keyBindings) && mod.keyBindings.length
    ? mod.keyBindings.map((binding, index) => `
        <div class="key-row">
          <button class="key-value ${binding.locked ? 'locked' : ''}" data-key-index="${index}">${escapeHtml(binding.displayKey || binding.key)}</button>
          <span class="key-label">${escapeHtml(formatKeyLabel(binding))}</span>
        </div>`).join('')
    : `<div class="key-empty">未找到 Key 绑定</div>`

  dom.previewName.innerHTML = `
    <div class="detail-panel">
      <button class="detail-close" data-detail-action="close" title="关闭详情">×</button>
      <div class="detail-panel-eyebrow">当前 MOD</div>
      <div class="detail-panel-title" data-detail-rename title="${escapeAttr(mod.name)}">${escapeHtml(mod.name)}</div>
      <div class="detail-panel-meta">
        <span class="${mod.disabled ? 'state-off' : 'state-on'}">${status}</span>
        ${mod.locked ? '<span class="state-lock">配置锁定</span>' : ''}
      </div>
      <div class="detail-actions">
        <button data-detail-action="rename">重命名</button>
        <button data-detail-action="preview">指定预览图</button>
        <button data-detail-action="open">打开目录</button>
      </div>
      <div class="detail-actions detail-danger-actions">
        <button class="danger-action" data-detail-action="translate">键位整理翻译</button>
        <button class="danger-action" data-detail-action="watch">监听并修改 ini</button>
      </div>
      <div class="key-section">
        <div class="key-section-header">
          <div class="key-section-title">MOD 的按键绑定</div>
          <button data-detail-action="keyPopup">弹窗置顶</button>
        </div>
        ${keys}
      </div>
    </div>
  `
  bindDetailPanel(mod)
}

function formatKeyLabel(binding) {
  return binding.description || String(binding.section || 'Key').replace(/^Key/i, '')
}

function bindDetailPanel(mod) {
  const title = dom.previewName.querySelector('[data-detail-rename]')
  title.addEventListener('dblclick', () => {
    if (blockIsolationMod(mod.rel)) return
    startRename(title, mod.rel)
  })
  dom.previewName.querySelectorAll('[data-detail-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      const action = button.dataset.detailAction
      if (action === 'close') {
        closeDetailPanel()
        return
      }
      if (blockIsolationMod(mod.rel)) return
      if (blockBusyMod(mod.rel)) return
      if (action === 'rename') startRename(title, mod.rel)
      if (action === 'preview') await setModPreview(mod.rel)
      if (action === 'open') {
        const result = await window.api.openFolder(mod.rel)
        if (result && !result.ok) showToast(result.error || '打开目录失败', 'err')
      }
      if (action === 'translate') {
        if (!confirm('键位整理翻译会修改该 mod 的 ini，并更新中文注释。\n请确认文件可恢复，是否继续？')) return
        setModBusy(mod.rel, true)
        button.disabled = true
        const oldText = button.textContent
        button.textContent = '整理中…'
        try {
          const result = await window.api.translateIni(mod.rel)
          if (result.ok) {
            showToast(`键位说明已整理：${result.files || 0} 个 ini`)
            await loadData({ quiet: true })
          } else {
            showToast(result.err || '整理翻译失败', 'err')
          }
        } finally {
          button.textContent = oldText
          button.disabled = false
          setModBusy(mod.rel, false)
        }
      }
      if (action === 'watch') {
        if (!confirm('监听 ini 会启动脚本，并在按键触发时实时改写该 mod 的 ini。\n请确认文件可恢复，是否继续？')) return
        const result = await window.api.watchIni(mod.rel)
        if (!result.ok) showToast(result.err || '启动监听失败', 'err')
      }
      if (action === 'keyPopup') window.api.showKeyPopup({
        name: mod.name,
        keyBindings: mod.keyBindings || [],
      })
    })
  })
  dom.previewName.querySelectorAll('[data-key-index]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (blockIsolationMod(mod.rel)) return
      if (blockBusyMod(mod.rel)) return
      const binding = mod.keyBindings[Number(button.dataset.keyIndex)]
      const nextKey = prompt('修改按键', binding.key)
      if (!nextKey || nextKey === binding.key) return
      setModBusy(mod.rel, true)
      try {
        const result = await window.api.setModKey(mod.rel, binding, nextKey)
        if (result.ok) {
          showToast('按键已保存')
          await loadData({ quiet: true })
        } else {
          showToast('操作失败：' + (result.error || result.err || '未知错误'), 'err')
        }
      } finally {
        setModBusy(mod.rel, false)
      }
    })
  })
}

function closeDetailPanel() {
  previewRenderToken += 1
  dom.detailPreview.classList.add('hidden')
  dom.previewImg.innerHTML = ''
  dom.previewName.textContent = ''
  selectedModRel = null
  dom.modList.querySelectorAll('.mod-item.selected').forEach((item) => item.classList.remove('selected'))
}

function startRename(nameEl, rel) {
  const mod = activeGroup.mods.find((m) => m.rel === rel)
  if (!mod || nameEl.querySelector('input') || blockIsolationMod(rel) || blockBusyMod(rel)) return
  setModBusy(rel, true)

  const input = document.createElement('input')
  input.className = 'rename-input'
  input.value = mod.name
  nameEl.textContent = ''
  nameEl.appendChild(input)
  input.focus()
  input.select()

  let done = false
  const cancel = () => {
    if (done) return
    done = true
    nameEl.textContent = mod.name
    nameEl.title = mod.name
    setModBusy(rel, false)
  }

  const save = async () => {
    if (done) return
    const nextName = input.value.trim()
    if (!nextName || nextName === mod.name) {
      cancel()
      return
    }
    done = true
    input.disabled = true
    try {
      const result = await window.api.renameMod(rel, nextName, activeGroup.path)
      if (!result.ok) throw new Error(result.error || 'rename failed')
      showToast('名称已保存')
      selectedModRel = result.rel
      await loadData({ quiet: true })
    } catch (err) {
      showToast('重命名失败：' + err.message, 'err')
      nameEl.textContent = mod.name
      nameEl.title = mod.name
    } finally {
      setModBusy(rel, false)
    }
  }

  input.addEventListener('click', (e) => e.stopPropagation())
  input.addEventListener('dblclick', (e) => e.stopPropagation())
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') save()
    if (e.key === 'Escape') cancel()
  })
  input.addEventListener('blur', cancel)
}

function backToOverview() {
  dom.detailPage.classList.add('hidden')
  dom.overviewPage.classList.remove('hidden')
  activeGroup = null
  selectedModRel = null
  selectedModRels.clear()
  lastSelectedRel = null
  dom.detailPreview.classList.add('hidden')
  renderOverview()
}

// ==================== 批量操作 ====================

async function applyBatch(enable) {
  if (!activeGroup) return
  if (busyModRels.size) {
    showToast('请等当前操作完成', 'err')
    return
  }
  // 直接使用 path 作为 category（因为现在 path 就是 Mods 目录下的相对路径）
  const category = activeGroup.path
  const result = await window.api.setCategory(category, enable)
  if (!result.ok) {
    showToast('批量操作失败：' + (result.error || result.err || '未知错误'), 'err')
    return
  }
  await loadData({ quiet: true })
}

// ==================== 辅助 ====================

function cleanGroup(g) {
  return String(g).split(' / ').map((seg) => {
    let s = seg
    while (s.startsWith('DISABLED_')) s = s.slice('DISABLED_'.length)
    return s
  }).join(' / ')
}

function displayGroup(mod) {
  const group = mod.group ? cleanGroup(mod.group) : ''
  return group === mod.name ? '' : group
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}
function escapeAttr(s) {
  return escapeHtml(s)
}

function imageSrc(src) {
  const value = String(src || '')
  if (/^(https?:|data:|modimg:|assetimg:)/i.test(value)) return value
  const normalized = value.replace(/\\/g, '/')
  const encoded = normalized.split('/').map(encodeURIComponent).join('/')
  return `modimg://local/${encoded}`
}

function getModPreviewSrc(mod) {
  return mod?.preview ? imageSrc(mod.preview) : ''
}

function getModPreviewFallbacks(mod) {
  const currentPreview = getModPreviewSrc(mod)
  const slash = currentPreview.lastIndexOf('/')
  if (slash < 0) return []
  const directory = currentPreview.slice(0, slash + 1)
  return ['.JASM_Cover.png', '.JASM_Cover.webp', '.JASM_Cover.jpg', '.JASM_Cover.jpeg', 'preview.png', 'preview.webp', 'preview.jpg', 'preview.jpeg']
    .map((name) => directory + name)
}

function preloadModImages(mods) {
  const work = () => {
    for (const mod of mods.slice(0, 36)) {
      if (!mod.preview) continue
      const src = imageSrc(mod.preview)
      if (preloadedImages.has(src)) continue
      preloadedImages.add(src)
      const img = new Image()
      img.src = src
    }
  }
  if ('requestIdleCallback' in window) requestIdleCallback(work, { timeout: 800 })
  else setTimeout(work, 50)
}

let toastTimer = null
function showToast(msg, kind = 'ok') {
  dom.toast.textContent = msg
  dom.toast.className = `toast ${kind}`
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => dom.toast.classList.add('hidden'), 3000)
}

// ==================== 数据加载 ====================

async function loadData(options = {}) {
  const quiet = !!options.quiet
  if (dataLoadInFlight) {
    dataLoadQueued = true
    return dataLoadInFlight
  }
  dataLoadInFlight = (async () => {
  try {
    if (!quiet) setLoadingState(true, activeGroup ? '正在加载目录详情…' : '正在加载一级界面…')
    // 直接从 Mods 目录扫描获取1级界面数据
    const [groups, sections, isolation] = await Promise.all([
      window.api.getOverviewGroups(),
      window.api.getOverviewSections(),
      window.api.getFrameworkIsolation(),
    ])
    overviewGroups = groups
    overviewSections = Array.isArray(sections) ? sections : []
    frameworkIsolation = isolation || { active: false }
    applyOverviewOrderFromSections()

    if (activeGroup) {
      // 在 detail 界面：更新当前 group 数据
      const updated = overviewGroups.find((g) => g.path === activeGroup.path)
      if (updated) {
        activeGroup = updated
        updateDetailHeader(activeGroup)
        renderModTable()
        if (selectedModRel) {
          const selectedItem = Array.from(dom.modList.querySelectorAll('.mod-item'))
            .find((item) => item.dataset.rel === selectedModRel)
          if (selectedItem) selectMod(selectedItem, selectedModRel)
          else dom.detailPreview.classList.add('hidden')
        }
      }
    } else {
      renderOverview()
    }
  } catch (e) {
    showToast('加载失败：' + e.message, 'err')
  } finally {
    if (!quiet) setLoadingState(false)
  }
  })()
  try {
    return await dataLoadInFlight
  } finally {
    dataLoadInFlight = null
    if (dataLoadQueued) {
      dataLoadQueued = false
      return loadData()
    }
  }
}

// 监听目录变化
window.api.onModsChanged(() => {
  loadData({ quiet: true })
})

// ==================== 事件绑定 ====================

dom.search.addEventListener('input', (e) => {
  searchTerm = e.target.value.trim()
  if (!activeGroup) renderOverview()
})
dom.detailSearch.addEventListener('input', (e) => {
  detailSearchTerm = e.target.value.trim()
  if (activeGroup) renderModTable()
})
dom.detailSearchGlobal.addEventListener('click', () => {
  setDetailSearchGlobal(!detailSearchGlobal)
  dom.detailSearch.focus()
})
setDetailSearchGlobal(false, false)
function setSearchPlaceholder(focused = document.activeElement === dom.search) {
  dom.search.placeholder = focused
    ? '搜索…'
    : '搜索…  Tab/Enter 聚焦 · Del 删除 · Ctrl+C/X/V 复制剪切粘贴'
}
dom.search.addEventListener('focus', () => setSearchPlaceholder(true))
dom.search.addEventListener('blur', () => setSearchPlaceholder(false))
setSearchPlaceholder(false)

dom.btnUpdateTools.addEventListener('click', async () => {
  const originalText = dom.btnUpdateTools.textContent
  dom.btnUpdateTools.disabled = true
  try {
    dom.btnUpdateTools.textContent = '更新配置 1/3 脚本'
    const tools = await window.api.updateTools()
    if (!tools.ok) {
      showToast(tools.error || '没有找到可更新的技能文件', 'err')
      return
    }
    dom.btnUpdateTools.textContent = '更新配置 2/3 角色'
    const chars = await window.api.syncCharacters()
    dom.btnUpdateTools.textContent = '更新配置 3/3 刷新'
    await loadData({ quiet: true })
    const suffix = tools.missing?.length ? `，缺少 ${tools.missing.join('、')}` : ''
    const avatarText = chars.ok ? `，头像配置 ${chars.count} 项` : `，头像配置沿用缓存 ${chars.count || 0} 项`
    showToast(`配置已更新：脚本 ${tools.copied.length} 个文件${avatarText}${suffix}`, 'ok')
  } catch (error) {
    showToast('配置更新失败：' + error.message, 'err')
  } finally {
    dom.btnUpdateTools.textContent = originalText
    dom.btnUpdateTools.disabled = false
  }
})

document.addEventListener('click', (e) => {
  if (e.target?.id === 'btnAddOverviewSection') addOverviewSection()
})

dom.autoF10.addEventListener('change', (e) => {
  window.api.setConfig('autoF10', e.target.checked)
})

function setDetailViewMode(mode, persist = true) {
  detailViewMode = mode === 'card' ? 'card' : 'list'
  dom.btnListView.classList.toggle('active', detailViewMode === 'list')
  dom.btnCardView.classList.toggle('active', detailViewMode === 'card')
  if (persist) window.api.setConfig('detailViewMode', detailViewMode)
  if (activeGroup) {
    renderModTable()
    if (selectedModRel) {
      const selectedItem = Array.from(dom.modList.querySelectorAll('.mod-item'))
        .find((item) => item.dataset.rel === selectedModRel)
      if (selectedItem) selectMod(selectedItem, selectedModRel)
    }
  }
}

dom.btnListView.addEventListener('click', () => setDetailViewMode('list'))
dom.btnCardView.addEventListener('click', () => setDetailViewMode('card'))
dom.btnBatchMove.addEventListener('click', async () => {
  if (!activeGroup) return
  await handleBatchMove(activeGroup.path)
})
dom.btnFlatten.addEventListener('click', async () => {
  if (!activeGroup) return
  if (frameworkIsolation?.active) {
    showToast('框架隔离调试中，暂不可平整目录', 'err')
    return
  }
  if (!confirm(`确认平整当前目录：${activeGroup.path}？`)) return
  showToast('正在平整目录...')
  const result = await window.api.flattenDir(activeGroup.path)
  if (result.ok) {
    showToast('目录平整完成')
    await loadData({ quiet: true })
  } else {
    showToast('目录平整失败：' + (result.err || result.out || '未知错误'), 'err')
  }
})
document.addEventListener('click', (e) => {
  if (!e.target.closest('#batchMenu')) hideBatchMenu()
  if (!e.target.closest('#overviewMenu')) hideOverviewMenu()
})

document.addEventListener('keydown', async (e) => {
  const editingTarget = isTextEditingTarget(e.target)
  const isDetailSearchTarget = e.target === dom.detailSearch

  if (isDetailVisible() && e.key === 'Escape' && (!editingTarget || isDetailSearchTarget)) {
    e.preventDefault()
    hideBatchMenu()
    backToOverview()
    return
  }

  if (isDetailVisible() && e.key === 'F2' && (!editingTarget || isDetailSearchTarget)) {
    e.preventDefault()
    setDetailSearchGlobal(!detailSearchGlobal)
    dom.detailSearch.focus()
    return
  }

  if (isDetailVisible() && e.key === 'Tab') {
    e.preventDefault()
    const now = Date.now()
    const enableGlobal = now - lastDetailTabAt < 450
    lastDetailTabAt = now
    setDetailSearchGlobal(enableGlobal)
    dom.detailSearch.focus()
    dom.detailSearch.select()
    return
  }

  if (editingTarget) return

  if (isOverviewVisible() && (e.key === 'Tab' || e.key === 'Enter')) {
    e.preventDefault()
    dom.search.focus()
    dom.search.select()
    return
  }

  if (e.key === 'Delete') {
    e.preventDefault()
    if (isDetailVisible()) await trashSelectedMods()
    else if (isOverviewVisible()) await deleteOverviewSelection()
    return
  }

  if (!isDetailVisible() || !(e.ctrlKey || e.metaKey)) return
  const key = e.key.toLowerCase()
  if (key === 'c') {
    e.preventDefault()
    copyOrCutSelectedMods('copy')
  } else if (key === 'x') {
    e.preventDefault()
    copyOrCutSelectedMods('cut')
  } else if (key === 'v') {
    e.preventDefault()
    await pasteSelectedMods()
  }
})

async function sendF10() {
  const r = await window.api.sendF10()
  if (r.ok) showToast('已发送 F10 重载', 'ok')
  else showToast('F10 发送失败：' + (r.err || r.out || '未找到游戏'), 'err')
}
dom.btnF10.addEventListener('click', sendF10)

dom.btnRefresh.addEventListener('click', loadData)
dom.btnRefreshb.addEventListener('click', loadData)

dom.btnBack.addEventListener('click', backToOverview)

dom.rootPath.addEventListener('click', async () => {
  if (frameworkIsolation?.active) {
    showToast('请先结束框架隔离，再切换 Mods 目录', 'err')
    return
  }
  const r = await window.api.chooseRoot()
  if (r.ok) {
    dom.rootPath.textContent = r.root
    showToast('已切换 Mods 目录，正在重扫…')
    loadData({ quiet: true })
  }
})

// ==================== 初始化 ====================

async function init() {
  renderShortcutHelp()

  const { root } = await window.api.getRoot()
  dom.rootPath.textContent = root

  // 初始化 Auto F10 复选框状态
  const { value: autoF10State } = await window.api.getConfig('autoF10')
  dom.autoF10.checked = autoF10State

  const { value: savedViewMode } = await window.api.getConfig('detailViewMode')
  setDetailViewMode(savedViewMode === 'card' ? 'card' : 'list', false)

  setLoadingState(true, '正在加载一级界面...')
  await waitNextFrame()
  try {
    await loadData()
  } finally {
    clearShortcutHelp()
  }
}
init()
