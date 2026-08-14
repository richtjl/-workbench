/* ==========================================
   自律工作台 v2 — 核心应用
   8大模块：专注/任务/习惯/记账/心情/纪念币/统计/运动
   桌面互动人物 · 雾矢葵
   ========================================== */

/* ========== IndexedDB（大文件存储） ========== */
const IDB = {
  db: null,

  async open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('self_discipline_v2', 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('moodMedia')) {
          db.createObjectStore('moodMedia', { keyPath: 'id' });
        }
      };
      req.onsuccess = (e) => { this.db = e.target.result; resolve(this.db); };
      req.onerror = (e) => { console.error('IDB open error', e); resolve(null); };
    });
  },

  async put(store, obj) {
    if (!this.db) await this.open();
    if (!this.db) return;
    return new Promise((resolve) => {
      const tx = this.db.transaction(store, 'readwrite');
      tx.objectStore(store).put(obj);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  },

  async get(store, id) {
    if (!this.db) await this.open();
    if (!this.db) return null;
    return new Promise((resolve) => {
      const tx = this.db.transaction(store, 'readonly');
      const req = tx.objectStore(store).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  },

  async delete(store, id) {
    if (!this.db) await this.open();
    if (!this.db) return;
    return new Promise((resolve) => {
      const tx = this.db.transaction(store, 'readwrite');
      tx.objectStore(store).delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  },

  async getAll(store) {
    if (!this.db) await this.open();
    if (!this.db) return [];
    return new Promise((resolve) => {
      const tx = this.db.transaction(store, 'readonly');
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  },
};

/* ========== 数据存储层 v2 ========== */
const DB = {
  KEY: 'self_discipline_app_data_v2',
  OLD_KEY: 'self_discipline_app_data',

  defaults: {
    version: 2,
    coins: 0,
    coinHistory: [],
    timerHistory: [],
    tasks: {},
    goals: [],
    habits: [],
    graceCards: { count: 1, usedDates: [], lastResetMonth: null },
    tags: [],
    finance: {
      records: [],
      accounts: [
        { id: 'default', name: '默认账户', balance: 0 }
      ],
      categories: {
        expense: [
          {id:'food',name:'餐饮',icon:'🍜'},
          {id:'transport',name:'交通',icon:'🚌'},
          {id:'shopping',name:'购物',icon:'🛍️'},
          {id:'entertainment',name:'娱乐',icon:'🎮'},
          {id:'housing',name:'居家',icon:'🏠'},
          {id:'medical',name:'医疗',icon:'💊'},
          {id:'education',name:'学习',icon:'📚'},
          {id:'other_exp',name:'其他',icon:'📌'},
        ],
        income: [
          {id:'salary',name:'工资',icon:'💼'},
          {id:'bonus',name:'奖金',icon:'🎁'},
          {id:'investment',name:'理财',icon:'📈'},
          {id:'gift',name:'红包',icon:'🧧'},
          {id:'other_inc',name:'其他',icon:'📌'},
        ]
      }
    },
    moods: {},
    exercise: {
      records: [],
      types: [
        {id:'running',name:'跑步',icon:'🏃'},
        {id:'walking',name:'步行',icon:'🚶'},
        {id:'cycling',name:'骑行',icon:'🚴'},
        {id:'swimming',name:'游泳',icon:'🏊'},
        {id:'gym',name:'健身',icon:'🏋️'},
        {id:'yoga',name:'瑜伽',icon:'🧘'},
        {id:'basketball',name:'篮球',icon:'🏀'},
        {id:'other',name:'其他',icon:'🏅'},
      ],
      weights: [],
    },
    settings: {
      soundEnabled: true,
      vibrateEnabled: true,
      coinReward: 3,
      coinPenalty: 2,
      sidebarCollapsed: false,
      companionEnabled: true,
      companionName: '雾矢葵',
    },
    reminders: [],
    currentPage: 'timer',
  },

  data: null,

  load() {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (raw) {
        this.data = JSON.parse(raw);
        this._mergeDefaults();
      } else {
        this.data = JSON.parse(JSON.stringify(this.defaults));
        Migration.fromV1(this.data);
      }
    } catch(e) {
      console.error('Load error:', e);
      this.data = JSON.parse(JSON.stringify(this.defaults));
    }
    return this.data;
  },

  _mergeDefaults() {
    this.data = { ...this.defaults, ...this.data };
    this.data.settings = { ...this.defaults.settings, ...(this.data.settings || {}) };
    this.data.graceCards = { ...this.defaults.graceCards, ...(this.data.graceCards || {}) };
    if (!this.data.finance) this.data.finance = JSON.parse(JSON.stringify(this.defaults.finance));
    if (!this.data.finance.categories) this.data.finance.categories = this.defaults.finance.categories;
    if (!this.data.exercise) this.data.exercise = JSON.parse(JSON.stringify(this.defaults.exercise));
    if (!this.data.moods) this.data.moods = {};
    if (!this.data.coinHistory) this.data.coinHistory = [];
  },

  save() {
    try {
      localStorage.setItem(this.KEY, JSON.stringify(this.data));
    } catch(e) {
      console.error('Save error:', e);
      Toast.show('保存失败，存储空间可能不足', 'error');
    }
  },

  addCoins(n, reason) {
    this.data.coins = Math.max(0, this.data.coins + n);
    this.data.coinHistory.unshift({
      id: this.uid(),
      amount: n,
      reason: reason || '',
      date: Utils.nowStr(),
    });
    if (this.data.coinHistory.length > 200) {
      this.data.coinHistory = this.data.coinHistory.slice(0, 200);
    }
    this.save();
  },

  export() {
    return JSON.stringify(this.data, null, 2);
  },

  import(jsonStr) {
    try {
      const imported = JSON.parse(jsonStr);
      this.data = { ...this.defaults, ...imported };
      this.data.settings = { ...this.defaults.settings, ...(imported.settings || {}) };
      this.data.graceCards = { ...this.defaults.graceCards, ...(imported.graceCards || {}) };
      if (!imported.finance) {
        this.data.finance = JSON.parse(JSON.stringify(this.defaults.finance));
      } else {
        this.data.finance = {
          records: Array.isArray(imported.finance.records) ? imported.finance.records : [],
          accounts: Array.isArray(imported.finance.accounts) ? imported.finance.accounts : this.defaults.finance.accounts,
          categories: imported.finance.categories || this.defaults.finance.categories,
        };
      }
      if (!imported.exercise) {
        this.data.exercise = JSON.parse(JSON.stringify(this.defaults.exercise));
      } else {
        this.data.exercise = {
          records: Array.isArray(imported.exercise.records) ? imported.exercise.records : [],
          types: imported.exercise.types || this.defaults.exercise.types,
          weights: Array.isArray(imported.exercise.weights) ? imported.exercise.weights : [],
        };
      }
      this.data.moods = imported.moods || {};
      this.data.coinHistory = Array.isArray(imported.coinHistory) ? imported.coinHistory : [];
      if (!Array.isArray(this.data.timerHistory)) this.data.timerHistory = [];
      if (!Array.isArray(this.data.goals)) this.data.goals = [];
      if (!Array.isArray(this.data.habits)) this.data.habits = [];
      if (!Array.isArray(this.data.tags)) this.data.tags = [];
      if (!Array.isArray(this.data.reminders)) this.data.reminders = [];
      if (typeof this.data.tasks !== 'object' || this.data.tasks === null) this.data.tasks = {};
      if (typeof this.data.coins !== 'number') this.data.coins = 0;
      this.save();
      return true;
    } catch(e) {
      return false;
    }
  },

  uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  },
};

/* ========== v1 → v2 数据迁移 ========== */
const Migration = {
  fromV1(v2data) {
    try {
      const raw = localStorage.getItem(DB.OLD_KEY);
      if (!raw) return;
      const v1 = JSON.parse(raw);

      v2data.coins = typeof v1.coins === 'number' ? v1.coins : 0;
      v2data.timerHistory = Array.isArray(v1.timerHistory) ? v1.timerHistory : [];
      v2data.tasks = (typeof v1.tasks === 'object' && v1.tasks) ? v1.tasks : {};
      v2data.goals = Array.isArray(v1.goals) ? v1.goals : [];
      v2data.habits = Array.isArray(v1.habits) ? v1.habits : [];
      v2data.tags = Array.isArray(v1.tags) ? v1.tags : [];
      v2data.reminders = Array.isArray(v1.reminders) ? v1.reminders : [];
      if (v1.graceCards) v2data.graceCards = { ...v2data.graceCards, ...v1.graceCards };
      if (v1.settings) v2data.settings = { ...v2data.settings, ...v1.settings };
      if (v1.finance) {
        v2data.finance = {
          records: Array.isArray(v1.finance.records) ? v1.finance.records : [],
          accounts: Array.isArray(v1.finance.accounts) ? v1.finance.accounts : v2data.finance.accounts,
          categories: v1.finance.categories || v2data.finance.categories,
        };
      }
      v2data.coinHistory = [];
      v2data.save();
      Toast.show('已从旧版迁移数据 ✨', 'success');
    } catch(e) {
      console.error('Migration error:', e);
    }
  },
};

/* ========== 工具函数 ========== */
const Utils = {
  _audioCtx: null,

  escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  nowStr() {
    return new Date().toISOString();
  },

  todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },

  monthStr(dateStr) {
    return dateStr ? dateStr.slice(0, 7) : '';
  },

  formatDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  },

  formatTime(isoStr) {
    const d = new Date(isoStr);
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  },

  formatDateCN(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${d.getMonth()+1}月${d.getDate()}日`;
  },

  formatDuration(minutes) {
    if (minutes < 60) return `${minutes}分`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}时${m}分` : `${h}时`;
  },

  getAudioCtx() {
    if (!this._audioCtx) {
      try {
        this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch(e) { return null; }
    }
    return this._audioCtx;
  },

  playSound(type) {
    if (!DB.data.settings.soundEnabled) return;
    const ctx = this.getAudioCtx();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const notes = type === 'complete' ? [523, 659, 784] : type === 'fail' ? [400, 300] : [523, 659];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0, now + i * 0.15);
        gain.gain.linearRampToValueAtTime(0.15, now + i * 0.15 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.3);
        osc.start(now + i * 0.15);
        osc.stop(now + i * 0.15 + 0.3);
      });
    } catch(e) {}
  },

  vibrate(pattern) {
    if (!DB.data.settings.vibrateEnabled) return;
    if (navigator.vibrate) navigator.vibrate(pattern);
  },
};

/* ========== Toast ========== */
const Toast = {
  show(msg, type) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => el.remove(), 2500);
  },
};

