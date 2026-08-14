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
let overviewConflictSearch = false
let detailSearchTerm = ''
let detailSearchGlobal = false
let activeTagOrder = ['默认']
let activeTagColors = {}
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
const pendingModToggles = new Map()
const modToggleQueue = []
const queuedModToggleRels = new Set()
const MOD_TOGGLE_CONCURRENCY = 4
let modToggleActiveCount = 0
let modToggleRefreshTimer = null
const preloadedImages = new Set()
let previewRenderToken = 0
let modHoverPreviewEl = null
let appTooltipEl = null
let dataLoadInFlight = null
let dataLoadQueued = false
let loadingMessage = ''
let lastDetailTabAt = 0
const SEARCH_HINT = 'Tab 搜当前页'

const SHORTCUTS = [
  { key: 'Ctrl+C', scope: '二级', desc: '复制所选 mod' },
  { key: 'Ctrl+V', scope: '二级', desc: '粘贴 mod' },
  { key: 'Ctrl+X', scope: '二级', desc: '剪切所选 mod' },
  { key: 'Ctrl+A', scope: '二级', desc: '全选当前列表 mod' },
  { key: 'Delete', scope: '全局', desc: '删除当前所选项到回收站' },
  { key: 'Enter', scope: '输入框', desc: '确认当前编辑' },
  { key: 'Esc', scope: '二级', desc: '返回一级界面' },
  { key: 'Esc', scope: '输入框', desc: '取消当前编辑' },
  { key: 'F2', scope: '二级', desc: '切换全局搜索' },
  { key: 'F2', scope: '一级', desc: '切换冲突筛选' },
  { key: 'Shift+点击', scope: '二级', desc: '连续多选 mod' },
  { key: 'Tab', scope: '一级', desc: '聚焦搜索框' },
  { key: 'Tab', scope: '二级', desc: '搜索当前页并聚焦搜索框' },
  { key: 'Tab Tab', scope: '二级', desc: '开启全局搜索并聚焦搜索框' },
  { key: 'Ctrl+点击', scope: '二级', desc: '增减多选 mod' },
]

const SHORTCUT_KEY_ORDER = ['Tab', 'Tab Tab', 'Enter', 'Esc', 'F2', 'Delete', 'Ctrl+A', 'Ctrl+C', 'Ctrl+V', 'Ctrl+X', 'Ctrl+点击', 'Shift+点击']
const THEME_STORAGE_KEY = 'wwmi-modora-theme'
const APP_THEMES = new Set(['dark', 'light', 'pink'])
const APP_RESTART_RIGHT_CLICK_WINDOW_MS = 3000
let appRestartRightClickArmed = false
let appRestartRightClickTimer = null

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

function setAppTheme(theme, persist = true) {
  const nextTheme = APP_THEMES.has(theme) ? theme : 'light'
  document.body.dataset.theme = nextTheme
  document.documentElement.dataset.theme = nextTheme
  dom.themeSwitch?.querySelectorAll('[data-theme]').forEach((button) => {
    button.classList.toggle('active', button.dataset.theme === nextTheme)
  })
  if (persist) window.api.setConfig('appTheme', nextTheme)
}

function openSettingsModal() {
  dom.settingsModal?.classList.remove('hidden')
  refreshSettingsPaths()
}

function closeSettingsModal() {
  dom.settingsModal?.classList.add('hidden')
}

async function refreshSettingsPaths() {
  try {
    const [{ root: modsRoot }, { root: wwmiRoot }] = await Promise.all([
      window.api.getRoot(),
      window.api.getWwmiRoot(),
    ])
    if (dom.settingsModsPath) dom.settingsModsPath.textContent = modsRoot || ''
    if (dom.settingsWwmiPath) dom.settingsWwmiPath.textContent = wwmiRoot || ''
  } catch {
    if (dom.settingsModsPath) dom.settingsModsPath.textContent = ''
    if (dom.settingsWwmiPath) dom.settingsWwmiPath.textContent = ''
  }
}

const dom = {
  appSettings: $('#btnAppSettings'),
  settingsModal: $('#settingsModal'),
  closeSettings: $('#btnCloseSettings'),
  settingsModsPath: $('#settingsModsPath'),
  settingsWwmiPath: $('#settingsWwmiPath'),
  btnChooseModsRoot: $('#btnChooseModsRoot'),
  btnChooseWwmiRoot: $('#btnChooseWwmiRoot'),
  themeSwitch: $('#themeSwitch'),
  btnWindowMinimize: $('#btnWindowMinimize'),
  btnWindowMaximize: $('#btnWindowMaximize'),
  btnWindowClose: $('#btnWindowClose'),
  // overview
  overviewPage: $('#page-overview'),
  overviewGrid: $('#overviewGrid'),
  overviewEmpty: $('#overviewEmpty'),
  search: $('#search'),
  overviewConflictSearch: $('#overviewConflictSearch'),
  btnRefresh: $('#btnRefresh'),
  overviewTitle: $('#overviewTitle'),
  btnUpdateTools: $('#btnUpdateTools'),
  btnClearDictionary: $('#btnClearDictionary'),
  btnClearCorrectionDictionary: $('#btnClearCorrectionDictionary'),
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
  updateProgress: $('#updateProgress'),
  updateProgressText: $('#updateProgressText'),
  updateProgressCount: $('#updateProgressCount'),
  updateProgressFill: $('#updateProgressFill'),
  updateProgressSteps: $('#updateProgressSteps'),
  frameworkIsolationNotice: $('#frameworkIsolationNotice'),
  frameworkIsolationNoticeText: $('#frameworkIsolationNoticeText'),
  btnListView: $('#btnListView'),
  btnCardView: $('#btnCardView'),
  btnBatchMove: $('#btnBatchMove'),
  btnFlatten: $('#btnFlatten'),
  btnTagManager: $('#btnTagManager'),
  btnRefreshb: $('#btnRefreshb'),
  toast: $('#toast'),
}

function isModBusy(rel) {
  return busyModRels.has(rel)
}

function getModByRel(rel) {
  return activeGroup?.mods?.find((mod) => mod.rel === rel) || null
}

function getModConfirmLabel(rel) {
  const mod = getModByRel(rel)
  return String(mod?.name || rel).replace(/\s+/g, ' ').trim()
}

function getEffectiveModDisabled(modOrRel) {
  const rel = typeof modOrRel === 'string' ? modOrRel : modOrRel?.rel
  if (!rel) return false
  const pending = pendingModToggles.get(rel)
  if (pending) return !pending.desiredEnable
  const mod = typeof modOrRel === 'string' ? getModByRel(rel) : modOrRel
  return !!mod?.disabled
}

function getEffectiveModEnabled(modOrRel) {
  return !getEffectiveModDisabled(modOrRel)
}

function applyModRowState(item, disabled, pending = false) {
  if (!item) return
  const rel = item.dataset.rel
  item.classList.toggle('disabled', disabled)
  item.classList.toggle('pending-toggle', pending)
  const check = item.querySelector('.mod-check')
  if (check) check.checked = !disabled
  item.querySelectorAll('.btn-lock, .btn-favorite, .mod-tag').forEach((el) => {
    el.disabled = isModBusy(rel)
  })
}

function syncModRowState(rel) {
  dom.modList.querySelectorAll('.mod-item').forEach((item) => {
    if (item.dataset.rel !== rel) return
    applyModRowState(item, getEffectiveModDisabled(rel), pendingModToggles.has(rel))
  })
}

function updateModCounts() {
  if (!activeGroup) return
  updateDetailHeader(activeGroup)
  if (!isDetailVisible()) renderOverview()
}

function queueModToggleRefresh() {
  clearTimeout(modToggleRefreshTimer)
  modToggleRefreshTimer = setTimeout(() => {
    if (modToggleActiveCount > 0 || pendingModToggles.size > 0) return
    loadData({ quiet: true })
  }, 180)
}

function enqueueModToggle(rel, enable) {
  if (!rel) return
  const mod = getModByRel(rel)
  if (!mod) return
  const pending = pendingModToggles.get(rel) || {
    confirmedEnable: !mod.disabled,
    desiredEnable: !mod.disabled,
    running: false,
  }
  pending.desiredEnable = enable
  pendingModToggles.set(rel, pending)
  syncModRowState(rel)
  if (!pending.running && !queuedModToggleRels.has(rel)) {
    modToggleQueue.push(rel)
    queuedModToggleRels.add(rel)
    pumpModToggleQueue()
  }
}

function pumpModToggleQueue() {
  while (modToggleActiveCount < MOD_TOGGLE_CONCURRENCY && modToggleQueue.length) {
    const rel = modToggleQueue.shift()
    queuedModToggleRels.delete(rel)
    const pending = pendingModToggles.get(rel)
    if (!pending || pending.running) continue
    runQueuedModToggle(rel, pending)
  }
}

async function runQueuedModToggle(rel, pending) {
  pending.running = true
  modToggleActiveCount++
  try {
    while (true) {
      const state = pendingModToggles.get(rel)
      if (!state) return
      const targetEnable = state.desiredEnable
      if (state.confirmedEnable === targetEnable) {
        pendingModToggles.delete(rel)
        syncModRowState(rel)
        return
      }
      const result = await window.api.toggleMod(rel, targetEnable)
      if (!result.ok) {
        showToast('操作失败：' + (result.error || '未知错误'), 'err')
        pendingModToggles.delete(rel)
        syncModRowState(rel)
        await loadData({ quiet: true })
        return
      }
      state.confirmedEnable = targetEnable
      const mod = getModByRel(rel)
      if (mod) mod.disabled = !targetEnable
      syncModRowState(rel)
      updateModCounts()
    }
  } finally {
    pending.running = false
    modToggleActiveCount = Math.max(0, modToggleActiveCount - 1)
    syncModRowState(rel)
    if (!pendingModToggles.size && !modToggleQueue.length && modToggleActiveCount === 0) {
      queueModToggleRefresh()
    }
    pumpModToggleQueue()
  }
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
    item.querySelectorAll('.mod-check, .btn-lock, .btn-favorite, .mod-tag').forEach((el) => {
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
    const at = getModTag(a)
    const bt = getModTag(b)
    const ai = getTagOrderIndex(at)
    const bi = getTagOrderIndex(bt)
    if (ai !== bi) return ai - bi
    const af = a.favorite ? 1 : 0
    const bf = b.favorite ? 1 : 0
    if (af !== bf) return bf - af
    return String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hans')
  })
}

