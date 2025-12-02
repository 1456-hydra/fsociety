/* ============ CONFIG ============ */
const MASTER_PASSWORD = "fsocietycompany2025";
const DB_NAME = "fsociety_inventory_db";
const DB_VERSION = 1;
const STORE_NAME = "tools";

/* ============ SHOW / HIDE WINDOWS ============ */
function toggleWindow(win) {
    const w = document.getElementById(win);
    if (!w) return;
    // Toggle hidden class and aria-hidden for accessibility
    const hidden = w.classList.toggle("hidden");
    w.setAttribute("aria-hidden", hidden ? "true" : "false");

    // If we open the tools window, try to render tools (if unlocked)
    if (win === "tools" && !hidden) {
        checkAutoUnlock();
        renderTools();
    }
}

/* ============ MASTER PASSWORD (client-side) ============ */

function unlockTools() {
    const input = document.getElementById("passwordInput").value;
    const error = document.getElementById("passwordError");

    if (input === MASTER_PASSWORD) {
        sessionStorage.setItem("fs_unlocked", "1");
        document.getElementById("tools-locked").classList.add("hidden");
        document.getElementById("tools-content").classList.remove("hidden");
        error.textContent = "";
        document.getElementById("passwordInput").value = "";
        renderTools();
    } else {
        error.textContent = "Contraseña incorrecta.";
    }
}

function checkAutoUnlock() {
    const unlocked = sessionStorage.getItem("fs_unlocked") === "1";
    if (unlocked) {
        document.getElementById("tools-locked").classList.add("hidden");
        document.getElementById("tools-content").classList.remove("hidden");
    } else {
        document.getElementById("tools-locked").classList.remove("hidden");
        document.getElementById("tools-content").classList.add("hidden");
    }
}

/* ============ INDEXEDDB HELPERS ============ */

let db = null;

function openDB() {
    return new Promise((resolve, reject) => {
        if (db) return resolve(db);
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onerror = (e) => reject(e.target.error);
        req.onupgradeneeded = (e) => {
            const idb = e.target.result;
            if (!idb.objectStoreNames.contains(STORE_NAME)) {
                const store = idb.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
                store.createIndex("name", "name", { unique: false });
                store.createIndex("category", "category", { unique: false });
                store.createIndex("tags", "tags", { unique: false });
            }
        };
        req.onsuccess = (e) => {
            db = e.target.result;
            resolve(db);
        };
    });
}

async function addTool(record) {
    const idb = await openDB();
    return new Promise((resolve, reject) => {
        const tx = idb.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const r = store.add(record);
        r.onsuccess = () => resolve(r.result);
        r.onerror = (ev) => reject(ev.target.error);
    });
}

async function getAllTools() {
    const idb = await openDB();
    return new Promise((resolve, reject) => {
        const tx = idb.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = (e) => reject(e.target.error);
    });
}

async function deleteTool(id) {
    const idb = await openDB();
    return new Promise((resolve, reject) => {
        const tx = idb.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = (e) => reject(e.target.error);
    });
}

async function clearDatabase() {
    const idb = await openDB();
    return new Promise((resolve, reject) => {
        const tx = idb.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = (e) => reject(e.target.error);
    });
}

/* ============ RENDER / UI ============ */

async function renderTools() {
    const listEl = document.getElementById("toolsList");
    const search = (document.getElementById("searchInput") || { value: "" }).value.trim().toLowerCase();
    listEl.innerHTML = "";

    // If not unlocked, do nothing
    if (sessionStorage.getItem("fs_unlocked") !== "1") return;

    const items = await getAllTools();
    const filtered = items.filter(it => {
        if (!search) return true;
        const fields = [it.name, it.category, (it.tags || ""), (it.description || ""), (it.author || "")].join(" ").toLowerCase();
        return fields.includes(search);
    });

    if (filtered.length === 0) {
        listEl.innerHTML = "<li class='meta'>No hay herramientas en el inventario.</li>";
        return;
    }

    filtered.sort((a,b) => b.uploadedAt - a.uploadedAt); // newest first

    filtered.forEach(it => {
        const li = document.createElement("li");

        const left = document.createElement("div");
        left.className = "meta";
        left.innerHTML = `<strong>${escapeHtml(it.name)}</strong> <div style="opacity:.85;font-size:12px">${escapeHtml(it.category)} • ${escapeHtml(it.filename)} • ${Math.round(it.size/1024)} KB</div>
                          <div style="margin-top:6px;font-size:12px;opacity:.85">${escapeHtml(it.description || "")}</div>
                          <div style="margin-top:6px;font-size:12px;opacity:.8">Tags: ${escapeHtml(it.tags || "")} • Autor: ${escapeHtml(it.author || "")} • Subido: ${new Date(it.uploadedAt).toLocaleString()}</div>`;

        const actions = document.createElement("div");
        actions.className = "actions";

        const downloadBtn = document.createElement("button");
        downloadBtn.textContent = "Descargar";
        downloadBtn.onclick = async () => {
            // retrieve the blob from the record and download
            const rec = await getById(it.id);
            if (!rec || !rec.fileBlob) return alert("Archivo no encontrado.");
            const url = URL.createObjectURL(rec.fileBlob);
            const a = document.createElement("a");
            a.href = url;
            a.download = rec.filename || rec.name || "archivo";
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(()=> URL.revokeObjectURL(url), 10000);
        };

        const detailsBtn = document.createElement("button");
        detailsBtn.textContent = "Detalles";
        detailsBtn.onclick = () => {
            alert(`Nombre: ${it.name}\nArchivo: ${it.filename}\nCategoría: ${it.category}\nVersión: ${it.version}\nTags: ${it.tags}\nAutor: ${it.author}\nDescripción:\n${it.description || "-"}`);
        };

        const deleteBtn = document.createElement("button");
        deleteBtn.textContent = "Eliminar";
        deleteBtn.onclick = async () => {
            if (!confirm("Eliminar permanentemente este registro del inventario?")) return;
            await deleteTool(it.id);
            renderTools();
        };

        actions.appendChild(downloadBtn);
        actions.appendChild(detailsBtn);
        actions.appendChild(deleteBtn);

        li.appendChild(left);
        li.appendChild(actions);

        listEl.appendChild(li);
    });
}

