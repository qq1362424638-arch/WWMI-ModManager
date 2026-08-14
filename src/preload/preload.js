// ---------- 预加载脚本：安全暴露 IPC 供渲染进程调用 ----------
// 通过 contextBridge 暴露 window.api，仅提供白名单方法，避免直接暴露 Node 能力。

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  // 获取全部 mod 数据（分类 + mod 列表）
  getMods: () => ipcRenderer.invoke('mods:get'),
  // 手动刷新
  refresh: () => ipcRenderer.invoke('mods:refresh'),
  updateTools: () => ipcRenderer.invoke('tools:update'),
  syncCharacters: () => ipcRenderer.invoke('tools:syncCharacters'),
  clearLocalDictionary: () => ipcRenderer.invoke('tools:clearLocalDictionary'),
  clearCorrectionDictionary: () => ipcRenderer.invoke('tools:clearCorrectionDictionary'),
  setTranslationCorrection: (rawKey, translation) => ipcRenderer.invoke('tools:setTranslationCorrection', rawKey, translation),
  // 切换启用状态：rel=相对路径，enable=true 启用 / false 停用
  toggleMod: (rel, enable) => ipcRenderer.invoke('mods:toggle', rel, enable),
  getFrameworkIsolation: () => ipcRenderer.invoke('frameworkIsolation:get'),
  startFrameworkIsolation: (rel) => ipcRenderer.invoke('frameworkIsolation:start', rel),
  endFrameworkIsolation: () => ipcRenderer.invoke('frameworkIsolation:end'),
  renameMod: (rel, name, groupPath) => ipcRenderer.invoke('mods:rename', rel, name, groupPath),
  setModPreview: (rel) => ipcRenderer.invoke('mods:setPreview', rel),
  setModLocked: (rel, locked) => ipcRenderer.invoke('mods:setLocked', rel, locked),
  setModFavorite: (rel, favorite) => ipcRenderer.invoke('mods:setFavorite', rel, favorite),
  setModTag: (rel, tag, groupPath) => ipcRenderer.invoke('mods:setTag', rel, tag, groupPath),
  getModTagList: (groupPath) => ipcRenderer.invoke('mods:getTagList', groupPath),
  setModTagList: (groupPath, tags, renames, colors, globals, deletedGlobals) => ipcRenderer.invoke('mods:setTagList', groupPath, tags, renames, colors, globals, deletedGlobals),
  getKeyBindings: (rel) => ipcRenderer.invoke('mods:getKeyBindings', rel),
  setModKey: (rel, binding, nextKey) => ipcRenderer.invoke('mods:setKey', rel, binding, nextKey),
  translateIni: (rel) => ipcRenderer.invoke('mods:translateIni', rel),
  watchIni: (rel) => ipcRenderer.invoke('mods:watchIni', rel),
  showKeyPopup: (payload) => ipcRenderer.invoke('keyPopup:show', payload),
  closeKeyPopup: () => ipcRenderer.invoke('keyPopup:close'),
  resizeKeyPopup: (scale) => ipcRenderer.invoke('keyPopup:resize', scale),
  fitKeyPopup: (size) => ipcRenderer.invoke('keyPopup:fit', size),
  getKeyWatchState: () => ipcRenderer.invoke('keyWatch:getState'),
  resetKeyWatchRow: (rowId) => ipcRenderer.invoke('keyWatch:resetRow', rowId),
  setKeyWatchValue: (rowId, value) => ipcRenderer.invoke('keyWatch:setValue', rowId, value),
  reloadKeyWatchGame: () => ipcRenderer.invoke('keyWatch:reloadGame'),
  closeKeyWatch: () => ipcRenderer.invoke('keyWatch:close'),
  returnKeyWatch: () => ipcRenderer.invoke('keyWatch:return'),
  flattenDir: (targetRel) => ipcRenderer.invoke('mods:flatten', targetRel),
  chooseMoveTarget: () => ipcRenderer.invoke('mods:chooseMoveTarget'),
  chooseMoveSources: () => ipcRenderer.invoke('mods:chooseMoveSources'),
  moveMods: (rels, targetDir) => ipcRenderer.invoke('mods:moveMany', rels, targetDir),
  moveSourceDirs: (targetGroupPath, sourceDirs) => ipcRenderer.invoke('mods:moveSourceDirs', targetGroupPath, sourceDirs),
  pasteMods: (rels, targetGroupPath, mode) => ipcRenderer.invoke('mods:pasteMany', rels, targetGroupPath, mode),
  trashMods: (rels) => ipcRenderer.invoke('mods:trashMany', rels),
  // 批量切换一个分类下所有 mod
  setCategory: (category, enable) => ipcRenderer.invoke('mods:setCategory', category, enable),
  // 批量切换分类下某个二级子目录的所有 mod
  setSubdir: (category, subdir, enable) => ipcRenderer.invoke('mods:setSubdir', category, subdir, enable),
  // 向游戏发送 F10 重载
  // 在资源管理器中打开 mod 文件夹
  openFolder: (rel) => ipcRenderer.invoke('mods:openFolder', rel),
  // 修改 Config（自动 F10）
  setConfig: (key, value) => ipcRenderer.invoke('config:set', key, value),
  // 获取 Config
  getConfig: (key) => ipcRenderer.invoke('config:get', key),
  setOverviewOrder: (order) => ipcRenderer.invoke('sort:setOverview', order),
  getOverviewSections: () => ipcRenderer.invoke('sort:getOverviewSections'),
  setOverviewSections: (sections) => ipcRenderer.invoke('sort:setOverviewSections', sections),
  setModOrder: (groupPath, order) => ipcRenderer.invoke('sort:setMods', groupPath, order),
  // 修改 Mods 根目录
  chooseRoot: () => ipcRenderer.invoke('mods:chooseRoot'),
  // 获取当前 root
  getRoot: () => ipcRenderer.invoke('mods:getRoot'),
  chooseWwmiRoot: () => ipcRenderer.invoke('wwmi:chooseRoot'),
  getWwmiRoot: () => ipcRenderer.invoke('wwmi:getRoot'),
  // 监听 mods 变化事件（目录监听器触发，防抖 300ms）
  onModsChanged: (cb) => ipcRenderer.on('mods:changed', (_e, data) => cb(data)),
  // 1级界面：从 Mods 目录扫描生成 groups
  getOverviewGroups: () => ipcRenderer.invoke('overview:getGroups'),
  // 选择源文件夹（导入时使用）
  chooseSourceDir: () => ipcRenderer.invoke('overview:chooseSource'),
  // 导入文件夹到指定目录
  importToDir: (targetPath, sourceDir) => ipcRenderer.invoke('overview:import', targetPath, sourceDir),
  openOverviewFolder: (groupPath) => ipcRenderer.invoke('overview:openFolder', groupPath),
  renameOverview: (groupPath, nextName) => ipcRenderer.invoke('overview:rename', groupPath, nextName),
  setOverviewPreview: (groupPath) => ipcRenderer.invoke('overview:setPreview', groupPath),
  chooseOverviewArtwork: () => ipcRenderer.invoke('overview:chooseArtwork'),
  setOverviewMeta: (groupPath, meta) => ipcRenderer.invoke('overview:setMeta', groupPath, meta),
  trashOverview: (groupPath) => ipcRenderer.invoke('overview:trash', groupPath),
  createOverviewDir: (groupPath) => ipcRenderer.invoke('overview:createDir', groupPath),
  createOverviewGrid: (name) => ipcRenderer.invoke('overview:createGrid', name),
  appRestart: () => ipcRenderer.invoke('app:restart'),
  windowMinimize: () => ipcRenderer.invoke('window:minimize'),
  windowToggleMaximize: () => ipcRenderer.invoke('window:toggleMaximize'),
  windowClose: () => ipcRenderer.invoke('window:close'),
})