function hashText(value) {
  let hash = 2166136261
  for (const char of String(value || '')) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

const TAG_COLOR_PALETTE = [
  { bg: '#e8f2ff', border: '#82b8ff', text: '#16406c' },
  { bg: '#e9f8ef', border: '#78c99b', text: '#185132' },
  { bg: '#fff0d9', border: '#f0ad55', text: '#6a3a08' },
  { bg: '#f1ecff', border: '#aa92f3', text: '#3d2678' },
  { bg: '#e8f8f7', border: '#67c7c0', text: '#164d4a' },
  { bg: '#ffe9ef', border: '#f08aaa', text: '#6a1d38' },
  { bg: '#eef3dc', border: '#a8c65a', text: '#3d4f10' },
  { bg: '#f3ece8', border: '#c59a85', text: '#563324' },
]

function normalizeTagColor(value) {
  const colorRe = /^#[0-9a-f]{6}$/i
  if (!value || typeof value !== 'object') return null
  const bg = String(value.bg || '').trim()
  const border = String(value.border || '').trim()
  const text = String(value.text || '').trim()
  if (!colorRe.test(bg) || !colorRe.test(border) || !colorRe.test(text)) return null
  return { bg: bg.toLowerCase(), border: border.toLowerCase(), text: text.toLowerCase() }
}

function getRandomTagColor(excludeColors = {}) {
  const used = new Set(Object.values(excludeColors || {}).map((color) => normalizeTagColor(color)?.bg).filter(Boolean))
  const candidates = TAG_COLOR_PALETTE.filter((color) => !used.has(color.bg.toLowerCase()))
  const pool = candidates.length ? candidates : TAG_COLOR_PALETTE
  return { ...pool[Math.floor(Math.random() * pool.length)] }
}

function getTagStyleFromColor(color) {
  const clean = normalizeTagColor(color)
  return clean ? `--tag-bg:${clean.bg};--tag-border:${clean.border};--tag-text:${clean.text};` : '--tag-bg:transparent;--tag-border:transparent;--tag-text:var(--text-dim);'
}

function getTagStyle(tag, groupPath = activeGroup?.path) {
  const clean = getModTag({ tag })
  if (clean === DEFAULT_MOD_TAG) return '--tag-bg:transparent;--tag-border:transparent;--tag-text:var(--text-dim);'
  const saved = normalizeTagColor(activeTagColors[clean])
  if (saved) return `--tag-bg:${saved.bg};--tag-border:${saved.border};--tag-text:${saved.text};`
  const tags = [...new Set((activeGroup?.mods || []).map(getModTag).filter((item) => item !== DEFAULT_MOD_TAG))]
    .sort((a, b) => a.localeCompare(b, 'zh-Hans'))
  const index = Math.max(0, tags.indexOf(clean))
  const offset = hashText(groupPath || '') % TAG_COLOR_PALETTE.length
  const color = TAG_COLOR_PALETTE[(offset + index) % TAG_COLOR_PALETTE.length]
  return `--tag-bg:${color.bg};--tag-border:${color.border};--tag-text:${color.text};`
}

function getAvailableTags(excludeTag = '') {
  const current = getModTag({ tag: excludeTag })
  return getCurrentTagOrder().filter((tag) => tag !== current)
}

function isIsolationBlockedMod(rel) {
  return false
}

function blockIsolationMod(rel) {
  return false
}

function blockIsolationRels(rels) {
  return (rels || []).some((rel) => blockIsolationMod(rel))
}

function ensureAppTooltip() {
  if (appTooltipEl) return appTooltipEl
  appTooltipEl = document.createElement('div')
  appTooltipEl.className = 'app-tooltip hidden'
  document.body.appendChild(appTooltipEl)
  return appTooltipEl
}

function getTooltipTarget(target) {
  return target?.closest?.('[title], [data-tooltip-title]')
}

function showAppTooltip(target, x, y) {
  if (!target) return
  const title = target.getAttribute('title')
  if (title) {
    target.dataset.tooltipTitle = title
    target.removeAttribute('title')
  }
  const text = target.dataset.tooltipTitle
  if (!text) return

  const tooltip = ensureAppTooltip()
  tooltip.textContent = text
  tooltip.classList.remove('hidden')

  const gap = 16
  const pad = 12
  const rect = tooltip.getBoundingClientRect()
  let left = x + gap
  let top = y + gap
  if (left + rect.width + pad > window.innerWidth) left = x - rect.width - gap
  if (top + rect.height + pad > window.innerHeight) top = y - rect.height - gap
  tooltip.style.left = `${Math.max(pad, left)}px`
  tooltip.style.top = `${Math.max(pad, top)}px`
}

function hideAppTooltip() {
  appTooltipEl?.classList.add('hidden')
}

function applyFrameworkIsolationUi() {
  dom.modList.querySelectorAll('.mod-item').forEach((item) => {
    const rel = item.dataset.rel
    const focused = !!frameworkIsolation?.active && frameworkIsolation.targetRel === rel
    item.classList.toggle('framework-isolation-target', focused)
    item.classList.remove('isolation-blocked')
    item.querySelectorAll('.mod-check, .btn-lock').forEach((el) => {
      el.disabled = isModBusy(rel)
    })
  })
}

function isFrameworkIsolationTarget(rel) {
  return !!frameworkIsolation?.active && frameworkIsolation.targetRel === rel
}

function getFrameworkIsolationTargetInfo() {
  if (!frameworkIsolation?.active) return null
  const targetKey = frameworkIsolation.targetOrderKey || getClientModOrderKey(frameworkIsolation.targetRel)
  for (const group of overviewGroups || []) {
    const mod = (group.mods || []).find((item) => item.rel === frameworkIsolation.targetRel || item.orderKey === targetKey)
    if (mod) return { group, mod }
  }
  return null
}

function updateFrameworkIsolationNotice() {
  if (!dom.frameworkIsolationNotice) return
  const info = getFrameworkIsolationTargetInfo()
  dom.frameworkIsolationNotice.classList.toggle('hidden', !info)
  if (!info) return
  const groupName = info.group.chineseName || info.group.name || info.group.path || '未知目录'
  const modName = frameworkIsolation.targetName || info.mod.name || info.mod.rel
  dom.frameworkIsolationNoticeText.textContent = `${groupName} / ${modName}`
  positionFrameworkIsolationNotice()
}

function positionFrameworkIsolationNotice() {
  if (!dom.frameworkIsolationNotice || dom.frameworkIsolationNotice.classList.contains('hidden')) return
  dom.frameworkIsolationNotice.style.left = ''
  dom.frameworkIsolationNotice.style.right = ''
  dom.frameworkIsolationNotice.style.bottom = ''
  if (!activeGroup) {
    dom.frameworkIsolationNotice.style.right = '24px'
    dom.frameworkIsolationNotice.style.bottom = '52px'
    return
  }
  const modPane = dom.modList.closest('.detail-mods')
  if (!modPane) return
  const rect = modPane.getBoundingClientRect()
  const width = dom.frameworkIsolationNotice.offsetWidth || 360
  dom.frameworkIsolationNotice.style.left = `${Math.max(16, rect.right - width - 24)}px`
  dom.frameworkIsolationNotice.style.bottom = `${Math.max(24, window.innerHeight - rect.bottom + 24)}px`
}

function focusModRow(rel) {
  const item = Array.from(dom.modList.querySelectorAll('.mod-item')).find((el) => el.dataset.rel === rel)
  if (!item) return false
  selectedModRels = new Set([rel])
  lastSelectedRel = rel
  updateBatchSelection()
  selectMod(item, rel)
  item.scrollIntoView({ block: 'center', behavior: 'smooth' })
  return true
}

function jumpToFrameworkIsolationTarget() {
  const info = getFrameworkIsolationTargetInfo()
  if (!info) {
    showToast('未找到当前调试项，请刷新后重试', 'err')
    return
  }
  if (!activeGroup || activeGroup.path !== info.group.path) {
    openDetail(info.group, info.mod.rel)
  } else {
    focusModRow(info.mod.rel)
  }
}

function blockDisablingFrameworkIsolationTarget(rel, enable) {
  if (enable || !isFrameworkIsolationTarget(rel)) return false
  showToast('请先结束当前框架隔离，再停用正在调试的 mod', 'err')
  return true
}

// ==================== 一级界面：总纲网格 ====================

const DEFAULT_OVERVIEW_SECTION = '__default'
const DEFAULT_COVER_SRC = '../assets/default.png'
const DEFAULT_MOD_TAG = '默认'

function getModTag(mod) {
  return String(mod?.tag || DEFAULT_MOD_TAG).trim() || DEFAULT_MOD_TAG
}

function getCurrentTagOrder() {
  const used = [...new Set((activeGroup?.mods || []).map(getModTag))]
  const ordered = [DEFAULT_MOD_TAG, ...activeTagOrder.filter((tag) => tag !== DEFAULT_MOD_TAG)]
  return [...new Set([...ordered, ...used])]
}

function getTagOrderIndex(tag) {
  const order = getCurrentTagOrder()
  const index = order.indexOf(getModTag({ tag }))
  return index >= 0 ? index : Number.MAX_SAFE_INTEGER
}

async function refreshActiveTagOrder(groupPath = activeGroup?.path) {
  if (!groupPath || !window.api.getModTagList) {
    activeTagOrder = getCurrentTagOrder()
    return
  }
  const result = await window.api.getModTagList(groupPath)
  if (result?.ok && Array.isArray(result.tags)) {
    activeTagOrder = result.tags
    activeTagColors = result.colors && typeof result.colors === 'object' ? result.colors : {}
  }
}

function groupHasEnabledTagConflict(group) {
  const counts = new Map()
  for (const mod of group.mods || []) {
    if (!getEffectiveModEnabled(mod)) continue
    const tag = getModTag(mod)
    counts.set(tag, (counts.get(tag) || 0) + 1)
    if (counts.get(tag) > 1) return true
  }
  return false
}

function setOverviewConflictSearch(enabled, rerender = true) {
  overviewConflictSearch = !!enabled
  dom.overviewConflictSearch?.classList.toggle('active', overviewConflictSearch)
  dom.overviewConflictSearch?.setAttribute('aria-pressed', overviewConflictSearch ? 'true' : 'false')
  const title = overviewConflictSearch ? 'F2 关闭冲突筛选' : 'F2 开启冲突筛选'
  if (dom.overviewConflictSearch) dom.overviewConflictSearch.title = title
  setSearchPlaceholder()
  if (rerender && !activeGroup) renderOverview()
}

function renderOverview() {
  const term = normalizeSearchText(searchTerm)
  const conflictFiltered = overviewConflictSearch
    ? overviewGroups.filter(groupHasEnabledTagConflict)
    : overviewGroups
  const filtered = term
    ? conflictFiltered.filter((g) => getGroupSearchText(g).includes(term))
    : conflictFiltered

  if (filtered.length === 0) {
    dom.overviewGrid.innerHTML = ''
    dom.overviewEmpty.classList.remove('hidden')
    return
  }
  dom.overviewEmpty.classList.add('hidden')

  dom.overviewGrid.innerHTML = getOverviewRenderSections(filtered, !!term || overviewConflictSearch).map((section) => {
    const expanded = (!!term || overviewConflictSearch) ? section.groups.length > 0 : (!section.collapsed && section.groups.length > 0)
    const header = section.showHeader
      ? `<div class="overview-section-header" data-section-id="${escapeAttr(section.id)}" draggable="${section.custom ? 'true' : 'false'}">
          <button class="section-toggle" data-section-action="toggle" title="${expanded ? '折叠分组' : '展开分组'}">${expanded ? '⌄' : '›'}</button>
          <span class="section-name">${escapeHtml(section.name)}</span>
          <span class="section-count">${section.groups.length}</span>
          ${section.custom ? '<button class="section-action" data-section-action="rename" title="重命名当前分组">重命名</button><button class="section-action" data-section-action="delete" title="删除当前分组，目录不会被删除">删除</button>' : ''}
          <button class="section-action" data-section-action="create-grid" title="在本地新建一级目录，并放到当前分组最后">新建网格</button>
        </div>`
      : ''
    const cards = !expanded
      ? ''
      : `<div class="overview-section-grid" data-section-id="${escapeAttr(section.id)}">${section.groups.map((g) => renderOverviewCard(g, !term && !overviewConflictSearch, section.id)).join('')}</div>`
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
      showOverviewMenu(e.clientX, e.clientY, path)
    })
  })
  bindOverviewImageFallback()
  bindOverviewSectionHeaders()
  setupOverviewDrag(!term)
}

