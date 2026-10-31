(() => {
"use strict";
const $ = id => document.getElementById(id);
const must = id => { const el = $(id); if(!el) throw new Error("Missing #"+id); return el; };
const letters = ["А","В","Е","К","М","Н","О","Р","С","Т","У","Х"];
const regions = ["01","02","05","16","18","22","25","34","50","52","54","55","59","61","63","66","72","74","77","78","86","90","97","99","102","116","123","124","125","134","136","150","152","154","159","161","163","166","174","177","178","186","190","196","197","199","702","716","750","777","790","797","799"];
const rarityRank = { "Обычный":1, "Необычный":2, "Редкий":3, "Эпический":4, "Легендарный":5 };
const rarityColors = {"Обычный":"#aab3bf","Необычный":"#64c8ff","Редкий":"#b58aff","Эпический":"#ffad55","Легендарный":"#b8f34b"};

/* Экономика: продажа машины ВСЕГДА дешевле покупки.
   Редкий номер на машине даёт бонус к цене продажи. */
const carCatalog = [
 {id:"sedan", name:"Городской седан", desc:"Надёжный первый автомобиль", price:18000, resale:11000, art:"assets/car-sedan.svg"},
 {id:"hatch", name:"Компактный хэтчбек", desc:"Манёвренный и экономичный", price:26500, resale:16000, art:"assets/car-hatch.svg"},
 {id:"suv",   name:"Внедорожник", desc:"Мощный автомобиль для города", price:52000, resale:32000, art:"assets/car-suv.svg"},
 {id:"sport", name:"Спорткар", desc:"Яркий стиль и высокая цена", price:95000, resale:58000, art:"assets/car-sport.svg"},
 {id:"lux",   name:"Премиум-седан", desc:"Комфорт и статус", price:145000, resale:90000, art:"assets/car-lux.svg"},
 {id:"super", name:"Суперкар", desc:"Мечта коллекционера", price:260000, resale:160000, art:"assets/car-super.svg"}
];

const defaultState = {money:50000,plates:[],safe:[],cars:[],generated:0,best:0,nextId:1};
let state = load();
let current = null;
let toastTimer;
let storageSort = "default";
let equipTargetCarId = null;

function load(){try{return {...defaultState,...JSON.parse(localStorage.getItem("avtonomer-save")||"{}")}}catch(e){return {...defaultState}}}
function save(){localStorage.setItem("avtonomer-save",JSON.stringify(state));renderStats()}
function money(n){return Math.round(n).toLocaleString("ru-RU")+" ₽"}
function rand(a){return a[Math.floor(Math.random()*a.length)]}

function makePlate(){
 let digits=String(Math.floor(Math.random()*1000)).padStart(3,"0");
 let a=rand(letters),b=rand(letters),c=rand(letters),region=rand(regions);
 let rank=1;
 if(digits[0]===digits[1]&&digits[1]===digits[2]) rank=4;
 else if(digits==="007"||digits==="001"||digits==="100"||digits==="777"||digits==="999") rank=4;
 else if(digits[0]===digits[2]||digits[0]===digits[1]||digits[1]===digits[2]) rank=2;
 if(a===b&&b===c) rank=Math.max(rank,4);
 else if(a===c) rank=Math.max(rank,3);
 if(digits==="001"&&a===b&&b===c) rank=5;
 if(region==="777"||region==="199"||region==="177"||region==="197") rank=Math.min(5,rank+1);
 const names=["","Обычный","Необычный","Редкий","Эпический","Легендарный"];
 const base=[0,500,1800,6500,18000,65000][rank];
 const price=Math.round(base+(Number(digits)%17)*23);
 return {id:state.nextId++,letters:[a,digits,b+c],region,code:a+digits+b+c,rarity:names[rank],rank,price,created:Date.now()};
}

function rarityReason(p){
 const digits=String(p.letters?.[1] ?? "000");
 const first=p.letters?.[0] ?? "";
 const pair=p.letters?.[2] ?? "";
 const second=pair[0] ?? "", third=pair[1] ?? "";
 const reasons=[];
 if(digits[0]===digits[1] && digits[1]===digits[2]) reasons.push("Три одинаковые цифры подряд — очень редкое сочетание.");
 else if(["007","001","100","777","999"].includes(digits)) reasons.push("Особая комбинация цифр "+digits+" встречается реже обычных.");
 else if(digits[0]===digits[1] || digits[0]===digits[2] || digits[1]===digits[2]) reasons.push("В номере повторяются цифры — это повышает его редкость.");
 if(first===second && second===third) reasons.push("Все три буквы одинаковые — редкая буквенная серия.");
 else if(first===third) reasons.push("Первая и последняя буквы совпадают — получается зеркальная серия.");
 if(["777","199","177","197"].includes(String(p.region))) reasons.push("Код региона "+p.region+" повышает класс редкости этого номера.");
 if(!reasons.length) reasons.push("Нет повторяющихся или особых сочетаний — стандартный номер.");
 return reasons.join(" ");
}

function rarityClass(r){
 return "rarity-"+({"Обычный":"common","Необычный":"uncommon","Редкий":"rare","Эпический":"epic","Легендарный":"legendary"}[r] || "common");
}

function plateMarkup(p){
 return `<div class="plate ${rarityClass(p.rarity)}"><span class="plate-main"><b>${p.letters[0]}</b><b>${p.letters[1]}</b><b>${p.letters[2]}</b></span><span class="plate-region"><b>${p.region}</b><small>RUS <span class="flag">▰</span></small></span></div>`;
}

function notify(msg){
 const el=$("toast");
 el.textContent=msg;
 el.classList.add("show");
 clearTimeout(toastTimer);
 toastTimer=setTimeout(()=>el.classList.remove("show"),2200);
}

function renderStats(){
 const setText = (id, val) => { const el = $(id); if(el) el.textContent = val; };
 setText("money", state.money.toLocaleString("ru-RU"));
 setText("storage-count", state.plates.length);
 setText("safe-count", state.safe.length);
 setText("garage-count", state.cars.length);
 setText("generated-total", state.generated);
 const all=[...state.plates,...state.safe];
 const best=all.reduce((m,p)=>Math.max(m,p.rank||1),0);
 setText("best-rarity", best ? Object.keys(rarityRank).find(k=>rarityRank[k]===best) : "—");
}

function setCurrent(p){
 current=p;
 const currentPlate=$("current-plate");
 currentPlate.className="plate "+rarityClass(p.rarity);
 currentPlate.innerHTML=`<span class="plate-main"><b>${p.letters[0]}</b><b>${p.letters[1]}</b><b>${p.letters[2]}</b></span><span class="plate-region"><b>${p.region}</b><small>RUS <span class="flag">▰</span></small></span>`;
 $("rarity-reason").textContent=rarityReason(p);
 $("rarity-name").textContent=p.rarity+" номер";
 $("rarity-name").style.color=rarityColors[p.rarity];
 $("rarity-dot").style.background=rarityColors[p.rarity];
 $("plate-price").textContent="≈ "+money(p.price);
}

let spinning = false;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function previewPlate(){
 const digits=String(Math.floor(Math.random()*1000)).padStart(3,"0");
 return {letters:[rand(letters),digits,rand(letters)+rand(letters)],region:rand(regions),rarity:"Обычный",price:500};
}

async function generate(){
 if(spinning)return;
 spinning=true;
 const button=$("generate-btn");
 button.disabled=true;
 button.textContent="⟳ ПРОКРУТКА НОМЕРА...";
 const plate=$("current-plate");
 plate.classList.add("spinning");
 const frames=[48,52,58,64,72,82,95,112,135,165,205,255];
 for(const duration of frames){
   setCurrent(previewPlate());
   await wait(duration);
 }
 const p=makePlate();
 setCurrent(p);
 plate.classList.remove("spinning");
 plate.classList.add("pop");
 setTimeout(()=>plate.classList.remove("pop"),400);
 state.plates.unshift(p);
 state.generated++;
 state.best=Math.max(state.best,p.rank);
 save();
 renderCollections();
 button.disabled=false;
 button.textContent="✦ СГЕНЕРИРОВАТЬ НОМЕР";
 spinning=false;
 notify("Выпал "+p.code+" · регион "+p.region+"! Номер добавлен в хранилище.");
}

function switchTab(tab){
 document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));
 document.querySelectorAll(".panel").forEach(p=>p.classList.toggle("active",p.id==="panel-"+tab));
}