/* ========== 弹窗 ========== */
const Modal = {
  show(html) {
    const overlay = document.getElementById('modal-overlay');
    const content = document.getElementById('modal-content');
    content.innerHTML = html;
    overlay.classList.remove('hidden');
  },

  close() {
    document.getElementById('modal-overlay').classList.add('hidden');
  },

  confirm(title, body, onConfirm, confirmText, cancelText) {
    this.show(`
      <div class="modal-title">${Utils.escapeHtml(title)}</div>
      <div class="modal-body">${Utils.escapeHtml(body)}</div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Modal.close()">${Utils.escapeHtml(cancelText || '取消')}</button>
        <button class="btn btn-primary" id="modal-confirm-btn">${Utils.escapeHtml(confirmText || '确定')}</button>
      </div>
    `);
    document.getElementById('modal-confirm-btn').onclick = () => {
      Modal.close();
      if (onConfirm) onConfirm();
    };
  },

  alert(title, body, onClose) {
    this.show(`
      <div class="modal-title">${Utils.escapeHtml(title)}</div>
      <div class="modal-body">${Utils.escapeHtml(body)}</div>
      <div class="modal-actions">
        <button class="btn btn-primary" id="modal-alert-btn">知道了</button>
      </div>
    `);
    document.getElementById('modal-alert-btn').onclick = () => {
      Modal.close();
      if (onClose) onClose();
    };
  },

  showEncourage(message, coinChange) {
    const isGain = coinChange > 0;
    const coinHtml = coinChange !== 0
      ? `<div class="modal-coin-change ${isGain ? 'gain' : 'lose'}">${isGain ? '+' : ''}${coinChange} 🪙</div>`
      : '';
    this.show(`
      <div class="modal-encourage">🌸</div>
      <div class="modal-message">${Utils.escapeHtml(message)}</div>
      ${coinHtml}
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="Modal.close()">继续加油</button>
      </div>
    `);
  },
};

/* ========== 可折叠列表 ========== */
const FoldableList = {
  render(items, groupKeyFn, itemRenderFn, options) {
    if (!items || items.length === 0) {
      return `<div class="task-empty">${Utils.escapeHtml(options.emptyText || '暂无记录')}</div>`;
    }

    const groups = {};
    const groupOrder = [];
    items.forEach(item => {
      const key = groupKeyFn(item);
      if (!groups[key]) {
        groups[key] = [];
        groupOrder.push(key);
      }
      groups[key].push(item);
    });

    let html = '';
    groupOrder.forEach(key => {
      const groupItems = groups[key];
      const collapsed = options.defaultCollapsed && groupOrder.indexOf(key) > 0;
      html += `<div class="foldable-group${collapsed ? ' collapsed' : ''}">`;
      html += `<div class="foldable-header" onclick="FoldableList.toggle(this)">`;
      html += `<span class="foldable-arrow">▼</span>`;
      html += `<span class="foldable-date">${Utils.escapeHtml(key)}</span>`;
      html += `<span class="foldable-count">${groupItems.length}</span>`;
      html += `</div>`;
      html += `<div class="foldable-content">`;
      groupItems.forEach(item => {
        html += itemRenderFn(item);
      });
      html += `</div></div>`;
    });
    return html;
  },

  toggle(headerEl) {
    const group = headerEl.parentElement;
    group.classList.toggle('collapsed');
  },
};

/* ========== 侧边栏 ========== */
const Sidebar = {
  navItems: [
    { id: 'timer', icon: '⏳', label: '专注' },
    { id: 'tasks', icon: '✅', label: '要干啦' },
    { id: 'habits', icon: '🌿', label: '好习惯' },
    { id: 'finance', icon: '💰', label: '记账' },
    { id: 'mood', icon: '🌈', label: '心情' },
    { id: 'coins', icon: '🪙', label: '纪念币' },
    { id: 'stats', icon: '📊', label: '复盘' },
    { id: 'exercise', icon: '🏃', label: '运动' },
  ],

  init() {
    if (DB.data.settings.sidebarCollapsed) {
      document.getElementById('sidebar').classList.add('collapsed');
    }
    this.render();
  },

  render() {
    const nav = document.getElementById('sidebar-nav');
    const current = DB.data.currentPage || 'timer';
    nav.innerHTML = this.navItems.map(item => `
      <div class="nav-item ${item.id === current ? 'active' : ''}" data-page="${item.id}" onclick="App.switchPage('${item.id}')">
        <span class="nav-icon">${item.icon}</span>
        <span class="nav-label">${item.label}</span>
      </div>
    `).join('');
  },

  toggle() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('collapsed');
    DB.data.settings.sidebarCollapsed = sidebar.classList.contains('collapsed');
    DB.save();
  },

  openMobile() {
    document.getElementById('sidebar').classList.add('mobile-open');
    document.getElementById('sidebar-mask').classList.remove('hidden');
  },

  closeMobile() {
    document.getElementById('sidebar').classList.remove('mobile-open');
    document.getElementById('sidebar-mask').classList.add('hidden');
  },

  setActive(pageId) {
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === pageId);
    });
  },
};