function bindOverviewImageFallback() {
  dom.overviewGrid.querySelectorAll('.overview-thumb-image').forEach((img) => {
    const src = img.getAttribute('src')
    if (!src) return
    const probe = new Image()
    probe.addEventListener('error', () => {
      const fallback = document.createElement('span')
      fallback.className = 'default-cover-thumb'
      fallback.setAttribute('aria-hidden', 'true')
      img.replaceWith(fallback)
    }, { once: true })
    probe.src = src
  })
}

function renderOverviewCard(g, canDrag, sectionId) {
  const en = g.mods.filter((m) => getEffectiveModEnabled(m)).length
  const tot = g.mods.length
  const isCharacterGroup = String(g.path || '').startsWith('character/')
  const hasCustomArtwork = !!g.customMeta?.artworkPath
  const artwork = isCharacterGroup
    ? (g.artwork || g.avatar || g.preview || null)
    : ((hasCustomArtwork || g.hasManualCover) ? g.artwork : (g.preview || g.artwork || g.avatar || null))
  const thumb = isDefaultCoverSrc(artwork)
    ? `<span class="default-cover-thumb" aria-hidden="true"></span>`
    : artwork
    ? renderOverviewThumbImage(imageSrc(artwork))
    : `<span class="default-cover-thumb" aria-hidden="true"></span>`
  const countText = `<div class="count-badge">${en}/${tot}</div>`
  const displayName = g.chineseName || g.name || g.path || '未命名'
  const artworkClass = ''
  const countTextFinal = g.missing
    ? `<div class="count-badge" title="配置：点击后新建本地目录">配置</div>`
    : countText
  const title = g.missing ? '配置：点击后新建本地目录' : ''
  return `<div class="folder-card ${tot === 0 ? 'is-empty' : ''} ${artwork ? 'has-artwork' : ''} ${artworkClass} ${g.missing ? 'missing' : ''}" title="${escapeAttr(title)}" data-path="${escapeAttr(g.path)}" data-order-key="${escapeAttr(g.path)}" data-section-id="${escapeAttr(sectionId)}" draggable="${canDrag && !g.missing ? 'true' : 'false'}">
      <div class="thumb">${thumb}${countTextFinal}</div>
      <div class="card-label">${escapeHtml(displayName)}</div>
    </div>`
}

function isDefaultCoverSrc(src) {
  return String(src || '').replace(/\\/g, '/').toLowerCase().includes('/assets/default.png')
}

function renderOverviewThumbImage(src) {
  const escaped = escapeAttr(src)
  return `<img class="overview-thumb-image" src="${escaped}" loading="lazy" alt="" />`
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
          || (sectionId === DEFAULT_OVERVIEW_SECTION ? { id: DEFAULT_OVERVIEW_SECTION, name: '未分组', items: [] } : null)
        if (action === 'toggle') {
          if (section) section.collapsed = !section.collapsed
          await saveOverviewLayout()
          renderOverview()
        }
        if (action === 'rename' && section) await renameOverviewSection(section)
        if (action === 'create-grid' && section) await createOverviewGridInSection(section)
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
    <button data-action="open" title="在资源管理器中打开该目录">打开目录</button>
    <button data-action="configure" title="修改一级卡片显示名称和图片">显示配置</button>
    <button data-action="rename" title="重命名该目录">重命名</button>
    <button data-action="preview" title="为该目录重新选择预览图">重新设置预览图</button>
    <button data-action="delete" title="将该目录删除到回收站">删除到回收站</button>
  `
  document.body.appendChild(menu)
  bindAutoCloseMenu(menu, hideOverviewMenu)
  menu.addEventListener('click', async (e) => {
    const action = e.target?.dataset?.action
    const group = getOverviewContextGroup(menu)
    if (!action || !group) return
    hideOverviewMenu()
    try {
      if (frameworkIsolation?.active && action !== 'open') {
        showToast('框架隔离调试中，暂不可修改目录', 'err')
        return
      }
      if (action === 'open') {
        if (group?.missing) await openOverviewGroup(group)
        else await window.api.openOverviewFolder(group.path)
      }
      if (action === 'configure') await configureOverviewMeta(group)
      if (action === 'rename') await renameOverviewGroup(group)
      if (action === 'preview') await setOverviewPreview(group)
      if (action === 'delete') await trashOverviewGroup(group)
    } catch (error) {
      showToast('操作失败：' + error.message, 'err')
    } finally {}
  })
  return menu
}

function bindAutoCloseMenu(menu, close) {
  let closeTimer = null
  menu.addEventListener('mouseenter', () => {
    clearTimeout(closeTimer)
  })
  menu.addEventListener('mouseleave', () => {
    clearTimeout(closeTimer)
    closeTimer = setTimeout(() => {
      if (!menu.matches(':hover')) close()
    }, 120)
  })
}

function positionFloatingMenu(menu, x, y) {
  const pad = 8
  const rect = menu.getBoundingClientRect()
  const left = Math.max(pad, Math.min(x, window.innerWidth - rect.width - pad))
  const top = Math.max(pad, Math.min(y, window.innerHeight - rect.height - pad))
  menu.style.left = `${left}px`
  menu.style.top = `${top}px`
}

function showOverviewMenu(x, y, path) {
  const menu = ensureOverviewMenu()
  if (path) menu.dataset.path = path
  hideBatchMenu()
  menu.classList.remove('hidden')
  positionFloatingMenu(menu, x, y)
}

function hideOverviewMenu() {
  const menu = document.querySelector('#overviewMenu')
  if (menu) menu.classList.add('hidden')
  if (menu) delete menu.dataset.path
  overviewContextPath = null
}

function getOverviewContextGroup(menu = document.querySelector('#overviewMenu')) {
  const path = menu?.dataset?.path || overviewContextPath
  if (!path) return null
  return overviewGroups.find((item) => item.path === path) || null
}

async function renameOverviewGroup(group) {
  if (!group) return
  const currentName = group.name
  const label = group.chineseName && group.chineseName !== group.name ? `（显示：${group.chineseName}）` : ''
  const nextName = await askText({
    title: `重命名实际目录名${label}`,
    value: currentName,
    confirmText: '重命名',
  })
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
          <button class="btn btn-ghost" data-meta-action="choose" title="从本地选择一张卡片图片">选择图片</button>
          <button class="btn btn-ghost" data-meta-action="clear" title="移除自定义图片并恢复自动匹配">清除图片</button>
          <button class="btn btn-ghost" data-meta-action="cancel" title="关闭窗口，不保存修改">取消</button>
          <button class="btn btn-primary" data-meta-action="save" title="保存显示名称和图片设置">保存</button>
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
  activeTagOrder = [DEFAULT_MOD_TAG, ...[...new Set((group.mods || []).map(getModTag).filter((tag) => tag !== DEFAULT_MOD_TAG))].sort((a, b) => a.localeCompare(b, 'zh-Hans'))]
  activeTagColors = {}
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
  refreshActiveTagOrder(group.path).then(() => {
    if (activeGroup?.path !== group.path) return
    sortCurrentModsByFavorite()
    renderModTable()
  }).catch(() => {})
  if (focusRel) {
    focusModRow(focusRel)
  }
  updateFrameworkIsolationNotice()
}

function updateDetailHeader(group) {
  dom.detailTitle.textContent = group.name
  const enabled = group.mods.filter((m) => getEffectiveModEnabled(m)).length
  const total = group.mods.length
  dom.detailCount.textContent = `${enabled}/${total}`
  const artwork = group.artwork || group.avatar || group.preview || ''
  const src = artwork ? imageSrc(artwork) : DEFAULT_COVER_SRC
  const img = document.createElement('img')
  img.alt = ''
  img.src = src
  img.addEventListener('error', () => {
    if (img.src.endsWith('/assets/default.png') || img.src.endsWith('\\assets\\default.png')) return
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
        <button class="btn-import-detail" id="btnBatchMoveEmpty" title="批量选择文件夹并移入当前目录">批量移入</button>
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

  const separatorIndex = mods.findIndex((m, index) => getEffectiveModDisabled(m) && index > 0 && !getEffectiveModDisabled(mods[index - 1]))
  const separatorHtml = separatorIndex >= 0
    ? `<div class="mod-state-separator ${detailViewMode === 'card' ? 'card-view' : 'list-view'}" aria-hidden="true"></div>`
    : ''
  dom.modList.innerHTML = mods.map((m, index) => {
    const extraClass = index === separatorIndex ? 'state-separator' : ''
    return `${index === separatorIndex ? separatorHtml : ''}${detailViewMode === 'card' ? renderModCard(m, extraClass) : renderModRow(m, extraClass)}`
  }).join('')
  bindModItems()
  setupModDrag()
  preloadModImages(mods)
  applyFrameworkIsolationUi()
}

function reconcilePendingModToggles() {
  if (!pendingModToggles.size) return
  const currentRels = new Set((activeGroup?.mods || []).map((mod) => mod.rel))
  for (const [rel] of pendingModToggles) {
    if (!currentRels.has(rel)) pendingModToggles.delete(rel)
  }
  if (pendingModToggles.size) {
    requestAnimationFrame(() => {
      dom.modList.querySelectorAll('.mod-item').forEach((item) => {
        const rel = item.dataset.rel
        if (!pendingModToggles.has(rel)) return
        applyModRowState(item, getEffectiveModDisabled(rel), true)
      })
      updateModCounts()
    })
  }
}

function getModSearchText(mod) {
  return [mod.name, mod.rel, mod.group, getModTag(mod)]
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
          return `<button class="global-search-item" data-search-group="${escapeAttr(group.path)}" type="button" title="进入该目录">
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
          return `<button class="global-search-item" data-search-group="${escapeAttr(group.path)}" data-search-mod="${escapeAttr(mod.rel)}" type="button" title="进入该 mod 所在目录并选中它">
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
  const disabled = getEffectiveModDisabled(m)
  const pending = pendingModToggles.has(m.rel)
  return `<div class="mod-row mod-item ${disabled ? 'disabled' : ''} ${pending ? 'pending-toggle' : ''} ${extraClass}" data-rel="${escapeAttr(m.rel)}" data-order-key="${escapeAttr(m.orderKey || m.rel)}" data-preview-src="${escapeAttr(previewSrc)}" draggable="true">
      <input type="checkbox" class="mod-check" ${disabled ? '' : 'checked'} />
      <button class="btn-lock ${m.locked ? 'locked' : ''}" title="${m.locked ? '取消锁定配置' : '锁定配置'}">${renderLockIcon(m.locked)}</button>
      <div class="mod-thumb">${thumb}</div>
      <div class="mod-info">
        <div class="mod-name" data-edit-name>${escapeHtml(m.name)}</div>
        ${group ? `<div class="mod-group">${escapeHtml(group)}</div>` : ''}
      </div>
      <span class="mod-clipboard-marker" aria-hidden="true"></span>
      ${renderModTag(m)}
      <button class="btn-favorite ${m.favorite ? 'favorited' : ''}" title="${m.favorite ? '取消收藏' : '收藏'}" aria-pressed="${m.favorite ? 'true' : 'false'}">${renderFavoriteIcon(m.favorite)}</button>
    </div>`
}

function renderModTag(m) {
  const tag = getModTag(m)
  return `<div class="mod-tag-wrap" style="${escapeAttr(getTagStyle(tag, activeGroup?.path))}">
    <button class="mod-tag" type="button" title="选择标签">${escapeHtml(tag)}</button>
  </div>`
}

function renderModCard(m, extraClass = '') {
  const previewSrc = getModPreviewSrc(m)
  const thumb = previewSrc
    ? `<img src="${escapeAttr(previewSrc)}" loading="lazy" alt="" />`
    : `<div class="no-thumb">MOD</div>`
  const group = displayGroup(m)
  const disabled = getEffectiveModDisabled(m)
  const pending = pendingModToggles.has(m.rel)
  return `<div class="mod-card mod-item ${disabled ? 'disabled' : ''} ${pending ? 'pending-toggle' : ''} ${extraClass}" data-rel="${escapeAttr(m.rel)}" data-order-key="${escapeAttr(m.orderKey || m.rel)}" data-preview-src="${escapeAttr(previewSrc)}" draggable="true">
      <div class="mod-card-image">
        ${thumb}
        <label class="mod-card-toggle">
          <input type="checkbox" class="mod-check" ${disabled ? '' : 'checked'} />
          <span></span>
        </label>
        <button class="btn-lock ${m.locked ? 'locked' : ''}" title="${m.locked ? '取消锁定配置' : '锁定配置'}">${renderLockIcon(m.locked)}</button>
        ${renderModTag(m)}
        <button class="btn-favorite ${m.favorite ? 'favorited' : ''}" title="${m.favorite ? '取消收藏' : '收藏'}" aria-pressed="${m.favorite ? 'true' : 'false'}">${renderFavoriteIcon(m.favorite)}</button>
        <span class="mod-clipboard-marker" aria-hidden="true"></span>
      </div>
      <div class="mod-card-body">
        <div class="mod-name" data-edit-name>${escapeHtml(m.name)}</div>
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
    const tagBtn = item.querySelector('.mod-tag')
    const nameEl = item.querySelector('[data-edit-name]')
    const previewSrc = item.dataset.previewSrc
    const hoverPreviewEnabled = detailViewMode !== 'card'
    applyModRowState(item, getEffectiveModDisabled(rel), pendingModToggles.has(rel))
    if (isModBusy(rel)) item.classList.add('busy')

    item.addEventListener('click', (e) => {
      if (suppressNextClick) return
      if (e.target === check || e.target === lockBtn || e.target === favoriteBtn || e.target === tagBtn || e.target.closest('.rename-input, .mod-tag-picker')) return
      if (blockIsolationMod(rel)) return
      if (blockBusyMod(rel)) return
      applySelection(item, rel, e)
      selectMod(item, rel)
    })

    item.addEventListener('mouseenter', (e) => {
      if (!hoverPreviewEnabled || !previewSrc) return
      showModHoverPreview(previewSrc, e.clientX, e.clientY)
    })
    item.addEventListener('mousemove', (e) => {
      if (!hoverPreviewEnabled || !previewSrc || modHoverPreviewEl?.classList.contains('hidden')) return
      showModHoverPreview(previewSrc, e.clientX, e.clientY)
    })
    if (hoverPreviewEnabled) item.addEventListener('mouseleave', hideModHoverPreview)

    item.addEventListener('contextmenu', (e) => {
      e.preventDefault()
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
      if (blockDisablingFrameworkIsolationTarget(rel, enable)) {
        check.checked = true
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
      enqueueModToggle(rel, enable)
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

    tagBtn?.addEventListener('click', (e) => {
      e.stopPropagation()
      if (blockBusyMod(rel)) return
      startModTagEdit(item, rel)
    })
  })
  updateBatchSelection()
}

function cleanModTagInput(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 16) || DEFAULT_MOD_TAG
}

