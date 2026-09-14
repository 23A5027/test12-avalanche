const DB_NAME = "web3-quiz-live-recordings";
const STORE_NAME = "recordings";
const VERSION = 1;
const UPDATE_KEY = "web3_quiz_live_recordings_updated_v1";

function openDb() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: "id" });
            }
        };
    });
}

function notifyUpdated() {
    localStorage.setItem(UPDATE_KEY, String(Date.now()));
    window.dispatchEvent(new Event("live-recordings-updated"));
}

async function saveLiveRecording(entry) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        store.put(entry);
        transaction.oncomplete = () => {
            notifyUpdated();
            resolve(entry);
        };
        transaction.onerror = () => reject(transaction.error);
    });
}

async function getAllLiveRecordings() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readonly");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => {
            const result = Array.isArray(request.result) ? request.result : [];
            result.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
            resolve(result);
        };
        request.onerror = () => reject(request.error);
    });
}

async function deleteLiveRecording(id) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        store.delete(id);
        transaction.oncomplete = () => {
            notifyUpdated();
            resolve();
        };
        transaction.onerror = () => reject(transaction.error);
    });
}

function subscribeToLiveRecordings(callback) {
    const storageHandler = (event) => {
        if (event.key === UPDATE_KEY) {
            callback();
        }
    };
    const customHandler = () => callback();
    window.addEventListener("storage", storageHandler);
    window.addEventListener("live-recordings-updated", customHandler);
    return () => {
        window.removeEventListener("storage", storageHandler);
        window.removeEventListener("live-recordings-updated", customHandler);
    };
}

export {
    deleteLiveRecording,
    getAllLiveRecordings,
    saveLiveRecording,
    subscribeToLiveRecordings,
};