/** Цена продажи машины = базовая resale + бонус за номер */
function carSellPrice(car){
 const model=carCatalog.find(x=>x.id===car.model);
 if(!model) return 0;
 let price = model.resale;
 if(car.plateId){
   const plate = state.plates.find(p=>p.id===car.plateId) || state.safe.find(p=>p.id===car.plateId);
   if(plate){
     // бонус 8–35% от цены номера в зависимости от редкости
     const bonusPct = [0, 0.08, 0.12, 0.18, 0.25, 0.35][plate.rank || 1] || 0.08;
     price += Math.round(plate.price * bonusPct);
   }
 }
 return price;
}

function renderCars(){
 $("shop-cars").innerHTML=carCatalog.map(c=>`
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

 $("owned-count").textContent=state.cars.length+" автомобилей";
 $("garage-count").textContent=state.cars.length;

 $("owned-cars").innerHTML=state.cars.length ? state.cars.map(car=>{
   const model=carCatalog.find(x=>x.id===car.model)||carCatalog[0];
   const plate=car.plateId ? state.plates.find(p=>p.id===car.plateId) : null;
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

function renderCollections(){
 $("storage-empty").style.display=state.plates.length?"none":"block";
 $("safe-empty").style.display=state.safe.length?"none":"block";
 const sortedPlates=[...state.plates];
 const sorters={
  "price-asc":(a,b)=>a.price-b.price,
  "price-desc":(a,b)=>b.price-a.price,
  "rarity-desc":(a,b)=>(b.rank||rarityRank[b.rarity]||1)-(a.rank||rarityRank[a.rarity]||1),
  "rarity-asc":(a,b)=>(a.rank||rarityRank[a.rarity]||1)-(b.rank||rarityRank[b.rarity]||1),
  "name-asc":(a,b)=>a.code.localeCompare(b.code,"ru"),
  "name-desc":(a,b)=>b.code.localeCompare(a.code,"ru"),
  "date-desc":(a,b)=>(b.created||0)-(a.created||0),
  "date-asc":(a,b)=>(a.created||0)-(b.created||0)
 };
 if(sorters[storageSort]) sortedPlates.sort(sorters[storageSort]);
 $("storage-list").innerHTML=sortedPlates.map(p=>collectionCard(p,"storage")).join("");
 $("safe-list").innerHTML=state.safe.map(p=>collectionCard(p,"safe")).join("");
 renderStats();
}

function collectionCard(p,where){
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

function buyCar(id){
 const c=carCatalog.find(x=>x.id===id); if(!c) return;
 if(state.money < c.price){ notify("Не хватает денег на покупку!"); return; }
 state.money -= c.price;
 state.cars.push({id:state.nextId++, model:id, buyPrice:c.price, plateId:null});
 save();
 renderCars();
 notify("Автомобиль куплен!");
}

function sellPlate(id){
 const p=state.plates.find(x=>x.id===id); if(!p) return;
 if(state.cars.some(c=>c.plateId===id)){ notify("Сначала сними номер с автомобиля!"); return; }
 state.plates = state.plates.filter(x=>x.id!==id);
 state.money += p.price;
 save();
 renderCollections();
 renderCars();
 notify("Номер продан за "+money(p.price));
}

let deleteAllArmed=false;
let deleteAllTimer=null;
function deleteAllPlates(){
 const button=$("sell-all-btn");
 if(!deleteAllArmed){
  deleteAllArmed=true;
  button.textContent="ТОЧНО УДАЛИТЬ";
  clearTimeout(deleteAllTimer);
  deleteAllTimer=setTimeout(()=>{ deleteAllArmed=false; button.textContent="УДАЛИТЬ ВСЁ"; },3000);
  return;
 }
 clearTimeout(deleteAllTimer);
 deleteAllArmed=false;
 state.plates=[];
 state.cars.forEach(car=>{ car.plateId=null; });
 button.textContent="УДАЛИТЬ ВСЁ";
 save();
 renderCollections();
 renderCars();
}

function vault(id){
 const p=state.plates.find(x=>x.id===id); if(!p) return;
 if(state.cars.some(c=>c.plateId===id)){ notify("Нельзя убрать установленный номер в сейф!"); return; }
 state.plates = state.plates.filter(x=>x.id!==id);
 state.safe.unshift(p);
 save();
 renderCollections();
 notify("Номер надёжно сохранён в сейфе.");
}

function unvault(id){
 const p=state.safe.find(x=>x.id===id); if(!p) return;
 state.safe = state.safe.filter(x=>x.id!==id);
 state.plates.unshift(p);
 save();
 renderCollections();
 notify("Номер возвращён в хранилище.");
}

/* ===== Модалка выбора номера ===== */
function openPlatePicker(carId){
 const car = state.cars.find(x=>x.id===carId);
 if(!car) return;
 if(!state.plates.length){ notify("В хранилище нет свободных номеров!"); return; }
 equipTargetCarId = carId;

 // номера, которые уже стоят на других машинах, недоступны
 const used = new Set(state.cars.filter(c=>c.plateId && c.id!==carId).map(c=>c.plateId));
 const free = state.plates.filter(p=>!used.has(p.id));

 const list = $("picker-list");
 if(!free.length){
   list.innerHTML = `<div class="empty-state"><div>📭</div><h3>Нет свободных номеров</h3><p>Все номера уже установлены на другие машины.</p></div>`;
 } else {
   list.innerHTML = free.map(p=>`
     <button class="picker-item ${rarityClass(p.rarity)}" data-pick="${p.id}">
       ${plateMarkup(p)}
       <div class="picker-meta">
         <span style="color:${rarityColors[p.rarity]}">${p.rarity}</span>
         <b>${money(p.price)}</b>
       </div>
     </button>`).join("");
 }

 $("plate-picker").classList.add("open");
 $("plate-picker").setAttribute("aria-hidden","false");
}

function closePlatePicker(){
 $("plate-picker").classList.remove("open");
 $("plate-picker").setAttribute("aria-hidden","true");
 equipTargetCarId = null;
}

function pickPlate(plateId){
 if(equipTargetCarId == null) return;
 const car = state.cars.find(x=>x.id===equipTargetCarId);
 if(!car) return;
 const p = state.plates.find(x=>x.id===plateId);
 if(!p) return;
 // снять с другой машины если вдруг
 state.cars.forEach(c=>{ if(c.plateId===plateId) c.plateId=null; });
 car.plateId = plateId;
 save();
 renderCars();
 renderCollections();
 closePlatePicker();
 notify("Номер "+p.code+" установлен на автомобиль!");
}

function unequip(carId){
 const car = state.cars.find(x=>x.id===carId);
 if(!car || !car.plateId) return;
 car.plateId = null;
 save();
 renderCars();
 renderCollections();
 notify("Номер снят с автомобиля.");
}

function sellCar(id){
 const car = state.cars.find(x=>x.id===id); if(!car) return;
 const model = carCatalog.find(x=>x.id===car.model); if(!model) return;
 const sell = carSellPrice(car);
 // номер возвращается в хранилище без изменения цены
 if(car.plateId){
   notify("Машина продана, номер вернулся в хранилище.");
 }
 state.money += sell;
 state.cars = state.cars.filter(x=>x.id!==id);
 save();
 renderCars();
 renderCollections();
 notify("Автомобиль продан за "+money(sell));
}

document.addEventListener("click", e=>{
 // закрытие модалки по клику на фон
 if(e.target.id === "picker-backdrop"){ closePlatePicker(); return; }

 const t = e.target.closest("button");
 if(!t) return;
 if(t.id === "picker-close"){ closePlatePicker(); return; }
 if(t.dataset.tab) switchTab(t.dataset.tab);
 if(t.dataset.buy) buyCar(t.dataset.buy);
 if(t.dataset.sellplate) sellPlate(Number(t.dataset.sellplate));
 if(t.dataset.vault) vault(Number(t.dataset.vault));
 if(t.dataset.unvault) unvault(Number(t.dataset.unvault));
 if(t.dataset.equip) openPlatePicker(Number(t.dataset.equip));
 if(t.dataset.unequip) unequip(Number(t.dataset.unequip));
 if(t.dataset.sellcar) sellCar(Number(t.dataset.sellcar));
 if(t.dataset.pick) pickPlate(Number(t.dataset.pick));
});

const bind = (id, event, fn) => { const el = $(id); if(el) el.addEventListener(event, fn); };
bind("generate-btn", "click", generate);
bind("sell-all-btn", "click", deleteAllPlates);
bind("storage-sort", "change", e=>{ storageSort=e.target.value; renderCollections(); });
bind("reset-btn", "click", ()=>{
 if(confirm("Точно начать игру заново? Весь прогресс будет удалён.")){
   localStorage.removeItem("avtonomer-save");
   state={...defaultState,plates:[],safe:[],cars:[]};
   setCurrent({letters:["А","000","АА"],region:"777",rarity:"Обычный",price:500});
   save(); renderCars(); renderCollections();
   notify("Игра началась заново.");
 }
});

function initLanguage(){
 const lang=(navigator.language||"ru").toLowerCase();
 if(!lang.startsWith("ru")) document.documentElement.lang="en";
}

async function initYandex(){
 try{
   if(window.YaGames){
     const sdk=await YaGames.init();
     window.yandexSDK=sdk;
   }
 }catch(e){
   console.info("Yandex Games SDK недоступен в режиме локального запуска.");
 }
}


function fitGameToScreen(){
  const shell = document.querySelector(".app-shell");
  if(!shell) return;
  const gw = 390;
  const gh = 780;
  const pad = 0;
  const vw = window.innerWidth - pad;
  const vh = window.innerHeight - pad;
  const scale = Math.min(vw / gw, vh / gh);
  shell.style.transform = "scale(" + scale + ")";
  shell.style.transformOrigin = "center center";
}
window.addEventListener("resize", fitGameToScreen);
window.addEventListener("orientationchange", () => setTimeout(fitGameToScreen, 100));

function init(){
 initLanguage();
 setCurrent({letters:["А","000","АА"],region:"777",rarity:"Обычный",price:500});
 renderStats();
 renderCars();
 renderCollections();
 initYandex();
 fitGameToScreen();
}
init();

})();
