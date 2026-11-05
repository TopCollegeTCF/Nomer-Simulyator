(() => {
  "use strict";
  
  /* =========================================================
     Утилиты
     ========================================================= */
  const $ = id => document.getElementById(id);
  const rand = a => a[Math.floor(Math.random()*a.length)];
  const money = n => Math.round(n).toLocaleString("ru-RU") + " ₽";
  const now = () => Date.now();
  
  const letters = ["А","В","Е","К","М","Н","О","Р","С","Т","У","Х"];
  const regions = ["01","02","05","16","18","22","25","34","50","52","54","55","59","61","63","66","72","74","77","78","86","90","97","99","102","116","123","124","125","134","136","150","152","154","159","161","163","166","174","177","178","186","190","196","197","199","702","716","750","777","790","797","799"];
  const rarityRank = { "Обычный":1, "Необычный":2, "Редкий":3, "Эпический":4, "Легендарный":5 };
  const rarityColors = {"Обычный":"#aab3bf","Необычный":"#64c8ff","Редкий":"#b58aff","Эпический":"#ffad55","Легендарный":"#b8f34b"};
  
  const carCatalog = [
   {id:"sedan", name:"Городской седан", desc:"Надёжный первый автомобиль", price:18000, resale:11000, art:"images/1.png"},
   {id:"hatch", name:"Компактный хэтчбек", desc:"Манёвренный и экономичный", price:26500, resale:16000, art:"images/3.png"},
   {id:"suv",   name:"Внедорожник", desc:"Мощный автомобиль для города", price:52000, resale:32000, art:"images/2.png"},
   {id:"sport", name:"Спорткар", desc:"Яркий стиль и высокая цена", price:95000, resale:58000, art:"images/6.png"},
   {id:"lux",   name:"Премиум-седан", desc:"Комфорт и статус", price:145000, resale:90000, art:"images/5.png"},
   {id:"super", name:"Суперкар", desc:"Мечта коллекционера", price:260000, resale:160000, art:"images/7.png"},
   {id:"race",  name:"Гоночный-суперкар", desc:"Награда для ярого гонщика", price:360000, resale:260000, art:"images/9.png"}
  ];
  
  /* =========================================================
     Состояние
     ========================================================= */
  const SAVE_KEY = "avtonomer-save-v2";
  
  const defaultState = {
    money: 50000,
    plates: [],
    safe: [],
    cars: [],
    generated: 0,
    best: 0,
    nextId: 1,
    boostLuckUntil: 0,
    boostSellUntil: 0
  };
  
  function loadState(){
    try {
      const raw = localStorage.getItem(SAVE_KEY) || localStorage.getItem("avtonomer-save") || "{}";
      const s = { ...defaultState, ...JSON.parse(raw) };
      if (s.boostLuckUntil < now()) s.boostLuckUntil = 0;
      if (s.boostSellUntil < now()) s.boostSellUntil = 0;
      if (!Array.isArray(s.plates)) s.plates = [];
      if (!Array.isArray(s.safe)) s.safe = [];
      if (!Array.isArray(s.cars)) s.cars = [];
      if (typeof s.nextId !== "number" || s.nextId < 1) s.nextId = 1;
      return s;
    } catch(e) {
      return { ...defaultState };
    }
  }
  
  let state = loadState();
  let current = null;
  let toastTimer;
  let storageSort = "default";
  let equipTargetCarId = null;
  let spinning = false;
  let boostTimerInterval = null;
  
  function save(){
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch(e) {}
    renderStats();
  }
  
  /* =========================================================
     Бусты
     ========================================================= */
  const BOOST_LUCK_MS = 5 * 60 * 1000;
  const BOOST_SELL_MS = 5 * 60 * 1000;
  
  const isLuckActive = () => state.boostLuckUntil > now();
  const isSellActive = () => state.boostSellUntil > now();
  
  function activateLuckBoost(){
    const base = Math.max(now(), state.boostLuckUntil || 0);
    state.boostLuckUntil = base + BOOST_LUCK_MS;
    save();
    renderBoosts();
    notify("🎲 x2 шанс дропа активирован на 5 минут!");
  }
  function activateSellBoost(){
    const base = Math.max(now(), state.boostSellUntil || 0);
    state.boostSellUntil = base + BOOST_SELL_MS;
    save();
    renderBoosts();
    notify("📈 +50% к цене продажи номеров на 5 минут!");
  }
  
  function fmtMMSS(ms){
    if (ms <= 0) return "";
    const total = Math.ceil(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return m + ":" + String(s).padStart(2, "0");
  }
  
  function renderBoosts(){
    const luckBtn = $("boost-luck");
    const sellBtn = $("boost-sell");
    if (luckBtn){
      const active = isLuckActive();
      luckBtn.classList.toggle("active", active);
      const t = $("boost-luck-timer");
      if (t) t.textContent = active ? fmtMMSS(state.boostLuckUntil - now()) : "5:00";
    }
    if (sellBtn){
      const active = isSellActive();
      sellBtn.classList.toggle("active", active);
      const t = $("boost-sell-timer");
      if (t) t.textContent = active ? fmtMMSS(state.boostSellUntil - now()) : "5:00";
    }
  }
  
  function startBoostTicker(){
    if (boostTimerInterval) clearInterval(boostTimerInterval);
    boostTimerInterval = setInterval(() => {
      let needReRender = false;
      if (state.boostLuckUntil && state.boostLuckUntil <= now()){ state.boostLuckUntil = 0; needReRender = true; }
      if (state.boostSellUntil && state.boostSellUntil <= now()){ state.boostSellUntil = 0; needReRender = true; }
      if (needReRender) save();
      renderBoosts();
    }, 1000);
  }
  
  /* =========================================================
     Yandex SDK
     ========================================================= */
  let yandexSDK = null;
  let ysdkReady = false;
  
  async function initYandex(){
    try {
      if (typeof window.YaGames === "undefined") {
        console.info("[Yandex] SDK не найден — офлайн-режим (реклама эмулируется).");
        return;
      }
      yandexSDK = await window.YaGames.init();
      window.yandexSDK = yandexSDK;
      ysdkReady = true;
      try { yandexSDK.features?.LoadingAPI?.ready(); } catch(e){}
      console.info("[Yandex] SDK инициализирован.");
    } catch(e) {
      console.warn("[Yandex] Ошибка инициализации SDK:", e);
      ysdkReady = false;
    }
  }
  
  function showRewardedVideo(onReward){
    return new Promise(resolve => {
      if (!ysdkReady || !yandexSDK?.adv) {
        console.info("[Ads] Офлайн-режим: эмулируем награду.");
        setTimeout(() => {
          try { onReward && onReward(); } catch(e){ console.error(e); }
          resolve(true);
        }, 600);
        return;
      }
      let rewarded = false, closed = false;
      try {
        yandexSDK.adv.showRewardedVideo({
          callbacks: {
            onOpen: () => console.info("[Ads] Открыто"),
            onRewarded: () => { rewarded = true; console.info("[Ads] Награда получена"); },
            onClose: () => {
              if (closed) return;
              closed = true;
              if (rewarded){
                try { onReward && onReward(); } catch(e){ console.error(e); }
                resolve(true);
              } else {
                notify("Реклама закрыта — награда не получена.");
                resolve(false);
              }
            },
            onError: (err) => {
              console.warn("[Ads] Ошибка:", err);
              if (closed) return;
              closed = true;
              notify("Реклама недоступна. Попробуйте позже.");
              resolve(false);
            }
          }
        });
      } catch(e) {
        console.warn("[Ads] Исключение:", e);
        if (!closed) { closed = true; resolve(false); }
      }
    });
  }
  
  /* =========================================================
     Генерация
     ========================================================= */
  function makePlate(){
    let digits = String(Math.floor(Math.random()*1000)).padStart(3,"0");
    let a = rand(letters), b = rand(letters), c = rand(letters), region = rand(regions);
    let rank = 1;
  
    if (digits[0]===digits[1] && digits[1]===digits[2]) rank = 4;
    else if (["007","001","100","777","999"].includes(digits)) rank = 4;
    else if (digits[0]===digits[2] || digits[0]===digits[1] || digits[1]===digits[2]) rank = 2;
  
    if (a===b && b===c) rank = Math.max(rank, 4);
    else if (a===c) rank = Math.max(rank, 3);
  
    if (digits==="001" && a===b && b===c) rank = 5;
    if (["777","199","177","197"].includes(region)) rank = Math.min(5, rank+1);
  
    if (isLuckActive() && Math.random() < 0.5 && rank < 5) rank += 1;
  
    const names = ["","Обычный","Необычный","Редкий","Эпический","Легендарный"];
    const base = [0,500,1800,6500,18000,65000][rank];
    const price = Math.round(base + (Number(digits)%17)*23);
  
    return { id: state.nextId++, letters:[a, digits, b+c], region, code:a+digits+b+c, rarity:names[rank], rank, price, created: now() };
  }
  
  function rarityReason(p){
    const digits = String(p.letters?.[1] ?? "000");
    const first = p.letters?.[0] ?? "";
    const pair = p.letters?.[2] ?? "";
    const second = pair[0] ?? "", third = pair[1] ?? "";
    const reasons = [];
  
    if (digits[0]===digits[1] && digits[1]===digits[2]) reasons.push("Три одинаковые цифры подряд — очень редкое сочетание.");
    else if (["007","001","100","777","999"].includes(digits)) reasons.push("Особая комбинация цифр "+digits+" встречается реже обычных.");
    else if (digits[0]===digits[1] || digits[0]===digits[2] || digits[1]===digits[2]) reasons.push("В номере повторяются цифры — это повышает его редкость.");
  
    if (first===second && second===third) reasons.push("Все три буквы одинаковые — редкая буквенная серия.");
    else if (first===third) reasons.push("Первая и последняя буквы совпадают — зеркальная серия.");
  
    if (["777","199","177","197"].includes(String(p.region))) reasons.push("Код региона "+p.region+" повышает класс редкости.");
  
    if (!reasons.length) reasons.push("Нет повторяющихся или особых сочетаний — стандартный номер.");
    return reasons.join(" ");
  }
  
  function rarityClass(r){
    return "rarity-"+({"Обычный":"common","Необычный":"uncommon","Редкий":"rare","Эпический":"epic","Легендарный":"legendary"}[r] || "common");
  }
  
  function plateMarkup(p){
    return `<div class="plate ${rarityClass(p.rarity)}"><span class="plate-main"><b>${p.letters[0]}</b><b>${p.letters[1]}</b><b>${p.letters[2]}</b></span><span class="plate-region"><b>${p.region}</b><small>RUS <span class="flag">▰</span></small></span></div>`;
  }
  
  function notify(msg){
    const el = $("toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(()=>el.classList.remove("show"), 2200);
  }
  
  /* =========================================================
     Рендер статистики
     ========================================================= */
  function setText(id, val){ const el = $(id); if (el) el.textContent = val; }
  
  function renderStats(){
    setText("money", state.money.toLocaleString("ru-RU"));
    setText("storage-count", state.plates.length);
    setText("safe-count", state.safe.length);
    setText("garage-count", state.cars.length);
    setText("generated-total", state.generated);
  
    const all = [...state.plates, ...state.safe];
    const best = all.reduce((m,p)=>Math.max(m, p.rank || 1), 0);
    const bestName = best ? Object.keys(rarityRank).find(k=>rarityRank[k]===best) : "—";
    setText("best-rarity", bestName);
  
    renderBoosts();
  }
  
  function setCurrent(p){
    current = p;
    const plate = $("current-plate");
    if (!plate) return;
    plate.className = "plate " + rarityClass(p.rarity);
    plate.innerHTML = `<span class="plate-main"><b>${p.letters[0]}</b><b>${p.letters[1]}</b><b>${p.letters[2]}</b></span><span class="plate-region"><b>${p.region}</b><small>RUS <span class="flag">▰</span></small></span>`;
  
    const rn = $("rarity-name");
    if (rn){ rn.textContent = p.rarity + " номер"; rn.style.color = rarityColors[p.rarity]; }
    const rd = $("rarity-dot"); if (rd) rd.style.background = rarityColors[p.rarity];
    const pp = $("plate-price"); if (pp) pp.textContent = "≈ " + money(p.price);
  }
  
  /* =========================================================
     Радар редкости (декоративный)
     ========================================================= */
  const radarFeed = [];
  
  function renderRadarFeed(){
    const feed = $("radar-feed");
    if (!feed) return;
    if (!radarFeed.length){
      feed.innerHTML = `<div class="radar-feed-empty">Сканируем эфир…</div>`;
      return;
    }
    feed.innerHTML = radarFeed.map(item => `
      <div class="radar-feed-row">
        <span class="code">${item.code}</span>
        <span class="rar" style="color:${item.color}">${item.rarity}</span>
        <span class="reg">${item.region}</span>
      </div>
    `).join("");
  }
  
  function pushRadarFeed(p){
    const card = document.querySelector(".radar-card");
    const color = rarityColors[p.rarity] || "#aab3bf";
    radarFeed.unshift({ code: p.code, region: p.region, rarity: p.rarity, color });
    if (radarFeed.length > 5) radarFeed.length = 5;
    renderRadarFeed();
  
    if (card && (p.rank || 1) >= 4) {
      card.classList.remove("flash");
      void card.offsetWidth;
      card.classList.add("flash");
      setTimeout(() => card.classList.remove("flash"), 1200);
    }
  }
  
  function initRadar(){
    radarFeed.length = 0;
    const recent = [...state.plates].slice(0, 5);
    recent.forEach(p => {
      radarFeed.push({ code: p.code, region: p.region, rarity: p.rarity, color: rarityColors[p.rarity] || "#aab3bf" });
    });
    renderRadarFeed();
  }
  
  /* =========================================================
     Спиннер генерации
     ========================================================= */
  const wait = ms => new Promise(r => setTimeout(r, ms));
  
  function previewPlate(){
    const digits = String(Math.floor(Math.random()*1000)).padStart(3,"0");
    return {letters:[rand(letters), digits, rand(letters)+rand(letters)], region:rand(regions), rarity:"Обычный", price:500};
  }
  
  async function generate(){
    if (spinning) return;
    spinning = true;
    const button = $("generate-btn");
    if (button){ button.disabled = true; button.textContent = "⟳ ПРОКРУТКА НОМЕРА..."; }
    const plate = $("current-plate");
    if (plate) plate.classList.add("spinning");
  
    const frames = [48,52,58,64,72,82,95,112,135,165,205,255];
    for (const d of frames){
      setCurrent(previewPlate());
      await wait(d);
    }
  
    const p = makePlate();
    setCurrent(p);
    if (plate){
      plate.classList.remove("spinning");
      plate.classList.add("pop");
      setTimeout(()=>plate.classList.remove("pop"), 400);
    }
  
    state.plates.unshift(p);
    state.generated++;
    state.best = Math.max(state.best, p.rank);
    save();
    renderCollections();
  
    if (button){ button.disabled = false; button.textContent = "✦ СГЕНЕРИРОВАТЬ НОМЕР"; }
    spinning = false;
  
    notify("Выпал " + p.code + " · регион " + p.region + "! Номер в хранилище.");
    pushRadarFeed(p);
  }
  
  /* =========================================================
     Вкладки
     ========================================================= */
  function switchTab(tab){
    document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active", b.dataset.tab===tab));
    document.querySelectorAll(".panel").forEach(p=>p.classList.toggle("active", p.id==="panel-"+tab));
  }
  
  /* =========================================================
     Машины
     ========================================================= */
  function carSellPrice(car){
    const model = carCatalog.find(x=>x.id===car.model);
    if (!model) return 0;
    let price = model.resale;
    if (car.plateId){
      const plate = state.plates.find(p=>p.id===car.plateId) || state.safe.find(p=>p.id===car.plateId);
      if (plate){
        const bonusPct = [0, 0.08, 0.12, 0.18, 0.25, 0.35][plate.rank || 1] || 0.08;
        price += Math.round(plate.price * bonusPct);
      }
    }
    return price;
  }
  
  function renderCars(){
    const shop = $("shop-cars");
    if (shop){
      shop.innerHTML = carCatalog.map(c=>`
        <article class="car-card">
          <div class="car-visual"><img src="${c.art}" alt="${c.name}"></div>
          <div class="car-info">
            <h3>${c.name}</h3>
            <p>${c.desc}</p>
            <div class="car-bottom">
              <span class="price">${money(c.price)}</span>
              <button class="small-btn" data-buy="${c.id}">Купить</button>
            </div>
            <div class="car-resale-hint">Продажа ≈ ${money(c.resale)}</div>
          </div>
        </article>`).join("");
    }
  
    setText("owned-count", state.cars.length + " автомобилей");
    setText("garage-count", state.cars.length);
  
    const owned = $("owned-cars");
    if (owned){
      owned.innerHTML = state.cars.length ? state.cars.map(car=>{
        const model = carCatalog.find(x=>x.id===car.model) || carCatalog[0];
        const plate = car.plateId ? state.plates.find(p=>p.id===car.plateId) : null;
        const sell = carSellPrice(car);
        return `<div class="owned-card">
          <div>
            <div class="owned-car-name">${model.name}</div>
            <div class="owned-meta">${plate ? "Номер: "+plate.code+" · "+plate.region+" · "+plate.rarity : "Номер не установлен"} · Куплен за ${money(car.buyPrice)}</div>
          </div>
          <div class="owned-actions">
            ${!plate ? `<button class="small-btn" data-equip="${car.id}">Установить номер</button>` : `<button class="small-btn" data-unequip="${car.id}">Снять номер</button>`}
            <button class="small-btn" data-sellcar="${car.id}">Продать за ${money(sell)}</button>
          </div>
        </div>`;
      }).join("") : `<div class="empty-state"><div>🚗</div><h3>Гараж пуст</h3><p>Купи первую машину в автосалоне.</p></div>`;
    }
  }
  
  /* =========================================================
     Коллекции
     ========================================================= */
  function renderCollections(){
    const se = $("storage-empty"); if (se) se.style.display = state.plates.length ? "none" : "block";
    const fe = $("safe-empty"); if (fe) fe.style.display = state.safe.length ? "none" : "block";
  
    const sorted = [...state.plates];
    const sorters = {
      "price-asc": (a,b)=>a.price-b.price,
      "price-desc": (a,b)=>b.price-a.price,
      "rarity-desc": (a,b)=>(b.rank||1)-(a.rank||1),
      "rarity-asc": (a,b)=>(a.rank||1)-(b.rank||1),
      "name-asc": (a,b)=>a.code.localeCompare(b.code,"ru"),
      "name-desc": (a,b)=>b.code.localeCompare(a.code,"ru"),
      "date-desc": (a,b)=>(b.created||0)-(a.created||0),
      "date-asc": (a,b)=>(a.created||0)-(b.created||0)
    };
    if (sorters[storageSort]) sorted.sort(sorters[storageSort]);
  
    const sl = $("storage-list"); if (sl) sl.innerHTML = sorted.map(p=>collectionCard(p,"storage")).join("");
    const fl = $("safe-list"); if (fl) fl.innerHTML = state.safe.map(p=>collectionCard(p,"safe")).join("");
  
    renderStats();
  }
  
  function collectionCard(p, where){
    return `<article class="collection-card ${rarityClass(p.rarity)}">
      ${plateMarkup(p)}
      <div class="collection-meta"><span style="color:${rarityColors[p.rarity]}">${p.rarity}</span><b>${money(p.price)}</b></div>
      <p class="collection-reason">${rarityReason(p)}</p>
      <div class="collection-actions">
        ${where==="storage"
          ? `<button class="small-btn" data-vault="${p.id}">В сейф</button><button class="small-btn" data-sellplate="${p.id}">Продать</button>`
          : `<button class="small-btn" data-unvault="${p.id}">В хранилище</button>`}
      </div>
    </article>`;
  }
  
  /* =========================================================
     Покупка/продажа
     ========================================================= */
  function buyCar(id){
    const c = carCatalog.find(x=>x.id===id); if (!c) return;
    if (state.money < c.price){ notify("Не хватает денег!"); return; }
    state.money -= c.price;
    state.cars.push({id: state.nextId++, model: id, buyPrice: c.price, plateId: null});
    save();
    renderCars();
    notify("Автомобиль куплен!");
  }
  
  function sellPlate(id){
    const p = state.plates.find(x=>x.id===id); if (!p) return;
    if (state.cars.some(c=>c.plateId===id)){ notify("Сначала сними номер с машины!"); return; }
    let price = p.price;
    if (isSellActive()) price = Math.round(price * 1.5);
    state.plates = state.plates.filter(x=>x.id!==id);
    state.money += price;
    save();
    renderCollections();
    renderCars();
    notify("Номер продан за " + money(price) + (isSellActive() ? " (буст +50%)" : ""));
  }
  
  let deleteAllArmed = false, deleteAllTimer = null;
  function deleteAllPlates(){
    const button = $("sell-all-btn"); if (!button) return;
    if (!deleteAllArmed){
      deleteAllArmed = true;
      button.textContent = "ТОЧНО УДАЛИТЬ";
      clearTimeout(deleteAllTimer);
      deleteAllTimer = setTimeout(()=>{ deleteAllArmed = false; button.textContent = "УДАЛИТЬ ВСЁ"; }, 3000);
      return;
    }
    clearTimeout(deleteAllTimer);
    deleteAllArmed = false;
    state.plates = [];
    state.cars.forEach(car=>{ car.plateId = null; });
    button.textContent = "УДАЛИТЬ ВСЁ";
    save(); renderCollections(); renderCars();
  }
  
  function vault(id){
    const p = state.plates.find(x=>x.id===id); if (!p) return;
    if (state.cars.some(c=>c.plateId===id)){ notify("Нельзя убрать установленный номер в сейф!"); return; }
    state.plates = state.plates.filter(x=>x.id!==id);
    state.safe.unshift(p);
    save(); renderCollections();
    notify("Номер сохранён в сейфе.");
  }
  function unvault(id){
    const p = state.safe.find(x=>x.id===id); if (!p) return;
    state.safe = state.safe.filter(x=>x.id!==id);
    state.plates.unshift(p);
    save(); renderCollections();
    notify("Номер возвращён в хранилище.");
  }
  
  /* =========================================================
     Модалка выбора номера
     ========================================================= */
  function openPlatePicker(carId){
    const car = state.cars.find(x=>x.id===carId);
    if (!car) return;
    if (!state.plates.length){ notify("В хранилище нет свободных номеров!"); return; }
    equipTargetCarId = carId;
  
    const used = new Set(state.cars.filter(c=>c.plateId && c.id!==carId).map(c=>c.plateId));
    const free = state.plates.filter(p=>!used.has(p.id));
  
    const list = $("picker-list");
    if (list){
      list.innerHTML = free.length ? free.map(p=>`
        <button class="picker-item ${rarityClass(p.rarity)}" data-pick="${p.id}">
          ${plateMarkup(p)}
          <div class="picker-meta">
            <span style="color:${rarityColors[p.rarity]}">${p.rarity}</span>
            <b>${money(p.price)}</b>
          </div>
        </button>`).join("")
        : `<div class="empty-state"><div>📭</div><h3>Нет свободных номеров</h3></div>`;
    }
  
    const picker = $("plate-picker");
    if (picker){ picker.classList.add("open"); picker.setAttribute("aria-hidden","false"); }
  }
  function closePlatePicker(){
    const picker = $("plate-picker");
    if (picker){ picker.classList.remove("open"); picker.setAttribute("aria-hidden","true"); }
    equipTargetCarId = null;
  }
  function pickPlate(plateId){
    if (equipTargetCarId == null) return;
    const car = state.cars.find(x=>x.id===equipTargetCarId);
    if (!car) return;
    const p = state.plates.find(x=>x.id===plateId);
    if (!p) return;
    state.cars.forEach(c=>{ if (c.plateId===plateId) c.plateId = null; });
    car.plateId = plateId;
    save(); renderCars(); renderCollections(); closePlatePicker();
    notify("Номер "+p.code+" установлен!");
  }
  function unequip(carId){
    const car = state.cars.find(x=>x.id===carId);
    if (!car || !car.plateId) return;
    car.plateId = null;
    save(); renderCars(); renderCollections();
    notify("Номер снят.");
  }
  function sellCar(id){
    const car = state.cars.find(x=>x.id===id); if (!car) return;
    const model = carCatalog.find(x=>x.id===car.model); if (!model) return;
    const sell = carSellPrice(car);
    if (car.plateId) notify("Машина продана, номер вернулся в хранилище.");
    state.money += sell;
    state.cars = state.cars.filter(x=>x.id!==id);
    save(); renderCars(); renderCollections();
    notify("Автомобиль продан за " + money(sell));
  }
  
  /* =========================================================
     Кнопки бустов
     ========================================================= */
  function bindBoostButtons(){
    const luckBtn = $("boost-luck");
    const cashBtn = $("boost-cash");
    const sellBtn = $("boost-sell");
  
    if (luckBtn){
      luckBtn.addEventListener("click", async () => {
        if (isLuckActive()){
          notify("Буст x2 дроп уже активен: " + fmtMMSS(state.boostLuckUntil - now()));
          return;
        }
        luckBtn.disabled = true;
        await showRewardedVideo(() => activateLuckBoost());
        luckBtn.disabled = false;
      });
    }
    if (cashBtn){
      cashBtn.addEventListener("click", async () => {
        cashBtn.disabled = true;
        await showRewardedVideo(() => {
          state.money += 50000;
          save();
          notify("💰 Награда: +50 000 ₽");
        });
        cashBtn.disabled = false;
      });
    }
    if (sellBtn){
      sellBtn.addEventListener("click", async () => {
        if (isSellActive()){
          notify("Буст +50% уже активен: " + fmtMMSS(state.boostSellUntil - now()));
          return;
        }
        sellBtn.disabled = true;
        await showRewardedVideo(() => activateSellBoost());
        sellBtn.disabled = false;
      });
    }
  }
  
  /* =========================================================
     Делегирование кликов
     ========================================================= */
  document.addEventListener("click", e=>{
    if (e.target.id === "picker-backdrop"){ closePlatePicker(); return; }
    const t = e.target.closest("button");
    if (!t) return;
    if (t.id === "picker-close"){ closePlatePicker(); return; }
    if (t.dataset.tab) switchTab(t.dataset.tab);
    if (t.dataset.buy) buyCar(t.dataset.buy);
    if (t.dataset.sellplate) sellPlate(Number(t.dataset.sellplate));
    if (t.dataset.vault) vault(Number(t.dataset.vault));
    if (t.dataset.unvault) unvault(Number(t.dataset.unvault));
    if (t.dataset.equip) openPlatePicker(Number(t.dataset.equip));
    if (t.dataset.unequip) unequip(Number(t.dataset.unequip));
    if (t.dataset.sellcar) sellCar(Number(t.dataset.sellcar));
    if (t.dataset.pick) pickPlate(Number(t.dataset.pick));
  });
  
  /* =========================================================
     Init
     ========================================================= */
  const bind = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
  
  function initLanguage(){
    const lang = (navigator.language || "ru").toLowerCase();
    if (!lang.startsWith("ru")) document.documentElement.lang = "en";
  }
  
  function fitGameToScreen(){
    const shell = document.querySelector(".app-shell");
    if (!shell) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const landscape = vw > vh;
    const isPc = vw >= 900 || (landscape && vw >= 700 && vh >= 450);
    document.body.classList.toggle("landscape", landscape);
    document.body.classList.toggle("portrait", !landscape);
    document.body.classList.toggle("is-pc", isPc);
  
    let gw, gh;
    if (landscape){ gw = vw; gh = vh; }
    else {
      if (isPc){ gw = 420; gh = 860; }
      else { gw = 390; gh = 780; if (vh >= 850){ gw = 400; gh = 820; } }
    }
  
    shell.style.width = gw + "px";
    shell.style.height = gh + "px";
    shell.style.maxWidth = gw + "px";
    shell.style.maxHeight = gh + "px";
  
    const scale = Math.min(vw / gw, vh / gh);
    shell.style.transform = "scale(" + scale + ")";
    shell.style.transformOrigin = "center center";
  }
  window.addEventListener("resize", fitGameToScreen);
  window.addEventListener("orientationchange", ()=> setTimeout(fitGameToScreen, 120));
  
  function init(){
    initLanguage();
    setCurrent({letters:["А","000","АА"], region:"777", rarity:"Обычный", price:500});
    renderStats();
    renderCars();
    renderCollections();
    bindBoostButtons();
    startBoostTicker();
    initRadar();
    fitGameToScreen();
  
    bind("generate-btn", "click", generate);
    bind("sell-all-btn", "click", deleteAllPlates);
    bind("storage-sort", "change", e=>{ storageSort = e.target.value; renderCollections(); });
  
    bind("reset-btn", "click", ()=>{
      if (confirm("Начать заново? Прогресс будет удалён.")){
        try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem("avtonomer-save"); } catch(e){}
        state = { ...defaultState, plates:[], safe:[], cars:[] };
        setCurrent({letters:["А","000","АА"], region:"777", rarity:"Обычный", price:500});
        radarFeed.length = 0;
        renderRadarFeed();
        save(); renderCars(); renderCollections();
        notify("Игра началась заново.");
      }
    });
  
    initYandex();
  }
  init();
  
  })();