const KEY = "night-auditor-v2";
const defaults = [["23:00", "استلام المناوبة ومراجعة سجل التسليم"], ["23:30", "مراجعة الوصولات المتأخرة والحجوزات"], ["00:00", "مراجعة المدفوعات وحسابات النزلاء"], ["01:00", "التحقق من أسعار الغرف والعمليات المسجلة"], ["02:00", "مراجعة المداخيل والمصاريف ووسائل الدفع"], ["03:00", "تنفيذ الإغلاق الليلي حسب إجراءات الفندق"], ["04:00", "مراجعة التقارير والفروقات المالية"], ["06:00", "تحضير تقرير نهاية المناوبة"], ["07:00", "تسليم المناوبة وتوضيح الملاحظات"]];
const fresh = () => ({
    tasks: defaults.map( (x, i) => ({
        id: i + 1,
        time: x[0],
        name: x[1],
        repeat: 10,
        status: "pending"
    })),
    ops: [],
    rooms: {
        total: 20,
        occupied: 0,
        arrivals: 0,
        departures: 0,
        openingCash: 0,
        countedCash: 0,
        movementNotes: ""
    },
    shift: {
        start: "23:00",
        end: "07:00"
    },
    handover: "",
    history: []
});
let data;
try {
    data = JSON.parse(localStorage.getItem(KEY)) || fresh()
} catch {
    data = fresh()
}
let lang = "ar"
  , notifiedAt = {};