async function saveModTag(rel, tag) {
  if (!activeGroup) return
  const nextTag = cleanModTagInput(tag)
  const targetRels = selectedModRels.size > 1 && selectedModRels.has(rel)
    ? Array.from(selectedModRels)
    : [rel]
  const targets = targetRels.map(getModByRel).filter(Boolean)
  if (!targets.length) return
  const changed = targets.filter((mod) => nextTag !== getModTag(mod))
  if (!changed.length) {
    renderModTable()
    updateBatchSelection()
    return
  }
  changed.forEach((mod) => setModBusy(mod.rel, true))
  try {
    const results = await Promise.all(changed.map((mod) => window.api.setModTag(mod.rel, nextTag, activeGroup.path)))
    const failed = results.find((result) => !result?.ok)
    if (failed) throw new Error(failed.error || 'tag failed')
    changed.forEach((mod, index) => {
      mod.tag = results[index]?.tag || nextTag
    })
    if (!activeTagOrder.includes(nextTag)) activeTagOrder.push(nextTag)
    sortCurrentModsByFavorite()
    changed.forEach((mod) => setModBusy(mod.rel, false))
    renderModTable()
    updateBatchSelection()
    showToast(changed.length > 1 ? `已批量设置 ${changed.length} 个标签` : '标签已保存')
  } catch (err) {
    changed.forEach((mod) => setModBusy(mod.rel, false))
    showToast('标签保存失败：' + err.message, 'err')
    renderModTable()
    updateBatchSelection()
  } finally {
    changed.forEach((mod) => setModBusy(mod.rel, false))
  }
}