/* ========== App 主控 ========== */
const App = {
  init() {
    DB.load();
    IDB.open();
    this.applyFont();
    Sidebar.init();
    Companion.init();
    Timer.init();
    Tasks.init();
    Habits.init();
    Tags.init();
    Finance.init();
    Mood.init();
    Exercise.init();
    Stats.init();
    Coins.init();
    Reminders.init();

    const page = DB.data.currentPage || 'timer';
    this.switchPage(page);

    Reminders.start();
    window.addEventListener('beforeunload', () => DB.save());
  },

  applyFont() {
    document.body.style.fontFamily = '"Microsoft YaHei", -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Helvetica Neue", Arial, sans-serif';
  },

  switchPage(pageId) {
    const validPages = Sidebar.navItems.map(i => i.id);
    if (!validPages.includes(pageId)) pageId = 'timer';

    DB.data.currentPage = pageId;
    DB.save();

    document.querySelectorAll('.page-view').forEach(el => {
      el.classList.toggle('active', el.id === 'view-' + pageId);
    });
    Sidebar.setActive(pageId);
    Sidebar.closeMobile();

    const navItem = Sidebar.navItems.find(i => i.id === pageId);
    document.getElementById('top-bar-title').textContent = navItem ? `${navItem.icon} ${navItem.label}` : '';

    this.refreshPage(pageId);
  },

  refreshPage(pageId) {
    switch(pageId) {
      case 'timer': Timer.renderHistory(); break;
      case 'tasks': Tasks.render(); break;
      case 'habits': Habits.render(); Tags.render(); break;
      case 'finance': Finance.render(); break;
      case 'mood': Mood.render(); break;
      case 'coins': Coins.render(); break;
      case 'stats': Stats.refresh(); break;
      case 'exercise': Exercise.render(); break;
    }
  },

  updateCoinsDisplay() {
    const coins = DB.data.coins || 0;
    const el = document.getElementById('top-bar-coins');
    if (el) el.textContent = `🪙 ${coins}`;
  },

  openSettings() {
    const s = DB.data.settings;
    Modal.show(`
      <div class="modal-title">⚙️ 设置</div>
      <div class="settings-item">
        <span class="settings-label">🔔 音效</span>
        <div class="reminder-toggle ${s.soundEnabled ? 'on' : ''}" onclick="App.toggleSetting('soundEnabled', this)"></div>
      </div>
      <div class="settings-item">
        <span class="settings-label">📳 震动</span>
        <div class="reminder-toggle ${s.vibrateEnabled ? 'on' : ''}" onclick="App.toggleSetting('vibrateEnabled', this)"></div>
      </div>
      <div class="settings-item">
        <span class="settings-label">🌸 桌面人物</span>
        <div class="reminder-toggle ${s.companionEnabled ? 'on' : ''}" onclick="App.toggleSetting('companionEnabled', this)"></div>
      </div>
      <div class="settings-item">
        <span class="settings-label">专注奖励</span>
        <span class="settings-value">+${s.coinReward} 🪙</span>
      </div>
      <div class="settings-item">
        <span class="settings-label">中途扣除</span>
        <span class="settings-value">-${s.coinPenalty} 🪙</span>
      </div>
      <div class="settings-item">
        <span class="settings-label">📤 导出数据</span>
        <button class="btn btn-secondary btn-sm" onclick="App.exportData()">导出</button>
      </div>
      <div class="settings-item">
        <span class="settings-label">📥 导入数据</span>
        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('import-file').click()">导入</button>
        <input type="file" id="import-file" accept=".json" style="display:none" onchange="App.importData(this)">
      </div>
      <div class="settings-item">
        <span class="settings-label">🗑️ 清空所有数据</span>
        <button class="btn btn-danger btn-sm" onclick="App.clearData()">清空</button>
      </div>
      <div class="modal-actions" style="margin-top:16px">
        <button class="btn btn-primary" onclick="Modal.close()">关闭</button>
      </div>
    `);
  },

  toggleSetting(key, el) {
    DB.data.settings[key] = !DB.data.settings[key];
    DB.save();
    el.classList.toggle('on');
    if (key === 'companionEnabled') {
      Companion.setEnabled(DB.data.settings.companionEnabled);
    }
  },

  exportData() {
    const data = DB.export();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `自律工作台备份_${Utils.todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    Toast.show('数据已导出 ✅');
  },

  importData(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      if (DB.import(e.target.result)) {
        Toast.show('数据导入成功 ✅', 'success');
        Modal.close();
        App.init();
      } else {
        Toast.show('导入失败，文件格式错误', 'error');
      }
    };
    reader.readAsText(file);
  },

  clearData() {
    Modal.confirm('确认清空', '所有数据将被永久删除，确定继续吗？', () => {
      localStorage.removeItem(DB.KEY);
      localStorage.removeItem(DB.OLD_KEY);
      location.reload();
    }, '清空', '取消');
  },
};

/* ========== 番茄钟 ========== */
const Timer = {
  mode: 'countdown',
  duration: 25,
  remaining: 25 * 60,
  elapsed: 0,
  running: false,
  startTime: null,
  intervalId: null,
  ringCircumference: 2 * Math.PI * 120,

  init() {
    this.updateDisplay();
    this.updateRing();
  },

  setMode(mode) {
    if (this.running) {
      Toast.show('请先停止当前专注');
      return;
    }
    this.mode = mode;
    document.querySelectorAll('.mode-tab').forEach(el => {
      el.classList.toggle('active', el.dataset.mode === mode);
    });
    const ring = document.getElementById('timer-ring-progress');
    if (ring) ring.classList.toggle('stopwatch-mode', mode === 'stopwatch');

    if (mode === 'countdown') {
      this.remaining = this.duration * 60;
      this.elapsed = 0;
    } else {
      this.remaining = 0;
      this.elapsed = 0;
    }
    this.updateDisplay();
    this.updateRing();
    document.getElementById('timer-status').textContent = mode === 'countdown' ? '准备专注' : '准备正计时';

    const durSettings = document.getElementById('duration-settings');
    if (durSettings) durSettings.style.display = mode === 'countdown' ? '' : 'none';

    const completeBtn = document.getElementById('timer-complete-btn');
    const stopBtn = document.getElementById('timer-stop-btn');
    if (mode === 'stopwatch' && this.running) {
      if (completeBtn) completeBtn.classList.remove('hidden');
      if (stopBtn) stopBtn.classList.add('hidden');
    } else {
      if (completeBtn) completeBtn.classList.add('hidden');
    }
  },

  setDuration(min) {
    if (this.running) {
      Toast.show('请先停止当前专注');
      return;
    }
    this.duration = min;
    this.remaining = min * 60;
    document.querySelectorAll('.preset-btn').forEach(el => {
      el.classList.toggle('active', parseInt(el.dataset.min) === min);
    });
    const customInput = document.getElementById('custom-minutes');
    if (customInput) customInput.value = min;
    this.updateDisplay();
    this.updateRing();
  },

  setCustomDuration() {
    const input = document.getElementById('custom-minutes');
    let min = parseInt(input.value);
    if (!min || min < 1) min = 1;
    if (min > 180) min = 180;
    this.setDuration(min);
  },

  start() {
    if (this.running) return;
    this.running = true;
    this.startTime = Date.now();

    document.getElementById('timer-start-btn').classList.add('hidden');
    if (this.mode === 'countdown') {
      document.getElementById('timer-stop-btn').classList.remove('hidden');
    } else {
      document.getElementById('timer-complete-btn').classList.remove('hidden');
    }
    document.getElementById('timer-status').textContent = this.mode === 'countdown' ? '专注中...' : '正计时中...';

    this.intervalId = setInterval(() => this.tick(), 1000);
    Companion.onScene('focusStart');
  },

  tick() {
    if (this.mode === 'countdown') {
      this.remaining--;
      this.elapsed++;
      if (this.remaining <= 0) {
        this.complete(true);
        return;
      }
    } else {
      this.elapsed++;
      this.remaining = this.elapsed;
    }
    this.updateDisplay();
    this.updateRing();
  },

  stop() {
    if (!this.running) return;
    clearInterval(this.intervalId);
    this.running = false;

    const actualMinutes = Math.floor(this.elapsed / 60);
    if (actualMinutes === 0) {
      this.reset();
      Toast.show('专注时间太短，未记录');
      return;
    }

    const record = {
      id: DB.uid(),
      startTime: new Date(this.startTime).toISOString(),
      mode: this.mode,
      duration: this.duration,
      actualDuration: actualMinutes,
      completed: false,
      date: Utils.todayStr(),
    };
    DB.data.timerHistory.unshift(record);
    DB.save();

    const penalty = DB.data.settings.coinPenalty;
    DB.addCoins(-penalty, `专注中途停止（${actualMinutes}分钟）`);

    this.reset();
    Utils.playSound('fail');
    Utils.vibrate(200);
    Companion.onScene('focusStop');
    Modal.showEncourage(`这次专注了${actualMinutes}分钟，下次坚持到底哦！`, -penalty);
    App.updateCoinsDisplay();
    this.renderHistory();
  },

  complete(autoTriggered) {
    if (!this.running) return;
    clearInterval(this.intervalId);
    this.running = false;

    let actualMinutes;
    if (this.mode === 'countdown') {
      actualMinutes = this.duration;
    } else {
      actualMinutes = Math.max(1, Math.floor(this.elapsed / 60));
    }

    const record = {
      id: DB.uid(),
      startTime: new Date(this.startTime).toISOString(),
      mode: this.mode,
      duration: this.duration,
      actualDuration: actualMinutes,
      completed: true,
      date: Utils.todayStr(),
    };
    DB.data.timerHistory.unshift(record);
    DB.save();

    const reward = DB.data.settings.coinReward;
    DB.addCoins(reward, `完成专注（${actualMinutes}分钟）`);

    this.reset();
    Utils.playSound('complete');
    Utils.vibrate([100, 50, 100]);
    Companion.onScene('focusComplete');
    Modal.showEncourage(`太棒了！专注${actualMinutes}分钟完成！${Companion.getEncourage()}`, reward);
    App.updateCoinsDisplay();
    this.renderHistory();
  },

  reset() {
    this.running = false;
    this.elapsed = 0;
    if (this.mode === 'countdown') {
      this.remaining = this.duration * 60;
    } else {
      this.remaining = 0;
    }
    clearInterval(this.intervalId);

    document.getElementById('timer-start-btn').classList.remove('hidden');
    document.getElementById('timer-stop-btn').classList.add('hidden');
    document.getElementById('timer-complete-btn').classList.add('hidden');
    document.getElementById('timer-status').textContent = this.mode === 'countdown' ? '准备专注' : '准备正计时';

    this.updateDisplay();
    this.updateRing();
  },

  updateDisplay() {
    const el = document.getElementById('timer-display');
    if (!el) return;
    if (this.mode === 'countdown') {
      const m = Math.floor(this.remaining / 60);
      const s = this.remaining % 60;
      el.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    } else {
      const total = this.elapsed;
      const m = Math.floor(total / 60);
      const s = total % 60;
      el.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    }
  },

  updateRing() {
    const ring = document.getElementById('timer-ring-progress');
    if (!ring) return;
    if (this.mode === 'countdown') {
      const total = this.duration * 60;
      const progress = total > 0 ? this.remaining / total : 0;
      const offset = this.ringCircumference * (1 - progress);
      ring.style.strokeDashoffset = offset;
    } else {
      const progress = Math.min(1, this.elapsed / (this.duration * 60 || 3600));
      const offset = this.ringCircumference * (1 - progress);
      ring.style.strokeDashoffset = offset;
    }
  },

  renderHistory() {
    const container = document.getElementById('timer-history-list');
    if (!container) return;
    const history = DB.data.timerHistory || [];

    if (history.length === 0) {
      container.innerHTML = '<div class="task-empty">还没有专注记录，开始第一次专注吧 🌱</div>';
      return;
    }

    const sorted = [...history].sort((a, b) => b.startTime.localeCompare(a.startTime));

    container.innerHTML = FoldableList.render(
      sorted,
      (item) => item.date,
      (item) => `
        <div class="history-item ${item.completed ? '' : 'incomplete'}">
          <div class="history-item-info">
            <div class="history-item-time">${Utils.formatTime(item.startTime)} · ${item.mode === 'countdown' ? '倒计时' : '正计时'}</div>
            <div class="history-item-mode">${item.completed ? '✅ 已完成' : '⏹ 中途停止'}</div>
          </div>
          <div class="history-item-duration">${Utils.formatDuration(item.actualDuration)}</div>
        </div>
      `,
      { emptyText: '暂无记录', defaultCollapsed: true }
    );
  },
};

/* ========== 任务与目标 ========== */
const Tasks = {
  selectedDate: null,
  calMonth: null,

  init() {
    this.selectedDate = Utils.todayStr();
    const now = new Date();
    this.calMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const dateInput = document.getElementById('goal-deadline-input');
    if (dateInput) dateInput.value = Utils.todayStr();

    this.renderDateBar();
  },

  renderDateBar() {
    const bar = document.getElementById('tasks-date-bar');
    if (!bar) return;
    const today = Utils.todayStr();
    const dates = [];
    for (let i = -3; i <= 3; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      dates.push(Utils.formatDate(d));
    }
    bar.innerHTML = dates.map(dateStr => {
      const d = new Date(dateStr);
      const weekdays = ['日','一','二','三','四','五','六'];
      const isToday = dateStr === today;
      const isSelected = dateStr === this.selectedDate;
      return `<div class="date-bar-item ${isSelected ? 'active' : ''} ${isToday ? 'today' : ''}" onclick="Tasks.selectDate('${dateStr}')">
        <div class="db-weekday">${weekdays[d.getDay()]}</div>
        <div class="db-day">${d.getDate()}</div>
      </div>`;
    }).join('');

    const display = document.getElementById('tasks-date-display');
    if (display) {
      const d = new Date(this.selectedDate);
      display.textContent = `${d.getMonth()+1}月${d.getDate()}日`;
    }
  },

  selectDate(dateStr) {
    this.selectedDate = dateStr;
    this.renderDateBar();
    this.renderTasks();
  },

  addTask() {
    const input = document.getElementById('task-input');
    const text = input.value.trim();
    if (!text) return;

    if (!DB.data.tasks[this.selectedDate]) {
      DB.data.tasks[this.selectedDate] = [];
    }
    DB.data.tasks[this.selectedDate].push({
      id: DB.uid(),
      text: text,
      done: false,
      tags: [],
    });
    DB.save();
    input.value = '';
    this.renderTasks();
    Toast.show('任务已添加 ✅');
  },

  toggleTask(id) {
    const tasks = DB.data.tasks[this.selectedDate];
    if (!tasks) return;
    const task = tasks.find(t => t.id === id);
    if (task) {
      task.done = !task.done;
      DB.save();
      this.renderTasks();
    }
  },

  deleteTask(id) {
    const tasks = DB.data.tasks[this.selectedDate];
    if (!tasks) return;
    DB.data.tasks[this.selectedDate] = tasks.filter(t => t.id !== id);
    if (DB.data.tasks[this.selectedDate].length === 0) {
      delete DB.data.tasks[this.selectedDate];
    }
    DB.save();
    this.renderTasks();
  },

  renderTasks() {
    const list = document.getElementById('task-list');
    if (!list) return;
    const tasks = DB.data.tasks[this.selectedDate] || [];

    if (tasks.length === 0) {
      list.innerHTML = '<div class="task-empty">今天还没有任务，添加一个吧 📝</div>';
      return;
    }

    list.innerHTML = tasks.map(task => `
      <div class="task-item ${task.done ? 'completed' : ''}">
        <div class="task-checkbox ${task.done ? 'checked' : ''}" onclick="Tasks.toggleTask('${task.id}')"></div>
        <div class="task-content">
          <div class="task-text">${Utils.escapeHtml(task.text)}</div>
          ${task.tags && task.tags.length > 0 ? `<div class="task-tags">${task.tags.map(tagId => {
            const tag = DB.data.tags.find(t => t.id === tagId);
            return tag ? `<span class="task-tag">${Utils.escapeHtml(tag.name)}</span>` : '';
          }).join('')}</div>` : ''}
        </div>
        <div class="task-delete" onclick="Tasks.deleteTask('${task.id}')">✕</div>
      </div>
    `).join('');
  },

  renderCalendar() {
    const grid = document.getElementById('tasks-calendar-grid');
    if (!grid) return;
    const title = document.getElementById('tasks-cal-title');
    const year = this.calMonth.getFullYear();
    const month = this.calMonth.getMonth();
    title.textContent = `${year}年${month+1}月`;

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month+1, 0).getDate();
    const today = Utils.todayStr();

    let html = '';
    for (let i = 0; i < firstDay; i++) html += '<div class="cal-cell empty"></div>';
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const tasks = DB.data.tasks[dateStr];
      const hasTasks = tasks && tasks.length > 0;
      const isToday = dateStr === today;
      const isSelected = dateStr === this.selectedDate;
      html += `<div class="cal-cell ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''} ${hasTasks ? 'has-tasks' : ''}" onclick="Tasks.selectDate('${dateStr}')">${d}</div>`;
    }
    grid.innerHTML = html;
  },

  prevMonth() {
    this.calMonth.setMonth(this.calMonth.getMonth() - 1);
    this.renderCalendar();
  },

  nextMonth() {
    this.calMonth.setMonth(this.calMonth.getMonth() + 1);
    this.renderCalendar();
  },

  addGoal() {
    const nameInput = document.getElementById('goal-name-input');
    const deadlineInput = document.getElementById('goal-deadline-input');
    const name = nameInput.value.trim();
    if (!name) return;

    DB.data.goals.push({
      id: DB.uid(),
      name: name,
      deadline: deadlineInput.value || '',
      subGoals: [],
    });
    DB.save();
    nameInput.value = '';
    this.renderGoals();
    Toast.show('目标已添加 🎯');
  },

  addSubGoal(goalId) {
    const goal = DB.data.goals.find(g => g.id === goalId);
    if (!goal) return;
    const input = document.getElementById(`subgoal-input-${goalId}`);
    const text = input.value.trim();
    if (!text) return;
    goal.subGoals.push({ id: DB.uid(), text: text, done: false });
    DB.save();
    input.value = '';
    this.renderGoals();
  },

  toggleSubGoal(goalId, subId) {
    const goal = DB.data.goals.find(g => g.id === goalId);
    if (!goal) return;
    const sub = goal.subGoals.find(s => s.id === subId);
    if (sub) {
      sub.done = !sub.done;
      DB.save();
      this.renderGoals();
    }
  },

  deleteSubGoal(goalId, subId) {
    const goal = DB.data.goals.find(g => g.id === goalId);
    if (!goal) return;
    goal.subGoals = goal.subGoals.filter(s => s.id !== subId);
    DB.save();
    this.renderGoals();
  },

  deleteGoal(goalId) {
    Modal.confirm('删除目标', '确定删除这个目标及其所有子目标吗？', () => {
      DB.data.goals = DB.data.goals.filter(g => g.id !== goalId);
      DB.save();
      this.renderGoals();
    }, '删除', '取消');
  },

  renderGoals() {
    const container = document.getElementById('goal-list');
    if (!container) return;
    const goals = DB.data.goals || [];

    if (goals.length === 0) {
      container.innerHTML = '<div class="task-empty">还没有大目标，设定一个吧 🎯</div>';
      return;
    }

    container.innerHTML = goals.map(goal => {
      const total = goal.subGoals.length;
      const done = goal.subGoals.filter(s => s.done).length;
      const progress = total > 0 ? Math.round(done / total * 100) : 0;
      let daysLeft = '';
      if (goal.deadline) {
        const diff = Math.ceil((new Date(goal.deadline) - new Date()) / (1000*60*60*24));
        daysLeft = diff > 0 ? `还剩 ${diff} 天` : diff === 0 ? '今天截止' : `已过期 ${-diff} 天`;
      }
      return `
        <div class="goal-item">
          <div class="goal-header">
            <div>
              <div class="goal-name">${Utils.escapeHtml(goal.name)}</div>
              ${goal.deadline ? `<div class="goal-deadline">${Utils.formatDateCN(goal.deadline)} · ${daysLeft}</div>` : ''}
            </div>
            <div class="goal-delete-btn" onclick="Tasks.deleteGoal('${goal.id}')">✕</div>
          </div>
          ${total > 0 ? `
            <div class="goal-progress-bar">
              <div class="goal-progress-fill" style="width:${progress}%"></div>
            </div>
            <div class="goal-progress-text">${done}/${total} 完成 · ${progress}%</div>
          ` : '<div class="goal-progress-text">还没有子目标</div>'}
          <div class="goal-sub-add">
            <input type="text" id="subgoal-input-${goal.id}" placeholder="添加子目标..." onkeypress="if(event.key==='Enter')Tasks.addSubGoal('${goal.id}')">
            <button class="btn btn-secondary btn-sm" onclick="Tasks.addSubGoal('${goal.id}')">+</button>
          </div>
          ${goal.subGoals.map(sub => `
            <div class="goal-sub-item ${sub.done ? 'completed' : ''}">
              <div class="task-checkbox ${sub.done ? 'checked' : ''}" onclick="Tasks.toggleSubGoal('${goal.id}','${sub.id}')"></div>
              <div class="task-text">${Utils.escapeHtml(sub.text)}</div>
              <div class="task-delete" onclick="Tasks.deleteSubGoal('${goal.id}','${sub.id}')">✕</div>
            </div>
          `).join('')}
        </div>
      `;
    }).join('');
  },

  render() {
    this.renderDateBar();
    this.renderTasks();
    this.renderCalendar();
    this.renderGoals();
  },
};

/* ========== 标签管理 ========== */
const Tags = {
  init() {},

  addTag() {
    const input = document.getElementById('tag-input');
    const name = input.value.trim();
    if (!name) return;
    if (DB.data.tags.some(t => t.name === name)) {
      Toast.show('标签已存在');
      return;
    }
    DB.data.tags.push({ id: DB.uid(), name: name });
    DB.save();
    input.value = '';
    this.render();
    Toast.show('标签已添加 🏷️');
  },

  deleteTag(id) {
    DB.data.tags = DB.data.tags.filter(t => t.id !== id);
    Object.keys(DB.data.tasks).forEach(date => {
      DB.data.tasks[date].forEach(task => {
        if (task.tags) task.tags = task.tags.filter(tagId => tagId !== id);
      });
    });
    DB.save();
    this.render();
  },

  render() {
    const list = document.getElementById('tag-list');
    if (!list) return;
    const tags = DB.data.tags || [];

    if (tags.length === 0) {
      list.innerHTML = '<div class="task-empty">还没有标签</div>';
      return;
    }

    list.innerHTML = tags.map(tag => `
      <div class="tag-item">
        ${Utils.escapeHtml(tag.name)}
        <span class="tag-delete" onclick="Tags.deleteTag('${tag.id}')">✕</span>
      </div>
    `).join('');
  },
};

/* ========== 习惯打卡 ========== */
const Habits = {
  init() {
    this.checkGraceCardReset();
  },

  checkGraceCardReset() {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    if (DB.data.graceCards.lastResetMonth !== currentMonth) {
      DB.data.graceCards.count = 1;
      DB.data.graceCards.usedDates = [];
      DB.data.graceCards.lastResetMonth = currentMonth;
      DB.save();
    }
  },

  addHabit() {
    const input = document.getElementById('habit-input');
    const name = input.value.trim();
    if (!name) return;

    const icons = ['🌱','🌿','☘️','🍃','🌷','🌻','⭐','💧','📖','✏️','🎨','🎵','🏃','🧘','💪','😴','🥗','💊','🦷','🧹'];
    DB.data.habits.push({
      id: DB.uid(),
      name: name,
      icon: icons[DB.data.habits.length % icons.length],
      checkins: [],
      createdAt: Utils.todayStr(),
    });
    DB.save();
    input.value = '';
    this.render();
    Toast.show('习惯已添加 🌿');
  },

  toggleCheckin(habitId) {
    const habit = DB.data.habits.find(h => h.id === habitId);
    if (!habit) return;

    const today = Utils.todayStr();
    const idx = habit.checkins.indexOf(today);

    if (idx > -1) {
      habit.checkins.splice(idx, 1);
      DB.save();
      this.render();
      return;
    }

    const yesterday = (() => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return Utils.formatDate(d);
    })();

    const wasCheckedYesterday = habit.checkins.includes(yesterday);
    const streak = this.calcStreak(habit);

    habit.checkins.push(today);
    habit.checkins.sort();
    DB.save();

    if (!wasCheckedYesterday && streak === 0) {
      const graceCount = DB.data.graceCards.count;
      if (graceCount > 0) {
        Modal.confirm(
          '🎟️ 使用宽限卡？',
          `昨天忘记打卡「${habit.name}」了，是否使用宽限卡保护连续记录？（剩余 ${graceCount} 张）`,
          () => {
            habit.checkins.push(yesterday);
            habit.checkins.sort();
            DB.data.graceCards.count--;
            DB.data.graceCards.usedDates.push(today);
            DB.save();
            this.render();
            Toast.show('宽限卡已使用，连续记录已保护 ✨');
          },
          '使用宽限卡',
          '不用'
        );
      }
    }

    Utils.vibrate(50);
    Companion.onScene('habitCheckin');
    this.render();
  },

  calcStreak(habit) {
    if (!habit.checkins || habit.checkins.length === 0) return 0;
    const sorted = [...habit.checkins].sort();
    const today = Utils.todayStr();
    const yesterday = (() => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return Utils.formatDate(d);
    })();

    if (!sorted.includes(today) && !sorted.includes(yesterday)) return 0;

    let streak = 0;
    let checkDate = sorted.includes(today) ? new Date(today) : new Date(yesterday);

    while (true) {
      const dateStr = Utils.formatDate(checkDate);
      if (sorted.includes(dateStr)) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }
    return streak;
  },

  calcRate(habit) {
    if (!habit.createdAt) return 0;
    const created = new Date(habit.createdAt);
    const now = new Date();
    const days = Math.max(1, Math.ceil((now - created) / (1000*60*60*24)));
    const checkinDays = habit.checkins ? habit.checkins.length : 0;
    return Math.min(100, Math.round(checkinDays / days * 100));
  },

  deleteHabit(id) {
    Modal.confirm('删除习惯', '确定删除这个习惯吗？', () => {
      DB.data.habits = DB.data.habits.filter(h => h.id !== id);
      DB.save();
      this.render();
    }, '删除', '取消');
  },

  showGraceInfo() {
    const gc = DB.data.graceCards;
    Modal.alert('🎟️ 宽限卡', `每月赠送 1 张宽限卡，可在漏打卡时保护连续记录。\n\n当前剩余：${gc.count} 张\n本月已用：${gc.usedDates.length} 次`);
  },

  showDetail(habitId) {
    const habit = DB.data.habits.find(h => h.id === habitId);
    if (!habit) return;

    const streak = this.calcStreak(habit);
    const rate = this.calcRate(habit);
    const totalCheckins = habit.checkins.length;

    const recentCheckins = [...habit.checkins].sort().reverse().slice(0, 30);

    Modal.show(`
      <div class="modal-title">${habit.icon} ${Utils.escapeHtml(habit.name)}</div>
      <div class="settings-item">
        <span class="settings-label">🔥 当前连续</span>
        <span class="settings-value">${streak} 天</span>
      </div>
      <div class="settings-item">
        <span class="settings-label">📊 执行率</span>
        <span class="settings-value">${rate}%</span>
      </div>
      <div class="settings-item">
        <span class="settings-label">✅ 累计打卡</span>
        <span class="settings-value">${totalCheckins} 次</span>
      </div>
      <div class="settings-item">
        <span class="settings-label">📅 创建于</span>
        <span class="settings-value">${Utils.formatDateCN(habit.createdAt)}</span>
      </div>
      <div style="margin-top:12px;font-size:13px;color:var(--text-secondary);font-weight:600">近30天打卡记录</div>
      <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:8px">
        ${recentCheckins.map(d => `<span style="font-size:11px;padding:2px 6px;border-radius:4px;background:var(--accent-orange-light);color:var(--accent-orange-dark)">${d.slice(5)}</span>`).join('')}
      </div>
      <div class="modal-actions" style="margin-top:16px">
        <button class="btn btn-danger" onclick="Habits.confirmDelete('${habit.id}')">删除习惯</button>
        <button class="btn btn-primary" onclick="Modal.close()">关闭</button>
      </div>
    `);
  },

  confirmDelete(habitId) {
    Modal.close();
    this.deleteHabit(habitId);
  },

  render() {
    const list = document.getElementById('habit-list');
    if (!list) return;
    const habits = DB.data.habits || [];

    const graceBadge = document.getElementById('grace-count');
    if (graceBadge) graceBadge.textContent = DB.data.graceCards.count;

    const empty = document.getElementById('habit-empty');
    if (habits.length === 0) {
      list.innerHTML = '';
      if (empty) empty.classList.remove('hidden');
      return;
    }
    if (empty) empty.classList.add('hidden');

    const today = Utils.todayStr();
    list.innerHTML = habits.map(habit => {
      const checked = habit.checkins.includes(today);
      const streak = this.calcStreak(habit);
      return `
        <div class="habit-item">
          <div class="habit-stamp ${checked ? 'checked' : ''}" onclick="Habits.toggleCheckin('${habit.id}')">${habit.icon}</div>
          <div class="habit-info">
            <div class="habit-name">${Utils.escapeHtml(habit.name)}</div>
            <div class="habit-streak">${streak > 0 ? `<span class="fire">🔥</span> 连续 ${streak} 天` : '今天还没打卡'}</div>
          </div>
          <div class="habit-detail-btn" onclick="Habits.showDetail('${habit.id}')">⋯</div>
        </div>
      `;
    }).join('');
  },
};

/* ========== 记账 ========== */
const Finance = {
  type: 'expense',
  selectedCategory: null,
  viewMonth: null,

  init() {
    const now = new Date();
    this.viewMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const dateInput = document.getElementById('finance-date');
    if (dateInput) dateInput.value = Utils.todayStr();

    this.renderCategoryGrid();
    this.renderAccounts();
  },

  setType(type) {
    this.type = type;
    document.querySelectorAll('.ftype-tab').forEach(el => {
      el.classList.toggle('active', el.dataset.type === type);
    });
    this.selectedCategory = null;
    this.renderCategoryGrid();

    const toSelect = document.getElementById('finance-account-to');
    if (toSelect) toSelect.classList.toggle('hidden', type !== 'transfer');
  },

  renderCategoryGrid() {
    const grid = document.getElementById('finance-category-grid');
    if (!grid) return;
    const categories = DB.data.finance.categories[this.type] || [];
    grid.innerHTML = categories.map(cat => `
      <div class="fcat-item ${this.selectedCategory === cat.id ? 'active' : ''}" onclick="Finance.selectCategory('${cat.id}')">
        <span class="fcat-icon">${cat.icon}</span>
        <span class="fcat-name">${Utils.escapeHtml(cat.name)}</span>
      </div>
    `).join('');
  },

  selectCategory(id) {
    this.selectedCategory = id;
    this.renderCategoryGrid();
  },

  addRecord() {
    const amountInput = document.getElementById('finance-amount');
    const amount = parseFloat(amountInput.value);
    if (!amount || amount <= 0) {
      Toast.show('请输入有效金额');
      return;
    }
    if (!this.selectedCategory && this.type !== 'transfer') {
      Toast.show('请选择分类');
      return;
    }

    const fromSelect = document.getElementById('finance-account-from');
    const toSelect = document.getElementById('finance-account-to');
    const dateInput = document.getElementById('finance-date');
    const noteInput = document.getElementById('finance-note');

    const record = {
      id: DB.uid(),
      type: this.type,
      amount: amount,
      category: this.selectedCategory,
      accountId: fromSelect.value,
      date: dateInput.value,
      note: noteInput.value.trim(),
    };

    if (this.type === 'transfer') {
      record.toAccountId = toSelect.value;
    }

    const accounts = DB.data.finance.accounts;
    if (this.type === 'expense') {
      const acc = accounts.find(a => a.id === record.accountId);
      if (acc) acc.balance -= amount;
    } else if (this.type === 'income') {
      const acc = accounts.find(a => a.id === record.accountId);
      if (acc) acc.balance += amount;
    } else if (this.type === 'transfer') {
      const from = accounts.find(a => a.id === record.accountId);
      const to = accounts.find(a => a.id === record.toAccountId);
      if (from) from.balance -= amount;
      if (to) to.balance += amount;
    }

    DB.data.finance.records.unshift(record);
    DB.save();

    amountInput.value = '';
    noteInput.value = '';
    this.selectedCategory = null;
    this.renderCategoryGrid();
    this.render();
    Toast.show('记录已添加 ✅');
  },

  deleteRecord(id) {
    const record = DB.data.finance.records.find(r => r.id === id);
    if (!record) return;

    const accounts = DB.data.finance.accounts;
    if (record.type === 'expense') {
      const acc = accounts.find(a => a.id === record.accountId);
      if (acc) acc.balance += record.amount;
    } else if (record.type === 'income') {
      const acc = accounts.find(a => a.id === record.accountId);
      if (acc) acc.balance -= record.amount;
    } else if (record.type === 'transfer') {
      const from = accounts.find(a => a.id === record.accountId);
      const to = accounts.find(a => a.id === record.toAccountId);
      if (from) from.balance += record.amount;
      if (to) to.balance -= record.amount;
    }

    DB.data.finance.records = DB.data.finance.records.filter(r => r.id !== id);
    DB.save();
    this.render();
  },

  addAccount() {
    const nameInput = document.getElementById('account-name-input');
    const balanceInput = document.getElementById('account-balance-input');
    const name = nameInput.value.trim();
    if (!name) return;
    const balance = parseFloat(balanceInput.value) || 0;

    DB.data.finance.accounts.push({
      id: DB.uid(),
      name: name,
      balance: balance,
    });
    DB.save();
    nameInput.value = '';
    balanceInput.value = '';
    this.renderAccounts();
    this.render();
    Toast.show('账户已添加 🏦');
  },

  deleteAccount(id) {
    if (DB.data.finance.accounts.length <= 1) {
      Toast.show('至少保留一个账户');
      return;
    }
    Modal.confirm('删除账户', '确定删除这个账户吗？相关记录不会删除。', () => {
      DB.data.finance.accounts = DB.data.finance.accounts.filter(a => a.id !== id);
      DB.save();
      this.renderAccounts();
      this.render();
    }, '删除', '取消');
  },

  renderAccounts() {
    const selects = ['finance-account-from', 'finance-account-to'];
    selects.forEach(selectId => {
      const sel = document.getElementById(selectId);
      if (!sel) return;
      const current = sel.value;
      sel.innerHTML = DB.data.finance.accounts.map(acc =>
        `<option value="${acc.id}">${Utils.escapeHtml(acc.name)}</option>`
      ).join('');
      if (current) sel.value = current;
    });

    const list = document.getElementById('account-list');
    if (!list) return;
    list.innerHTML = DB.data.finance.accounts.map(acc => `
      <div class="account-item">
        <div>
          <div class="account-name">${Utils.escapeHtml(acc.name)}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="account-balance">¥${acc.balance.toFixed(2)}</span>
          <span class="task-delete" onclick="Finance.deleteAccount('${acc.id}')">✕</span>
        </div>
      </div>
    `).join('');
  },

  prevMonth() {
    this.viewMonth.setMonth(this.viewMonth.getMonth() - 1);
    this.render();
  },

  nextMonth() {
    this.viewMonth.setMonth(this.viewMonth.getMonth() + 1);
    this.render();
  },

  render() {
    const records = DB.data.finance.records || [];
    const accounts = DB.data.finance.accounts;

    const netAssets = accounts.reduce((sum, a) => sum + a.balance, 0);
    const el = document.getElementById('finance-net-assets');
    if (el) el.textContent = `¥${netAssets.toFixed(2)}`;

    const monthStr = `${this.viewMonth.getFullYear()}-${String(this.viewMonth.getMonth()+1).padStart(2,'0')}`;
    const monthRecords = records.filter(r => r.date && r.date.startsWith(monthStr));
    const income = monthRecords.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0);
    const expense = monthRecords.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0);

    const miEl = document.getElementById('finance-month-income');
    if (miEl) miEl.textContent = `+¥${income.toFixed(2)}`;
    const meEl = document.getElementById('finance-month-expense');
    if (meEl) meEl.textContent = `-¥${expense.toFixed(2)}`;

    const titleEl = document.getElementById('finance-month-title');
    if (titleEl) titleEl.textContent = `${this.viewMonth.getFullYear()}年${this.viewMonth.getMonth()+1}月`;

    const fsIncome = document.getElementById('fs-income');
    if (fsIncome) fsIncome.textContent = `¥${income.toFixed(2)}`;
    const fsExpense = document.getElementById('fs-expense');
    if (fsExpense) fsExpense.textContent = `¥${expense.toFixed(2)}`;
    const fsBalance = document.getElementById('fs-balance');
    if (fsBalance) fsBalance.textContent = `¥${(income - expense).toFixed(2)}`;

    this.renderCategoryBreakdown(monthRecords);
    this.renderFinanceLine();
    this.renderRecordsList(monthRecords);
  },

  renderCategoryBreakdown(monthRecords) {
    const container = document.getElementById('finance-category-breakdown');
    if (!container) return;

    const expenseByCategory = {};
    monthRecords.filter(r => r.type === 'expense').forEach(r => {
      if (!expenseByCategory[r.category]) expenseByCategory[r.category] = 0;
      expenseByCategory[r.category] += r.amount;
    });

    const totalExpense = Object.values(expenseByCategory).reduce((s, v) => s + v, 0);
    const categories = DB.data.finance.categories.expense;

    const sorted = Object.entries(expenseByCategory).sort((a, b) => b[1] - a[1]);

    if (sorted.length === 0) {
      container.innerHTML = '<div class="task-empty">本月暂无支出记录</div>';
    } else {
      container.innerHTML = sorted.map(([catId, amount]) => {
        const cat = categories.find(c => c.id === catId);
        const percent = totalExpense > 0 ? Math.round(amount / totalExpense * 100) : 0;
        return `<div class="fcat-breakdown-item">
          <div class="fcat-breakdown-left">
            <span>${cat ? cat.icon : '📌'}</span>
            <span>${Utils.escapeHtml(cat ? cat.name : '其他')}</span>
            <span style="color:var(--text-tertiary);font-size:11px">${percent}%</span>
          </div>
          <span class="fcat-breakdown-amount expense">¥${amount.toFixed(2)}</span>
        </div>`;
      }).join('');
    }

    this.renderCategoryPie(expenseByCategory, categories);
  },

  _pieChart: null,
  renderCategoryPie(expenseByCategory, categories) {
    const canvas = document.getElementById('chart-finance-pie');
    if (!canvas || typeof Chart === 'undefined') return;

    const sorted = Object.entries(expenseByCategory).sort((a, b) => b[1] - a[1]);
    const labels = sorted.map(([catId]) => {
      const cat = categories.find(c => c.id === catId);
      return cat ? cat.name : '其他';
    });
    const data = sorted.map(([, amount]) => amount);
    const colors = ['#E8A87C','#85B79D','#E8A0A0','#B8A0D4','#F0D080','#8BA8C4','#D4A574','#C4A0D4'];

    if (this._pieChart) this._pieChart.destroy();
    if (data.length === 0) {
      this._pieChart = new Chart(canvas, {
        type: 'doughnut',
        data: { labels: ['暂无支出'], datasets: [{ data: [1], backgroundColor: ['#FAF3E8'] }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } } }
      });
      return;
    }
    this._pieChart = new Chart(canvas, {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: colors }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 8 } } } }
    });
  },

  _lineChart: null,
  renderFinanceLine() {
    const canvas = document.getElementById('chart-finance-line');
    if (!canvas || typeof Chart === 'undefined') return;

    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
    }

    const incomeData = months.map(m => {
      return DB.data.finance.records.filter(r => r.date && r.date.startsWith(m) && r.type === 'income').reduce((s, r) => s + r.amount, 0);
    });
    const expenseData = months.map(m => {
      return DB.data.finance.records.filter(r => r.date && r.date.startsWith(m) && r.type === 'expense').reduce((s, r) => s + r.amount, 0);
    });
    const labels = months.map(m => `${parseInt(m.split('-')[1])}月`);

    if (this._lineChart) this._lineChart.destroy();
    this._lineChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: '收入', data: incomeData, borderColor: '#85B79D', backgroundColor: 'rgba(133,183,157,0.1)', tension: 0.3 },
          { label: '支出', data: expenseData, borderColor: '#E89090', backgroundColor: 'rgba(232,144,144,0.1)', tension: 0.3 },
        ]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 8 } } }, scales: { y: { beginAtZero: true } } }
    });
  },

  renderRecordsList(monthRecords) {
    let listEl = document.getElementById('finance-records-list');
    if (!listEl) {
      const pieCanvas = document.getElementById('chart-finance-pie');
      const pieCard = pieCanvas?.closest('.card');
      if (!pieCard) return;
      listEl = document.createElement('div');
      listEl.id = 'finance-records-list';
      listEl.className = 'foldable-container';
      pieCard.appendChild(listEl);
    }

    const sorted = [...monthRecords].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    if (sorted.length === 0) {
      listEl.innerHTML = '<div class="task-empty">本月暂无记录</div>';
      return;
    }

    const categories = { ...DB.data.finance.categories.expense.reduce((m, c) => { m[c.id] = c; return m; }, {}),
                         ...DB.data.finance.categories.income.reduce((m, c) => { m[c.id] = c; return m; }, {}) };

    listEl.innerHTML = FoldableList.render(
      sorted,
      (r) => r.date || '无日期',
      (r) => {
        const cat = categories[r.category];
        const icon = cat ? cat.icon : (r.type === 'transfer' ? '🔄' : '📌');
        const name = cat ? cat.name : (r.type === 'transfer' ? '转账' : '其他');
        const sign = r.type === 'income' ? '+' : r.type === 'expense' ? '-' : '';
        return `<div class="finance-record">
          <div class="fr-icon ${r.type}">${icon}</div>
          <div class="fr-info">
            <div class="fr-category">${Utils.escapeHtml(name)}</div>
            ${r.note ? `<div class="fr-note">${Utils.escapeHtml(r.note)}</div>` : ''}
          </div>
          <span class="fr-amount ${r.type}">${sign}¥${r.amount.toFixed(2)}</span>
          <span class="fr-delete" onclick="Finance.deleteRecord('${r.id}')">✕</span>
        </div>`;
      },
      { emptyText: '暂无记录', defaultCollapsed: true }
    );
  },
};

/* ========== 心情日历 ========== */
const Mood = {
  viewMonth: null,
  selectedDate: null,

  EMOJI_COUNT: 30,

  init() {
    const now = new Date();
    this.viewMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    this.selectedDate = Utils.todayStr();
  },

  prevMonth() {
    this.viewMonth.setMonth(this.viewMonth.getMonth() - 1);
    this.render();
  },

  nextMonth() {
    this.viewMonth.setMonth(this.viewMonth.getMonth() + 1);
    this.render();
  },

  onDayClick(dateStr) {
    this.selectedDate = dateStr;
    this.showMoodEditor(dateStr);
  },

  showMoodEditor(dateStr) {
    const existing = DB.data.moods[dateStr] || {};
    const moodId = existing.moodId || '';
    const memo = existing.memo || '';

    let emojiHtml = '';
    for (let i = 1; i <= this.EMOJI_COUNT; i++) {
      const num = String(i).padStart(2, '0');
      const isSelected = moodId === num;
      emojiHtml += `<div class="mood-emoji-option ${isSelected ? 'selected' : ''}" data-emo="${num}" onclick="Mood.selectEmoji('${num}')">
        <img src="emotions/emo_${num}.png" alt="表情${num}">
      </div>`;
    }

    Modal.show(`
      <div class="modal-title">🌈 ${Utils.formatDateCN(dateStr)}的心情</div>
      <div style="font-size:13px;color:var(--text-secondary);margin-bottom:8px">选一个表情告诉葵吧～</div>
      <div class="mood-emoji-picker" id="mood-emoji-picker">${emojiHtml}</div>
      <div class="mood-memo-section">
        <div style="font-size:13px;color:var(--text-secondary);margin-bottom:6px">📝 今日故事</div>
        <textarea class="mood-memo-textarea" id="mood-memo-input" placeholder="今天发生了什么有趣的事？">${Utils.escapeHtml(memo)}</textarea>
      </div>
      <div class="mood-media-section" style="margin-top:12px">
        <div style="font-size:13px;color:var(--text-secondary);margin-bottom:6px">📷 图片/语音（可选）</div>
        <div class="mood-media-row">
          <label class="mood-media-btn">📷 图片<input type="file" accept="image/*" multiple style="display:none" onchange="Mood.addImages(this)"></label>
          <button class="mood-media-btn" id="mood-record-btn" onclick="Mood.toggleRecord()">🎤 录音</button>
        </div>
        <div class="mood-media-preview" id="mood-media-preview"></div>
      </div>
      <div class="modal-actions" style="margin-top:16px">
        ${existing.moodId ? `<button class="btn btn-danger" onclick="Mood.deleteMood('${dateStr}')">删除</button>` : ''}
        <button class="btn btn-secondary" onclick="Modal.close()">取消</button>
        <button class="btn btn-primary" onclick="Mood.saveMood('${dateStr}')">保存</button>
      </div>
    `);

    this._pendingMedia = [];
    this._pendingEmoji = moodId;
    this._renderPendingMedia();
  },

  selectEmoji(num) {
    this._pendingEmoji = num;
    document.querySelectorAll('.mood-emoji-option').forEach(el => {
      el.classList.toggle('selected', el.dataset.emo === num);
    });
  },

  _pendingMedia: [],
  _pendingEmoji: '',

  async addImages(input) {
    const files = Array.from(input.files);
    for (const file of files) {
      const reader = new FileReader();
      const dataUrl = await new Promise(resolve => {
        reader.onload = e => resolve(e.target.result);
        reader.readAsDataURL(file);
      });
      this._pendingMedia.push({ type: 'image', data: dataUrl });
    }
    input.value = '';
    this._renderPendingMedia();
  },

  _renderPendingMedia() {
    const container = document.getElementById('mood-media-preview');
    if (!container) return;
    container.innerHTML = this._pendingMedia.map((m, i) => {
      if (m.type === 'image') {
        return `<div class="mood-media-item">
          <img src="${m.data}">
          <div class="mood-media-remove" onclick="Mood.removeMedia(${i})">✕</div>
        </div>`;
      } else if (m.type === 'audio') {
        return `<div class="mood-media-item" style="width:120px;height:64px;display:flex;align-items:center;justify-content:center">
          <span style="font-size:11px;color:var(--text-secondary)">🎤 ${Math.round(m.duration||0)}s</span>
          <div class="mood-media-remove" onclick="Mood.removeMedia(${i})">✕</div>
        </div>`;
      }
      return '';
    }).join('');
  },

  removeMedia(index) {
    this._pendingMedia.splice(index, 1);
    this._renderPendingMedia();
  },

  _mediaRecorder: null,
  _recordChunks: [],
  _recordStartTime: 0,

  async toggleRecord() {
    const btn = document.getElementById('mood-record-btn');
    if (this._mediaRecorder && this._mediaRecorder.state === 'recording') {
      this._mediaRecorder.stop();
      btn.textContent = '🎤 录音';
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this._recordChunks = [];
      this._mediaRecorder = new MediaRecorder(stream);
      this._mediaRecorder.ondataavailable = e => { if (e.data.size > 0) this._recordChunks.push(e.data); };
      this._mediaRecorder.onstop = async () => {
        const blob = new Blob(this._recordChunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onload = e => {
          this._pendingMedia.push({ type: 'audio', data: e.target.result, duration: Math.round((Date.now() - this._recordStartTime) / 1000) });
          this._renderPendingMedia();
        };
        reader.readAsDataURL(blob);
        stream.getTracks().forEach(t => t.stop());
      };
      this._recordStartTime = Date.now();
      this._mediaRecorder.start();
      btn.textContent = '⏹ 停止录音';
    } catch(e) {
      Toast.show('无法访问麦克风', 'error');
    }
  },

  async saveMood(dateStr) {
    const memo = document.getElementById('mood-memo-input').value.trim();
    if (!this._pendingEmoji && !memo && this._pendingMedia.length === 0) {
      Toast.show('请选择心情或写点什么');
      return;
    }

    const moodData = {
      moodId: this._pendingEmoji || '',
      memo: memo,
      media: [],
      updatedAt: Utils.nowStr(),
    };

    for (const media of this._pendingMedia) {
      const id = `mood_${dateStr}_${DB.uid()}`;
      await IDB.put('moodMedia', { id, type: media.type, data: media.data, duration: media.duration });
      moodData.media.push({ id, type: media.type, duration: media.duration });
    }

    const existing = DB.data.moods[dateStr];
    if (existing && existing.media) {
      for (const m of existing.media) {
        if (!moodData.media.find(nm => nm.id === m.id)) {
          await IDB.delete('moodMedia', m.id);
        }
      }
    }

    DB.data.moods[dateStr] = moodData;
    DB.save();
    Modal.close();
    this.render();
    Toast.show('心情已记录 🌸');
  },

  async deleteMood(dateStr) {
    const existing = DB.data.moods[dateStr];
    if (existing && existing.media) {
      for (const m of existing.media) {
        await IDB.delete('moodMedia', m.id);
      }
    }
    delete DB.data.moods[dateStr];
    DB.save();
    Modal.close();
    this.render();
    Toast.show('心情记录已删除');
  },

  render() {
    const grid = document.getElementById('mood-calendar-grid');
    if (!grid) return;
    const title = document.getElementById('mood-cal-title');
    const year = this.viewMonth.getFullYear();
    const month = this.viewMonth.getMonth();
    title.textContent = `${year}年${month+1}月`;

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month+1, 0).getDate();
    const today = Utils.todayStr();

    const moods = DB.data.moods || {};

    let html = '';
    for (let i = 0; i < firstDay; i++) html += '<div class="mood-cal-cell empty"></div>';
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const mood = moods[dateStr];
      const isToday = dateStr === today;
      const isSelected = dateStr === this.selectedDate;

      if (mood && mood.moodId) {
        html += `<div class="mood-cal-cell has-mood ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}" onclick="Mood.onDayClick('${dateStr}')">
          <img class="mood-cal-emoji" src="emotions/emo_${mood.moodId}.png" alt="心情">
        </div>`;
      } else {
        html += `<div class="mood-cal-cell ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}" onclick="Mood.onDayClick('${dateStr}')">${d}</div>`;
      }
    }
    grid.innerHTML = html;

    this.renderRecentMoods();
  },

  async renderRecentMoods() {
    const moodSection = document.getElementById('mood-recent-card');
    if (!moodSection) return;

    const moodEntries = Object.entries(DB.data.moods || {})
      .filter(([dateStr, m]) => m.moodId || m.memo)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 10);

    if (moodEntries.length === 0) {
      moodSection.innerHTML = `<div class="card-title">📖 心情故事</div><div class="task-empty">还没有记录心情哦，点击日历开始吧 🌸</div>`;
      return;
    }

    let html = `<div class="card-title">📖 最近心情</div>`;
    for (const [dateStr, mood] of moodEntries) {
      let emojiHtml = '';
      if (mood.moodId) {
        emojiHtml = `<div class="mood-record-emoji"><img src="emotions/emo_${mood.moodId}.png" alt="心情"></div>`;
      }
      html += `<div class="mood-record-item" onclick="Mood.showMoodEditor('${dateStr}')">
        ${emojiHtml}
        <div class="mood-record-info">
          <div class="mood-record-date">${Utils.formatDateCN(dateStr)}</div>
          ${mood.memo ? `<div class="mood-record-memo">${Utils.escapeHtml(mood.memo)}</div>` : '<div class="mood-record-memo" style="font-style:italic;color:var(--text-light)">（仅表情）</div>'}
        </div>
      </div>`;
    }

    moodSection.innerHTML = html;
  },
};

/* ========== 运动锻炼 ========== */
const Exercise = {
  init() {},

  addType() {
    Modal.show(`
      <div class="modal-title">➕ 自定义运动</div>
      <div style="margin-bottom:8px;font-size:13px;color:var(--text-secondary)">选择图标并输入名称</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px" id="ex-icon-picker">
        ${['🏃','🚶','🚴','🏊','🏋️','🧘','🏀','⚽','🏸','🏓','🎾','🏐','🤸','🚣','🧗','⛸️','🥊','⛳'].map((icon, i) =>
          `<div class="fcat-item ${i===0?'active':''}" data-icon="${icon}" onclick="Exercise.selectIcon(this)" style="width:48px"><span class="fcat-icon">${icon}</span></div>`
        ).join('')}
      </div>
      <input type="text" id="ex-type-name" placeholder="运动名称（如：跳绳）" style="width:100%;padding:10px;border-radius:12px;border:1px solid var(--text-light);background:var(--bg-input);margin-bottom:12px">
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Modal.close()">取消</button>
        <button class="btn btn-primary" onclick="Exercise.confirmAddType()">添加</button>
      </div>
    `);
    this._selectedIcon = '🏃';
  },

  selectIcon(el) {
    document.querySelectorAll('#ex-icon-picker .fcat-item').forEach(e => e.classList.remove('active'));
    el.classList.add('active');
    this._selectedIcon = el.dataset.icon;
  },

  _selectedIcon: '🏃',

  confirmAddType() {
    const name = document.getElementById('ex-type-name').value.trim();
    if (!name) { Toast.show('请输入名称'); return; }
    DB.data.exercise.types.push({ id: DB.uid(), name, icon: this._selectedIcon });
    DB.save();
    Modal.close();
    this.renderTypeOptions();
    Toast.show('运动类型已添加 ✅');
  },

  deleteType(id) {
    DB.data.exercise.types = DB.data.exercise.types.filter(t => t.id !== id);
    DB.save();
    this.renderTypeOptions();
    this.render();
  },

  renderTypeOptions() {
    const sel = document.getElementById('ex-type');
    if (!sel) return;
    sel.innerHTML = DB.data.exercise.types.map(t =>
      `<option value="${t.id}">${t.icon} ${Utils.escapeHtml(t.name)}</option>`
    ).join('');
  },

  addRecord() {
    const typeSel = document.getElementById('ex-type');
    const durInput = document.getElementById('ex-duration');
    const dateInput = document.getElementById('ex-date');
    const noteInput = document.getElementById('ex-note');

    const duration = parseInt(durInput.value);
    if (!duration || duration < 1) { Toast.show('请输入有效时长'); return; }

    const record = {
      id: DB.uid(),
      typeId: typeSel.value,
      duration: duration,
      date: dateInput.value || Utils.todayStr(),
      note: noteInput.value.trim(),
    };

    DB.data.exercise.records.unshift(record);
    DB.save();

    durInput.value = '';
    noteInput.value = '';
    dateInput.value = Utils.todayStr();
    this.render();
    Toast.show('运动已记录 🏃');
  },

  deleteRecord(id) {
    DB.data.exercise.records = DB.data.exercise.records.filter(r => r.id !== id);
    DB.save();
    this.render();
  },

  addWeight() {
    const dateInput = document.getElementById('weight-date');
    const weightInput = document.getElementById('weight-input');
    const weight = parseFloat(weightInput.value);
    if (!weight || weight < 20 || weight > 300) { Toast.show('请输入有效体重'); return; }

    const date = dateInput.value || Utils.todayStr();

    const existing = DB.data.exercise.weights.find(w => w.date === date);
    if (existing) {
      existing.weight = weight;
    } else {
      DB.data.exercise.weights.push({ id: DB.uid(), date, weight });
    }

    DB.data.exercise.weights.sort((a, b) => a.date.localeCompare(b.date));
    DB.save();

    weightInput.value = '';
    dateInput.value = Utils.todayStr();
    this.render();
    Toast.show('体重已记录 ⚖️');
  },

  deleteWeight(id) {
    DB.data.exercise.weights = DB.data.exercise.weights.filter(w => w.id !== id);
    DB.save();
    this.render();
  },

  _weightChart: null,

  render() {
    this.renderTypeOptions();

    const types = DB.data.exercise.types;
    const records = DB.data.exercise.records || [];

    records.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    const listEl = document.getElementById('exercise-list');
    if (records.length === 0) {
      listEl.innerHTML = '<div class="task-empty">还没有运动记录，动起来吧 🏃</div>';
    } else {
      listEl.innerHTML = FoldableList.render(
        records,
        (r) => r.date || '无日期',
        (r) => {
          const type = types.find(t => t.id === r.typeId) || { icon: '🏅', name: '其他' };
          return `<div class="exercise-record">
            <div class="ex-icon">${type.icon}</div>
            <div class="ex-info">
              <div class="ex-type">${Utils.escapeHtml(type.name)}</div>
              ${r.note ? `<div class="ex-note">${Utils.escapeHtml(r.note)}</div>` : ''}
            </div>
            <span class="ex-duration">${r.duration}分钟</span>
            <span class="ex-delete" onclick="Exercise.deleteRecord('${r.id}')">✕</span>
          </div>`;
        },
        { emptyText: '暂无记录', defaultCollapsed: true }
      );
    }

    this.renderWeightChart();
    this.renderWeightStats();

    const dateInput = document.getElementById('ex-date');
    if (dateInput && !dateInput.value) dateInput.value = Utils.todayStr();
    const weightDateInput = document.getElementById('weight-date');
    if (weightDateInput && !weightDateInput.value) weightDateInput.value = Utils.todayStr();
  },

  renderWeightChart() {
    const canvas = document.getElementById('chart-weight-line');
    if (!canvas || typeof Chart === 'undefined') return;

    const weights = [...(DB.data.exercise.weights || [])].sort((a, b) => a.date.localeCompare(b.date));
    const recent = weights.slice(-30);

    const labels = recent.map(w => {
      const d = new Date(w.date);
      return `${d.getMonth()+1}/${d.getDate()}`;
    });
    const data = recent.map(w => w.weight);

    if (this._weightChart) this._weightChart.destroy();

    if (data.length === 0) {
      this._weightChart = new Chart(canvas, {
        type: 'line',
        data: { labels: ['暂无数据'], datasets: [{ data: [0], borderColor: '#85B79D' }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
      });
      return;
    }

    this._weightChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: '体重 (kg)',
          data,
          borderColor: '#85B79D',
          backgroundColor: 'rgba(133,183,157,0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 3,
          pointBackgroundColor: '#5E9B7C',
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: false } }
      }
    });
  },

  renderWeightStats() {
    const container = document.getElementById('weight-stats');
    if (!container) return;
    const weights = DB.data.exercise.weights || [];
    if (weights.length === 0) {
      container.innerHTML = '<div class="task-empty" style="padding:8px">暂无体重记录</div>';
      return;
    }

    const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date));
    const latest = sorted[sorted.length - 1];
    const first = sorted[0];
    const diff = latest.weight - first.weight;
    const min = Math.min(...sorted.map(w => w.weight));
    const max = Math.max(...sorted.map(w => w.weight));

    container.innerHTML = `
      <div class="weight-stat-item">
        <div class="weight-stat-label">当前</div>
        <div class="weight-stat-value">${latest.weight.toFixed(1)}</div>
      </div>
      <div class="weight-stat-item">
        <div class="weight-stat-label">变化</div>
        <div class="weight-stat-value" style="color:${diff > 0 ? 'var(--color-expense)' : diff < 0 ? 'var(--color-income)' : 'var(--text-primary)'}">${diff > 0 ? '+' : ''}${diff.toFixed(1)}</div>
      </div>
      <div class="weight-stat-item">
        <div class="weight-stat-label">最低</div>
        <div class="weight-stat-value">${min.toFixed(1)}</div>
      </div>
      <div class="weight-stat-item">
        <div class="weight-stat-label">最高</div>
        <div class="weight-stat-value">${max.toFixed(1)}</div>
      </div>
    `;
  },
};

/* ========== 纪念币 ========== */
const Coins = {
  init() {},

  render() {
    const el = document.getElementById('coins-big-balance');
    if (el) el.textContent = DB.data.coins || 0;
  },

  showHistory() {
    const history = DB.data.coinHistory || [];

    let html = `<div class="modal-title">🪙 纪念币记录</div>`;

    if (history.length === 0) {
      html += '<div class="task-empty">暂无记录</div>';
    } else {
      html += '<div style="max-height:400px;overflow-y:auto">';
      html += FoldableList.render(
        history,
        (item) => (item.date || '').slice(0, 10) || '无日期',
        (item) => {
          const isGain = item.amount > 0;
          return `<div class="coin-history-item">
            <div class="coin-history-info">
              <div class="coin-history-reason">${Utils.escapeHtml(item.reason || '纪念币变动')}</div>
              <div class="coin-history-date">${Utils.formatTime(item.date)}</div>
            </div>
            <div class="coin-history-amount ${isGain ? 'gain' : 'lose'}">${isGain ? '+' : ''}${item.amount}</div>
          </div>`;
        },
        { emptyText: '暂无记录', defaultCollapsed: false }
      );
      html += '</div>';
    }

    html += `<div class="modal-actions" style="margin-top:16px"><button class="btn btn-primary" onclick="Modal.close()">关闭</button></div>`;
    Modal.show(html);
  },
};

/* ========== 统计复盘 ========== */
const Stats = {
  _barChart: null,
  _pieChart: null,
  _lineChart: null,

  init() {},

  refresh() {
    if (typeof Chart === 'undefined') return;

    const timerHistory = DB.data.timerHistory || [];

    const totalMinutes = timerHistory.reduce((s, r) => s + (r.actualDuration || 0), 0);
    const totalHours = (totalMinutes / 60).toFixed(1);
    const totalEl = document.getElementById('stat-total-focus');
    if (totalEl) totalEl.textContent = `${totalHours}h`;

    const activeDates = new Set();
    timerHistory.forEach(r => { if (r.date) activeDates.add(r.date); });
    Object.keys(DB.data.tasks || {}).forEach(d => activeDates.add(d));
    (DB.data.habits || []).forEach(h => (h.checkins || []).forEach(d => activeDates.add(d)));
    const activeEl = document.getElementById('stat-active-days');
    if (activeEl) activeEl.textContent = activeDates.size;

    let bestStreak = 0;
    (DB.data.habits || []).forEach(h => {
      const s = Habits.calcStreak(h);
      if (s > bestStreak) bestStreak = s;
    });
    const streakEl = document.getElementById('stat-best-streak');
    if (streakEl) streakEl.textContent = bestStreak;

    this.renderHeatmap();
    this.renderFocusBar();
    this.renderFocusPie();
    this.renderTaskLine();
    this.renderHabitStats();
  },

  renderHeatmap() {
    const wrapper = document.getElementById('heatmap-wrapper');
    if (!wrapper) return;

    const today = new Date();
    const days = [];
    for (let i = 90; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      days.push(Utils.formatDate(d));
    }

    const activity = {};
    (DB.data.timerHistory || []).forEach(r => {
      if (r.date) activity[r.date] = (activity[r.date] || 0) + (r.actualDuration || 0);
    });
    Object.keys(DB.data.tasks || {}).forEach(date => {
      const tasks = DB.data.tasks[date];
      const done = tasks ? tasks.filter(t => t.done).length : 0;
      activity[date] = (activity[date] || 0) + done * 5;
    });
    (DB.data.habits || []).forEach(h => {
      (h.checkins || []).forEach(d => {
        activity[d] = (activity[d] || 0) + 10;
      });
    });

    let html = '<div class="heatmap-grid">';
    const firstDay = new Date(days[0]).getDay();
    for (let i = 0; i < firstDay; i++) {
      html += '<div class="heat-cell" style="visibility:hidden"></div>';
    }
    days.forEach(dateStr => {
      const score = activity[dateStr] || 0;
      let bg = 'var(--bg-input)';
      if (score >= 60) bg = 'var(--accent-orange-dark)';
      else if (score >= 40) bg = 'var(--accent-orange)';
      else if (score >= 20) bg = 'rgba(232,168,124,0.6)';
      else if (score >= 10) bg = 'rgba(232,168,124,0.4)';
      html += `<div class="heat-cell" style="background:${bg}" title="${dateStr}: ${score}分"></div>`;
    });
    html += '</div>';
    wrapper.innerHTML = html;
  },

  renderFocusBar() {
    const canvas = document.getElementById('chart-focus-bar');
    if (!canvas || typeof Chart === 'undefined') return;

    const labels = [];
    const data = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = Utils.formatDate(d);
      labels.push(`${d.getMonth()+1}/${d.getDate()}`);
      const minutes = (DB.data.timerHistory || [])
        .filter(r => r.date === dateStr && r.completed)
        .reduce((s, r) => s + (r.actualDuration || 0), 0);
      data.push(Math.round(minutes / 60 * 10) / 10);
    }

    if (this._barChart) this._barChart.destroy();
    this._barChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: '专注时长(小时)',
          data,
          backgroundColor: '#E8A87C',
          borderRadius: 4,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true } }
      }
    });
  },

  renderFocusPie() {
    const canvas = document.getElementById('chart-focus-pie');
    if (!canvas || typeof Chart === 'undefined') return;

    const completed = (DB.data.timerHistory || []).filter(r => r.completed).length;
    const incomplete = (DB.data.timerHistory || []).filter(r => !r.completed).length;

    if (this._pieChart) this._pieChart.destroy();

    if (completed + incomplete === 0) {
      this._pieChart = new Chart(canvas, {
        type: 'doughnut',
        data: { labels: ['暂无数据'], datasets: [{ data: [1], backgroundColor: ['#FAF3E8'] }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } } }
      });
      return;
    }

    this._pieChart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: ['已完成', '中途停止'],
        datasets: [{ data: [completed, incomplete], backgroundColor: ['#85B79D', '#E8A0A0'] }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 8 } } }
      }
    });
  },

  renderTaskLine() {
    const canvas = document.getElementById('chart-task-line');
    if (!canvas || typeof Chart === 'undefined') return;

    const labels = [];
    const data = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = Utils.formatDate(d);
      labels.push(`${d.getMonth()+1}/${d.getDate()}`);
      const tasks = DB.data.tasks[dateStr] || [];
      const total = tasks.length;
      const done = tasks.filter(t => t.done).length;
      const rate = total > 0 ? Math.round(done / total * 100) : 0;
      data.push(rate);
    }

    if (this._lineChart) this._lineChart.destroy();
    this._lineChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: '完成率(%)',
          data,
          borderColor: '#B8A0D4',
          backgroundColor: 'rgba(184,160,212,0.1)',
          fill: true,
          tension: 0.3,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, max: 100 } }
      }
    });
  },

  renderHabitStats() {
    const container = document.getElementById('habit-stats-list');
    if (!container) return;
    const habits = DB.data.habits || [];

    if (habits.length === 0) {
      container.innerHTML = '<div class="task-empty">还没有习惯数据</div>';
      return;
    }

    container.innerHTML = habits.map(habit => {
      const streak = Habits.calcStreak(habit);
      const rate = Habits.calcRate(habit);
      const total = (habit.checkins || []).length;
      return `<div class="habit-stat-item">
        <div>
          <div class="habit-stat-name">${habit.icon} ${Utils.escapeHtml(habit.name)}</div>
          <div class="habit-stat-rate">累计 ${total} 次 · 执行率 ${rate}%</div>
        </div>
        <div class="habit-stat-streak">🔥 ${streak}天</div>
      </div>`;
    }).join('');
  },
};

/* ========== 提醒系统 ========== */
const Reminders = {
  _intervalId: null,
  _triggered: new Set(),

  init() {},

  start() {
    if (this._intervalId) clearInterval(this._intervalId);
    this.check();
    this._intervalId = setInterval(() => this.check(), 30000);
  },

  check() {
    const now = new Date();
    const today = Utils.todayStr();
    const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const weekday = now.getDay();

    this._triggered.forEach(key => {
      if (!key.startsWith(today)) this._triggered.delete(key);
    });

    (DB.data.reminders || []).forEach(r => {
      if (!r.enabled) return;
      if (!r.days || !r.days.includes(weekday)) return;
      if (r.time !== timeStr) return;

      const key = `${today}_${r.id}`;
      if (this._triggered.has(key)) return;
      this._triggered.add(key);

      const habit = DB.data.habits.find(h => h.id === r.refId);
      const name = habit ? habit.name : '提醒';
      Toast.show(`⏰ ${name} - 该打卡啦！`);
      Utils.vibrate([100, 50, 100]);
    });
  },
};

/* ========== 桌面互动人物 · 雾矢葵 ========== */
const Companion = {
  _dragData: null,
  _bubbleTimeout: null,
  _greeted: false,

  dialogues: {
    greeting: [
      '今天也要元气满满哦！',
      '葵一直在你身边支持你～',
      '又是新的一天，加油！',
      '准备好开始今天的挑战了吗？',
    ],
    focusStart: [
      '专注开始啦，你可以的！',
      '这段时间只属于你和你想做的事～',
      '深呼吸，让我们开始吧！',
    ],
    focusComplete: [
      '太厉害了！你做到了！',
      '又一次战胜了自己，好棒！',
      '专注力满点！葵为你骄傲～',
      '看到你坚持的样子真的好帅！',
    ],
    focusStop: [
      '没关系，下次会更好的！',
      '休息一下也没事，调整好再来～',
      '别灰心，已经比昨天进步了！',
    ],
    habitCheckin: [
      '又打卡啦，习惯正在养成中～',
      '坚持就是胜利！你真棒！',
      '每一个小习惯都在改变你～',
    ],
    click: [
      '嗨～需要葵帮忙吗？',
      '你今天辛苦啦！',
      '点我干嘛呀～哈哈',
      '记住要好好照顾自己哦！',
      '你的努力葵都看在眼里呢～',
    ],
  },

  init() {
    this.setEnabled(DB.data.settings.companionEnabled);
    const img = document.getElementById('companion-img');
    if (!img) return;

    let pressTimer = null;
    let isDragging = false;

    const onStart = (e) => {
      const event = e.touches ? e.touches[0] : e;
      const widget = document.getElementById('companion-widget');
      const rect = widget.getBoundingClientRect();

      this._dragData = {
        startX: event.clientX,
        startY: event.clientY,
        widgetLeft: rect.left,
        widgetTop: rect.top,
        moved: false,
      };

      pressTimer = setTimeout(() => {
        if (this._dragData && !this._dragData.moved) {
          isDragging = true;
        }
      }, 200);
    };

    const onMove = (e) => {
      if (!this._dragData) return;
      const event = e.touches ? e.touches[0] : e;
      const dx = event.clientX - this._dragData.startX;
      const dy = event.clientY - this._dragData.startY;

      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        this._dragData.moved = true;
        clearTimeout(pressTimer);
        isDragging = true;
      }

      if (isDragging) {
        e.preventDefault();
        const widget = document.getElementById('companion-widget');
        let newLeft = this._dragData.widgetLeft + dx;
        let newTop = this._dragData.widgetTop + dy;

        const w = window.innerWidth;
        const h = window.innerHeight;
        const widgetW = 80;
        const widgetH = 120;
        newLeft = Math.max(0, Math.min(w - widgetW, newLeft));
        newTop = Math.max(0, Math.min(h - widgetH, newTop));

        widget.style.left = newLeft + 'px';
        widget.style.top = newTop + 'px';
        widget.style.right = 'auto';
        widget.style.bottom = 'auto';
      }
    };

    const onEnd = (e) => {
      clearTimeout(pressTimer);
      if (this._dragData && !this._dragData.moved) {
        this.onClick();
      }
      this._dragData = null;
      isDragging = false;
    };

    img.addEventListener('pointerdown', onStart);
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onEnd);

    img.addEventListener('touchstart', onStart, { passive: false });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);

    if (!this._greeted) {
      this._greeted = true;
      setTimeout(() => {
        this.showBubble(this.getDialogue('greeting'), 4000);
      }, 1500);
    }
  },

  setEnabled(enabled) {
    const widget = document.getElementById('companion-widget');
    if (widget) widget.style.display = enabled ? '' : 'none';
  },

  getDialogue(scene) {
    const lines = this.dialogues[scene] || this.dialogues.click;
    return lines[Math.floor(Math.random() * lines.length)];
  },

  getEncourage() {
    return this.getDialogue('focusComplete');
  },

  onClick() {
    const img = document.getElementById('companion-img');
    if (img) {
      img.classList.add('bounce');
      setTimeout(() => img.classList.remove('bounce'), 500);
    }
    this.showBubble(this.getDialogue('click'), 4000);
  },

  onScene(scene) {
    if (!DB.data.settings.companionEnabled) return;
    const msg = this.getDialogue(scene);
    setTimeout(() => this.showBubble(msg, 4000), 300);
  },

  showBubble(text, duration) {
    const bubble = document.getElementById('companion-bubble');
    if (!bubble) return;
    bubble.textContent = text;
    bubble.classList.remove('hidden');

    if (this._bubbleTimeout) clearTimeout(this._bubbleTimeout);
    if (duration) {
      this._bubbleTimeout = setTimeout(() => {
        bubble.classList.add('hidden');
      }, duration);
    }
  },

  hideBubble() {
    const bubble = document.getElementById('companion-bubble');
    if (bubble) bubble.classList.add('hidden');
    if (this._bubbleTimeout) clearTimeout(this._bubbleTimeout);
  },

  openSettings() {
    Modal.show(`
      <div class="modal-title">🌸 互动人物</div>
      <div style="text-align:center;margin-bottom:16px">
        <img src="companion-aoi.png" alt="雾矢葵" style="width:100px;height:auto;border-radius:12px;filter:drop-shadow(0 4px 8px rgba(184,160,212,0.3))">
      </div>
      <div style="text-align:center;font-size:18px;font-weight:700;margin-bottom:4px">雾矢葵</div>
      <div style="text-align:center;font-size:13px;color:var(--text-tertiary);margin-bottom:16px">来自偶像活动的伙伴，会一直陪伴你～</div>
      <div class="settings-item">
        <span class="settings-label">显示桌面人物</span>
        <div class="reminder-toggle ${DB.data.settings.companionEnabled ? 'on' : ''}" onclick="App.toggleSetting('companionEnabled', this)"></div>
      </div>
      <div class="settings-item">
        <span class="settings-label">📌 拖动提示</span>
        <span class="settings-value">长按可拖动位置</span>
      </div>
      <div class="modal-actions" style="margin-top:16px">
        <button class="btn btn-primary" onclick="Modal.close()">关闭</button>
      </div>
    `);
  },
};

/* ========== 启动 ========== */
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
