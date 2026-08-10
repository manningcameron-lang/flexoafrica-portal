// Hand-off of the customer's uploaded PDF to the file-checking station.
//
// The checking station ("/check") opens in a NEW browser tab. A File/Blob
// can't travel in a URL, and sessionStorage isn't shared across tabs — but
// IndexedDB is same-origin and shared, so the order page stashes the PDF blob
// under a random id and the new tab reads it back by that id.

const DB_NAME = "fa-check";
const STORE = "files";

function openDb() {
  return new Promise((resolve, reject) => {
    let req;
    try {
      req = indexedDB.open(DB_NAME, 1);
    } catch (e) {
      reject(e);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Stash a file for the checking station. Returns the id it was stored under.
export async function stashCheckFile(id, file, meta = {}) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({
      id,
      blob: file,
      name: file && file.name ? file.name : "artwork.pdf",
      meta,
      ts: Date.now(),
    });
    tx.oncomplete = () => {
      db.close();
      resolve(id);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

async function getOne(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => {
      db.close();
      resolve(req.result || null);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

// Read a stashed file back. The new tab can load slightly before the order
// page finishes writing, so poll briefly before giving up.
export async function takeCheckFile(id, { retries = 40, delayMs = 150 } = {}) {
  for (let i = 0; i < retries; i++) {
    try {
      const rec = await getOne(id);
      if (rec) return rec;
    } catch {
      // ignore and retry
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return null;
}

// Drop hand-offs older than an hour so IndexedDB doesn't grow forever.
export async function cleanupCheckFiles(maxAgeMs = 3600000) {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const cutoff = Date.now() - maxAgeMs;
    const req = store.openCursor();
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) {
        db.close();
        return;
      }
      if ((cur.value && cur.value.ts ? cur.value.ts : 0) < cutoff) cur.delete();
      cur.continue();
    };
    req.onerror = () => db.close();
  } catch {
    // best-effort cleanup only
  }
}