function openTagManager() {
  if (!activeGroup) return
  const original = getCurrentTagOrder()
  let tagRows = original.map((tag) => ({
    original: tag,
    value: tag,
    editing: false,
    color: tag === DEFAULT_MOD_TAG ? null : (normalizeTagColor(activeTagColors[tag]) || getRandomTagColor(activeTagColors)),
  }))
  const modal = document.createElement('div')
  modal.className = 'text-modal'
  const commitEdit = (index, value) => {
    if (index <= 0 || !tagRows[index]) return
    const used = tagRows.map((row, rowIndex) => rowIndex === index ? '' : row.value)
    const clean = cleanModTagInput(value)
    tagRows[index].value = uniqueTagName(used, clean === DEFAULT_MOD_TAG ? '标签' : clean)
    tagRows[index].editing = false
  }
  const render = () => {
    modal.innerHTML = `
      <div class="text-dialog tag-manager-dialog">
        <div class="text-dialog-title">标签管理</div>
        <div class="tag-manager-list">
          ${tagRows.map((row, index) => `
            <div class="tag-manager-row" data-index="${index}">
              <button class="tag-manager-drag" type="button" title="拖动排序" draggable="${index > 0 ? 'true' : 'false'}" ${index === 0 ? 'disabled' : ''}>⋮⋮</button>
              <div class="tag-manager-color-sample" style="${escapeAttr(row.value === DEFAULT_MOD_TAG ? getTagStyle(row.value, activeGroup?.path) : getTagStyleFromColor(row.color))}"></div>
              <div class="tag-manager-name">
                ${row.editing
                  ? `<input class="text-dialog-input tag-manager-input" value="${escapeAttr(row.value)}" maxlength="16" autofocus />`
                  : `<button class="tag-manager-label" type="button" ${index === 0 ? 'disabled' : ''}>${escapeHtml(row.value)}</button>`}
              </div>
              <button class="btn btn-ghost tag-manager-color-btn" data-tag-action="color" ${index === 0 ? 'disabled' : ''}>随机颜色</button>
              <button class="btn btn-ghost" data-tag-action="edit" ${index === 0 ? 'disabled' : ''}>重命名</button>
              <button class="btn btn-ghost" data-tag-action="delete" ${index === 0 ? 'disabled' : ''}>删除</button>
            </div>
          `).join('')}
        </div>
        <div class="text-dialog-actions">
          <button class="btn btn-ghost" data-tag-action="add">添加</button>
          <button class="btn btn-ghost" data-tag-action="cancel">取消</button>
          <button class="btn btn-primary" data-tag-action="save">保存</button>
        </div>
      </div>`
    const input = modal.querySelector('.tag-manager-input')
    if (input) {
      input.focus()
      input.select()
    }
  }
  const syncRows = () => {
    Array.from(modal.querySelectorAll('.tag-manager-input')).forEach((input, index) => {
      const row = input.closest('.tag-manager-row')
      const rowIndex = Number(row?.dataset.index)
      if (tagRows[rowIndex]) tagRows[rowIndex].value = cleanModTagInput(input.value)
    })
    tagRows[0] = { original: DEFAULT_MOD_TAG, value: DEFAULT_MOD_TAG, editing: false, color: null }
  }
  const normalizeRowsForSave = () => {
    const used = [DEFAULT_MOD_TAG]
    tagRows = tagRows.map((row, index) => {
      if (index === 0) return { original: DEFAULT_MOD_TAG, value: DEFAULT_MOD_TAG, editing: false, color: null }
      const clean = cleanModTagInput(row.value)
      const value = uniqueTagName(used, clean === DEFAULT_MOD_TAG ? '标签' : clean)
      used.push(value)
      return { ...row, value, editing: false }
    })
  }
  const close = () => modal.remove()
  render()
  modal.addEventListener('click', async (e) => {
    const action = e.target?.dataset?.tagAction
    if (e.target === modal || action === 'cancel') {
      close()
      return
    }
    if (!action) return
    syncRows()
    const row = e.target.closest('.tag-manager-row')
    const index = Number(row?.dataset.index)
    if (action === 'add') {
      const value = uniqueTagName(tagRows.map((item) => item.value), '标签')
      const color = getRandomTagColor(Object.fromEntries(tagRows.filter((item) => item.color).map((item) => [item.value, item.color])))
      tagRows.push({ original: '', value, editing: true, color })
    }
    if (action === 'delete' && index > 0) tagRows.splice(index, 1)
    if (action === 'edit' && index > 0) tagRows[index].editing = true
    if (action === 'color' && index > 0) tagRows[index].color = getRandomTagColor(Object.fromEntries(tagRows.filter((item, rowIndex) => rowIndex !== index && item.color).map((item) => [item.value, item.color])))
    if (action === 'save') {
      normalizeRowsForSave()
      const unique = [DEFAULT_MOD_TAG]
      for (const row of tagRows) if (row.value !== DEFAULT_MOD_TAG && !unique.includes(row.value)) unique.push(row.value)
      const renames = {}
      tagRows.forEach((row) => {
        if (row.original && row.original !== row.value) renames[row.original] = row.value
      })
      const colors = {}
      tagRows.forEach((row) => {
        if (row.value !== DEFAULT_MOD_TAG && unique.includes(row.value) && row.color) colors[row.value] = row.color
      })
      const result = await window.api.setModTagList(activeGroup.path, unique, renames, colors)
      if (!result?.ok) {
        showToast(result?.error || '保存标签失败', 'err')
        return
      }
      activeTagOrder = result.tags || unique
      activeTagColors = result.colors && typeof result.colors === 'object' ? result.colors : colors
      for (const mod of activeGroup.mods || []) {
        if (renames[getModTag(mod)]) mod.tag = renames[getModTag(mod)]
        if (!activeTagOrder.includes(getModTag(mod))) mod.tag = DEFAULT_MOD_TAG
      }
      sortCurrentModsByFavorite()
      renderModTable()
      showToast('标签已保存')
      close()
      return
    }
    render()
  })
  modal.addEventListener('dblclick', (e) => {
    const label = e.target.closest('.tag-manager-label')
    const row = label?.closest('.tag-manager-row')
    const index = Number(row?.dataset.index)
    if (!label || index <= 0) return
    syncRows()
    tagRows[index].editing = true
    render()
  })
  modal.addEventListener('focusout', (e) => {
    if (!e.target.classList.contains('tag-manager-input')) return
    const row = e.target.closest('.tag-manager-row')
    const index = Number(row?.dataset.index)
    commitEdit(index, e.target.value)
    setTimeout(() => {
      if (document.body.contains(modal)) render()
    }, 80)
  })
  modal.addEventListener('keydown', (e) => {
    if (!e.target.classList.contains('tag-manager-input')) return
    if (e.key !== 'Enter') return
    e.preventDefault()
    const row = e.target.closest('.tag-manager-row')
    const index = Number(row?.dataset.index)
    commitEdit(index, e.target.value)
    render()
  })
  let draggedTagIndex = null
  modal.addEventListener('dragstart', (e) => {
    const handle = e.target.closest('.tag-manager-drag')
    const row = handle?.closest('.tag-manager-row')
    const index = Number(row?.dataset.index)
    if (!handle || !row || index <= 0) {
      e.preventDefault()
      return
    }
    syncRows()
    draggedTagIndex = index
    row.classList.add('dragging')
    e.dataTransfer.effectAllowed = 'move'
  })
  modal.addEventListener('dragover', (e) => {
    const row = e.target.closest('.tag-manager-row')
    const index = Number(row?.dataset.index)
    if (!row || index <= 0 || draggedTagIndex === null || draggedTagIndex === index) return
    e.preventDefault()
    row.classList.add('drag-over')
  })
  modal.addEventListener('dragleave', (e) => {
    e.target.closest('.tag-manager-row')?.classList.remove('drag-over')
  })
  modal.addEventListener('drop', (e) => {
    const row = e.target.closest('.tag-manager-row')
    const index = Number(row?.dataset.index)
    if (!row || index <= 0 || draggedTagIndex === null || draggedTagIndex === index) return
    e.preventDefault()
    const [moved] = tagRows.splice(draggedTagIndex, 1)
    tagRows.splice(index, 0, moved)
    draggedTagIndex = null
    modal.querySelectorAll('.dragging,.drag-over').forEach((el) => el.classList.remove('dragging', 'drag-over'))
    render()
  })
  modal.addEventListener('dragend', () => {
    draggedTagIndex = null
    modal.querySelectorAll('.dragging,.drag-over').forEach((el) => el.classList.remove('dragging', 'drag-over'))
  })
  document.body.appendChild(modal)
}

function uniqueTagName(tags, base) {
  let index = 1
  let name = base
  while (tags.includes(name)) {
    index += 1
    name = `${base}${index}`
  }
  return name
}