const $ = id => document.getElementById(id);
const money = n => (Number(n) || 0).toLocaleString("fr-MA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
}) + " DH";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
}[c]));
function totals() {
    let inc = 0
      , exp = 0
      , cashInc = 0
      , cashExp = 0
      , roomRevenue = 0;
    data.ops.forEach(o => {
        let v = +o.amount || 0;
        if (o.type === "income") {
            inc += v;
            if (o.payment === "cash")
                cashInc += v;
            if (o.category === "room")
                roomRevenue += v
        } else {
            exp += v;
            if (o.payment === "cash")
                cashExp += v
        }
    }
    );
    return {
        inc,
        exp,
        net: inc - exp,
        cashInc,
        cashExp,
        roomRevenue
    }
}
function save() {
    localStorage.setItem(KEY, JSON.stringify(data));
    $("saveState").textContent = "تم الحفظ محلياً على هذا الجهاز";
    render()
}
function toast(s) {
    $("toast").textContent = s;
    $("toast").classList.add("show");
    setTimeout( () => $("toast").classList.remove("show"), 2600)
}
function isPast(time) {
    let now = new Date()
      , [h,m] = time.split(":").map(Number)
      , d = new Date();
    d.setHours(h, m, 0, 0);
    let start = +data.shift.start.slice(0, 2);
    if (start >= 12 && now.getHours() < 12 && h < 12)
        d.setDate(d.getDate() + 1);
    return now > d
}
function render() {
    let t = totals()
      , r = data.rooms
      , occ = r.total ? 100 * r.occupied / r.total : 0
      , adr = r.occupied ? t.roomRevenue / r.occupied : 0
      , revpar = r.total ? t.roomRevenue / r.total : 0;
    $("remaining").textContent = data.tasks.filter(x => x.status !== "done").length;
    $("done").textContent = data.tasks.filter(x => x.status === "done").length;
    $("net").textContent = money(t.net);
    $("occupancy").textContent = occ.toFixed(1) + "%";
    $("incomeTotal").textContent = money(t.inc);
    $("expenseTotal").textContent = money(t.exp);
    $("netTotal").textContent = money(t.net);
    $("taskList").innerHTML = data.tasks.slice().sort( (a, b) => a.time.localeCompare(b.time)).map(x => {
        let late = x.status !== "done" && isPast(x.time);
        return `<article class="task ${x.status === "done" ? "done" : ""} ${late ? "overdue" : ""}"><div class="task-time">${x.time}</div><div><div class="task-name">${esc(x.name)}</div><small>${x.status === "done" ? "تم الإنجاز" : late ? "متأخرة — تحتاج متابعة" : "بانتظار التنفيذ"} · تذكير كل ${x.repeat} دقيقة</small></div><div class="task-actions">${x.status !== "done" ? `<button class="complete" onclick="completeTask(${x.id})">تم</button><button class="postpone" onclick="postponeTask(${x.id})">＋10 د</button>` : `<button onclick="undoTask(${x.id})">تراجع</button>`}</div></article>`
    }
    ).join("");
    $("operationRows").innerHTML = data.ops.slice().reverse().map(o => `<tr><td>${o.time}</td><td>${o.type === "income" ? "مدخول" : "مصروف"}</td><td>${esc(o.categoryLabel)}</td><td>${money(o.amount)}</td><td>${esc(o.paymentLabel)}</td><td>${esc(o.note || "—")}</td><td><button onclick="deleteOp(${o.id})">✕</button></td></tr>`).join("") || `<tr><td colspan="7">لا توجد عمليات مسجلة</td></tr>`;
    $("occKpi").textContent = occ.toFixed(1) + "%";
    $("adrKpi").textContent = money(adr);
    $("revparKpi").textContent = money(revpar);
    let expected = +r.openingCash + t.cashInc - t.cashExp
      , diff = +r.countedCash - expected;
    $("expectedCash").textContent = "الرصيد النظري: " + money(expected);
    $("cashDifference").textContent = "الفرق: " + money(diff);
    $("cashDifference").style.color = Math.abs(diff) < .005 ? "var(--green)" : "var(--red)";
    makeReport();
    renderHistory()
}
function makeReport() {
    let t = totals()
      , r = data.rooms
      , done = data.tasks.filter(x => x.status === "done").length
      , occ = r.total ? 100 * r.occupied / r.total : 0;
    $("reportContent").innerHTML = `<h3>تقرير المناوبة الليلية</h3><p>${new Date().toLocaleString()}</p><div class="report-grid">
<div class="report-item"><b>المهام المنجزة</b><br>${done}/${data.tasks.length}</div><div class="report-item"><b>الإشغال</b><br>${r.occupied}/${r.total} (${occ.toFixed(1)}%)</div>
<div class="report-item"><b>الوصولات / المغادرات</b><br>${r.arrivals} / ${r.departures}</div><div class="report-item"><b>مداخيل الغرف</b><br>${money(t.roomRevenue)}</div>
<div class="report-item"><b>ADR</b><br>${money(r.occupied ? t.roomRevenue / r.occupied : 0)}</div><div class="report-item"><b>RevPAR</b><br>${money(r.total ? t.roomRevenue / r.total : 0)}</div>
<div class="report-item"><b>المداخيل</b><br>${money(t.inc)}</div><div class="report-item"><b>المصاريف</b><br>${money(t.exp)}</div>
<div class="report-item"><b>الصافي</b><br>${money(t.net)}</div><div class="report-item"><b>الصندوق النظري / الفعلي</b><br>${money(+r.openingCash + t.cashInc - t.cashExp)} / ${money(r.countedCash)}</div></div>
<p><b>ملاحظات الحركة:</b><br>${esc(r.movementNotes || "—")}</p><p><b>المهام غير المنجزة:</b><br>${data.tasks.filter(x => x.status !== "done").map(x => esc(x.time + " — " + x.name)).join("<br>") || "—"}</p><p><b>تسليم المناوبة:</b><br>${esc(data.handover || "—")}</p>`
}
function renderHistory() {
    $("historyList").innerHTML = (data.history || []).slice().reverse().map( (h, i) => `<article class="task"><div class="task-time">${esc(h.date)}</div><div><div class="task-name">صافي: ${money(h.net)} · إشغال: ${h.occupancy}%</div><small>مداخيل ${money(h.income)} · مصاريف ${money(h.expense)} · مهام ${h.done}/${h.total}</small></div><div class="task-actions"><button onclick="viewArchive(${data.history.length - 1 - i})">عرض الملخص</button></div></article>`).join("") || '<div class="panel">لا توجد مناوبات محفوظة بعد.</div>'
}
window.viewArchive = i => {
    let h = data.history[i];
    if (h)
        alert(h.summary)
}
;
window.completeTask = id => {
    let x = data.tasks.find(t => t.id === id);
    if (x)
        x.status = "done";
    save()
}
;
window.undoTask = id => {
    let x = data.tasks.find(t => t.id === id);
    if (x)
        x.status = "pending";
    save()
}
;
window.postponeTask = id => {
    let x = data.tasks.find(t => t.id === id);
    if (x) {
        let d = new Date()
          , [h,m] = x.time.split(":").map(Number);
        d.setHours(h, m + 10, 0, 0);
        x.time = d.toTimeString().slice(0, 5);
        notifiedAt[id] = Date.now()
    }
    save()
}
;
window.deleteOp = id => {
    data.ops = data.ops.filter(x => x.id !== id);
    save()
}
;
function alertTask(x) {
    let msg = "تذكير بمهمة المناوبة: " + x.name;
    toast(msg);
    try {
        let C = AudioContext || webkitAudioContext
          , c = new C()
          , o = c.createOscillator()
          , g = c.createGain();
        o.connect(g);
        g.connect(c.destination);
        o.frequency.value = 880;
        g.gain.value = .07;
        o.start();
        o.stop(c.currentTime + .25)
    } catch {}
    if ("Notification" in window && Notification.permission === "granted")
        new Notification("Night Auditor Assistant",{
            body: msg,
            tag: "task-" + x.id,
            renotify: true
        })
}
function tick() {
    let n = new Date();
    $("clock").textContent = n.toLocaleTimeString("ar-MA");
    $("dateLine").textContent = n.toLocaleDateString("ar-MA", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
    });
    data.tasks.forEach(x => {
        if (x.status !== "done" && isPast(x.time) && Date.now() - (notifiedAt[x.id] || 0) >= x.repeat * 60000) {
            notifiedAt[x.id] = Date.now();
            alertTask(x)
        }
    }
    )
}
$("notifyBtn").onclick = async () => {
    if (!("Notification" in window)) {
        toast("المتصفح لا يدعم إشعارات النظام");
        return
    }
    let p = await Notification.requestPermission();
    toast(p === "granted" ? "تم تفعيل الإشعارات" : "لم يتم السماح بالإشعارات")
}
;
$("saveShift").onclick = () => {
    data.shift = {
        start: $("shiftStart").value,
        end: $("shiftEnd").value
    };
    save();
    toast("تم حفظ توقيت المناوبة")
}
;
$("operationForm").onsubmit = e => {
    e.preventDefault();
    let cat = $("opCategory")
      , pay = $("opPayment");
    data.ops.push({
        id: Date.now(),
        time: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit"
        }),
        type: $("opType").value,
        category: cat.value,
        categoryLabel: cat.selectedOptions[0].textContent,
        amount: +$("opAmount").value,
        payment: pay.value,
        paymentLabel: pay.selectedOptions[0].textContent,
        note: $("opNote").value
    });
    e.target.reset();
    save();
    toast("تم تسجيل العملية")
}
;
$("roomsForm").onsubmit = e => {
    e.preventDefault();
    let r = {};
    for (let[id,k] of [["totalRooms", "total"], ["occupiedRooms", "occupied"], ["arrivals", "arrivals"], ["departures", "departures"], ["openingCash", "openingCash"], ["countedCash", "countedCash"], ["movementNotes", "movementNotes"]])
        r[k] = $(id).value;
    Object.keys(r).forEach(k => {
        if (k !== "movementNotes")
            r[k] = +r[k]
    }
    );
    data.rooms = r;
    save();
    toast("تم حفظ بيانات الغرف")
}
;
$("addTaskBtn").onclick = () => $("taskDialog").showModal();
$("confirmTask").onclick = e => {
    e.preventDefault();
    data.tasks.push({
        id: Date.now(),
        time: $("newTaskTime").value,
        name: $("newTaskName").value,
        repeat: +$("newTaskRepeat").value || 10,
        status: "pending"
    });
    $("taskDialog").close();
    $("taskForm").reset();
    save()
}
;
$("printReport").onclick = () => window.print();
$("saveHandover").onclick = () => {
    data.handover = $("handover").value;
    save();
    toast("تم حفظ الملاحظات")
}
;
$("archiveBtn").onclick = () => {
    let t = totals()
      , r = data.rooms
      , occ = r.total ? +(100 * r.occupied / r.total).toFixed(1) : 0;
    let summary = $("reportContent").innerText;
    data.history.push({
        date: new Date().toLocaleString(),
        income: t.inc,
        expense: t.exp,
        net: t.net,
        occupancy: occ,
        done: data.tasks.filter(x => x.status === "done").length,
        total: data.tasks.length,
        summary
    });
    save();
    toast("تم حفظ المناوبة في السجل")
}
;
$("exportBtn").onclick = () => {
    let blob = new Blob([JSON.stringify(data, null, 2)],{
        type: "application/json"
    })
      , url = URL.createObjectURL(blob)
      , a = document.createElement("a");
    a.href = url;
    a.download = "night-auditor-backup-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    URL.revokeObjectURL(url);
    toast("تم إنشاء النسخة الاحتياطية")
}
;
$("importFile").onchange = async e => {
    let f = e.target.files[0];
    if (!f)
        return;
    try {
        let obj = JSON.parse(await f.text());
        if (!obj.tasks || !obj.ops || !obj.rooms)
            throw Error();
        if (confirm("سيتم استبدال البيانات الحالية بالنسخة المختارة. هل تريد المتابعة؟")) {
            data = {
                ...fresh(),
                ...obj
            };
            fillForms();
            save();
            toast("تم استيراد النسخة الاحتياطية")
        }
    } catch {
        toast("الملف غير صالح أو ليس نسخة احتياطية مناسبة")
    }
    e.target.value = ""
}
;
$("resetBtn").onclick = () => {
    if (confirm("سيتم مسح بيانات المناوبة الحالية. احفظ نسخة احتياطية أولاً. هل تريد المتابعة؟")) {
        let hist = data.history || [];
        data = fresh();
        data.history = hist;
        notifiedAt = {};
        fillForms();
        save()
    }
}
;
document.querySelectorAll(".tab").forEach(b => b.onclick = () => {
    document.querySelectorAll(".tab,.tabpane").forEach(x => x.classList.remove("active"));
    b.classList.add("active");
    $(b.dataset.tab).classList.add("active")
}
);
$("langBtn").onclick = () => {
    lang = lang === "ar" ? "fr" : "ar";
    document.body.classList.toggle("fr", lang === "fr");
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = lang;
    $("appTitle").textContent = lang === "ar" ? "مساعد الاستقبال والمدقق الليلي" : "Assistant réception & audit de nuit";
    toast(lang === "ar" ? "تم اختيار العربية" : "Mode français partiel : certains libellés restent en arabe")
}
;
function fillForms() {
    let r = data.rooms;
    $("shiftStart").value = data.shift.start;
    $("shiftEnd").value = data.shift.end;
    for (let[id,k] of [["totalRooms", "total"], ["occupiedRooms", "occupied"], ["arrivals", "arrivals"], ["departures", "departures"], ["openingCash", "openingCash"], ["countedCash", "countedCash"], ["movementNotes", "movementNotes"]])
        $(id).value = r[k] ?? 0;
    $("handover").value = data.handover || ""
}
if ("serviceWorker" in navigator && location.protocol !== "file:")
    navigator.serviceWorker.register("./sw.js").catch( () => {}
    );
fillForms();
render();
tick();
setInterval(tick, 15000);