/* helper to fetch single record by id */
function getById(id) {
    return new Promise(async (resolve, reject) => {
        const idb = await openDB();
        const tx = idb.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result);
        req.onerror = (e) => reject(e.target.error);
    });
}

/* ============ UPLOAD FORM ============ */

document.getElementById("uploadForm").addEventListener("submit", async function (e) {
    e.preventDefault();

    const fileInput = document.getElementById("fileInput");
    const file = fileInput.files[0];
    const name = document.getElementById("toolName").value.trim();
    const version = document.getElementById("toolVersion").value.trim();
    const category = document.getElementById("toolCategory").value;
    const desc = document.getElementById("toolDescription").value.trim();
    const tags = document.getElementById("toolTags").value.trim();
    const author = document.getElementById("toolAuthor").value.trim();

    if (!file) return alert("Selecciona un archivo antes de enviar.");
    if (!name) return alert("Dale un nombre al recurso.");
    if (!category) return alert("Selecciona una categoría.");

    // read file as blob (we can store file directly)
    const record = {
        name,
        version,
        category,
        description: desc,
        tags,
        author,
        filename: file.name,
        size: file.size,
        uploadedAt: Date.now(),
        fileBlob: file // store Blob/File directly in IndexedDB
    };

    try {
        await addTool(record);
        // limpiar campos
        fileInput.value = "";
        document.getElementById("toolName").value = "";
        document.getElementById("toolVersion").value = "";
        document.getElementById("toolCategory").value = "";
        document.getElementById("toolDescription").value = "";
        document.getElementById("toolTags").value = "";
        document.getElementById("toolAuthor").value = "";
        alert("Archivo clasificado y agregado al inventario (IndexedDB).");
        toggleWindow("upload");
        // if tools is open and unlocked, re-render
        if (sessionStorage.getItem("fs_unlocked") === "1") renderTools();
    } catch (err) {
        console.error(err);
        alert("Error guardando en IndexedDB: " + err);
    }
});

/* ============ UTILITIES ============ */

function escapeHtml(s) {
    if (!s) return "";
    return s.replace(/[&<>"'`]/g, (m) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;","`":"&#96;" }[m]));
}

async function exportAll() {
    const all = await getAllTools();
    if (!all || all.length === 0) return alert("No hay registros para exportar.");
    // Remove binary blob for safe JSON export (or export as base64; here we'll export metadata only)
    const metadata = all.map(a => {
        const { fileBlob, ...meta } = a;
        return meta;
    });
    const json = JSON.stringify(metadata, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "fsociety_inventory_metadata.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=> URL.revokeObjectURL(url), 10000);
}

async function clearAll() {
    if (!confirm("Borrar todo el inventario en IndexedDB? Esto es irreversible.")) return;
    try {
        await clearDatabase();
        renderTools();
        alert("Inventario borrado.");
    } catch (err) {
        alert("Error borrando DB: " + err);
    }
}

/* ============ small helper to initialize on load ============ */

window.addEventListener("load", async () => {
    // Ensure DB is opened
    try {
        await openDB();
    } catch (err) {
        console.error("Error opening DB:", err);
        alert("Error inicializando IndexedDB: " + err);
    }
    // if already unlocked in this session, show tools content
    checkAutoUnlock();
    // render if tools open and unlocked
    if (document.getElementById("tools") && !document.getElementById("tools").classList.contains("hidden")) {
        renderTools();
    }
});

/* ============ MATRIX BACKGROUND EFFECT ============ */

const canvas = document.getElementById('matrix');
const ctx = canvas.getContext('2d');

function fitCanvas() {
    canvas.height = window.innerHeight;
    canvas.width = window.innerWidth;
}
fitCanvas();
window.addEventListener("resize", () => {
    fitCanvas();
    // recalc drops
    initDrops();
});

const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*";
let drops = [];

function initDrops(){
    const columns = Math.floor(canvas.width / 12);
    drops = Array(columns).fill(1);
}
initDrops();

function drawMatrix() {
    if (!ctx) return;
    ctx.fillStyle = "rgba(0,0,0,0.06)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#0F0";
    ctx.font = "14px monospace";

    drops.forEach((y, i) => {
        const text = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillText(text, i * 12, y * 18);

        if (y * 18 > canvas.height && Math.random() > 0.975)
            drops[i] = 0;

        drops[i]++;
    });
}

setInterval(drawMatrix, 50);