function startModTagEdit(item, rel) {
  const mod = getModByRel(rel)
  const wrap = item.querySelector('.mod-tag-wrap')
  if (!mod || !wrap || wrap.querySelector('.mod-tag-picker')) return
  const current = getModTag(mod)
  const options = getCurrentTagOrder()
  wrap.innerHTML = `
    <div class="mod-tag-picker">
      <button class="mod-tag" type="button" style="${escapeAttr(getTagStyle(current, activeGroup?.path))}">${escapeHtml(current)}</button>
      <div class="mod-tag-options">${options.map((tag) => `<button type="button" data-tag="${escapeAttr(tag)}" class="${tag === current ? 'active' : ''}" style="${escapeAttr(getTagStyle(tag, activeGroup?.path))}">${escapeHtml(tag)}</button>`).join('')}</div>
    </div>`
  wrap.querySelectorAll('[data-tag]').forEach((button) => {
    button.addEventListener('click', (e) => {
      e.stopPropagation()
      saveModTag(rel, button.dataset.tag || DEFAULT_MOD_TAG)
    })
  })
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
  const isMultiSelect = selectedModRels.size > 1
  items.forEach((item) => {
    item.classList.remove('batch-selected', 'batch-multi', 'batch-start', 'batch-middle', 'batch-end', 'batch-single')
    if (!selectedModRels.has(item.dataset.rel)) return
    item.classList.add('batch-selected')
    if (isMultiSelect) item.classList.add('batch-multi')
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
  updateClipboardMarkers()
}

function getSelectedModRels() {
  return selectedModRels.size ? Array.from(selectedModRels) : (selectedModRel ? [selectedModRel] : [])
}

function updateClipboardMarkers() {
  const rels = new Set(modClipboard?.rels || [])
  const mode = modClipboard?.mode === 'cut' ? 'cut' : (modClipboard?.mode === 'copy' ? 'copy' : null)
  dom.modList?.querySelectorAll('.mod-item').forEach((item) => {
    const active = mode && rels.has(item.dataset.rel)
    const marker = item.querySelector('.mod-clipboard-marker')
    item.classList.toggle('clipboard-copy', active && mode === 'copy')
    item.classList.toggle('clipboard-cut', active && mode === 'cut')
    if (marker) marker.innerHTML = active ? renderClipboardIcon(mode) : ''
  })
}

function clearModClipboard() {
  modClipboard = null
  updateClipboardMarkers()
}

function selectAllCurrentMods() {
  if (!isDetailVisible()) return
  const items = Array.from(dom.modList.querySelectorAll('.mod-item'))
  selectedModRels = new Set(items.map((item) => item.dataset.rel).filter(Boolean))
  lastSelectedRel = items.at(-1)?.dataset.rel || null
  updateBatchSelection()
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
    <button data-action="open" title="在资源管理器中打开所选 mod 目录">打开目录</button>
    <button data-action="preview" title="为所选 mod 指定预览图">指定预览图</button>
    <button data-action="enable" title="启用当前选中的 mod">启用所选</button>
    <button data-action="disable" title="停用当前选中的 mod">停用所选</button>
    <button data-action="move" title="将所选 mod 移动到其他目录">移动到...</button>
    <button data-action="delete" title="将所选 mod 删除到回收站">删除到回收站</button>
  `
  document.body.appendChild(menu)
  bindAutoCloseMenu(menu, hideBatchMenu)
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

function getContextMenuMod() {
  const rel = contextMenuRel || getSelectedModRels()[0]
  if (!rel || !activeGroup?.mods) return null
  return activeGroup.mods.find((mod) => mod.rel === rel) || null
}

function syncBatchMenu() {
  const menu = ensureBatchMenu()
  let frameworkBtn = menu.querySelector('[data-action="framework-isolate"], [data-action="framework-restore"]')
  const mod = getContextMenuMod()
  const isTarget = !!frameworkIsolation?.active && mod?.rel === frameworkIsolation.targetRel
  const isEnabled = !!mod && getEffectiveModEnabled(mod)
  const label = frameworkIsolation?.active
    ? (isTarget ? '结束框架隔离' : '切换到此项调试')
    : '框架隔离调试此项'
  const action = frameworkIsolation?.active && isTarget ? 'framework-restore' : 'framework-isolate'
  if (!frameworkBtn) {
    frameworkBtn = document.createElement('button')
    menu.insertBefore(frameworkBtn, menu.querySelector('[data-action="move"]'))
  }
  frameworkBtn.dataset.action = action
  frameworkBtn.textContent = label
  frameworkBtn.disabled = !isEnabled
  frameworkBtn.title = isEnabled ? label : '请先开启该 mod'
}

function showBatchMenu(x, y) {
  const menu = ensureBatchMenu()
  syncBatchMenu()
  hideOverviewMenu()
  menu.classList.remove('hidden')
  positionFloatingMenu(menu, x, y)
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
  const mod = activeGroup?.mods?.find((item) => item.rel === rel)
  if (!rel || blockBusyMod(rel)) return
  if (!getEffectiveModEnabled(mod)) {
    showToast('请先开启该 mod，再进行框架隔离', 'err')
    return
  }
  if (frameworkIsolation?.active && frameworkIsolation.targetRel === rel) {
    showToast('当前已在此项调试中')
    return
  }
  const targetOrderKey = getClientModOrderKey(rel)
  const previous = frameworkIsolation
    frameworkIsolation = { ...(frameworkIsolation || { active: true }), active: true, pending: true, targetOrderKey, targetRel: rel }
  applyFrameworkIsolationUi()
  updateFrameworkIsolationNotice()
  hideBatchMenu()
  showToast(frameworkIsolation?.active && previous?.active ? '正在切换框架隔离目标...' : '正在进入框架隔离...')
  try {
    const result = await window.api.startFrameworkIsolation(rel)
    if (!result.ok) {
      frameworkIsolation = previous || { active: false }
      applyFrameworkIsolationUi()
      updateFrameworkIsolationNotice()
      showToast(result.error || '框架隔离失败', 'err')
      return
    }
    frameworkIsolation = result.state || { active: true }
    applyFrameworkIsolationUi()
    updateFrameworkIsolationNotice()
    selectedModRel = rel
    showToast(previous?.active ? '已切换框架隔离目标' : '已进入框架隔离调试，其他 mod 已禁止互动')
  } catch (err) {
    frameworkIsolation = previous || { active: false }
    applyFrameworkIsolationUi()
    updateFrameworkIsolationNotice()
    showToast('框架隔离失败：' + err.message, 'err')
  }
}

async function endContextFrameworkIsolation() {
  if (!frameworkIsolation?.active) return
  const previous = frameworkIsolation
  frameworkIsolation = { active: false }
  applyFrameworkIsolationUi()
  updateFrameworkIsolationNotice()
  hideBatchMenu()
  showToast('正在结束框架隔离...')
  try {
    const result = await window.api.endFrameworkIsolation()
    if (!result.ok) {
      frameworkIsolation = previous
      applyFrameworkIsolationUi()
      updateFrameworkIsolationNotice()
      showToast(result.error || '结束隔离失败', 'err')
      return
    }
    showToast('已结束框架隔离并恢复加载范围')
  } catch (err) {
    frameworkIsolation = previous
    applyFrameworkIsolationUi()
    updateFrameworkIsolationNotice()
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
  const itemList = rels.map((rel) => `- ${getModConfirmLabel(rel)}`).join('\n')
  if (!confirm(`将以下 mod 放入回收站：\n${itemList}\n此操作可在系统回收站恢复，是否继续？`)) return
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
  if (rels.some((rel) => blockDisablingFrameworkIsolationTarget(rel, enable))) return
  if (blockIsolationRels(rels)) return
  if (hasBusyMod(rels)) {
    showToast('请等当前操作完成', 'err')
    return
  }
  const targets = rels
    .map((rel) => getModByRel(rel))
    .filter((mod) => mod && !mod.locked && (getEffectiveModDisabled(mod) !== enable || pendingModToggles.has(mod.rel)))
  if (!targets.length) {
    showToast(enable ? '所选 mod 已启用' : '所选 mod 已停用')
    return
  }
  showToast(enable ? '正在启用所选…' : '正在停用所选…')
  targets.forEach((mod) => enqueueModToggle(mod.rel, enable))
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
  const group = getOverviewContextGroup()
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
  updateClipboardMarkers()
  showToast(`${mode === 'cut' ? '已剪切' : '已复制'} ${rels.length} 个 mod`)
}

async function pasteSelectedMods() {
  if (!isDetailVisible() || !activeGroup || !modClipboard?.rels?.length) return
  if (hasBusyMod(modClipboard.rels)) {
    showToast('请等当前操作完成', 'err')
    return
  }
  const result = await window.api.pasteMods(modClipboard.rels, activeGroup.path, modClipboard.mode)
  if (!result.ok) {
    showToast('粘贴失败：' + (result.error || result.err || '未知错误'), 'err')
    return
  }
  clearModClipboard()
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

async function createOverviewGridInSection(section) {
  const name = await askText({
    title: '新建网格',
    placeholder: '文件夹名称',
    confirmText: '创建',
  })
  const cleanName = String(name || '').trim()
  if (!cleanName) return
  try {
    const result = await window.api.createOverviewGrid(cleanName)
    if (!result?.ok) {
      if (!result?.canceled) showToast(result?.error || '创建网格失败', 'err')
      return
    }
    await loadData({ quiet: true })
    overviewSections.forEach((item) => {
      item.items = (item.items || []).filter((path) => path !== result.path)
    })
    const current = overviewSections.find((item) => item.id === section.id)
    if (current) {
      current.items = [...(current.items || []), result.path]
    } else {
      const created = overviewGroups.find((group) => group.path === result.path)
      overviewGroups = overviewGroups.filter((group) => group.path !== result.path)
      if (created) overviewGroups.push(created)
    }
    await saveOverviewLayout()
    renderOverview()
    showToast(`已新建网格：${result.name}`)
  } catch (err) {
    showToast('创建网格失败：' + err.message, 'err')
  }
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
          <button class="btn btn-ghost" data-dialog-action="cancel" title="关闭窗口，不保存修改">取消</button>
          <button class="btn btn-primary" data-dialog-action="confirm" title="确认并提交当前输入">${escapeHtml(confirmText)}</button>
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
    isEnabled: (mod) => mod && getEffectiveModEnabled(mod),
    getTag: (mod) => getModTag(mod),
    isFavorite: (mod) => mod && mod.favorite,
    move: async (draggedKey, targetKey) => {
      moveItem(activeGroup.mods, draggedKey, targetKey, (mod) => mod.orderKey || mod.rel)
      renderModTable()
      await window.api.setModOrder(activeGroup.path, activeGroup.mods.map((mod) => mod.orderKey || mod.rel))
    },
  })
}

function setupDragSort({ container, itemSelector, getItem, isEnabled, getTag = () => DEFAULT_MOD_TAG, isFavorite = () => false, move }) {
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
      if (getTag(dragged) !== getTag(target)) {
        showToast('相同标签内才能手动排序')
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
  updateFrameworkIsolationNotice()
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
  if (!mod.keyBindingsLoaded && !mod.keyBindingsLoading) {
    mod.keyBindingsLoading = true
  }
  renderDetailPanel(mod)
  loadModKeyBindings(mod, renderToken)
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
  const status = getEffectiveModEnabled(mod) ? '已启用' : '已停用'
  const keys = mod.keyBindingsLoading
    ? `<div class="key-empty">正在读取键位…</div>`
    : Array.isArray(mod.keyBindings) && mod.keyBindings.length
    ? mod.keyBindings.map((binding, index) => `
        <div class="key-row">
          <button class="key-value" data-key-index="${index}" title="单击后按下新的按键或组合键">${escapeHtml(binding.displayKey || binding.key)}</button>
          ${renderKeyLabel(binding)}
        </div>`).join('')
    : `<div class="key-empty">未找到 Key 绑定</div>`

  dom.previewName.innerHTML = `
    <div class="detail-panel">
      <button class="detail-close" data-detail-action="close" title="关闭详情">×</button>
      <div class="detail-panel-eyebrow">当前 MOD</div>
      <div class="detail-panel-title" data-detail-rename title="${escapeAttr(mod.name)}">${escapeHtml(mod.name)}</div>
      <div class="detail-panel-meta">
        <span class="${getEffectiveModEnabled(mod) ? 'state-on' : 'state-off'}">${status}</span>
        ${mod.locked ? '<span class="state-lock">配置锁定</span>' : ''}
      </div>
      <div class="detail-actions">
        <button data-detail-action="rename" title="重命名当前 mod 目录">重命名</button>
        <button data-detail-action="preview" title="为当前 mod 指定预览图">指定预览图</button>
        <button data-detail-action="open" title="在资源管理器中打开当前 mod 目录">打开目录</button>
      </div>
      <div class="key-section">
        <div class="key-section-header">
          <div class="key-section-title">MOD 的按键绑定</div>
          <div class="key-section-actions">
            <button data-detail-action="translate" title="整理并修改 ini 热键中文说明">ini热键翻译修改</button>
            <button data-detail-action="watch" title="打开统一置顶窗口监听并修改 ini 热键">ini热键监听修改</button>
          </div>
        </div>
        ${keys}
      </div>
    </div>
  `
  bindDetailPanel(mod)
}

async function loadModKeyBindings(mod, renderToken) {
  if (mod.keyBindingsLoaded) return
  if (!window.api.getKeyBindings) {
    mod.keyBindingsLoading = false
    renderDetailPanel(mod)
    return
  }
  try {
    const result = await window.api.getKeyBindings(mod.rel)
    if (renderToken !== previewRenderToken || selectedModRel !== mod.rel) return
    mod.keyBindingsLoading = false
    if (result?.ok) {
      mod.keyBindings = Array.isArray(result.keyBindings) ? result.keyBindings : []
      mod.keyBindingsLoaded = true
    } else {
      showToast(result?.err || '读取键位失败', 'err')
    }
    renderDetailPanel(mod)
  } catch (err) {
    if (renderToken !== previewRenderToken || selectedModRel !== mod.rel) return
    mod.keyBindingsLoading = false
    showToast(err.message || '读取键位失败', 'err')
    renderDetailPanel(mod)
  }
}

function formatKeyLabel(binding) {
  const raw = formatRawKeyLabel(binding)
  const label = String(binding.description || '').trim()
  if (raw && label.toLowerCase() === raw.toLowerCase()) return ''
  return label || String(binding.section || 'Key').replace(/^Key/i, '')
}

function formatRawKeyLabel(binding) {
  return String(binding.rawDescription || '').trim()
}

function renderKeyLabel(binding) {
  const label = formatKeyLabel(binding)
  const raw = formatRawKeyLabel(binding)
  const showRaw = raw && raw.toLowerCase() !== String(label || '').trim().toLowerCase()
  return `
    <span class="key-label-wrap">
      ${label ? `<span class="key-label">${escapeHtml(label)}</span>` : ''}
      ${showRaw || raw ? `<button class="key-original" type="button" data-translation-raw="${escapeAttr(raw)}" data-translation-current="${escapeAttr(label)}" title="左键修正这个原词的翻译">${escapeHtml(raw)}</button>` : ''}
    </span>
  `
}

function startTranslationInlineEdit(button, mod) {
  const wrap = button.closest('.key-label-wrap')
  if (!wrap || wrap.querySelector('.key-label-edit')) return
  const raw = button.dataset.translationRaw || ''
  const current = button.dataset.translationCurrent || ''
  const label = wrap.querySelector('.key-label')
  const input = document.createElement('input')
  input.className = 'key-label key-label-edit'
  input.type = 'text'
  input.value = current
  input.placeholder = '输入中文说明'
  input.dataset.originalValue = current
  if (label) label.replaceWith(input)
  else wrap.insertBefore(input, button)
  input.focus()
  input.select()

  let saving = false
  const finish = async (save) => {
    if (saving) return
    saving = true
    const next = input.value.trim()
    if (!save || next === input.dataset.originalValue) {
      renderDetailPanel(mod)
      return
    }
    const result = await window.api.setTranslationCorrection(raw, next)
    if (!result?.ok) {
      showToast(result?.err || '保存修正失败', 'err')
      saving = false
      input.focus()
      return
    }
    showToast(next ? '翻译修正已保存' : '翻译修正已删除', 'ok')
    mod.keyBindingsLoaded = false
    mod.keyBindingsLoading = true
    renderDetailPanel(mod)
    loadModKeyBindings(mod, ++previewRenderToken)
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish(true)
    if (e.key === 'Escape') finish(false)
  })
  input.addEventListener('blur', () => finish(true))
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
        const result = await window.api.watchIni(mod.rel)
        if (!result.ok) showToast(result.err || '启动监听失败', 'err')
      }
      if (action === 'keyPopup') window.api.showKeyPopup({
        rel: mod.rel,
        name: mod.name,
        keyBindings: mod.keyBindings || [],
      })
    })
  })
  dom.previewName.querySelectorAll('[data-translation-raw]').forEach((button) => {
    button.addEventListener('click', () => startTranslationInlineEdit(button, mod))
  })
  dom.previewName.querySelectorAll('[data-key-index]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (blockIsolationMod(mod.rel)) return
      if (blockBusyMod(mod.rel)) return
      const binding = mod.keyBindings[Number(button.dataset.keyIndex)]
      const nextKey = await captureModKey(binding)
      if (!nextKey || nextKey === binding.key) return
      setModBusy(mod.rel, true)
      button.disabled = true
      try {
        const result = await window.api.setModKey(mod.rel, binding, nextKey)
        if (result.ok) {
          showToast('按键已保存')
          mod.keyBindingsLoaded = false
          mod.keyBindingsLoading = true
          renderDetailPanel(mod)
          await loadModKeyBindings(mod, previewRenderToken)
        } else {
          showToast('操作失败：' + (result.error || result.err || '未知错误'), 'err')
        }
      } finally {
        button.disabled = false
        setModBusy(mod.rel, false)
      }
    })

  })
}

function captureModKey(binding) {
  return new Promise((resolve) => {
    const modal = document.createElement('div')
    modal.className = 'key-capture-modal'
    modal.innerHTML = `
      <div class="key-capture-dialog" role="dialog" aria-modal="true">
        <div class="key-capture-title">重设按键</div>
        <div class="key-capture-current">${escapeHtml(binding.displayKey || binding.key || '未设置')}</div>
        <div class="key-capture-hint">按下新的按键或组合键，Esc 取消</div>
      </div>
    `
    let finished = false
    const finish = (value) => {
      if (finished) return
      finished = true
      document.removeEventListener('keydown', onKeyDown, true)
      modal.remove()
      resolve(value)
    }
    const onKeyDown = (event) => {
      event.preventDefault()
      event.stopPropagation()
      if (event.key === 'Escape') {
        finish(null)
        return
      }
      const nextKey = eventToModKey(event)
      if (!nextKey) return
      finish(nextKey)
    }
    modal.addEventListener('click', (event) => {
      if (event.target === modal) finish(null)
    })
    document.body.appendChild(modal)
    document.addEventListener('keydown', onKeyDown, true)
  })
}

function eventToModKey(event) {
  const base = normalizeEventKey(event)
  if (!base || ['alt', 'ctrl', 'shift', 'control', 'meta'].includes(base)) return ''
  const mods = []
  if (event.ctrlKey) mods.push('ctrl')
  if (event.altKey) mods.push('alt')
  if (event.shiftKey) mods.push('shift')
  return [...new Set(mods), base].join(' ')
}

function normalizeEventKey(event) {
  const key = String(event.key || '').trim()
  const code = String(event.code || '').trim()
  if (!key) return ''
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase()
  if (/^Digit\d$/.test(code)) return code.slice(5)
  if (/^Numpad\d$/.test(code)) return `numpad${code.slice(6)}`
  const codeMap = {
    NumpadAdd: 'numpad+',
    NumpadSubtract: 'numpad-',
    NumpadMultiply: 'numpad*',
    NumpadDivide: 'numpad/',
    NumpadDecimal: 'numpad.',
    ArrowUp: 'VK_UP',
    ArrowDown: 'VK_DOWN',
    ArrowLeft: 'VK_LEFT',
    ArrowRight: 'VK_RIGHT',
    Space: 'VK_SPACE',
    Enter: 'VK_RETURN',
    Tab: 'VK_TAB',
    Backspace: 'VK_BACK',
    Delete: 'VK_DELETE',
    Insert: 'VK_INSERT',
    Home: 'VK_HOME',
    End: 'VK_END',
    PageUp: 'VK_PRIOR',
    PageDown: 'VK_NEXT',
  }
  if (codeMap[code]) return codeMap[code]
  if (/^F\d{1,2}$/i.test(key)) return `VK_${key.toUpperCase()}`
  if (key.length === 1) return key.toLowerCase()
  return key.toLowerCase()
}

function closeDetailPanel() {
  previewRenderToken += 1
  hideModHoverPreview()
  dom.detailPreview.classList.add('hidden')
  dom.previewImg.innerHTML = ''
  dom.previewName.textContent = ''
  selectedModRel = null
  dom.modList.querySelectorAll('.mod-item.selected').forEach((item) => item.classList.remove('selected'))
  updateFrameworkIsolationNotice()
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
  hideModHoverPreview()
  dom.detailPage.classList.add('hidden')
  dom.overviewPage.classList.remove('hidden')
  activeGroup = null
  selectedModRel = null
  selectedModRels.clear()
  lastSelectedRel = null
  dom.detailPreview.classList.add('hidden')
  renderOverview()
  updateFrameworkIsolationNotice()
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

function renderLockIcon(locked) {
  return locked
    ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 11V8a5 5 0 0 1 10 0v3"/><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M12 14v3"/></svg>`
    : `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 11V8a5 5 0 0 1 4-4"/><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M12 14v3"/></svg>`
}

function renderFavoriteIcon(favorited) {
  return favorited
    ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 17.2 6.9 20l1-5.7L3.7 10l5.8-.8L12 3.9l2.5 5.3 5.8.8-4.2 4.3 1 5.7z"/></svg>`
    : `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.9 14.5 9.2 20.3 10l-4.2 4.3 1 5.7L12 17.2 6.9 20l1-5.7L3.7 10l5.8-.8z"/></svg>`
}

function renderClipboardIcon(mode) {
  return mode === 'cut'
    ? `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.2 8.2 19 19"/><path d="M8.2 15.8 19 5"/></svg>`
    : `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"/></svg>`
}

function ensureModHoverPreview() {
  if (modHoverPreviewEl) return modHoverPreviewEl
  modHoverPreviewEl = document.createElement('div')
  modHoverPreviewEl.className = 'mod-hover-preview hidden'
  modHoverPreviewEl.innerHTML = '<img alt="" />'
  document.body.appendChild(modHoverPreviewEl)
  return modHoverPreviewEl
}

function hideModHoverPreview() {
  modHoverPreviewEl?.classList.add('hidden')
}

function showModHoverPreview(src, x, y) {
  if (!src) {
    hideModHoverPreview()
    return
  }
  const panel = ensureModHoverPreview()
  const img = panel.querySelector('img')
  if (img.src !== src) img.src = src
  panel.classList.remove('hidden')

  const maxW = Math.min(520, Math.max(280, Math.floor(window.innerWidth * 0.32)))
  const maxH = Math.min(720, Math.max(320, Math.floor(window.innerHeight * 0.72)))
  panel.style.maxWidth = `${maxW}px`
  panel.style.maxHeight = `${maxH}px`
  img.style.maxWidth = `${maxW}px`
  img.style.maxHeight = `${maxH}px`

  const pad = 24
  const gap = 40
  let left = x + gap
  let top = y - Math.round(maxH * 0.28)
  if (left + maxW + pad > window.innerWidth) left = x - maxW - gap
  if (left < pad) left = pad
  if (top + maxH + pad > window.innerHeight) top = window.innerHeight - maxH - pad
  if (top < pad) top = pad
  panel.style.left = `${left}px`
  panel.style.top = `${top}px`
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

const UPDATE_CONFIG_STEPS = [
  { key: 'tools', title: '更新脚本文件', desc: '复制技能脚本与工具文件' },
  { key: 'characters', title: '同步角色配置', desc: '更新角色名称、头像与缓存配置' },
  { key: 'refresh', title: '刷新目录数据', desc: '重新扫描 Mods 列表并刷新界面' },
]

let updateProgressHideTimer = null
let updateProgressActiveKey = 'tools'
function setUpdateProgress(activeKey, status = 'running', message = '') {
  if (!dom.updateProgress) return
  clearTimeout(updateProgressHideTimer)

  const activeIndex = Math.max(0, UPDATE_CONFIG_STEPS.findIndex((step) => step.key === activeKey))
  updateProgressActiveKey = UPDATE_CONFIG_STEPS[activeIndex]?.key || 'tools'
  const completedCount = status === 'done'
    ? UPDATE_CONFIG_STEPS.length
    : status === 'error'
      ? activeIndex
      : activeIndex
  const displayCount = Math.min(completedCount + (status === 'running' ? 1 : 0), UPDATE_CONFIG_STEPS.length)

  dom.updateProgress.classList.remove('hidden', 'done', 'error')
  dom.updateProgress.classList.toggle('done', status === 'done')
  dom.updateProgress.classList.toggle('error', status === 'error')
  dom.updateProgressText.textContent = message || UPDATE_CONFIG_STEPS[activeIndex]?.desc || '正在处理'
  dom.updateProgressCount.textContent = `${displayCount}/${UPDATE_CONFIG_STEPS.length}`
  dom.updateProgressFill.style.width = `${Math.round((displayCount / UPDATE_CONFIG_STEPS.length) * 100)}%`

  dom.updateProgressSteps.innerHTML = UPDATE_CONFIG_STEPS.map((step, index) => {
    const stepStatus = status === 'error' && index === activeIndex
      ? 'error'
      : status === 'done' || index < activeIndex
        ? 'done'
        : index === activeIndex
          ? 'active'
          : 'pending'
    return `
      <div class="update-progress-step ${stepStatus}" data-key="${escapeAttr(step.key)}">
        <span class="update-step-mark"></span>
        <div>
          <div class="update-step-title">${escapeHtml(step.title)}</div>
          <div class="update-step-desc">${escapeHtml(step.desc)}</div>
        </div>
      </div>
    `
  }).join('')
}

function finishUpdateProgress(status, message) {
  setUpdateProgress(status === 'error' ? updateProgressActiveKey : 'refresh', status, message)
  updateProgressHideTimer = setTimeout(() => {
    dom.updateProgress?.classList.add('hidden')
  }, status === 'error' ? 5200 : 3200)
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
    updateFrameworkIsolationNotice()

    if (activeGroup) {
      // 在 detail 界面：更新当前 group 数据
      const updated = overviewGroups.find((g) => g.path === activeGroup.path)
      if (updated) {
        activeGroup = updated
        updateDetailHeader(activeGroup)
        renderModTable()
        reconcilePendingModToggles()
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
    updateFrameworkIsolationNotice()
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
      return loadData({ quiet })
    }
  }
}

// 监听目录变化
window.api.onModsChanged(() => {
  loadData({ quiet: true })
})

window.addEventListener('resize', positionFrameworkIsolationNotice)

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
dom.overviewConflictSearch?.addEventListener('click', () => {
  setOverviewConflictSearch(!overviewConflictSearch)
  dom.search.focus()
})
dom.frameworkIsolationNotice?.addEventListener('click', jumpToFrameworkIsolationTarget)
setDetailSearchGlobal(false, false)
function setSearchPlaceholder(focused = document.activeElement === dom.search) {
  dom.search.placeholder = overviewConflictSearch ? 'Tab 搜当前页 · F2 关闭冲突' : SEARCH_HINT
  dom.search.title = overviewConflictSearch ? 'Tab 搜当前页，F2 关闭冲突筛选' : SEARCH_HINT
}
dom.search.addEventListener('focus', () => setSearchPlaceholder(true))
dom.search.addEventListener('blur', () => setSearchPlaceholder(false))
setSearchPlaceholder(false)

dom.btnUpdateTools.addEventListener('click', async () => {
  const originalText = dom.btnUpdateTools.textContent
  dom.btnUpdateTools.disabled = true
  try {
    setUpdateProgress('tools', 'running', '正在检查内置脚本')
    const tools = await window.api.updateTools()
    if (!tools.ok) {
      showToast(tools.error || '内置脚本检查失败', 'err')
      finishUpdateProgress('error', tools.error || '内置脚本检查失败')
      return
    }
    setUpdateProgress('characters', 'running', '正在同步角色配置')
    const chars = await window.api.syncCharacters()
    setUpdateProgress('refresh', 'running', '正在刷新目录数据')
    await loadData({ quiet: true })
    const suffix = tools.missing?.length ? `，缺少 ${tools.missing.join('、')}` : ''
    const avatarText = chars.ok ? `，头像配置 ${chars.count} 项` : `，头像配置沿用缓存 ${chars.count || 0} 项`
    showToast(`配置已更新：内置脚本${avatarText}${suffix}`, 'ok')
    finishUpdateProgress('done', `完成：内置脚本${avatarText}${suffix}`)
  } catch (error) {
    showToast('配置更新失败：' + error.message, 'err')
    finishUpdateProgress('error', '失败：' + error.message)
  } finally {
    dom.btnUpdateTools.textContent = originalText
    dom.btnUpdateTools.disabled = false
  }
})

function reloadSelectedModKeyBindings() {
  const mod = getModByRel(selectedModRel)
  if (!mod) return
  mod.keyBindingsLoaded = false
  mod.keyBindingsLoading = true
  renderDetailPanel(mod)
  loadModKeyBindings(mod, ++previewRenderToken)
}

dom.btnClearDictionary.addEventListener('click', async () => {
  if (!confirm('确定清空网络翻译词典？\n之后会重新记录新遇到的词条。')) return
  const originalText = dom.btnClearDictionary.textContent
  dom.btnClearDictionary.disabled = true
  dom.btnClearDictionary.textContent = '清空中...'
  try {
    const result = await window.api.clearLocalDictionary()
    if (!result?.ok) {
      showToast(result?.error || '清空词典失败', 'err')
      return
    }
    showToast(`网络词典已清空：${result.cleared || 0} 个词条`, 'ok')
    reloadSelectedModKeyBindings()
  } catch (error) {
    showToast('清空词典失败：' + error.message, 'err')
  } finally {
    dom.btnClearDictionary.textContent = originalText
    dom.btnClearDictionary.disabled = false
  }
})

dom.btnClearCorrectionDictionary?.addEventListener('click', async () => {
  if (!confirm('确定清空修正翻译词典？\n键位说明会重新回到网络词典或内置翻译结果。')) return
  const originalText = dom.btnClearCorrectionDictionary.textContent
  dom.btnClearCorrectionDictionary.disabled = true
  dom.btnClearCorrectionDictionary.textContent = '清空中...'
  try {
    const result = await window.api.clearCorrectionDictionary()
    if (!result?.ok) {
      showToast(result?.error || '清空修正失败', 'err')
      return
    }
    showToast(`修正词典已清空：${result.cleared || 0} 个词条`, 'ok')
    reloadSelectedModKeyBindings()
  } catch (error) {
    showToast('清空修正失败：' + error.message, 'err')
  } finally {
    dom.btnClearCorrectionDictionary.textContent = originalText
    dom.btnClearCorrectionDictionary.disabled = false
  }
})

document.addEventListener('click', (e) => {
  if (e.target?.id === 'btnAddOverviewSection') addOverviewSection()
})

dom.themeSwitch?.addEventListener('click', (e) => {
  const button = e.target.closest('[data-theme]')
  if (!button) return
  setAppTheme(button.dataset.theme)
})

dom.appSettings?.addEventListener('click', openSettingsModal)
dom.appSettings?.addEventListener('contextmenu', (e) => e.preventDefault())
dom.appSettings?.addEventListener('pointerdown', async (e) => {
  if (e.button !== 2) return
  e.preventDefault()
  if (appRestartRightClickArmed) {
    appRestartRightClickArmed = false
    clearTimeout(appRestartRightClickTimer)
    await window.api.appRestart()
    return
  }
  appRestartRightClickArmed = true
  showToast('再次右键星星将退出并重启', 'ok')
  clearTimeout(appRestartRightClickTimer)
  appRestartRightClickTimer = setTimeout(() => {
    appRestartRightClickArmed = false
  }, APP_RESTART_RIGHT_CLICK_WINDOW_MS)
})
dom.closeSettings?.addEventListener('click', closeSettingsModal)
dom.settingsModal?.addEventListener('click', (e) => {
  if (e.target === dom.settingsModal) closeSettingsModal()
})
dom.btnChooseModsRoot?.addEventListener('click', async () => {
  if (frameworkIsolation?.active) {
    showToast('请先结束框架隔离，再切换 Mods 目录', 'err')
    return
  }
  const r = await window.api.chooseRoot()
  if (r.ok) {
    await refreshSettingsPaths()
    showToast('已切换 Mods 目录，正在重扫…')
    loadData({ quiet: true })
  }
})
dom.btnChooseWwmiRoot?.addEventListener('click', async () => {
  if (frameworkIsolation?.active) {
    showToast('请先结束框架隔离，再切换 WWMI 目录', 'err')
    return
  }
  const r = await window.api.chooseWwmiRoot()
  if (r.ok) {
    await refreshSettingsPaths()
    showToast('已设置 WWMI 目录', 'ok')
  }
})
dom.btnWindowMinimize?.addEventListener('click', () => window.api.windowMinimize())
dom.btnWindowMaximize?.addEventListener('click', () => window.api.windowToggleMaximize())
dom.btnWindowClose?.addEventListener('click', () => window.api.windowClose())

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
dom.btnTagManager?.addEventListener('click', openTagManager)
dom.btnFlatten.addEventListener('click', async () => {
  if (!activeGroup) return
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
  if (!e.target.closest('.mod-tag-wrap') && dom.modList.querySelector('.mod-tag-picker')) renderModTable()
  hideAppTooltip()
})

document.addEventListener('pointerover', (e) => {
  const target = getTooltipTarget(e.target)
  if (target) showAppTooltip(target, e.clientX, e.clientY)
})

document.addEventListener('pointermove', (e) => {
  const target = getTooltipTarget(e.target)
  if (target && appTooltipEl && !appTooltipEl.classList.contains('hidden')) {
    showAppTooltip(target, e.clientX, e.clientY)
  }
})

document.addEventListener('pointerout', (e) => {
  const target = getTooltipTarget(e.target)
  if (!target) return
  const nextTarget = e.relatedTarget instanceof Element ? getTooltipTarget(e.relatedTarget) : null
  if (nextTarget === target) return
  hideAppTooltip()
})

window.addEventListener('blur', hideAppTooltip)
window.addEventListener('scroll', hideAppTooltip, true)

document.addEventListener('focusin', (e) => {
  const target = getTooltipTarget(e.target)
  if (!target) return
  const rect = target.getBoundingClientRect()
  showAppTooltip(target, rect.left + rect.width / 2, rect.bottom)
})

document.addEventListener('focusout', hideAppTooltip)

document.addEventListener('keydown', async (e) => {
  if (e.key === 'Escape' && dom.settingsModal && !dom.settingsModal.classList.contains('hidden')) {
    e.preventDefault()
    closeSettingsModal()
    return
  }

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

  if (isOverviewVisible() && e.key === 'F2' && !editingTarget) {
    e.preventDefault()
    setOverviewConflictSearch(!overviewConflictSearch)
    dom.search.focus()
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

  if (isOverviewVisible() && e.key === 'Tab') {
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
  } else if (key === 'a') {
    e.preventDefault()
    selectAllCurrentMods()
  } else if (key === 'x') {
    e.preventDefault()
    copyOrCutSelectedMods('cut')
  } else if (key === 'v') {
    e.preventDefault()
    await pasteSelectedMods()
  }
})

dom.btnRefresh.addEventListener('click', () => loadData({ quiet: false }))
dom.btnRefreshb.addEventListener('click', () => loadData({ quiet: false }))

dom.btnBack.addEventListener('click', backToOverview)

// ==================== 初始化 ====================

async function init() {
  const { value: savedTheme } = await window.api.getConfig('appTheme')
  const legacyTheme = localStorage.getItem(THEME_STORAGE_KEY)
  const initialTheme = APP_THEMES.has(savedTheme) ? savedTheme : (APP_THEMES.has(legacyTheme) ? legacyTheme : 'light')
  setAppTheme(initialTheme, !APP_THEMES.has(savedTheme) && APP_THEMES.has(legacyTheme))
  renderShortcutHelp()

  await refreshSettingsPaths()

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
