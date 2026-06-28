/* Invoice Desk PWA - local-first starter app
   Storage: localStorage by default. Firebase-ready structure is included in README.
*/

const STORAGE_KEY = "invoiceDeskPwa.v1";
const LOCAL_STATE_FOUND_ON_BOOT = (() => {
  try { return Boolean(localStorage.getItem(STORAGE_KEY)); }
  catch (err) { return false; }
})();
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const docTypes = {
  quotation: { label: "Quotation", tab: "quotationTab", prefixKey: "quotation", badge: "quotation" },
  invoice: { label: "Invoice", tab: "invoiceTab", prefixKey: "invoice", badge: "invoice" },
  delivery: { label: "Delivery Order", tab: "deliveryTab", prefixKey: "delivery", badge: "delivery" },
  markupDraft: { label: "Markup Draft", tab: "markupTab", prefixKey: "markupDraft", badge: "markupDraft" }
};

const templates = [
  { id: "modern", name: "Modern Standard" },
  { id: "classic", name: "Classic Centered" },
  { id: "bluebar", name: "Blue Bar Corporate" },
  { id: "minimal", name: "Minimal Clean" },
  { id: "receipt", name: "Boxed Letterhead" }
];

let state = normalizeState(loadState());
let selectedLineTarget = null;
let selectedCustomerTarget = null;
let deferredInstallPrompt = null;
let templateEditor = { companyId: null, selectedId: null, docType: "quotation" };
let wordingEditor = { companyId: null, docType: "quotation" };
let templateDrag = null;

const CLOUD_APP_ID = "invoiceDeskPwa";
const CLOUD_SHARED_COLLECTION = "sharedApps";
const CLOUD_CLIENT_ID_KEY = "invoiceDeskPwa.cloudClientId";
const CLOUD_LAST_SCOPE_KEY = "invoiceDeskPwa.lastCloudScope";
const CLOUD_OPERATOR_SESSION_KEY = "invoiceDeskPwa.operatorSession.v1";
const SESSION_LIMIT_MS = 60 * 60 * 1000;
const IDLE_LIMIT_MS = 3 * 60 * 1000;
const PRESENCE_STALE_MS = 2 * 60 * 1000;
const CLOUD_CLIENT_ID = (() => {
  try {
    const existing = localStorage.getItem(CLOUD_CLIENT_ID_KEY);
    if (existing) return existing;
    const created = uid("client");
    localStorage.setItem(CLOUD_CLIENT_ID_KEY, created);
    return created;
  } catch (err) {
    return uid("client");
  }
})();

let cloudSync = {
  enabled: false,
  auth: null,
  db: null,
  uid: null,
  operatorId: "",
  operatorKey: "",
  operatorRole: "",
  ready: false,
  applyingCloud: false,
  saveTimer: null,
  unsubscribe: null,
  presenceUnsubscribe: null,
  presenceTimer: null,
  sessionTimer: null,
  idleTimer: null,
  lastSavedJson: "",
  lastAppliedJson: "",
  firstSnapshotHandled: false,
  onlineUsers: [],
  currentDocId: "",
  currentDocType: "",
  currentDocNumber: "",
  currentArea: "",
  lastActivityAt: Date.now(),
  lastEditingAt: 0
};

function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function money(value) {
  const n = Number(value || 0);
  return n.toLocaleString("en-MY", { style: "currency", currency: "MYR" });
}

function number(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function defaultState() {
  const company1 = uid("company");
  const company2 = uid("company");
  const company3 = uid("company");
  const company4 = uid("company");
  const company5 = uid("company");
  return {
    activeCompanyId: company1,
    companies: [
      {
        id: company1,
        name: "Company One Sdn. Bhd.",
        phone: "+60 12-345 6789",
        address: "No. 1, Jalan Business, 50000 Kuala Lumpur, Malaysia",
        email: "sales@companyone.com",
        logo: "",
        template: "modern",
        paymentMethod: "Payment Method: Bank Transfer\nBank: Your Bank\nAccount No.: 1234567890\nAccount Name: Company One Sdn. Bhd.",
        prefix: { quotation: "QT-", invoice: "INV-", delivery: "DO-", markupDraft: "MD-" }
      },
      {
        id: company2,
        name: "Company Two Enterprise",
        phone: "+60 11-2222 3333",
        address: "Lot 2, Commercial Park, 47000 Selangor, Malaysia",
        email: "hello@companytwo.com",
        logo: "",
        template: "classic",
        paymentMethod: "Payment Method: Cash / Online Transfer\nPlease attach payment proof after payment.",
        prefix: { quotation: "Q2-", invoice: "I2-", delivery: "D2-", markupDraft: "M2-" }
      },
      {
        id: company3,
        name: "Company Three Trading",
        phone: "+60 13-333 4444",
        address: "Suite 3A, Trade Avenue, 50480 Kuala Lumpur, Malaysia",
        email: "admin@companythree.com",
        logo: "",
        template: "bluebar",
        paymentMethod: "Payment Method: Bank Transfer\nPayment reference must include document number.",
        prefix: { quotation: "C3Q-", invoice: "C3I-", delivery: "C3D-", markupDraft: "C3M-" }
      },
      {
        id: company4,
        name: "Company Four Resources",
        phone: "+60 14-444 5555",
        address: "No. 4, Resource Park, 81200 Johor Bahru, Malaysia",
        email: "billing@companyfour.com",
        logo: "",
        template: "minimal",
        paymentMethod: "Payment Method: Online Transfer\nPayment due according to agreed terms.",
        prefix: { quotation: "FQ-", invoice: "FI-", delivery: "FD-", markupDraft: "FM-" }
      },
      {
        id: company5,
        name: "Company Five Holdings",
        phone: "+60 15-555 6666",
        address: "Level 5, Holdings Tower, 88000 Kota Kinabalu, Malaysia",
        email: "accounts@companyfive.com",
        logo: "",
        template: "receipt",
        paymentMethod: "Payment Method: Cheque / Bank Transfer\nKindly confirm payment with our accounts department.",
        prefix: { quotation: "HQT-", invoice: "HINV-", delivery: "HDO-", markupDraft: "HMD-" }
      }
    ],
    customers: [
      { id: uid("customer"), name: "Aiman Trading", phone: "+60 12-111 2222", email: "aiman@example.com", address: "Seremban, Negeri Sembilan" },
      { id: uid("customer"), name: "Borneo Agro Supplies", phone: "+60 16-333 4444", email: "borneo@example.com", address: "Kota Kinabalu, Sabah" }
    ],
    items: [
      { id: uid("item"), name: "T-Shirt Printing", details: "Custom print with premium cotton shirt", unit: "pcs", price: 35 },
      { id: uid("item"), name: "Delivery Service", details: "Local delivery and handling", unit: "trip", price: 25 }
    ],
    docs: [],
    deletedDocIds: [],
    workingDocs: {}
  };
}


function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const loaded = JSON.parse(raw);
    return { ...defaultState(), ...loaded, deletedDocIds: Array.isArray(loaded.deletedDocIds) ? loaded.deletedDocIds : [], workingDocs: loaded.workingDocs || {} };
  } catch (err) {
    console.warn("Storage reset because data could not be parsed", err);
    return defaultState();
  }
}


function normalizeState(input) {
  const base = defaultState();
  const next = { ...base, ...input, deletedDocIds: Array.isArray(input?.deletedDocIds) ? input.deletedDocIds : [], workingDocs: input?.workingDocs || {} };
  next.companies = (next.companies || []).map(company => ({
    ...company,
    customTemplateMode: company.customTemplateMode || "overlay",
    customTemplateElements: Array.isArray(company.customTemplateElements) ? company.customTemplateElements : [],
    templateWordings: company.templateWordings && typeof company.templateWordings === "object" ? company.templateWordings : {},
    baseTemplateBox: normalizeBaseTemplateBox(company.baseTemplateBox)
  }));
  if (!next.companies.length) next.companies = base.companies;
  return next;
}

function normalizeBaseTemplateBox(box = {}) {
  return {
    x: Number.isFinite(Number(box.x)) ? Number(box.x) : 0,
    y: Number.isFinite(Number(box.y)) ? Number(box.y) : 0,
    w: Math.max(80, Number.isFinite(Number(box.w)) ? Number(box.w) : 698),
    h: Math.max(80, Number.isFinite(Number(box.h)) ? Number(box.h) : 1027)
  };
}

function ensureCompanyTemplate(company) {
  if (!company.customTemplateMode) company.customTemplateMode = "overlay";
  if (!Array.isArray(company.customTemplateElements)) company.customTemplateElements = [];
  if (!company.templateWordings || typeof company.templateWordings !== "object") company.templateWordings = {};
  company.baseTemplateBox = normalizeBaseTemplateBox(company.baseTemplateBox);
  return company;
}

function defaultTemplateLabel(type, template) {
  const labels = {
    modern: { quotation: "Quotation", invoice: "Invoice", delivery: "Delivery Order", markupDraft: "Quotation Pricing Draft" },
    classic: { quotation: "Quotation", invoice: "Invoice", delivery: "Delivery Order", markupDraft: "Sales Pricing Draft" },
    bluebar: { quotation: "Commercial Quotation", invoice: "Billing Invoice", delivery: "Goods Delivery Order", markupDraft: "Commercial Pricing Draft" },
    minimal: { quotation: "Price Offer", invoice: "Invoice Statement", delivery: "Dispatch Note", markupDraft: "Price Review Draft" },
    receipt: { quotation: "Customer Quotation", invoice: "Payment Invoice", delivery: "Goods Received Note", markupDraft: "Customer Pricing Draft" }
  };
  return labels[template]?.[type] || docTypes[type]?.label || "Document";
}

function defaultCustomerHeading(template) {
  return ({
    modern: "Bill To / Customer",
    classic: "Prepared For",
    bluebar: "Client Information",
    minimal: "For",
    receipt: "Customer Details"
  })[template] || "Customer";
}

function defaultTemplateSubtitle(template) {
  return ({
    modern: "Official business document",
    classic: "Prepared with appreciation for your business",
    bluebar: "Issued by authorised representative",
    minimal: "Simple record for approval and payment",
    receipt: "Please keep this document for your records"
  })[template] || "Official document";
}

function defaultDocumentRemark(template) {
  return ({
    modern: "Please review the document details below and contact us for any clarification.",
    classic: "We are pleased to submit the following particulars for your confirmation.",
    bluebar: "Kindly review the listed scope, pricing and payment details stated in this document.",
    minimal: "Details are provided for approval and record purposes.",
    receipt: "This document confirms the listed goods/services and related transaction details."
  })[template] || "Please find the document details below.";
}

function wordingContext(doc = {}, company = activeCompany(), template = company?.template || "modern", extras = {}) {
  const title = extras.documentTitle || defaultTemplateLabel(doc.type || "quotation", template);
  const customer = customerById(doc.customerId);
  const totals = docTotals(normalizeDoc(doc, doc.type || "quotation", company?.id || activeCompany().id));
  return {
    documentTitle: title,
    documentNo: doc.number || "",
    date: doc.date || "",
    companyName: company?.name || "",
    companyPhone: company?.phone || "",
    companyEmail: company?.email || "",
    companyAddress: company?.address || "",
    customerName: customer?.name || "",
    customerPhone: customer?.phone || "",
    customerEmail: customer?.email || "",
    customerAddress: customer?.address || "",
    grandTotal: money(totals.grand),
    paid: showPaidBalance(doc) ? money(totals.paid) : "",
    balanceDue: showPaidBalance(doc) ? money(totals.balance) : "",
    template
  };
}

function resolveWordingPlaceholders(value = "", context = {}) {
  return String(value ?? "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => context[key] ?? "");
}

function wording(company, key, fallback = "", context = {}) {
  company = ensureCompanyTemplate(company || activeCompany());
  const store = company.templateWordings || {};
  const raw = Object.prototype.hasOwnProperty.call(store, key) ? store[key] : fallback;
  return resolveWordingPlaceholders(raw, context);
}

function wordingHtml(company, key, fallback = "", context = {}) {
  return escapeHtml(wording(company, key, fallback, context)).replaceAll("\n", "<br>");
}

function persistLocalStateOnly() {
  state.companies.forEach(ensureCompanyTemplate);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function saveState() {
  persistLocalStateOnly();
  scheduleCloudSave();
}

function cloudDataRef() {
  if (!cloudSync.db || !cloudSync.uid) return null;
  return cloudSync.db.collection(CLOUD_SHARED_COLLECTION).doc(CLOUD_APP_ID);
}

function cloudPresenceCollectionRef() {
  if (!cloudSync.db || !cloudSync.uid) return null;
  return cloudDataRef()?.collection("presence") || null;
}

function cloudPresenceRef() {
  const collection = cloudPresenceCollectionRef();
  return collection ? collection.doc(CLOUD_CLIENT_ID) : null;
}

function cleanForFirestore(value) {
  return JSON.parse(JSON.stringify(value));
}

function sharedStateSnapshot(source = state) {
  const sourceState = source || state || defaultState();
  const normalized = normalizeState({
    ...sourceState,
    activeCompanyId: state?.activeCompanyId || sourceState.activeCompanyId,
    workingDocs: {}
  });
  const deletedDocIds = Array.from(new Set((normalized.deletedDocIds || []).filter(Boolean)));
  const deletedSet = new Set(deletedDocIds);
  return cleanForFirestore({
    schemaVersion: 2,
    syncScope: "shared-documents-only",
    companies: normalized.companies || [],
    customers: normalized.customers || [],
    items: normalized.items || [],
    docs: (normalized.docs || []).filter(doc => doc?.id && !deletedSet.has(doc.id)),
    deletedDocIds
  });
}

function sharedStateJson(source = state) {
  return JSON.stringify(sharedStateSnapshot(source));
}

function preserveLocalWorkspaceWithSharedState(sharedSource = {}) {
  const localActiveCompanyId = state.activeCompanyId;
  const localWorkingDocs = state.workingDocs || {};
  const incoming = sharedSource || {};
  const next = normalizeState({
    ...state,
    companies: Array.isArray(incoming.companies) ? incoming.companies : state.companies,
    customers: Array.isArray(incoming.customers) ? incoming.customers : state.customers,
    items: Array.isArray(incoming.items) ? incoming.items : state.items,
    docs: Array.isArray(incoming.docs) ? incoming.docs : state.docs,
    deletedDocIds: Array.isArray(incoming.deletedDocIds) ? incoming.deletedDocIds : (state.deletedDocIds || []),
    activeCompanyId: localActiveCompanyId,
    workingDocs: localWorkingDocs
  });
  if (!next.companies.find(c => c.id === next.activeCompanyId)) {
    next.activeCompanyId = next.companies[0]?.id || localActiveCompanyId || "";
  }
  return next;
}

function setSyncStatus(text, status = "neutral") {
  const node = $("#syncStatus");
  if (!node) return;
  node.textContent = text;
  node.dataset.status = status;
}

function setAuthMessage(text, type = "muted") {
  const node = $("#authMessage");
  if (!node) return;
  node.textContent = text;
  node.className = `auth-message ${type}`;
}

function setAuthLoading(loading) {
  const button = $("#authSubmitBtn");
  const idInput = $("#authId");
  const pinInput = $("#authPin");
  if (button) {
    button.disabled = loading;
    button.textContent = loading ? "Please wait..." : "Continue";
  }
  if (idInput) idInput.disabled = loading;
  if (pinInput) pinInput.disabled = loading;
}

function showAuthGate(show) {
  const gate = $("#authGate");
  if (gate) gate.classList.toggle("hidden", !show);
  document.body.classList.toggle("auth-locked", show);
  document.body.classList.toggle("auth-ready", !show);
}

function normalizeOperatorId(value = "") {
  return String(value).trim().replace(/\s+/g, " ").slice(0, 40);
}

function allowedAccessOptions() {
  return {
    caseSensitiveIds: false,
    ...(window.INVOICE_DESK_ACCESS_OPTIONS || {})
  };
}

function allowedUsersList() {
  return Array.isArray(window.INVOICE_DESK_ALLOWED_USERS) ? window.INVOICE_DESK_ALLOWED_USERS : [];
}

function normalizeAccessId(value = "") {
  return String(value).trim().replace(/\s+/g, "").slice(0, 40);
}

function canonicalAccessId(value = "") {
  const cleaned = normalizeAccessId(value);
  return allowedAccessOptions().caseSensitiveIds ? cleaned : cleaned.toUpperCase();
}

function authDomainForIds() {
  return String(window.INVOICE_DESK_ID_AUTH_DOMAIN || "invoice-desk-pwa.app").trim().toLowerCase();
}

function accessIdToEmail(idValue = "") {
  const safeId = canonicalAccessId(idValue).toLowerCase().replace(/[^a-z0-9._-]/g, "_");
  return `${safeId}@${authDomainForIds()}`;
}

function findAllowedUser(value = "") {
  const input = canonicalAccessId(value);
  if (!input) return null;
  return allowedUsersList().find(user => canonicalAccessId(user.id) === input) || null;
}

function validateAllowedUserLogin(idValue = "", pinValue = "") {
  const users = allowedUsersList();
  if (!users.length) {
    return { ok: false, message: "No allowed user list found. Please upload allowed-users.js with at least one ID." };
  }
  const cleanId = normalizeAccessId(idValue);
  if (!cleanId) {
    return { ok: false, message: "Please enter your approved ID first." };
  }
  const user = findAllowedUser(cleanId);
  if (!user) {
    return { ok: false, message: "This ID is not allowed. Ask the admin to add your ID in allowed-users.js." };
  }
  const typedPin = String(pinValue || "").trim();
  if (!typedPin) {
    return { ok: false, message: "Please enter your Access PIN / Password." };
  }
  if (typedPin.length < 6) {
    return { ok: false, message: "Access PIN / Password must be at least 6 characters because Firebase Authentication requires it." };
  }
  return {
    ok: true,
    user,
    email: accessIdToEmail(user.id),
    operatorKey: canonicalAccessId(user.id),
    operatorId: normalizeOperatorId(user.name || user.id),
    operatorRole: normalizeOperatorId(user.role || "")
  };
}

function accessRecordFromAllowedUser(user = {}) {
  return {
    ok: true,
    user,
    email: accessIdToEmail(user.id),
    operatorKey: canonicalAccessId(user.id),
    operatorId: normalizeOperatorId(user.name || user.id),
    operatorRole: normalizeOperatorId(user.role || "")
  };
}

function accessRecordFromFirebaseUser(firebaseUser) {
  const email = String(firebaseUser?.email || "").toLowerCase();
  if (!email) return null;
  return allowedUsersList()
    .map(user => accessRecordFromAllowedUser(user))
    .find(record => String(record.email || "").toLowerCase() === email) || null;
}

function readOperatorSessionRaw() {
  try {
    const raw = localStorage.getItem(CLOUD_OPERATOR_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}

function loadOperatorSession() {
  try {
    const session = readOperatorSessionRaw();
    if (!session) return null;
    if (!session || typeof session !== "object") return null;
    if (!session.expiresAt || Date.now() >= Number(session.expiresAt)) {
      localStorage.removeItem(CLOUD_OPERATOR_SESSION_KEY);
      return null;
    }
    const allowed = allowedUsersList().find(user => canonicalAccessId(user.id) === canonicalAccessId(session.operatorKey || session.id || ""));
    if (!allowed) {
      localStorage.removeItem(CLOUD_OPERATOR_SESSION_KEY);
      return null;
    }
    const record = accessRecordFromAllowedUser(allowed);
    return {
      ...record,
      uid: session.uid || "",
      expiresAt: Number(session.expiresAt),
      savedAt: Number(session.savedAt || Date.now())
    };
  } catch (err) {
    try { localStorage.removeItem(CLOUD_OPERATOR_SESSION_KEY); } catch (innerErr) {}
    return null;
  }
}

function rememberOperatorSession(access, firebaseUser = null, options = {}) {
  try {
    const now = Date.now();
    const existing = loadOperatorSession();
    const expiresAt = options.keepExistingExpiry && existing?.expiresAt ? existing.expiresAt : now + SESSION_LIMIT_MS;
    localStorage.setItem(CLOUD_OPERATOR_SESSION_KEY, JSON.stringify({
      id: access.user?.id || access.operatorKey,
      email: access.email || firebaseUser?.email || "",
      uid: firebaseUser?.uid || access.uid || "",
      operatorKey: access.operatorKey,
      operatorId: access.operatorId,
      operatorRole: access.operatorRole,
      savedAt: now,
      expiresAt
    }));
  } catch (err) {
    console.warn("Could not remember login session", err);
  }
}

function clearOperatorSession() {
  try { localStorage.removeItem(CLOUD_OPERATOR_SESSION_KEY); } catch (err) {}
}

function restoreOperatorSessionForUser(firebaseUser) {
  const rawSession = readOperatorSessionRaw();
  const hadExpiredSession = rawSession?.expiresAt && Date.now() >= Number(rawSession.expiresAt);
  const remembered = loadOperatorSession();
  const email = String(firebaseUser?.email || "").toLowerCase();
  if (remembered && (!email || String(remembered.email || "").toLowerCase() === email || remembered.uid === firebaseUser?.uid)) {
    cloudSync.operatorId = remembered.operatorId;
    cloudSync.operatorKey = remembered.operatorKey;
    cloudSync.operatorRole = remembered.operatorRole;
    cloudSync.lastActivityAt = Date.now();
    updateUserDisplay();
    return true;
  }

  // Fallback for users who were already signed in before this update but refreshed without a saved operator session.
  // If the saved session expired, do not restore automatically; show the login page again.
  const fromAuth = hadExpiredSession ? null : accessRecordFromFirebaseUser(firebaseUser);
  if (fromAuth) {
    cloudSync.operatorId = fromAuth.operatorId;
    cloudSync.operatorKey = fromAuth.operatorKey;
    cloudSync.operatorRole = fromAuth.operatorRole;
    cloudSync.lastActivityAt = Date.now();
    rememberOperatorSession(fromAuth, firebaseUser);
    updateUserDisplay();
    return true;
  }

  clearOperatorSession();
  return false;
}

function currentSessionRemainingMs() {
  const session = loadOperatorSession();
  if (!session?.expiresAt) return SESSION_LIMIT_MS;
  return Math.max(0, Number(session.expiresAt) - Date.now());
}

function currentUserLabel() {
  return cloudSync.operatorId || "Unknown";
}

function updateAuthModeUi() {
  const title = $("#authTitle");
  const subtitle = $("#authSubtitle");
  const submit = $("#authSubmitBtn");
  if (title) title.textContent = "Enter Your ID";
  if (subtitle) subtitle.textContent = "Enter your approved ID and PIN before opening the shared invoice system.";
  if (submit) submit.textContent = "Continue";
}

function updateUserDisplay() {
  const userNode = $("#userEmailLabel");
  const signOut = $("#signOutBtn");
  if (userNode) {
    userNode.textContent = cloudSync.operatorId ? `ID: ${cloudSync.operatorId}${cloudSync.operatorRole ? " • " + cloudSync.operatorRole : ""}` : "";
    userNode.classList.toggle("hidden", !cloudSync.operatorId);
  }
  if (signOut) signOut.classList.toggle("hidden", !cloudSync.operatorId);
}

function firebaseErrorMessage(error) {
  const code = error?.code || "";
  const friendly = {
    "auth/operation-not-allowed": "Email/Password sign-in is not enabled. Enable Email/Password in Firebase Authentication > Sign-in method.",
    "auth/network-request-failed": "Network error. Please check your internet connection.",
    "auth/user-not-found": "This ID has not been created in Firebase Authentication yet.",
    "auth/wrong-password": "Access PIN / Password is incorrect.",
    "auth/invalid-credential": "ID or Access PIN / Password is incorrect, or this user has not been created in Firebase Authentication.",
    "auth/invalid-email": "This ID cannot be converted to a valid login email. Please use letters and numbers only.",
    "permission-denied": "Access denied. This Firebase user is not approved in Firestore members list yet, or the Firestore Rules were not updated.",
    "auth/too-many-requests": "Too many attempts. Please wait a while and try again."
  };
  return friendly[code] || error?.message || "Something went wrong. Please try again.";
}

function scheduleCloudSave() {
  if (!cloudSync.enabled || !cloudSync.ready || cloudSync.applyingCloud || !cloudSync.uid) return;
  setSyncStatus("Saving...", "saving");
  clearTimeout(cloudSync.saveTimer);
  cloudSync.saveTimer = setTimeout(() => flushCloudSave(), 700);
}

async function flushCloudSave(force = false) {
  if (!cloudSync.enabled || !cloudSync.uid) return;
  const ref = cloudDataRef();
  if (!ref) return;
  try {
    let cleanState = sharedStateSnapshot(state);
    let json = JSON.stringify(cleanState);
    if (!force && json === cloudSync.lastSavedJson) {
      setSyncStatus("Synced", "synced");
      return;
    }

    // Merge with the newest cloud copy before writing. This keeps documents created
    // by other users/devices instead of overwriting the whole shared file.
    try {
      const latest = await ref.get();
      const latestState = latest.exists ? latest.data()?.state : null;
      if (latestState) {
        const merged = mergeStatesForCloud(cleanState, latestState);
        cleanState = sharedStateSnapshot(merged);
        json = JSON.stringify(cleanState);
        state = preserveLocalWorkspaceWithSharedState(cleanState);
        persistLocalStateOnly();
      }
    } catch (mergeErr) {
      console.warn("Could not pre-merge cloud state before saving", mergeErr);
    }

    if (!force && json === cloudSync.lastSavedJson) {
      setSyncStatus("Synced", "synced");
      return;
    }

    setSyncStatus("Saving...", "saving");
    await ref.set({
      state: cleanState,
      clientId: CLOUD_CLIENT_ID,
      updatedBy: currentUserLabel(),
      updatedAtLocal: new Date().toISOString(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    cloudSync.lastSavedJson = json;
    cloudSync.lastAppliedJson = json;
    try { localStorage.setItem(CLOUD_LAST_SCOPE_KEY, "shared-documents-only"); } catch (err) {}
    setSyncStatus("Synced", "synced");
    updatePresenceNow();
  } catch (err) {
    console.error("Cloud save failed", err);
    setSyncStatus("Sync error", "error");
    setAuthMessage(`Cloud save failed: ${firebaseErrorMessage(err)}`, "error");
  }
}

function recordTime(record = {}) {
  const value = record.updatedAt || record.lastEditedAt || record.createdAt || record.updatedAtLocal || "";
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

function mergeArrayById(localItems = [], cloudItems = []) {
  const merged = new Map();
  (cloudItems || []).forEach(item => {
    if (item?.id) merged.set(item.id, item);
  });
  (localItems || []).forEach(item => {
    if (!item?.id) return;
    const existing = merged.get(item.id);
    if (!existing || recordTime(item) >= recordTime(existing)) merged.set(item.id, item);
  });
  return Array.from(merged.values());
}

function mergeWorkingDocs(localDocs = {}, cloudDocs = {}) {
  return { ...(cloudDocs || {}), ...(localDocs || {}) };
}

function hasMeaningfulData(candidate = {}) {
  const docs = Array.isArray(candidate.docs) ? candidate.docs : [];
  if (docs.length) return true;
  const customers = Array.isArray(candidate.customers) ? candidate.customers : [];
  const items = Array.isArray(candidate.items) ? candidate.items : [];
  const companies = Array.isArray(candidate.companies) ? candidate.companies : [];

  const defaultCustomerNames = new Set(["Aiman Trading", "Borneo Agro Supplies"]);
  const defaultItemNames = new Set(["T-Shirt Printing", "Delivery Service"]);
  const defaultCompanyNames = new Set([
    "Company One Sdn. Bhd.",
    "Company Two Enterprise",
    "Company Three Trading",
    "Company Four Resources",
    "Company Five Holdings"
  ]);

  if (customers.some(c => c?.name && !defaultCustomerNames.has(c.name))) return true;
  if (items.some(i => i?.name && !defaultItemNames.has(i.name))) return true;
  if (companies.some(c => c?.name && !defaultCompanyNames.has(c.name))) return true;
  if (companies.some(c => c?.logo || (Array.isArray(c?.customTemplateElements) && c.customTemplateElements.length) || (c?.templateWordings && Object.keys(c.templateWordings).length))) return true;
  return false;
}

function mergeStatesForCloud(localState, cloudState) {
  const local = normalizeState({ ...defaultState(), ...(localState || {}), activeCompanyId: state.activeCompanyId, workingDocs: {} });
  const cloud = normalizeState({ ...defaultState(), ...(cloudState || {}), activeCompanyId: state.activeCompanyId, workingDocs: {} });
  const deletedDocIds = Array.from(new Set([...(cloud.deletedDocIds || []), ...(local.deletedDocIds || [])].filter(Boolean)));
  const deletedSet = new Set(deletedDocIds);
  return normalizeState({
    ...cloud,
    activeCompanyId: state.activeCompanyId,
    companies: mergeArrayById(local.companies, cloud.companies),
    customers: mergeArrayById(local.customers, cloud.customers),
    items: mergeArrayById(local.items, cloud.items),
    docs: mergeArrayById(local.docs, cloud.docs).filter(doc => doc?.id && !deletedSet.has(doc.id)),
    deletedDocIds,
    workingDocs: state.workingDocs || {}
  });
}

function chooseInitialCloudState(incomingState) {
  const incoming = normalizeState(incomingState || defaultState());
  const localHasUsefulData = LOCAL_STATE_FOUND_ON_BOOT && hasMeaningfulData(state);
  const cloudHasUsefulData = hasMeaningfulData(incoming);

  if (localHasUsefulData && !cloudHasUsefulData) return { state: sharedStateSnapshot(state), shouldUpload: true, note: "Uploaded this device shared records to the cloud." };
  if (localHasUsefulData && cloudHasUsefulData) {
    const merged = mergeStatesForCloud(state, incoming);
    return { state: merged, shouldUpload: true, note: "Merged this device with the shared cloud file." };
  }
  return { state: sharedStateSnapshot(incoming), shouldUpload: false, note: "Loaded shared documents and records." };
}

function applyCloudState(incomingState) {
  cloudSync.applyingCloud = true;
  try {
    state = preserveLocalWorkspaceWithSharedState(incomingState);
    persistLocalStateOnly();
    cloudSync.lastAppliedJson = sharedStateJson(state);
    cloudSync.lastSavedJson = cloudSync.lastAppliedJson;
    try { localStorage.setItem(CLOUD_LAST_SCOPE_KEY, "shared-documents-only"); } catch (err) {}
  } finally {
    cloudSync.applyingCloud = false;
  }
}

function startSessionTimer() {
  clearTimeout(cloudSync.sessionTimer);
  const remaining = currentSessionRemainingMs();
  if (remaining <= 0) {
    signOutCloud(true);
    return;
  }
  cloudSync.sessionTimer = setTimeout(() => {
    signOutCloud(true);
  }, remaining);
}

function stopSessionTimer() {
  clearTimeout(cloudSync.sessionTimer);
  cloudSync.sessionTimer = null;
}

function startCloudListener(user) {
  if (!user || !cloudSync.operatorId) {
    showAuthGate(true);
    return;
  }
  if (cloudSync.unsubscribe) {
    cloudSync.unsubscribe();
    cloudSync.unsubscribe = null;
  }
  cloudSync.uid = user.uid;
  cloudSync.ready = false;
  cloudSync.firstSnapshotHandled = false;
  updateUserDisplay();
  showAuthGate(true);
  setAuthMessage("Loading the shared cloud file...", "muted");
  setSyncStatus("Loading shared data...", "saving");
  startSessionTimer();
  startPresence();

  const ref = cloudDataRef();
  cloudSync.unsubscribe = ref.onSnapshot(async snapshot => {
    try {
      if (!snapshot.exists) {
        if (!cloudSync.ready) {
          cloudSync.ready = true;
          cloudSync.firstSnapshotHandled = true;
          showAuthGate(false);
          setAuthMessage("Shared cloud file created from this device.", "success");
          setSyncStatus("Creating shared cloud file...", "saving");
          renderAll();
          await flushCloudSave(true);
        }
        return;
      }

      const data = snapshot.data() || {};
      const incoming = data.state;
      if (!incoming) {
        if (!cloudSync.ready) {
          cloudSync.ready = true;
          showAuthGate(false);
          renderAll();
          await flushCloudSave(true);
        }
        return;
      }

      const incomingJson = sharedStateJson(incoming);
      const currentJson = sharedStateJson(state);
      const isOwnSave = data.clientId === CLOUD_CLIENT_ID;

      if (!cloudSync.ready) {
        const decision = chooseInitialCloudState(incoming);
        applyCloudState(decision.state);
        cloudSync.ready = true;
        cloudSync.firstSnapshotHandled = true;
        showAuthGate(false);
        renderAll();
        setAuthMessage(decision.note, decision.shouldUpload ? "success" : "muted");
        if (decision.shouldUpload) await flushCloudSave(true);
      } else if (!isOwnSave && incomingJson !== currentJson) {
        applyCloudState(incoming);
        renderAll();
      }

      setSyncStatus("Synced", "synced");
      updatePresenceNow();
    } catch (err) {
      console.error("Cloud load failed", err);
      setSyncStatus("Sync error", "error");
      setAuthMessage(`Cloud load failed: ${firebaseErrorMessage(err)}`, "error");
    }
  }, err => {
    console.error("Cloud listener failed", err);
    setSyncStatus("Sync error", "error");
    setAuthMessage(`Cloud sync error: ${firebaseErrorMessage(err)}`, "error");
  });
}

function stopCloudListener() {
  if (cloudSync.unsubscribe) {
    cloudSync.unsubscribe();
    cloudSync.unsubscribe = null;
  }
  stopPresence();
  stopSessionTimer();
  cloudSync.uid = null;
  cloudSync.operatorId = "";
  cloudSync.operatorKey = "";
  cloudSync.operatorRole = "";
  cloudSync.ready = false;
  cloudSync.lastSavedJson = "";
  cloudSync.lastAppliedJson = "";
  cloudSync.firstSnapshotHandled = false;
  cloudSync.currentDocId = "";
  cloudSync.currentDocType = "";
  cloudSync.currentDocNumber = "";
  cloudSync.currentArea = "";
  cloudSync.onlineUsers = [];
  updateUserDisplay();
  renderOnlineUsers();
}

function initFirebaseSync() {
  if (!window.firebase || !window.INVOICE_DESK_FIREBASE_CONFIG) {
    cloudSync.enabled = false;
    showAuthGate(false);
    setSyncStatus("Local only", "neutral");
    console.warn("Firebase SDK or config missing. App is running with local browser storage only.");
    return;
  }
  try {
    if (!firebase.apps.length) firebase.initializeApp(window.INVOICE_DESK_FIREBASE_CONFIG);
    cloudSync.auth = firebase.auth();
    try { cloudSync.auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL); } catch (persistErr) { console.warn("Could not set local auth persistence", persistErr); }
    cloudSync.db = firebase.firestore();
    cloudSync.enabled = true;
    cloudSync.operatorId = "";
    showAuthGate(true);
    updateAuthModeUi();
    updateUserDisplay();
    setSyncStatus("Enter ID", "neutral");
    setAuthMessage("Enter your approved ID and Access PIN / Password to access the shared synced documents.", "muted");
    cloudSync.auth.onAuthStateChanged(user => {
      if (!user) {
        stopCloudListener();
        showAuthGate(true);
        updateAuthModeUi();
        updateUserDisplay();
        setSyncStatus("Enter ID", "neutral");
        return;
      }
      cloudSync.uid = user.uid;
      if (!cloudSync.operatorId && !restoreOperatorSessionForUser(user)) {
        showAuthGate(true);
        setSyncStatus("Enter ID", "neutral");
        return;
      }
      startCloudListener(user);
    });
  } catch (err) {
    console.error("Firebase init failed", err);
    cloudSync.enabled = false;
    showAuthGate(false);
    setSyncStatus("Local only", "neutral");
    alert("Firebase could not start. The app will continue with local browser storage only.");
  }
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  if (!cloudSync.auth) return;
  const idInput = $("#authId");
  const pinInput = $("#authPin");
  const operatorId = normalizeOperatorId(idInput?.value || "");
  const pin = String(pinInput?.value || "").trim();
  if (!operatorId) {
    setAuthMessage("Please enter your approved ID first.", "error");
    idInput?.focus();
    return;
  }

  const access = validateAllowedUserLogin(operatorId, pin);
  if (!access.ok) {
    setAuthMessage(access.message, "error");
    if (access.message.includes("PIN")) pinInput?.focus();
    else idInput?.focus();
    return;
  }

  try {
    setAuthLoading(true);
    setAuthMessage(`Welcome ${access.operatorId}. Loading shared documents...`, "muted");
    cloudSync.operatorId = access.operatorId;
    cloudSync.operatorKey = access.operatorKey;
    cloudSync.operatorRole = access.operatorRole;
    cloudSync.lastActivityAt = Date.now();
    updateUserDisplay();
    try { await cloudSync.auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL); } catch (persistErr) { console.warn("Could not set local auth persistence", persistErr); }
    const credential = await cloudSync.auth.signInWithEmailAndPassword(access.email, pin);
    rememberOperatorSession(access, credential.user);
    startCloudListener(credential.user);
  } catch (err) {
    clearOperatorSession();
    cloudSync.operatorId = "";
    cloudSync.operatorKey = "";
    cloudSync.operatorRole = "";
    setAuthMessage(firebaseErrorMessage(err), "error");
    updateUserDisplay();
  } finally {
    setAuthLoading(false);
  }
}

async function signOutCloud(auto = false) {
  if (!cloudSync.auth) return;
  try {
    clearTimeout(cloudSync.saveTimer);
    await flushCloudSave(true);
    await markPresenceOffline();
    stopPresence();
    const message = auto ? "You were automatically logged out after 1 hour." : "Signed out.";
    clearOperatorSession();
    cloudSync.operatorId = "";
    cloudSync.operatorKey = "";
    cloudSync.operatorRole = "";
    updateUserDisplay();
    await cloudSync.auth.signOut();
    showAuthGate(true);
    setSyncStatus("Signed out", "neutral");
    setAuthMessage(message, auto ? "error" : "muted");
  } catch (err) {
    alert(firebaseErrorMessage(err));
  }
}

function schedulePresenceUpdate(delay = 1200) {
  if (!cloudSync.enabled || !cloudSync.uid || !cloudSync.operatorId) return;
  clearTimeout(cloudSync.presenceTimer);
  cloudSync.presenceTimer = setTimeout(() => updatePresenceNow(), delay);
}

function visiblePresenceUsers() {
  const now = Date.now();
  return (cloudSync.onlineUsers || []).filter(user => {
    const lastSeen = Date.parse(user.lastSeenAtLocal || "");
    return user.status !== "offline" && Number.isFinite(lastSeen) && now - lastSeen <= PRESENCE_STALE_MS;
  });
}

function computedPresenceStatus() {
  const now = Date.now();
  if (now - cloudSync.lastActivityAt > IDLE_LIMIT_MS) return "idle";
  if (cloudSync.currentDocId && now - cloudSync.lastEditingAt <= IDLE_LIMIT_MS) return "editing";
  return "online";
}

function updateCurrentAreaFromTab(tabId = $(".tab.active")?.id || "") {
  const tabToType = {
    quotationTab: "quotation",
    invoiceTab: "invoice",
    deliveryTab: "delivery",
    markupTab: "markupDraft"
  };
  const type = tabToType[tabId] || "";
  if (type) {
    const doc = workingDoc(type);
    cloudSync.currentDocId = doc.id || "";
    cloudSync.currentDocType = type;
    cloudSync.currentDocNumber = doc.number || "";
    cloudSync.currentArea = `${docTypes[type]?.label || "Document"} ${doc.number || ""}`.trim();
  } else {
    cloudSync.currentDocId = "";
    cloudSync.currentDocType = "";
    cloudSync.currentDocNumber = "";
    cloudSync.currentArea = tabId === "listTab" ? "Documents list" : tabId ? tabId.replace("Tab", "") : "";
  }
}

function markUserActivity() {
  cloudSync.lastActivityAt = Date.now();
  schedulePresenceUpdate(1500);
}

function markDocumentActivity(type, editing = true) {
  const doc = workingDoc(type);
  cloudSync.currentDocId = doc.id || "";
  cloudSync.currentDocType = type;
  cloudSync.currentDocNumber = doc.number || "";
  cloudSync.currentArea = `${docTypes[type]?.label || "Document"} ${doc.number || ""}`.trim();
  cloudSync.lastActivityAt = Date.now();
  if (editing) cloudSync.lastEditingAt = Date.now();
  schedulePresenceUpdate(250);
}

async function updatePresenceNow(statusOverride = null) {
  const ref = cloudPresenceRef();
  if (!ref || !cloudSync.operatorId) return;
  updateCurrentAreaFromTab();
  const status = statusOverride || computedPresenceStatus();
  const now = new Date().toISOString();
  try {
    await ref.set({
      clientId: CLOUD_CLIENT_ID,
      uid: cloudSync.uid || "",
      operatorId: currentUserLabel(),
      operatorKey: cloudSync.operatorKey || "",
      operatorRole: cloudSync.operatorRole || "",
      status,
      currentDocId: cloudSync.currentDocId || "",
      currentDocType: cloudSync.currentDocType || "",
      currentDocNumber: cloudSync.currentDocNumber || "",
      currentArea: cloudSync.currentArea || "",
      lastSeenAtLocal: now,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (err) {
    console.warn("Presence update failed", err);
  }
}

async function markPresenceOffline() {
  const ref = cloudPresenceRef();
  if (!ref || !cloudSync.operatorId) return;
  try {
    await ref.set({
      clientId: CLOUD_CLIENT_ID,
      uid: cloudSync.uid || "",
      operatorId: currentUserLabel(),
      operatorKey: cloudSync.operatorKey || "",
      operatorRole: cloudSync.operatorRole || "",
      status: "offline",
      currentDocId: "",
      currentDocType: "",
      currentDocNumber: "",
      currentArea: "",
      lastSeenAtLocal: new Date().toISOString(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (err) {
    console.warn("Presence offline update failed", err);
  }
}

function startPresence() {
  if (!cloudSync.db || !cloudSync.uid || !cloudSync.operatorId) return;
  stopPresence(false);
  const collection = cloudPresenceCollectionRef();
  if (!collection) return;
  cloudSync.presenceUnsubscribe = collection.onSnapshot(snapshot => {
    const users = [];
    snapshot.forEach(doc => {
      const data = doc.data() || {};
      if (!data.operatorId) return;
      users.push({ ...data, clientId: data.clientId || doc.id });
    });
    cloudSync.onlineUsers = users;
    renderOnlineUsers();
    refreshDocumentCollabPanel();
  }, err => console.warn("Presence listener failed", err));
  updatePresenceNow("online");
  cloudSync.idleTimer = setInterval(() => updatePresenceNow(), 30000);
}

function stopPresence(markOffline = true) {
  clearTimeout(cloudSync.presenceTimer);
  clearInterval(cloudSync.idleTimer);
  cloudSync.presenceTimer = null;
  cloudSync.idleTimer = null;
  if (cloudSync.presenceUnsubscribe) {
    cloudSync.presenceUnsubscribe();
    cloudSync.presenceUnsubscribe = null;
  }
  if (markOffline) markPresenceOffline();
}

function statusLabel(status = "online") {
  return status === "editing" ? "Editing" : status === "idle" ? "Idle" : "Online";
}

function renderOnlineUsers() {
  const node = $("#onlineUsersBar");
  if (!node) return;
  const users = visiblePresenceUsers();
  if (!cloudSync.operatorId) {
    node.innerHTML = "";
    return;
  }
  if (!users.length) {
    node.innerHTML = `<span class="online-pill"><span class="status-dot online"></span>${escapeHtml(currentUserLabel())}</span>`;
    return;
  }
  const sorted = users.sort((a, b) => (a.operatorId || "").localeCompare(b.operatorId || ""));
  node.innerHTML = sorted.map(user => {
    const status = user.status || "online";
    const isSelf = user.clientId === CLOUD_CLIENT_ID;
    const area = user.currentArea ? ` • ${user.currentArea}` : "";
    return `<span class="online-pill" title="${escapeHtml(statusLabel(status) + area)}"><span class="status-dot ${escapeHtml(status)}"></span>${escapeHtml(user.operatorId || "User")}${isSelf ? " (you)" : ""}</span>`;
  }).join("");
}

function usersWorkingOnDoc(docId) {
  if (!docId) return [];
  return visiblePresenceUsers().filter(user => user.currentDocId === docId && ["editing", "online", "idle"].includes(user.status || "online"));
}

function documentAuditHtml(doc) {
  const editedBy = doc.lastEditedBy || doc.createdBy || "Unknown";
  const editedAt = doc.lastEditedAt || doc.updatedAt || doc.createdAt || "";
  const createdBy = doc.createdBy || "Unknown";
  return `<div class="doc-audit-line">Created by <strong>${escapeHtml(createdBy)}</strong> • Last edited by <strong>${escapeHtml(editedBy)}</strong>${editedAt ? ` on ${escapeHtml(formatDateTime(editedAt))}` : ""}</div>`;
}

function documentCollabInnerHtml(doc) {
  const workers = usersWorkingOnDoc(doc.id);
  const history = Array.isArray(doc.editHistory) ? doc.editHistory.slice(-5).reverse() : [];
  const workerHtml = workers.length
    ? workers.map(user => `<span class="worker-pill"><span class="status-dot ${escapeHtml(user.status || "online")}"></span>${escapeHtml(user.operatorId || "User")}${user.clientId === CLOUD_CLIENT_ID ? " (you)" : ""} ${statusLabel(user.status).toLowerCase()}</span>`).join("")
    : `<span class="muted">No other active user on this document right now.</span>`;
  const historyHtml = history.length
    ? `<details class="edit-history"><summary>Recent edit history</summary>${history.map(entry => `<div>${escapeHtml(formatDateTime(entry.at))} — <strong>${escapeHtml(entry.by || "Unknown")}</strong> ${escapeHtml(entry.action || "edited")}</div>`).join("")}</details>`
    : `<div class="muted small-note">No saved edit history yet.</div>`;
  return `${documentAuditHtml(doc)}<div class="workers-line"><strong>Working now:</strong> ${workerHtml}</div>${historyHtml}`;
}

function documentCollabPanel(doc, type) {
  return `<div id="documentCollabPanel" class="doc-collab-panel" data-doc-type="${escapeHtml(type)}">${documentCollabInnerHtml(doc)}</div>`;
}

function refreshDocumentCollabPanel() {
  const panel = $("#documentCollabPanel");
  if (!panel) return;
  const type = panel.dataset.docType;
  if (!type || !docTypes[type]) return;
  panel.innerHTML = documentCollabInnerHtml(workingDoc(type));
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "";
  return date.toLocaleString("en-MY", { dateStyle: "medium", timeStyle: "short" });
}

function touchDocumentAudit(doc, action = "saved") {
  const now = new Date().toISOString();
  const user = currentUserLabel();
  if (!doc.createdBy || doc.createdBy === "Unknown") doc.createdBy = user;
  if (!doc.createdAt) doc.createdAt = now;
  doc.updatedAt = now;
  doc.lastEditedBy = user;
  doc.lastEditedAt = now;
  const entry = { at: now, by: user, action };
  doc.editHistory = Array.isArray(doc.editHistory) ? [...doc.editHistory, entry].slice(-30) : [entry];
  return doc;
}

function activeCompany() {
  return state.companies.find(c => c.id === state.activeCompanyId) || state.companies[0];
}

function companyById(id) {
  return state.companies.find(c => c.id === id) || null;
}

function documentCompany(doc) {
  if (doc?.type === "markupDraft") {
    return companyById(doc.companyId) || companyById(doc.issueCompanyId) || activeCompany();
  }
  return companyById(doc?.companyId) || activeCompany();
}

function customerById(id) {
  return state.customers.find(c => c.id === id) || null;
}

function itemById(id) {
  return state.items.find(i => i.id === id) || null;
}

function makeLine(type = "quotation") {
  return {
    id: uid("line"),
    itemId: "",
    name: "",
    details: "",
    qty: 1,
    unit: "pcs",
    price: 0,
    discountType: "amount",
    discount: 0,
    markupType: "percentage",
    markup: 0
  };
}

function makeDoc(type, sourceDoc = null) {
  const company = companyById(sourceDoc?.companyId) || activeCompany();
  const baseItems = sourceDoc?.items?.length ? sourceDoc.items.map(line => ({ ...line, id: uid("line") })) : [makeLine(type)];
  const issueCompanyId = type === "markupDraft" ? (sourceDoc?.issueCompanyId || company.id) : "";
  return {
    id: uid("doc"),
    type,
    number: nextNumber(type, company.id),
    date: todayISO(),
    companyId: company.id,
    issueCompanyId,
    customerId: sourceDoc?.customerId || "",
    items: baseItems,
    paymentMethod: type === "markupDraft" ? (companyById(issueCompanyId)?.paymentMethod || company.paymentMethod || "") : (company.paymentMethod || ""),
    paid: type === "delivery" ? 0 : number(sourceDoc?.paid),
    showPaidBalance: sourceDoc?.showPaidBalance !== false,
    signatureEnabled: true,
    receiverEnabled: type === "delivery",
    sourceId: sourceDoc?.id || "",
    createdBy: sourceDoc?.createdBy || currentUserLabel(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastEditedBy: sourceDoc?.lastEditedBy || currentUserLabel(),
    lastEditedAt: sourceDoc?.lastEditedAt || new Date().toISOString(),
    editHistory: Array.isArray(sourceDoc?.editHistory) ? sourceDoc.editHistory : []
  };
}

function validDocType(type, fallback = "quotation") {
  if (docTypes[type]) return type;
  const legacyMap = {
    quote: "quotation",
    salesQuotation: "quotation",
    quotationDoc: "quotation",
    taxInvoice: "invoice",
    invoiceDoc: "invoice",
    deliveryOrder: "delivery",
    deliveryDoc: "delivery",
    markup: "markupDraft",
    dummy: "markupDraft",
    dummyQuotation: "markupDraft",
    markupQuotation: "markupDraft"
  };
  return legacyMap[type] || (docTypes[fallback] ? fallback : "quotation");
}

function normalizeLine(line = {}, type = "quotation") {
  const base = makeLine(type);
  const discountType = ["amount", "percentage"].includes(line.discountType) ? line.discountType : base.discountType;
  const markupType = ["amount", "percentage"].includes(line.markupType) ? line.markupType : base.markupType;
  return {
    ...base,
    ...line,
    id: line.id || uid("line"),
    itemId: line.itemId || "",
    name: line.name || "",
    details: line.details || "",
    qty: number(line.qty || base.qty),
    unit: line.unit || base.unit,
    price: number(line.price),
    discountType,
    discount: number(line.discount),
    markupType,
    markup: number(line.markup)
  };
}

function normalizeDoc(doc = {}, fallbackType = "quotation", fallbackCompanyId = null) {
  const type = validDocType(doc.type || fallbackType, fallbackType);
  const company = companyById(doc.companyId) || companyById(fallbackCompanyId) || activeCompany();
  const rawItems = Array.isArray(doc.items) && doc.items.length ? doc.items : [makeLine(type)];
  const items = rawItems.map(line => normalizeLine(line, type));
  const issueCompanyId = type === "markupDraft" ? (doc.issueCompanyId || company.id) : (doc.issueCompanyId || "");
  return {
    id: doc.id || uid("doc"),
    type,
    number: doc.number || nextNumber(type, company.id),
    date: doc.date || todayISO(),
    companyId: company.id,
    issueCompanyId,
    customerId: doc.customerId || "",
    items,
    paymentMethod: doc.paymentMethod ?? (type === "markupDraft" ? (companyById(issueCompanyId)?.paymentMethod || company.paymentMethod || "") : (company.paymentMethod || "")),
    paid: type === "delivery" ? 0 : number(doc.paid),
    showPaidBalance: doc.showPaidBalance !== false,
    signatureEnabled: doc.signatureEnabled !== false,
    receiverEnabled: type === "delivery" ? doc.receiverEnabled !== false : Boolean(doc.receiverEnabled),
    sourceId: doc.sourceId || "",
    createdBy: doc.createdBy || "Unknown",
    createdAt: doc.createdAt || new Date().toISOString(),
    updatedAt: doc.updatedAt || new Date().toISOString(),
    lastEditedBy: doc.lastEditedBy || doc.updatedBy || doc.createdBy || "Unknown",
    lastEditedAt: doc.lastEditedAt || doc.updatedAt || doc.createdAt || new Date().toISOString(),
    editHistory: Array.isArray(doc.editHistory) ? doc.editHistory.slice(-30) : []
  };
}

function nextNumber(type, companyId) {
  const company = state.companies.find(c => c.id === companyId) || activeCompany();
  const prefix = company.prefix?.[type] || docTypes[type]?.label?.slice(0, 2).toUpperCase() + "-";
  const count = state.docs.filter(d => d.companyId === companyId && d.type === type).length + 1;
  return `${prefix}${String(count).padStart(5, "0")}`;
}

function workingDoc(type) {
  type = validDocType(type);
  const companyId = activeCompany().id;
  const key = `${companyId}:${type}`;
  if (!state.workingDocs[key]) state.workingDocs[key] = makeDoc(type);
  state.workingDocs[key] = normalizeDoc(state.workingDocs[key], type, companyId);
  return state.workingDocs[key];
}

function setWorkingDoc(type, doc) {
  type = validDocType(type);
  const normalized = normalizeDoc({ ...doc, type: doc?.type || type }, type, doc?.companyId || activeCompany().id);
  const keyCompanyId = normalized.companyId || activeCompany().id;
  state.workingDocs[`${keyCompanyId}:${type}`] = normalized;
  // Working drafts are local per user/device. They should not sync until the user clicks Save.
  persistLocalStateOnly();
}

function lineUnitPrice(line, docType) {
  const base = number(line.price);
  if (docType !== "markupDraft") return base;
  const markup = number(line.markup);
  return line.markupType === "percentage" ? base * (1 + markup / 100) : base + markup;
}

function lineDiscount(line, docType) {
  const gross = number(line.qty) * lineUnitPrice(line, docType);
  const discount = number(line.discount);
  return line.discountType === "percentage" ? gross * (discount / 100) : discount;
}

function lineTotal(line, docType) {
  const gross = number(line.qty) * lineUnitPrice(line, docType);
  return Math.max(0, gross - lineDiscount(line, docType));
}

function docTotals(doc) {
  if (!doc) return { grand: 0, paid: 0, balance: 0 };
  if (doc.type === "delivery") return { grand: 0, paid: 0, balance: 0 };
  const items = Array.isArray(doc.items) ? doc.items : [];
  const grand = items.reduce((sum, line) => sum + lineTotal(normalizeLine(line, doc.type), doc.type), 0);
  const paid = number(doc.paid);
  const balance = Math.max(0, grand - paid);
  return { grand, paid, balance };
}

function showPaidBalance(doc) {
  return doc.type !== "delivery" && doc.showPaidBalance !== false;
}

function docSubtotal(doc) {
  const items = Array.isArray(doc?.items) ? doc.items : [];
  return items.reduce((sum, line) => {
    const safeLine = normalizeLine(line, doc.type);
    return sum + (number(safeLine.qty) * lineUnitPrice(safeLine, doc.type));
  }, 0);
}

function docDiscountTotal(doc) {
  const items = Array.isArray(doc?.items) ? doc.items : [];
  return items.reduce((sum, line) => lineDiscount(normalizeLine(line, doc.type), doc.type) + sum, 0);
}

function numberToWords(n) {
  n = Math.round(Number(n || 0));
  if (n === 0) return "Zero";
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  function under1000(x) {
    let s = "";
    if (x >= 100) {
      s += ones[Math.floor(x / 100)] + " Hundred";
      x %= 100;
      if (x) s += " ";
    }
    if (x >= 20) {
      s += tens[Math.floor(x / 10)];
      x %= 10;
      if (x) s += " " + ones[x];
    } else if (x > 0) s += ones[x];
    return s;
  }
  const parts = [];
  const scales = [[1000000, "Million"], [1000, "Thousand"], [1, ""]];
  for (const [value, label] of scales) {
    if (n >= value) {
      const chunk = Math.floor(n / value);
      if (chunk) parts.push(under1000(chunk) + (label ? " " + label : ""));
      n %= value;
    }
  }
  return parts.join(" ").trim();
}

function defaultCustomElement(kind = "text") {
  const quickText = {
    titleText: { text: "{{documentTitle}}", x: 70, y: 55, w: 280, h: 50, fontSize: 30, fontWeight: "900" },
    noText: { text: "No: {{documentNo}}", x: 70, y: 118, w: 220, h: 34, fontSize: 14, fontWeight: "700" },
    dateText: { text: "Date: {{date}}", x: 70, y: 155, w: 220, h: 34, fontSize: 14, fontWeight: "700" },
    companyNameText: { text: "{{companyName}}", x: 420, y: 60, w: 300, h: 48, fontSize: 24, fontWeight: "900", align: "right" },
    companyAddressText: { text: "{{companyAddress}}\n{{companyPhone}}\n{{companyEmail}}", x: 420, y: 112, w: 300, h: 92, fontSize: 12, fontWeight: "400", align: "right" },
    customerNameText: { text: "{{customerName}}", x: 70, y: 230, w: 300, h: 38, fontSize: 16, fontWeight: "700" },
    customerAddressText: { text: "{{customerAddress}}\n{{customerPhone}}\n{{customerEmail}}", x: 70, y: 270, w: 320, h: 92, fontSize: 12, fontWeight: "400" },
    grandTotalText: { text: "Grand Total: {{grandTotal}}", x: 500, y: 790, w: 230, h: 38, fontSize: 16, fontWeight: "900", align: "right" },
    balanceText: { text: "Balance Due: {{balanceDue}}", x: 500, y: 835, w: 230, h: 38, fontSize: 16, fontWeight: "900", align: "right" }
  };

  const textPreset = quickText[kind];
  const base = {
    id: uid("tpl"),
    kind: textPreset ? "text" : kind,
    x: textPreset?.x ?? 70,
    y: textPreset?.y ?? 70,
    w: textPreset?.w ?? (kind === "itemTable" ? 650 : 240),
    h: textPreset?.h ?? (kind === "itemTable" ? 170 : 70),
    text: textPreset?.text ?? "New wording",
    fontSize: textPreset?.fontSize ?? 16,
    fontWeight: textPreset?.fontWeight ?? "700",
    color: "#111827",
    align: textPreset?.align ?? "left",
    background: "transparent",
    borderColor: "#111827",
    borderWidth: 0,
    radius: 0
  };

  if (textPreset) return base;
  if (kind === "logo") return { ...base, kind: "logo", x: 610, y: 55, w: 120, h: 95, text: "", fontSize: 12, fontWeight: "400", align: "center", background: "transparent", borderWidth: 0 };
  if (kind === "box") return { ...base, text: "", background: "#f3f4f6", borderWidth: 1, h: 90 };
  if (kind === "companyInfo") return { ...base, w: 300, h: 110, fontSize: 13, fontWeight: "400", text: "Company Info" };
  if (kind === "customerInfo") return { ...base, w: 300, h: 100, fontSize: 13, fontWeight: "400", text: "Customer Info" };
  if (kind === "docInfo") return { ...base, w: 260, h: 90, fontSize: 15, fontWeight: "700", text: "Document Info" };
  if (kind === "totals") return { ...base, x: 500, y: 780, w: 220, h: 115, fontSize: 13, fontWeight: "400", text: "Totals" };
  if (kind === "payment") return { ...base, x: 70, y: 820, w: 320, h: 120, fontSize: 12, fontWeight: "400", text: "Payment Details" };
  if (kind === "signature") return { ...base, x: 500, y: 920, w: 220, h: 80, fontSize: 13, fontWeight: "400", text: "Prepared By\n\n________________" };
  if (kind === "itemTable") return { ...base, x: 70, y: 350, w: 650, h: 220, fontSize: 12, fontWeight: "400", text: "Item Table" };
  return base;
}

function templateCompany() {
  const id = templateEditor.companyId || activeCompany().id;
  const company = companyById(id) || activeCompany();
  templateEditor.companyId = company.id;
  return ensureCompanyTemplate(company);
}

function customTextValue(raw, doc, company, customer, totals) {
  const title = templateLabel(doc.type, company.template || "modern", company);
  const map = {
    companyName: company.name || "",
    companyPhone: company.phone || "",
    companyEmail: company.email || "",
    companyAddress: company.address || "",
    customerName: customer?.name || "",
    customerPhone: customer?.phone || "",
    customerEmail: customer?.email || "",
    customerAddress: customer?.address || "",
    documentTitle: title,
    documentNo: doc.number || "",
    date: doc.date || "",
    grandTotal: money(totals.grand),
    paid: showPaidBalance(doc) ? money(totals.paid) : "",
    balanceDue: showPaidBalance(doc) ? money(totals.balance) : ""
  };
  return String(raw || "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => map[key] ?? "");
}

function customBlockHtml(el, doc, company, customer, totals, template, isDelivery) {
  if (el.kind === "logo") {
    if (company.logo) return `<img class="custom-template-logo" src="${company.logo}" alt="${escapeHtml(company.name || "Company")} logo">`;
    return `<div class="custom-logo-placeholder">${escapeHtml((company.name || "CO").slice(0, 2).toUpperCase())}</div>`;
  }
  if (el.kind === "companyInfo") {
    return `<strong>${escapeHtml(company.name || "-")}</strong><br>${escapeHtml(company.address || "").replaceAll("\n", "<br>")}<br>${escapeHtml(company.phone || "")}${company.email ? `<br>${escapeHtml(company.email)}` : ""}`;
  }
  if (el.kind === "customerInfo") {
    return `<strong>${escapeHtml(customer?.name || "Customer")}</strong><br>${escapeHtml(customer?.address || "").replaceAll("\n", "<br>")}<br>${escapeHtml(customer?.phone || "")}${customer?.email ? `<br>${escapeHtml(customer.email)}` : ""}`;
  }
  if (el.kind === "docInfo") {
    const title = templateLabel(doc.type, template, company);
    const ctx = wordingContext(doc, company, template, { documentTitle: title });
    return `<strong>${escapeHtml(title)}</strong><br>${wordingHtml(company, "meta.no", "No:", ctx)} ${escapeHtml(doc.number || "-")}<br>${wordingHtml(company, "meta.date", "Date:", ctx)} ${escapeHtml(doc.date || "-")}`;
  }
  if (el.kind === "itemTable") return previewTableHtml(doc, template, isDelivery, company);
  if (el.kind === "totals") {
    if (doc.type === "delivery") return "";
    const ctx = wordingContext(doc, company, template);
    const paidBalanceLines = showPaidBalance(doc) ? `<div><span>${wordingHtml(company, "total.paid", "Paid", ctx)}</span><strong>${money(totals.paid)}</strong></div><div><span>${wordingHtml(company, "total.balanceDue", "Balance Due", ctx)}</span><strong>${money(totals.balance)}</strong></div>` : "";
    return `<div class="custom-total-lines"><div><span>${wordingHtml(company, "total.grand", "Grand Total", wordingContext(doc, company, template))}</span><strong>${money(totals.grand)}</strong></div>${paidBalanceLines}</div>`;
  }
  if (el.kind === "payment") return `<strong>${wordingHtml(company, "payment.title", "Payment Details", wordingContext(doc, company, template))}</strong><br>${escapeHtml(doc.paymentMethod || "-").replaceAll("\n", "<br>")}`;
  if (el.kind === "signature") return customTextValue(el.text || "Prepared By\n\n________________", doc, company, customer, totals).replaceAll("\n", "<br>");
  return customTextValue(el.text || "", doc, company, customer, totals).replaceAll("\n", "<br>");
}

function baseTemplateFrameHtml(company, baseContent, options = {}) {
  if (!baseContent) return "";
  company = ensureCompanyTemplate(company);
  const box = normalizeBaseTemplateBox(company.baseTemplateBox);
  company.baseTemplateBox = box;
  const selected = options.editMode && templateEditor.selectedId === "__base__" ? " selected" : "";
  const scaleX = Math.max(0.05, box.w / 698);
  const scaleY = Math.max(0.05, box.h / 1027);
  const style = [`left:${box.x}px`, `top:${box.y}px`, `width:${box.w}px`, `height:${box.h}px`].join(";");
  return `<div class="ready-template-frame${options.editMode ? " editing" : ""}${selected}" data-base-template="true" style="${style}">
    <div class="ready-template-inner" style="transform:scale(${scaleX}, ${scaleY});">${baseContent}</div>
    ${options.editMode ? `<span class="ready-template-label">Ready-made template</span><span class="resize-handle" data-base-template-resize="true"></span>` : ""}
  </div>`;
}

function customTemplateLayerHtml(company, doc, options = {}) {
  company = ensureCompanyTemplate(company);
  const elements = company.customTemplateElements || [];
  if (!elements.length && !options.editMode) return "";
  const customer = customerById(doc.customerId);
  const totals = docTotals(doc);
  const template = company.template || "modern";
  const isDelivery = doc.type === "delivery";
  const layerClass = options.editMode ? "custom-template-layer editing" : "custom-template-layer";
  return `<div class="${layerClass}">
    ${elements.map(el => {
      if (!options.editMode && !showPaidBalance(doc) && el.kind === "text" && /\{\{\s*(paid|balanceDue)\s*\}\}/i.test(el.text || "")) return "";
      const selected = options.selectedId === el.id ? " selected" : "";
      const bg = el.background || "transparent";
      const borderWidth = number(el.borderWidth);
      const style = [
        `left:${number(el.x)}px`, `top:${number(el.y)}px`, `width:${number(el.w)}px`, `height:${number(el.h)}px`,
        `font-size:${number(el.fontSize) || 13}px`, `font-weight:${escapeHtml(el.fontWeight || "400")}`,
        `color:${escapeHtml(el.color || "#111827")}`, `text-align:${escapeHtml(el.align || "left")}`,
        `background:${escapeHtml(bg)}`, `border:${borderWidth}px solid ${escapeHtml(el.borderColor || "transparent")}`,
        `border-radius:${number(el.radius)}px`
      ].join(";");
      const content = customBlockHtml(el, doc, company, customer, totals, template, isDelivery);
      return `<div class="custom-template-element custom-kind-${escapeHtml(el.kind)}${selected}" data-template-element="${el.id}" style="${style}">
        <div class="custom-template-content">${content}</div>
        ${options.editMode ? `<span class="resize-handle" data-template-resize="${el.id}"></span>` : ""}
      </div>`;
    }).join("")}
  </div>`;
}

function makeTemplateSampleDoc(type = "quotation", companyId = null) {
  const company = companyById(companyId) || activeCompany();
  const customer = state.customers[0] || { id: "", name: "Sample Customer", phone: "+60 12-000 0000", email: "customer@example.com", address: "Customer address" };
  return {
    id: "sample",
    type,
    number: `${company.prefix?.[type] || "DOC-"}00001`,
    date: todayISO(),
    companyId: company.id,
    issueCompanyId: "",
    customerId: customer.id,
    items: [
      { ...makeLine(type), id: "sample1", name: "Sample Product / Service", details: "Description text shown in the item table", qty: 2, unit: "pcs", price: 120, discount: 0 },
      { ...makeLine(type), id: "sample2", name: "Installation / Delivery", details: "Second line item for layout preview", qty: 1, unit: "job", price: 80, discount: 10 }
    ],
    paymentMethod: company.paymentMethod || "Payment details here",
    paid: type === "delivery" ? 0 : 50,
    showPaidBalance: true,
    signatureEnabled: true,
    receiverEnabled: type === "delivery"
  };
}

function switchTab(tabId) {
  $$(".tab").forEach(tab => tab.classList.toggle("active", tab.id === tabId));
  $$(".nav-btn").forEach(btn => btn.classList.toggle("active", btn.dataset.tab === tabId));
  $("#sidebar").classList.remove("open");
  updateCurrentAreaFromTab(tabId);
  schedulePresenceUpdate(300);
}

function selectCompany(companyId) {
  state.activeCompanyId = companyId;
  templateEditor.companyId = companyId;
  wordingEditor.companyId = companyId;
  persistLocalStateOnly();
  $("#companyGate").classList.add("hidden");
  renderAll();
}

function safeRender(name, fn) {
  try {
    fn();
  } catch (err) {
    console.error(`${name} render failed`, err);
    const fallbacks = {
      quotation: "quotationTab",
      invoice: "invoiceTab",
      delivery: "deliveryTab",
      markup: "markupTab",
      template: "templateTab",
      wording: "wordingTab",
      settings: "settingsTab"
    };
    const targetId = fallbacks[name];
    const target = targetId ? $(`#${targetId}`) : null;
    if (target) {
      target.innerHTML = `<div class="card"><h3>${escapeHtml(name)} failed to load</h3><p class="muted">This area had invalid saved data, but the app stayed open. Try refreshing once or resetting that section.</p></div>`;
    }
  }
}

function renderAll() {
  safeRender("companyGate", renderCompanyGate);
  safeRender("activeCompany", renderActiveCompanyLabel);
  safeRender("documentList", renderDocumentList);
  safeRender("items", renderItems);
  safeRender("quotation", () => renderDocumentForm("quotation"));
  safeRender("invoice", () => renderDocumentForm("invoice"));
  safeRender("delivery", () => renderDocumentForm("delivery"));
  safeRender("markup", renderMarkupForm);
  safeRender("template", renderTemplateEditor);
  safeRender("wording", renderWordingEditor);
  safeRender("settings", renderSettings);
}

function renderCompanyGate() {
  const picker = $("#companyPicker");
  picker.innerHTML = state.companies.map(company => `
    <button class="company-choice" data-select-company="${company.id}">
      <span class="company-logo-dot">${company.logo ? `<img src="${company.logo}" alt="">` : escapeHtml(company.name.slice(0,2).toUpperCase())}</span>
      <span>
        <strong>${escapeHtml(company.name)}</strong><br>
        <small>${escapeHtml(company.phone || "No phone")}</small>
      </span>
    </button>
  `).join("");
}

function renderActiveCompanyLabel() {
  const company = activeCompany();
  $("#activeCompanyLabel").textContent = `${company.name} • ${company.template} template`;
}

function renderDocumentList() {
  const query = ($("#documentSearch")?.value || "").trim().toLowerCase();
  const filter = $("#documentTypeFilter")?.value || "all";
  const rows = state.docs
    .map(doc => normalizeDoc(doc, doc?.type || "quotation", doc?.companyId || activeCompany().id))
    .filter(doc => doc.companyId === activeCompany().id)
    .filter(doc => filter === "all" || doc.type === filter)
    .filter(doc => {
      const customer = customerById(doc.customerId);
      return !query || (customer?.name || "").toLowerCase().includes(query);
    })
    .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));

  const tbody = $("#documentTableBody");
  if (!tbody) return;
  tbody.innerHTML = rows.length ? rows.map(doc => {
    const totals = docTotals(doc);
    const customer = customerById(doc.customerId);
    const info = docTypes[doc.type] || docTypes.quotation;
    return `
      <tr>
        <td><span class="badge ${info.badge}">${info.label}</span></td>
        <td><strong>${escapeHtml(doc.number)}</strong></td>
        <td>${escapeHtml(doc.date)}</td>
        <td>${escapeHtml(customer?.name || "No customer")}</td>
        <td>${doc.type === "delivery" ? "-" : money(totals.grand)}</td>
        <td>${doc.type === "delivery" || doc.showPaidBalance === false ? "-" : money(totals.balance)}</td>
        <td><strong>${escapeHtml(doc.lastEditedBy || doc.createdBy || "Unknown")}</strong><br><small class="muted">${escapeHtml(formatDateTime(doc.lastEditedAt || doc.updatedAt || doc.createdAt || ""))}</small></td>
        <td>
          <button type="button" class="btn secondary" data-open-doc="${doc.id}">Open</button>
          <button type="button" class="btn danger" data-delete-doc="${doc.id}">Delete</button>
        </td>
      </tr>`;
  }).join("") : `<tr><td colspan="8" class="muted">No document found for this company.</td></tr>`;
}

function formHeader(doc, type) {
  const info = docTypes[type];
  const isDelivery = type === "delivery";
  return `
    <div class="doc-titlebar">
      <div>
        <h2>${info.label}</h2>
        <p class="muted">Create, edit, save, and export ${info.label.toLowerCase()} records.</p>
      </div>
      <button class="btn secondary" data-save-doc="${type}">Save Record</button>
    </div>
    ${documentCollabPanel(doc, type)}
    <div class="form-grid three">
      <div class="field">
        <label>Customer Name</label>
        <div class="button-row">
          <input class="input" value="${escapeHtml(customerById(doc.customerId)?.name || "")}" placeholder="Select customer" readonly />
          <button class="btn secondary" data-pick-customer="${type}">Select</button>
        </div>
      </div>
      <div class="field">
        <label>${isDelivery ? "Delivery Order Number" : info.label + " Number"}</label>
        <input class="input" data-doc-field="number" data-doc-type="${type}" value="${escapeHtml(doc.number)}" />
      </div>
      <div class="field">
        <label>Date</label>
        <input class="input" type="date" data-doc-field="date" data-doc-type="${type}" value="${escapeHtml(doc.date)}" />
      </div>
    </div>
  `;
}


function markupIssuerSelector(doc) {
  const draftCompanyId = doc.companyId || activeCompany().id;
  const issueCompanyId = doc.issueCompanyId || draftCompanyId;
  const draftCompany = companyById(draftCompanyId) || activeCompany();
  const issueCompany = companyById(issueCompanyId) || draftCompany;
  return `
    <div class="card soft-card issuer-card" style="margin-top:12px;">
      <div class="form-grid two">
        <div class="field">
          <label>Create markup draft under company</label>
          <select class="input" data-doc-field="companyId" data-doc-type="markupDraft">
            ${state.companies.map(company => `<option value="${company.id}" ${draftCompanyId === company.id ? "selected" : ""}>${escapeHtml(company.name)} — ${escapeHtml(company.prefix?.markupDraft || "MD-")} draft prefix</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label>Draft company preview</label>
          <div class="issuer-preview">
            <strong>${escapeHtml(draftCompany.name)}</strong><br>
            <span>${escapeHtml(draftCompany.phone || "")} ${draftCompany.email ? "• " + escapeHtml(draftCompany.email) : ""}</span><br>
            <small class="muted">Draft No: ${escapeHtml(doc.number || nextNumber("markupDraft", draftCompanyId))}</small>
          </div>
        </div>
        <div class="field">
          <label>Issue converted quotation using company</label>
          <select class="input" data-doc-field="issueCompanyId" data-doc-type="markupDraft">
            ${state.companies.map(company => `<option value="${company.id}" ${issueCompanyId === company.id ? "selected" : ""}>${escapeHtml(company.name)} — ${escapeHtml(company.template || "modern")} template</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label>Converted quotation company preview</label>
          <div class="issuer-preview">
            <strong>${escapeHtml(issueCompany.name)}</strong><br>
            <span>${escapeHtml(issueCompany.phone || "")} ${issueCompany.email ? "• " + escapeHtml(issueCompany.email) : ""}</span>
          </div>
        </div>
      </div>
      <p class="muted" style="margin:8px 0 0;">The markup draft is saved under the first selected company. When converted, the quotation will use the second selected company name, logo, letterhead, template, quotation number prefix, and default payment details.</p>
    </div>
  `;
}

function renderLineRows(doc) {
  doc = normalizeDoc(doc, doc?.type || "quotation", doc?.companyId || activeCompany().id);
  const isDelivery = doc.type === "delivery";
  const isMarkup = doc.type === "markupDraft";
  return doc.items.map((line, index) => `
    <tr data-line-id="${line.id}">
      <td class="no-col">${index + 1}</td>
      <td>
        <div class="button-row">
          <input class="input" data-line-field="name" value="${escapeHtml(line.name)}" placeholder="Item name" />
          <button class="btn secondary" data-pick-item="${doc.type}" data-line-id="${line.id}">Select</button>
        </div>
        <textarea data-line-field="details" placeholder="Item details">${escapeHtml(line.details)}</textarea>
      </td>
      <td><input type="number" min="0" step="0.01" data-line-field="qty" value="${escapeHtml(line.qty)}" /></td>
      ${isDelivery ? "" : `<td><input data-line-field="unit" value="${escapeHtml(line.unit)}" /></td>`}
      ${isDelivery ? "" : `<td><input type="number" min="0" step="0.01" data-line-field="price" value="${escapeHtml(line.price)}" /></td>`}
      ${isMarkup ? `
        <td>
          <select data-line-field="markupType">
            <option value="percentage" ${line.markupType === "percentage" ? "selected" : ""}>%</option>
            <option value="amount" ${line.markupType === "amount" ? "selected" : ""}>RM</option>
          </select>
          <input type="number" min="0" step="0.01" data-line-field="markup" value="${escapeHtml(line.markup)}" placeholder="Markup" />
        </td>` : ""}
      ${isDelivery ? "" : `
        <td>
          <select data-line-field="discountType">
            <option value="amount" ${line.discountType === "amount" ? "selected" : ""}>RM</option>
            <option value="percentage" ${line.discountType === "percentage" ? "selected" : ""}>%</option>
          </select>
          <input type="number" min="0" step="0.01" data-line-field="discount" value="${escapeHtml(line.discount)}" placeholder="Discount" />
        </td>
        <td><strong>${money(lineTotal(line, doc.type))}</strong></td>`}
      <td><button type="button" class="btn danger row-delete-btn" data-remove-line="${doc.type}" data-line-id="${line.id}">Delete Row</button></td>
    </tr>
  `).join("");
}

function renderDocumentForm(type) {
  const doc = workingDoc(type);
  const target = $(`#${docTypes[type].tab}`);
  if (!target) return;
  const isDelivery = type === "delivery";
  const totals = docTotals(doc);

  target.innerHTML = `
    <div class="document-layout">
      <div class="document-form draft-panel">
        ${formHeader(doc, type)}
        <div class="table-wrap" style="margin-top:16px;">
          <table class="item-editor-table">
            <thead>
              <tr>
                <th>No.</th>
                <th>Items with Details</th>
                <th>Quantity</th>
                ${isDelivery ? "" : "<th>Units</th><th>Price / Unit</th><th>Item Discount</th><th>Total</th>"}
                <th>Action</th>
              </tr>
            </thead>
            <tbody>${renderLineRows(doc)}</tbody>
          </table>
        </div>
        <div class="button-row" style="margin-top:12px;">
          <button class="btn secondary" data-add-line="${type}">Add Item Row</button>
        </div>

        ${isDelivery ? renderDeliveryBottom(doc) : renderSalesBottom(doc, totals)}

        <div class="button-row right" style="margin-top:16px;">
          ${type === "quotation" ? `<button class="btn warning" data-create-markup-from="quotation">Create Markup Draft</button><button class="btn success" data-convert-doc="quotation:invoice">Create Invoice</button><button class="btn success" data-convert-doc="quotation:delivery">Create Delivery Order</button>` : ""}
          <button class="btn primary" data-create-pdf="${type}">Create PDF</button>
        </div>
      </div>
      <div class="doc-preview">
        <h3>Live Preview</h3>
        ${previewHtml(doc)}
      </div>
    </div>
  `;
}

function renderSalesBottom(doc, totals) {
  return `
    <div class="doc-summary-row">
      <div>
        <div class="field">
          <label>Payment Method & Details</label>
          <textarea data-doc-field="paymentMethod" data-doc-type="${doc.type}">${escapeHtml(doc.paymentMethod || "")}</textarea>
        </div>
        <label class="checkbox-line"><input type="checkbox" data-doc-field="signatureEnabled" data-doc-type="${doc.type}" ${doc.signatureEnabled ? "checked" : ""}> Show Prepared By signature</label>
        ${doc.signatureEnabled ? `<div class="signature-box"><strong>Prepared By</strong><br><br><br>_________________________</div>` : `<div class="computer-note">This Document Create by Computer, No Signature needed</div>`}
      </div>
      <div class="summary-box">
        <div class="summary-line"><span>Grand Total</span><strong>${money(totals.grand)}</strong></div>
        <label class="checkbox-line compact-check"><input type="checkbox" data-doc-field="showPaidBalance" data-doc-type="${doc.type}" ${showPaidBalance(doc) ? "checked" : ""}> Show Paid & Balance Due</label>
        ${showPaidBalance(doc) ? `
          <div class="summary-line"><span>Paid</span><input class="input" type="number" min="0" step="0.01" data-doc-field="paid" data-doc-type="${doc.type}" value="${escapeHtml(doc.paid)}"></div>
          <div class="summary-line"><span>Balance Due</span><strong>${money(totals.balance)}</strong></div>
        ` : `<p class="muted small-note">Paid and Balance Due are hidden in the live preview and PDF.</p>`}
      </div>
    </div>
  `;
}

function renderDeliveryBottom(doc) {
  return `
    <div style="margin-top:16px;">
      <label class="checkbox-line"><input type="checkbox" data-doc-field="signatureEnabled" data-doc-type="delivery" ${doc.signatureEnabled ? "checked" : ""}> Show signatures</label>
      ${doc.signatureEnabled ? `
        <div class="signature-row">
          <div class="signature-box"><strong>Prepared By</strong><br><br><br>_________________________</div>
          <div class="signature-box"><strong>Received By</strong><br><br><br>_________________________</div>
        </div>` : `<div class="computer-note">This Document Create by Computer, No Signature needed</div>`}
    </div>
  `;
}

function renderMarkupForm() {
  const doc = workingDoc("markupDraft");
  const totals = docTotals(doc);
  const target = $("#markupTab");
  target.innerHTML = `
    <div class="document-layout">
      <div class="document-form draft-panel">
        <div class="internal-ribbon">Internal use only: use this to review markup pricing. Export only after converting into an approved quotation under an authorised company profile.</div>
        ${formHeader(doc, "markupDraft")}
        ${markupIssuerSelector(doc)}
        <div class="table-wrap" style="margin-top:16px;">
          <table class="item-editor-table">
            <thead>
              <tr>
                <th>No.</th>
                <th>Items with Details</th>
                <th>Quantity</th>
                <th>Units</th>
                <th>Original Price</th>
                <th>Markup</th>
                <th>Discount</th>
                <th>Total</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>${renderLineRows(doc)}</tbody>
          </table>
        </div>
        <div class="button-row" style="margin-top:12px;">
          <button class="btn secondary" data-add-line="markupDraft">Add Item Row</button>
        </div>
        ${renderSalesBottom(doc, totals)}
        <div class="button-row right" style="margin-top:16px;">
          <button class="btn secondary" data-save-doc="markupDraft">Save Internal Draft</button>
          <button class="btn success" data-convert-doc="markupDraft:quotation">Convert to Quotation</button>
        </div>
      </div>
      <div class="doc-preview">
        <h3>Internal Preview</h3>
        ${previewHtml(doc)}
      </div>
    </div>
  `;
}


function renderTemplateEditor() {
  const target = $("#templateTab");
  if (!target) return;
  const company = templateCompany();
  const sampleType = templateEditor.docType || "quotation";
  const sampleDoc = makeTemplateSampleDoc(sampleType, company.id);
  const baseSelected = templateEditor.selectedId === "__base__";
  const selected = baseSelected ? { id: "__base__", kind: "baseTemplate" } : ((company.customTemplateElements || []).find(el => el.id === templateEditor.selectedId) || null);
  const customLayerRows = (company.customTemplateElements || []).map(el => `
    <button type="button" class="template-layer-row ${el.id === templateEditor.selectedId ? "active" : ""}" data-select-template-element="${el.id}">
      <span>${escapeHtml(templateElementName(el))}</span><small>${Math.round(number(el.x))}, ${Math.round(number(el.y))}</small>
    </button>
  `).join("");
  const elementList = `
    <button type="button" class="template-layer-row ${baseSelected ? "active" : ""}" data-select-template-element="__base__">
      <span>Ready-made Template</span><small>move / resize base</small>
    </button>
    ${customLayerRows || `<p class="muted">No custom elements yet. Add a wording, box, or dynamic block.</p>`}
  `;

  target.innerHTML = `
    <div class="panel-header">
      <div>
        <h2>Edit Template</h2>
        <p>Drag, move, and resize the ready-made template or add your own custom blocks anywhere on the A4 page. The exported PDF follows the same layout.</p>
      </div>
      <div class="button-row">
        <button class="btn ghost" data-reset-template-view>Refresh Preview</button>
        <button class="btn secondary" data-reset-base-template>Reset Ready Template</button>
        <button class="btn danger" data-clear-template>Clear Custom Elements</button>
      </div>
    </div>

    <div class="template-editor-layout">
      <aside class="template-tools card">
        <h3>Template Controls</h3>
        <div class="field">
          <label>Company to edit</label>
          <select class="input" data-template-company>
            ${state.companies.map(c => `<option value="${c.id}" ${c.id === company.id ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label>Preview as document type</label>
          <select class="input" data-template-doc-type>
            <option value="quotation" ${sampleType === "quotation" ? "selected" : ""}>Quotation</option>
            <option value="invoice" ${sampleType === "invoice" ? "selected" : ""}>Invoice</option>
            <option value="delivery" ${sampleType === "delivery" ? "selected" : ""}>Delivery Order</option>
          </select>
        </div>
        <div class="field">
          <label>Canvas mode</label>
          <select class="input" data-template-mode>
            <option value="overlay" ${company.customTemplateMode !== "blank" ? "selected" : ""}>Use selected base template + my custom elements</option>
            <option value="blank" ${company.customTemplateMode === "blank" ? "selected" : ""}>Blank page / fully custom</option>
          </select>
        </div>

        <div class="template-button-grid">
          <div class="template-tool-section-title">Free placement</div>
          <button class="btn secondary" data-add-template-element="logo">+ Logo</button>
          <button class="btn secondary" data-add-template-element="text">+ Custom Text</button>
          <button class="btn secondary" data-add-template-element="box">+ Box</button>

          <div class="template-tool-section-title">Individual wording blocks</div>
          <button class="btn secondary" data-add-template-element="titleText">+ Document Title</button>
          <button class="btn secondary" data-add-template-element="noText">+ Document No.</button>
          <button class="btn secondary" data-add-template-element="dateText">+ Date</button>
          <button class="btn secondary" data-add-template-element="companyNameText">+ Company Name</button>
          <button class="btn secondary" data-add-template-element="companyAddressText">+ Company Details</button>
          <button class="btn secondary" data-add-template-element="customerNameText">+ Customer Name</button>
          <button class="btn secondary" data-add-template-element="customerAddressText">+ Customer Details</button>
          <button class="btn secondary" data-add-template-element="grandTotalText">+ Grand Total Text</button>
          <button class="btn secondary" data-add-template-element="balanceText">+ Balance Due Text</button>

          <div class="template-tool-section-title">Dynamic blocks</div>
          <button class="btn secondary" data-add-template-element="companyInfo">+ Company Info</button>
          <button class="btn secondary" data-add-template-element="customerInfo">+ Customer Info</button>
          <button class="btn secondary" data-add-template-element="docInfo">+ Doc Info</button>
          <button class="btn secondary" data-add-template-element="itemTable">+ Item Table</button>
          <button class="btn secondary" data-add-template-element="totals">+ Totals</button>
          <button class="btn secondary" data-add-template-element="payment">+ Payment</button>
          <button class="btn secondary" data-add-template-element="signature">+ Signature</button>
        </div>

        <h3>Layers</h3>
        <div class="template-layer-list">${elementList}</div>
      </aside>

      <div class="template-canvas-wrap">
        <div class="template-canvas-head">
          <strong>A4 Template Canvas</strong>
          <span class="muted">Select Ready-made Template or any block, then drag to move and use bottom-right handle to resize.</span>
        </div>
        <div class="template-edit-canvas">
          ${previewHtml(sampleDoc, { editMode: true, selectedId: templateEditor.selectedId })}
        </div>
      </div>

      <aside class="template-inspector card">
        <h3>Selected Element</h3>
        ${selected ? templateInspectorHtml(selected) : `<p class="muted">Select an element on the page or from the layer list.</p>`}
      </aside>
    </div>
  `;
}

function wordingCompany() {
  const id = wordingEditor.companyId || activeCompany().id;
  const company = companyById(id) || activeCompany();
  wordingEditor.companyId = company.id;
  return ensureCompanyTemplate(company);
}

function wordingFieldDefinitions(company) {
  company = ensureCompanyTemplate(company);
  const template = company.template || "modern";
  const defs = [
    { section: "Document Titles", key: "title.quotation", label: "Quotation title", fallback: defaultTemplateLabel("quotation", template) },
    { section: "Document Titles", key: "title.invoice", label: "Invoice title", fallback: defaultTemplateLabel("invoice", template) },
    { section: "Document Titles", key: "title.delivery", label: "Delivery Order title", fallback: defaultTemplateLabel("delivery", template) },
    { section: "Document Titles", key: "title.markupDraft", label: "Markup Draft title", fallback: defaultTemplateLabel("markupDraft", template) },

    { section: "Header & Document Info", key: "header.subtitle", label: "Header subtitle", fallback: defaultTemplateSubtitle(template), large: true },
    { section: "Header & Document Info", key: "meta.no", label: "No label", fallback: "No:" },
    { section: "Header & Document Info", key: "meta.date", label: "Date label", fallback: "Date:" },
    { section: "Header & Document Info", key: "meta.numberLine", label: "Modern number label", fallback: "{{documentTitle}}#" },
    { section: "Header & Document Info", key: "meta.dateLine", label: "Modern date label", fallback: "{{documentTitle}} Date" },
    { section: "Header & Document Info", key: "meta.documentNo", label: "Receipt document number label", fallback: "Document No." },
    { section: "Header & Document Info", key: "meta.issueDate", label: "Receipt issue date label", fallback: "Issue Date" },

    { section: "Customer / Party Boxes", key: "party.customerHeading", label: "Customer heading", fallback: defaultCustomerHeading(template) },
    { section: "Customer / Party Boxes", key: "party.by", label: "Modern issued by label", fallback: "{{documentTitle}} by" },
    { section: "Customer / Party Boxes", key: "party.to", label: "Modern issued to label", fallback: "{{documentTitle}} to" },
    { section: "Customer / Party Boxes", key: "party.address", label: "Address label", fallback: "Address" },
    { section: "Customer / Party Boxes", key: "party.contact", label: "Contact label", fallback: "Contact" },
    { section: "Customer / Party Boxes", key: "party.remarkTitle", label: "Remarks / Note heading", fallback: template === "minimal" ? "Note" : "Remarks" },
    { section: "Customer / Party Boxes", key: "party.remarkText", label: "Remarks / Note wording", fallback: defaultDocumentRemark(template), large: true },

    { section: "Totals & Payment", key: "total.grand", label: "Grand total label", fallback: template === "minimal" ? "Total" : template === "receipt" ? "Amount Payable" : "Grand Total" },
    { section: "Totals & Payment", key: "total.paid", label: "Paid label", fallback: "Paid" },
    { section: "Totals & Payment", key: "total.balanceDue", label: "Balance due label", fallback: "Balance Due" },
    { section: "Totals & Payment", key: "payment.title", label: "Payment title", fallback: template === "classic" ? "Settlement Details" : template === "minimal" ? "Payment Note" : template === "receipt" ? "Payment / Collection" : "Payment Details" },
    { section: "Totals & Payment", key: "payment.termsTitle", label: "Modern payment terms heading", fallback: "Payment Method & Terms" },

    { section: "Signature & Miscellaneous", key: "signature.preparedBy", label: "Prepared by label", fallback: "Prepared By" },
    { section: "Signature & Miscellaneous", key: "signature.receivedBy", label: "Received by label", fallback: "Received By" },
    { section: "Signature & Miscellaneous", key: "signature.computerNote", label: "No-signature computer note", fallback: "This Document Create by Computer, No Signature needed", large: true },
    { section: "Signature & Miscellaneous", key: "other.internalRibbon", label: "Internal draft ribbon", fallback: "INTERNAL MARKUP DRAFT" }
  ];

  const salesSpec = tableSpec(template, false);
  salesSpec.forEach((col, index) => defs.push({ section: "Table Headings - Quotation / Invoice", key: `table.${template}.sales.${index}`, label: `Column ${index + 1}`, fallback: col.label }));
  const deliverySpec = tableSpec(template, true);
  deliverySpec.forEach((col, index) => defs.push({ section: "Table Headings - Delivery Order", key: `table.${template}.delivery.${index}`, label: `Column ${index + 1}`, fallback: col.label }));

  return defs;
}

function renderWordingPreview() {
  const preview = $("#wordingPreviewArea");
  if (!preview) return;
  const company = wordingCompany();
  const sampleDoc = makeTemplateSampleDoc(wordingEditor.docType || "quotation", company.id);
  preview.innerHTML = previewHtml(sampleDoc);
}

function renderWordingEditor() {
  const target = $("#wordingTab");
  if (!target) return;
  const company = wordingCompany();
  const sampleType = wordingEditor.docType || "quotation";
  const defs = wordingFieldDefinitions(company);
  const bySection = defs.reduce((acc, def) => {
    acc[def.section] = acc[def.section] || [];
    acc[def.section].push(def);
    return acc;
  }, {});
  const sectionsHtml = Object.entries(bySection).map(([section, fields]) => `
    <div class="wording-section card">
      <h3>${escapeHtml(section)}</h3>
      <div class="wording-field-grid">
        ${fields.map(def => {
          const hasCustom = Object.prototype.hasOwnProperty.call(company.templateWordings || {}, def.key);
          const value = hasCustom ? company.templateWordings[def.key] : def.fallback;
          const control = def.large
            ? `<textarea data-wording-field="${escapeHtml(def.key)}">${escapeHtml(value)}</textarea>`
            : `<input class="input" data-wording-field="${escapeHtml(def.key)}" value="${escapeHtml(value)}">`;
          return `
            <div class="wording-field ${hasCustom ? "has-custom" : ""}">
              <label>${escapeHtml(def.label)}</label>
              ${control}
              <div class="wording-field-foot">
                <small>${hasCustom ? "Custom wording" : "Default wording"}</small>
                <button type="button" class="mini-link" data-reset-wording-field="${escapeHtml(def.key)}">Reset</button>
              </div>
            </div>`;
        }).join("")}
      </div>
    </div>
  `).join("");

  target.innerHTML = `
    <div class="panel-header">
      <div>
        <h2>Edit Wording</h2>
        <p>Edit every wording used inside the selected company's ready-made template, including titles, labels, table headings, totals, payment, and signature wording.</p>
      </div>
      <div class="button-row">
        <button class="btn ghost" data-refresh-wording-preview>Refresh Preview</button>
        <button class="btn danger" data-reset-all-wordings>Reset All Wordings</button>
      </div>
    </div>

    <div class="wording-layout">
      <div class="wording-editor-panel">
        <div class="card wording-top-controls">
          <div class="form-grid two">
            <div class="field">
              <label>Company wording to edit</label>
              <select class="input" data-wording-company>
                ${state.companies.map(c => `<option value="${c.id}" ${c.id === company.id ? "selected" : ""}>${escapeHtml(c.name)} — ${escapeHtml(c.template || "modern")}</option>`).join("")}
              </select>
            </div>
            <div class="field">
              <label>Preview as document type</label>
              <select class="input" data-wording-doc-type>
                <option value="quotation" ${sampleType === "quotation" ? "selected" : ""}>Quotation</option>
                <option value="invoice" ${sampleType === "invoice" ? "selected" : ""}>Invoice</option>
                <option value="delivery" ${sampleType === "delivery" ? "selected" : ""}>Delivery Order</option>
                <option value="markupDraft" ${sampleType === "markupDraft" ? "selected" : ""}>Markup Draft</option>
              </select>
            </div>
          </div>
          <p class="muted">You can use placeholders such as <code>{{documentTitle}}</code>, <code>{{documentNo}}</code>, <code>{{date}}</code>, <code>{{companyName}}</code>, <code>{{customerName}}</code>, <code>{{grandTotal}}</code>, <code>{{paid}}</code>, and <code>{{balanceDue}}</code>.</p>
        </div>
        ${sectionsHtml}
      </div>

      <aside class="wording-preview-panel">
        <div class="template-canvas-head">
          <strong>Live Wording Preview</strong>
          <span class="muted">Typing saves automatically. Use Refresh Preview if you want to force-update the view.</span>
        </div>
        <div id="wordingPreviewArea" class="wording-preview-area">${previewHtml(makeTemplateSampleDoc(sampleType, company.id))}</div>
      </aside>
    </div>
  `;
}

function updateWordingField(key, value) {
  const company = wordingCompany();
  company.templateWordings = company.templateWordings || {};
  company.templateWordings[key] = value;
  saveState();
  renderWordingPreview();
}

function resetWordingField(key) {
  const company = wordingCompany();
  if (company.templateWordings) delete company.templateWordings[key];
  saveState();
  renderWordingEditor();
}

function resetAllWordings() {
  const company = wordingCompany();
  if (!confirm(`Reset all edited wording for ${company.name}?`)) return;
  company.templateWordings = {};
  saveState();
  renderWordingEditor();
}

function templateElementName(el) {
  const names = {
    text: "Wording",
    logo: "Logo",
    box: "Box",
    companyInfo: "Company Info",
    customerInfo: "Customer Info",
    docInfo: "Document Info",
    itemTable: "Item Table",
    totals: "Totals",
    payment: "Payment",
    signature: "Signature",
    baseTemplate: "Ready-made Template"
  };
  if (el.kind === "text" && el.text) {
    const label = String(el.text).replaceAll("{{", "").replaceAll("}}", "").replace(/\s+/g, " ").trim().slice(0, 34);
    return label ? `Wording: ${label}` : "Wording";
  }
  return names[el.kind] || "Element";
}

function baseTemplateInspectorHtml() {
  const company = templateCompany();
  const box = normalizeBaseTemplateBox(company.baseTemplateBox);
  company.baseTemplateBox = box;
  return `
    <div class="inspector-badge">Ready-made Template</div>
    <p class="muted">This controls the selected built-in template as one editable block. Move it, resize it, then place your own wording/logo blocks on top if needed.</p>
    <div class="form-grid two">
      <div class="field"><label>X</label><input class="input" type="number" data-base-template-field="x" value="${escapeHtml(box.x)}"></div>
      <div class="field"><label>Y</label><input class="input" type="number" data-base-template-field="y" value="${escapeHtml(box.y)}"></div>
      <div class="field"><label>Width</label><input class="input" type="number" data-base-template-field="w" value="${escapeHtml(box.w)}"></div>
      <div class="field"><label>Height</label><input class="input" type="number" data-base-template-field="h" value="${escapeHtml(box.h)}"></div>
    </div>
    <div class="button-row">
      <button class="btn secondary" data-reset-base-template>Reset Ready Template</button>
    </div>
  `;
}

function templateInspectorHtml(el) {
  if (el.kind === "baseTemplate") return baseTemplateInspectorHtml();
  const allowText = ["text", "box", "signature"].includes(el.kind);
  const logoNote = el.kind === "logo" ? `<p class="muted">This block uses the selected company logo. Upload or change the logo in <strong>Settings &gt; Upload Logo</strong>, then drag and resize this logo block anywhere on the page.</p>` : "";
  return `
    <div class="inspector-badge">${escapeHtml(templateElementName(el))}</div>
    ${allowText ? `
      <div class="field">
        <label>Wording / Placeholder Text</label>
        <textarea data-template-field="text" data-template-id="${el.id}">${escapeHtml(el.text || "")}</textarea>
      </div>
      <div class="placeholder-help">
        <strong>Placeholders:</strong><br>
        {{companyName}}, {{companyPhone}}, {{companyEmail}}, {{companyAddress}}<br>
        {{customerName}}, {{customerPhone}}, {{customerEmail}}, {{customerAddress}}<br>
        {{documentTitle}}, {{documentNo}}, {{date}}, {{grandTotal}}, {{paid}}, {{balanceDue}}
      </div>` : (logoNote || `<p class="muted">This is a dynamic block. You can move, resize, recolor, and add border/background.</p>`)}
    <div class="form-grid two">
      <div class="field"><label>X</label><input class="input" type="number" data-template-field="x" data-template-id="${el.id}" value="${escapeHtml(el.x)}"></div>
      <div class="field"><label>Y</label><input class="input" type="number" data-template-field="y" data-template-id="${el.id}" value="${escapeHtml(el.y)}"></div>
      <div class="field"><label>Width</label><input class="input" type="number" data-template-field="w" data-template-id="${el.id}" value="${escapeHtml(el.w)}"></div>
      <div class="field"><label>Height</label><input class="input" type="number" data-template-field="h" data-template-id="${el.id}" value="${escapeHtml(el.h)}"></div>
    </div>
    <div class="form-grid two">
      <div class="field"><label>Font Size</label><input class="input" type="number" min="6" max="80" data-template-field="fontSize" data-template-id="${el.id}" value="${escapeHtml(el.fontSize || 13)}"></div>
      <div class="field"><label>Font Weight</label><select class="input" data-template-field="fontWeight" data-template-id="${el.id}">
        <option value="400" ${String(el.fontWeight) === "400" ? "selected" : ""}>Regular</option>
        <option value="700" ${String(el.fontWeight) === "700" ? "selected" : ""}>Bold</option>
        <option value="900" ${String(el.fontWeight) === "900" ? "selected" : ""}>Extra Bold</option>
      </select></div>
      <div class="field"><label>Align</label><select class="input" data-template-field="align" data-template-id="${el.id}">
        <option value="left" ${el.align === "left" ? "selected" : ""}>Left</option>
        <option value="center" ${el.align === "center" ? "selected" : ""}>Center</option>
        <option value="right" ${el.align === "right" ? "selected" : ""}>Right</option>
      </select></div>
      <div class="field"><label>Radius</label><input class="input" type="number" min="0" data-template-field="radius" data-template-id="${el.id}" value="${escapeHtml(el.radius || 0)}"></div>
    </div>
    <div class="form-grid two">
      <div class="field"><label>Text Color</label><input class="input" type="color" data-template-field="color" data-template-id="${el.id}" value="${escapeHtml(el.color || "#111827")}"></div>
      <div class="field"><label>Background</label><input class="input" type="text" data-template-field="background" data-template-id="${el.id}" value="${escapeHtml(el.background || "transparent")}" placeholder="transparent or #ffffff"></div>
      <div class="field"><label>Border Color</label><input class="input" type="color" data-template-field="borderColor" data-template-id="${el.id}" value="${escapeHtml(el.borderColor || "#111827")}"></div>
      <div class="field"><label>Border Width</label><input class="input" type="number" min="0" data-template-field="borderWidth" data-template-id="${el.id}" value="${escapeHtml(el.borderWidth || 0)}"></div>
    </div>
    <div class="button-row space-between">
      <button class="btn secondary" data-duplicate-template-element="${el.id}">Duplicate</button>
      <button class="btn danger" data-delete-template-element="${el.id}">Delete Element</button>
    </div>
  `;
}

function addTemplateElement(kind) {
  const company = templateCompany();
  const el = defaultCustomElement(kind);
  company.customTemplateElements.push(el);
  templateEditor.selectedId = el.id;
  saveState();
  renderAll();
  switchTab("templateTab");
}

function updateTemplateElement(id, field, value) {
  const company = templateCompany();
  const el = company.customTemplateElements.find(item => item.id === id);
  if (!el) return;
  const numericFields = ["x", "y", "w", "h", "fontSize", "borderWidth", "radius"];
  el[field] = numericFields.includes(field) ? number(value) : value;
  if (field === "w") el.w = Math.max(20, el.w);
  if (field === "h") el.h = Math.max(20, el.h);
  saveState();
  renderAll();
  switchTab("templateTab");
}

function selectTemplateElement(id) {
  templateEditor.selectedId = id;
  renderTemplateEditor();
}

function deleteTemplateElement(id) {
  const company = templateCompany();
  company.customTemplateElements = company.customTemplateElements.filter(el => el.id !== id);
  if (templateEditor.selectedId === id) templateEditor.selectedId = null;
  saveState();
  renderAll();
  switchTab("templateTab");
}

function duplicateTemplateElement(id) {
  const company = templateCompany();
  const source = company.customTemplateElements.find(el => el.id === id);
  if (!source) return;
  const copy = { ...source, id: uid("tpl"), x: number(source.x) + 20, y: number(source.y) + 20 };
  company.customTemplateElements.push(copy);
  templateEditor.selectedId = copy.id;
  saveState();
  renderAll();
  switchTab("templateTab");
}

function clearTemplateElements() {
  const company = templateCompany();
  if (!confirm(`Clear all custom template elements for ${company.name}?`)) return;
  company.customTemplateElements = [];
  templateEditor.selectedId = null;
  saveState();
  renderAll();
  switchTab("templateTab");
}

function setTemplateMode(value) {
  const company = templateCompany();
  company.customTemplateMode = value === "blank" ? "blank" : "overlay";
  saveState();
  renderAll();
  switchTab("templateTab");
}

function updateBaseTemplateBox(field, value) {
  const company = templateCompany();
  const box = normalizeBaseTemplateBox(company.baseTemplateBox);
  box[field] = number(value);
  if (field === "w") box.w = Math.max(80, box.w);
  if (field === "h") box.h = Math.max(80, box.h);
  company.baseTemplateBox = normalizeBaseTemplateBox(box);
  saveState();
  renderTemplateEditor();
}

function resetBaseTemplateBox() {
  const company = templateCompany();
  company.baseTemplateBox = normalizeBaseTemplateBox({ x: 0, y: 0, w: 698, h: 1027 });
  templateEditor.selectedId = "__base__";
  saveState();
  renderAll();
  switchTab("templateTab");
}

function beginBaseTemplateDrag(event, mode) {
  const node = event.target.closest("[data-base-template]");
  const paper = event.target.closest(".preview-paper");
  if (!node || !paper) return;
  event.preventDefault();
  event.stopPropagation();
  const company = templateCompany();
  company.baseTemplateBox = normalizeBaseTemplateBox(company.baseTemplateBox);
  templateEditor.selectedId = "__base__";
  const rect = paper.getBoundingClientRect();
  const scaleX = 794 / rect.width;
  const scaleY = 1123 / rect.height;
  templateDrag = {
    id: "__base__",
    mode,
    startX: event.clientX,
    startY: event.clientY,
    original: { ...company.baseTemplateBox },
    scaleX,
    scaleY
  };
  node.classList.add("selected");
}

function beginTemplateDrag(event, mode) {
  const elNode = event.target.closest("[data-template-element]");
  if (!elNode) return;
  const company = templateCompany();
  const el = company.customTemplateElements.find(item => item.id === elNode.dataset.templateElement);
  const paper = event.target.closest(".preview-paper");
  if (!el || !paper) return;
  event.preventDefault();
  event.stopPropagation();
  templateEditor.selectedId = el.id;
  const rect = paper.getBoundingClientRect();
  const scaleX = 794 / rect.width;
  const scaleY = 1123 / rect.height;
  templateDrag = {
    id: el.id,
    mode,
    startX: event.clientX,
    startY: event.clientY,
    original: { x: number(el.x), y: number(el.y), w: number(el.w), h: number(el.h) },
    scaleX,
    scaleY
  };
  elNode.classList.add("selected");
}

function handleTemplatePointerMove(event) {
  if (!templateDrag) return;
  const company = templateCompany();
  const dx = (event.clientX - templateDrag.startX) * templateDrag.scaleX;
  const dy = (event.clientY - templateDrag.startY) * templateDrag.scaleY;

  if (templateDrag.id === "__base__") {
    const box = normalizeBaseTemplateBox(company.baseTemplateBox);
    if (templateDrag.mode === "resize") {
      box.w = Math.max(80, templateDrag.original.w + dx);
      box.h = Math.max(80, templateDrag.original.h + dy);
    } else {
      box.x = Math.max(-200, Math.min(794, templateDrag.original.x + dx));
      box.y = Math.max(-200, Math.min(1123, templateDrag.original.y + dy));
    }
    company.baseTemplateBox = normalizeBaseTemplateBox(box);
    const node = $(".template-edit-canvas [data-base-template]");
    if (node) {
      node.style.left = `${box.x}px`;
      node.style.top = `${box.y}px`;
      node.style.width = `${box.w}px`;
      node.style.height = `${box.h}px`;
      const inner = node.querySelector(".ready-template-inner");
      if (inner) inner.style.transform = `scale(${Math.max(0.05, box.w / 698)}, ${Math.max(0.05, box.h / 1027)})`;
    }
    return;
  }

  const el = company.customTemplateElements.find(item => item.id === templateDrag.id);
  if (!el) return;
  if (templateDrag.mode === "resize") {
    el.w = Math.max(28, templateDrag.original.w + dx);
    el.h = Math.max(22, templateDrag.original.h + dy);
  } else {
    el.x = Math.max(0, Math.min(794 - number(el.w), templateDrag.original.x + dx));
    el.y = Math.max(0, Math.min(1123 - number(el.h), templateDrag.original.y + dy));
  }
  const node = $(`.template-edit-canvas [data-template-element="${el.id}"]`);
  if (node) {
    node.style.left = `${el.x}px`;
    node.style.top = `${el.y}px`;
    node.style.width = `${el.w}px`;
    node.style.height = `${el.h}px`;
  }
}

function endTemplateDrag() {
  if (!templateDrag) return;
  templateDrag = null;
  saveState();
  renderAll();
  switchTab("templateTab");
}



function templateLabel(type, template, company = null) {
  const fallback = defaultTemplateLabel(type, template);
  if (!company) return fallback;
  return wording(company, `title.${type}`, fallback, { documentTitle: fallback, template });
}

function customerHeading(template, company = null) {
  const fallback = defaultCustomerHeading(template);
  return company ? wordingHtml(company, "party.customerHeading", fallback, { template }) : fallback;
}

function templateSubtitle(template, company = null) {
  const fallback = defaultTemplateSubtitle(template);
  return company ? wordingHtml(company, "header.subtitle", fallback, { template }) : fallback;
}

function documentRemark(template, company = null) {
  const fallback = defaultDocumentRemark(template);
  return company ? wordingHtml(company, "party.remarkText", fallback, { template }) : fallback;
}

function compactAddress(value = "") {
  return escapeHtml(value).replaceAll("\n", "<br>");
}

function companyCustomerPanelHtml(company, customer, template, displayType = "Quotation") {
  if (template === "modern") {
    return `
      <div class="modern-party-grid">
        <div class="modern-party-card">
          <div class="modern-party-row"><span>${wordingHtml(company, "party.by", "{{documentTitle}} by", wordingContext({}, company, template, { documentTitle: displayType }))}</span><strong>${escapeHtml(company?.name || "-")}</strong></div>
          <div class="modern-party-row"><span>${wordingHtml(company, "party.address", "Address", wordingContext({}, company, template, { documentTitle: displayType }))}</span><div>${compactAddress(company?.address || "-")}</div></div>
          <div class="modern-party-row"><span>${wordingHtml(company, "party.contact", "Contact", wordingContext({}, company, template, { documentTitle: displayType }))}</span><div>${escapeHtml(company?.phone || "-")}${company?.email ? `<br>${escapeHtml(company.email)}` : ""}</div></div>
        </div>
        <div class="modern-party-card">
          <div class="modern-party-row"><span>${wordingHtml(company, "party.to", "{{documentTitle}} to", wordingContext({}, company, template, { documentTitle: displayType }))}</span><strong>${escapeHtml(customer?.name || "-")}</strong></div>
          <div class="modern-party-row"><span>${wordingHtml(company, "party.address", "Address", wordingContext({}, company, template, { documentTitle: displayType }))}</span><div>${compactAddress(customer?.address || "-")}</div></div>
          <div class="modern-party-row"><span>${wordingHtml(company, "party.contact", "Contact", wordingContext({}, company, template, { documentTitle: displayType }))}</span><div>${escapeHtml(customer?.phone || "-")}${customer?.email ? `<br>${escapeHtml(customer.email)}` : ""}</div></div>
        </div>
      </div>`;
  }
  return `
    <div class="preview-customer-doc-grid preview-customer-doc-grid-${escapeHtml(template)}">
      <div class="preview-customer-box"><strong>${customerHeading(template, company)}</strong><br>${escapeHtml(customer?.name || "-")}<br>${compactAddress(customer?.address || "")}<br>${escapeHtml(customer?.phone || "")}</div>
      <div class="preview-wording-box"><strong>${wordingHtml(company, "party.remarkTitle", template === "minimal" ? "Note" : "Remarks", wordingContext({}, company, template, { documentTitle: displayType }))}</strong><br>${documentRemark(template, company)}</div>
    </div>`;
}

function logoHtml(company, className = "preview-logo") {
  return company.logo ? `<img class="${className}" src="${company.logo}" alt="logo">` : `<div class="preview-logo-placeholder ${className === "preview-logo small-logo" ? "small-logo" : ""}">${escapeHtml((company.name || "CO").slice(0, 2).toUpperCase())}</div>`;
}

function companyContactHtml(company) {
  return `${compactAddress(company.address || "")}<br>${escapeHtml(company.phone || "")}${company.email ? ` • ${escapeHtml(company.email)}` : ""}`;
}

function previewLetterheadHtml(company, doc, template, displayType) {
  const ctx = wordingContext(doc, company, template, { documentTitle: displayType });
  const docMeta = `<div class="preview-meta"><strong>${wordingHtml(company, "meta.no", "No:", ctx)}</strong> ${escapeHtml(doc.number)}<br><strong>${wordingHtml(company, "meta.date", "Date:", ctx)}</strong> ${escapeHtml(doc.date)}</div>`;

  // Template 1: sample-inspired quotation header.
  if (template === "modern") {
    return `
      <div class="preview-letterhead preview-letterhead-modern modern-sample-header">
        <div class="template1-left modern-meta-left">
          <div class="preview-title title-left modern-sample-title">${escapeHtml(displayType)}</div>
          <div class="modern-doc-meta-lines">
            <div class="modern-doc-meta-row"><span>${wordingHtml(company, "meta.numberLine", "{{documentTitle}}#", ctx)}</span><strong>${escapeHtml(doc.number)}</strong></div>
            <div class="modern-doc-meta-row"><span>${wordingHtml(company, "meta.dateLine", "{{documentTitle}} Date", ctx)}</span><strong>${escapeHtml(doc.date)}</strong></div>
          </div>
        </div>
        <div class="template1-right modern-brand-right">
          <div class="modern-brand-lockup">
            ${logoHtml(company, "preview-logo modern-brand-logo")}
            <div class="modern-brand-name">${escapeHtml(company.name)}</div>
          </div>
        </div>
      </div>`;
  }

  // Template 2: logo left, company details beside logo, document title at the very right.
  if (template === "classic") {
    return `
      <div class="preview-letterhead preview-letterhead-classic">
        <div class="template2-left">
          ${logoHtml(company)}
          <div>
            <strong class="preview-company-name big">${escapeHtml(company.name)}</strong><br>
            <span class="preview-company-contact">${companyContactHtml(company)}</span>
          </div>
        </div>
        <div class="template2-title">
          <div class="preview-title">${escapeHtml(displayType).toUpperCase()}</div>
          <div class="preview-subtitle right-align">${templateSubtitle(template, company)}</div>
          ${docMeta}
        </div>
      </div>`;
  }

  // Template 3: full-width corporate band.
  if (template === "bluebar") {
    return `
      <div class="preview-letterhead preview-letterhead-bluebar">
        <div>
          <div class="preview-title title-left">${escapeHtml(displayType).toUpperCase()}</div>
          <div class="preview-subtitle light">${templateSubtitle(template, company)}</div>
        </div>
        <div class="logo-right">${logoHtml(company)}</div>
      </div>
      <div class="bluebar-company-row">
        <div><strong>${escapeHtml(company.name)}</strong><br>${companyContactHtml(company)}</div>
        ${docMeta}
      </div>`;
  }

  // Template 4: minimal editorial layout.
  if (template === "minimal") {
    return `
      <div class="preview-letterhead preview-letterhead-minimal">
        <div>
          <div class="preview-title title-left understated">${escapeHtml(displayType)}</div>
          <div class="preview-subtitle">${templateSubtitle(template, company)}</div>
          ${docMeta}
        </div>
        <div class="preview-company-block right-align">
          ${logoHtml(company, "preview-logo small-logo")}<br>
          <strong>${escapeHtml(company.name)}</strong><br>${companyContactHtml(company)}
        </div>
      </div>`;
  }

  // Template 5: boxed receipt-style layout.
  if (template === "receipt") {
    return `
      <div class="preview-letterhead preview-letterhead-receipt">
        <div class="receipt-box receipt-company">${logoHtml(company, "preview-logo small-logo")}<br><strong>${escapeHtml(company.name)}</strong><br>${companyContactHtml(company)}</div>
        <div class="receipt-box receipt-title"><div class="preview-title title-centered">${escapeHtml(displayType).toUpperCase()}</div><div class="preview-subtitle">${templateSubtitle(template, company)}</div></div>
        <div class="receipt-box receipt-meta"><strong>${wordingHtml(company, "meta.documentNo", "Document No.", ctx)}</strong><br>${escapeHtml(doc.number)}<br><br><strong>${wordingHtml(company, "meta.issueDate", "Issue Date", ctx)}</strong><br>${escapeHtml(doc.date)}</div>
      </div>`;
  }

  return `
    <div class="preview-letterhead preview-letterhead-modern">
      <div class="template1-left">${logoHtml(company)}<div class="preview-company-stack"><strong>${escapeHtml(company.name)}</strong><br>${companyContactHtml(company)}</div></div>
      <div class="template1-right"><div class="preview-title">${escapeHtml(displayType).toUpperCase()}</div>${docMeta}</div>
    </div>`;
}

function tableSpec(template, isDelivery) {
  if (isDelivery) {
    return ({
      modern: [
        { label: "Item #/Item description", html: (line, i) => `<strong>${i + 1}. ${escapeHtml(line.name || "-")}</strong><br>${escapeHtml(line.details || "")}` },
        { label: "Qty.", align: "center", html: line => escapeHtml(line.qty) }
      ],
      classic: [
        { label: "Delivered Item Description", html: (line, i) => `<strong>${i + 1}. ${escapeHtml(line.name || "-")}</strong><br>${escapeHtml(line.details || "")}` },
        { label: "Delivered Qty", align: "center", html: line => escapeHtml(line.qty) }
      ],
      bluebar: [
        { label: "#", align: "center", html: (line, i) => i + 1 },
        { label: "Goods / Service", html: line => `<strong>${escapeHtml(line.name || "-")}</strong><br>${escapeHtml(line.details || "")}` },
        { label: "QTY", align: "center", html: line => escapeHtml(line.qty) }
      ],
      minimal: [
        { label: "Dispatch Item", html: (line, i) => `<span class="muted">${i + 1}</span> ${escapeHtml(line.name || "-")}<br>${escapeHtml(line.details || "")}` },
        { label: "Qty", align: "center", html: line => escapeHtml(line.qty) }
      ],
      receipt: [
        { label: "Line", align: "center", html: (line, i) => i + 1 },
        { label: "Description", html: line => `<strong>${escapeHtml(line.name || "-")}</strong><br>${escapeHtml(line.details || "")}` },
        { label: "Quantity Received", align: "center", html: line => escapeHtml(line.qty) }
      ]
    })[template] || [];
  }

  return ({
    modern: [
      { label: "Item #/Item description", html: (line, i) => `<strong>${i + 1}. ${escapeHtml(line.name || "-")}</strong><br>${escapeHtml(line.details || "")}${line.discount ? `<br><small>Discount: ${line.discountType === "percentage" ? `${escapeHtml(line.discount)}%` : money(line.discount)}</small>` : ""}` },
      { label: "Qty.", html: line => escapeHtml(line.qty) },
      { label: "Unit", html: line => escapeHtml(line.unit) },
      { label: "Rate", html: (line, i, doc) => money(lineUnitPrice(line, doc.type)) },
      { label: "Amount", html: (line, i, doc) => `<strong>${money(lineTotal(line, doc.type))}</strong>` }
    ],
    classic: [
      { label: "No.", html: (line, i) => i + 1 },
      { label: "Particulars", html: line => `<strong>${escapeHtml(line.name || "-")}</strong><br>${escapeHtml(line.details || "")}` },
      { label: "U/M", html: line => escapeHtml(line.unit) },
      { label: "Qty", html: line => escapeHtml(line.qty) },
      { label: "Rate", html: (line, i, doc) => money(lineUnitPrice(line, doc.type)) },
      { label: "Less", html: line => line.discountType === "percentage" ? `${escapeHtml(line.discount)}%` : money(line.discount) },
      { label: "Amount", html: (line, i, doc) => `<strong>${money(lineTotal(line, doc.type))}</strong>` }
    ],
    bluebar: [
      { label: "Ref", html: (line, i) => `B${String(i + 1).padStart(2, "0")}` },
      { label: "Product / Service Details", html: line => `<strong>${escapeHtml(line.name || "-")}</strong><br>${escapeHtml(line.details || "")}` },
      { label: "Quantity", html: line => escapeHtml(line.qty) },
      { label: "UOM", html: line => escapeHtml(line.unit) },
      { label: "Sell Price", html: (line, i, doc) => money(lineUnitPrice(line, doc.type)) },
      { label: "Rebate", html: line => line.discountType === "percentage" ? `${escapeHtml(line.discount)}%` : money(line.discount) },
      { label: "Net Total", html: (line, i, doc) => `<strong>${money(lineTotal(line, doc.type))}</strong>` }
    ],
    minimal: [
      { label: "Description", html: (line, i) => `<span class="muted">${i + 1}</span> <strong>${escapeHtml(line.name || "-")}</strong><br>${escapeHtml(line.details || "")}` },
      { label: "Qty", html: line => escapeHtml(line.qty) },
      { label: "UOM", html: line => escapeHtml(line.unit) },
      { label: "Rate", html: (line, i, doc) => money(lineUnitPrice(line, doc.type)) },
      { label: "Disc.", html: line => line.discountType === "percentage" ? `${escapeHtml(line.discount)}%` : money(line.discount) },
      { label: "Amount", html: (line, i, doc) => `<strong>${money(lineTotal(line, doc.type))}</strong>` }
    ],
    receipt: [
      { label: "Line", html: (line, i) => i + 1 },
      { label: "Goods / Services", html: line => `<strong>${escapeHtml(line.name || "-")}</strong><br>${escapeHtml(line.details || "")}<br><small>Unit: ${escapeHtml(line.unit || "-")}</small>` },
      { label: "Qty", html: line => escapeHtml(line.qty) },
      { label: "Unit Price", html: (line, i, doc) => money(lineUnitPrice(line, doc.type)) },
      { label: "Discount", html: line => line.discountType === "percentage" ? `${escapeHtml(line.discount)}%` : money(line.discount) },
      { label: "Line Amount", html: (line, i, doc) => `<strong>${money(lineTotal(line, doc.type))}</strong>` }
    ]
  })[template] || [];
}

function tableCellClass(col) {
  return col.align ? ` class="cell-${escapeHtml(col.align)}"` : "";
}

function previewTableHtml(doc, template, isDelivery, companyOverride = null) {
  const company = ensureCompanyTemplate(companyOverride || documentCompany(doc));
  const spec = tableSpec(template, isDelivery);
  const tableKind = isDelivery ? "delivery" : "sales";
  return `
    <table class="preview-table preview-table-${escapeHtml(template)} preview-table-${tableKind}">
      <thead><tr>${spec.map((col, index) => `<th${tableCellClass(col)}>${wordingHtml(company, `table.${template}.${tableKind}.${index}`, col.label, wordingContext(doc, company, template))}</th>`).join("")}</tr></thead>
      <tbody>
        ${doc.items.map((line, i) => `
          <tr>${spec.map(col => `<td${tableCellClass(col)}>${col.html(line, i, doc)}</td>`).join("")}</tr>`).join("")}
      </tbody>
    </table>`;
}

function previewPaymentTotalsHtml(doc, template, totals, companyOverride = null) {
  if (doc.type === "delivery") return "";
  const company = ensureCompanyTemplate(companyOverride || documentCompany(doc));
  const ctx = wordingContext(doc, company, template);
  const totalLabelFallback = template === "minimal" ? "Total" : template === "receipt" ? "Amount Payable" : "Grand Total";
  const totalLabel = wordingHtml(company, "total.grand", totalLabelFallback, ctx);
  const paidBalanceLines = showPaidBalance(doc)
    ? `<div class="summary-line"><span>${wordingHtml(company, "total.paid", "Paid", ctx)}</span><strong>${money(totals.paid)}</strong></div><div class="summary-line"><span>${wordingHtml(company, "total.balanceDue", "Balance Due", ctx)}</span><strong>${money(totals.balance)}</strong></div>`
    : "";
  const totalsHtml = `
    <div class="preview-totals preview-totals-${escapeHtml(template)}">
      <div class="summary-line"><span>${totalLabel}</span><strong>${money(totals.grand)}</strong></div>
      ${paidBalanceLines}
    </div>`;
  const paymentTitleFallback = template === "classic" ? "Settlement Details" : template === "minimal" ? "Payment Note" : template === "receipt" ? "Payment / Collection" : "Payment Details";
  const paymentTitle = wordingHtml(company, "payment.title", paymentTitleFallback, ctx);
  const paymentHtml = `<div class="preview-payment preview-payment-${escapeHtml(template)}"><strong>${paymentTitle}</strong><br>${escapeHtml(doc.paymentMethod || "-").replaceAll("\n", "<br>")}</div>`;

  if (template === "modern") return `<div class="preview-payment-grid modern-pay"><div class="modern-terms-wrap"><div class="modern-terms-title">${wordingHtml(company, "payment.termsTitle", "Payment Method & Terms", ctx)}</div>${paymentHtml}</div><div class="modern-totals-wrap">${totalsHtml}</div></div>`;
  if (template === "classic") return `<div class="classic-payment-wrap">${totalsHtml}${paymentHtml}</div>`;
  if (template === "bluebar") return `<div class="preview-payment-grid bluebar-pay">${totalsHtml}${paymentHtml}</div>`;
  if (template === "minimal") return `<div class="minimal-payment-stack">${paymentHtml}${totalsHtml}</div>`;
  if (template === "receipt") return `<div class="receipt-payment-boxes">${paymentHtml}${totalsHtml}</div>`;
  return `${totalsHtml}${paymentHtml}`;
}

function previewSignatureHtml(doc, isDelivery, companyOverride = null) {
  const company = ensureCompanyTemplate(companyOverride || documentCompany(doc));
  const ctx = wordingContext(doc, company, company.template || "modern");
  if (!doc.signatureEnabled) return `<div class="computer-note">${wordingHtml(company, "signature.computerNote", "This Document Create by Computer, No Signature needed", ctx)}</div>`;
  if (isDelivery) {
    return `
      <div class="signature-row">
        <div style="margin-top:34px;">${wordingHtml(company, "signature.preparedBy", "Prepared By", ctx)}<br><br>________________</div>
        <div style="margin-top:34px;">${wordingHtml(company, "signature.receivedBy", "Received By", ctx)}<br><br>________________</div>
      </div>`;
  }
  return `<div class="preview-signature-single${doc.type !== "delivery" ? " preview-signature-right" : ""}">${wordingHtml(company, "signature.preparedBy", "Prepared By", ctx)}<br><br>________________</div>`;
}

function previewHtml(doc, options = {}) {
  const company = ensureCompanyTemplate(documentCompany(doc));
  const customer = customerById(doc.customerId);
  const totals = docTotals(doc);
  const template = company.template || "modern";
  const displayType = templateLabel(doc.type, template, company);
  const isDelivery = doc.type === "delivery";
  const useBlankCanvas = company.customTemplateMode === "blank";
  const baseContent = useBlankCanvas ? "" : `
      ${previewLetterheadHtml(company, doc, template, displayType)}
      <div class="preview-customer-doc-grid preview-customer-doc-grid-${escapeHtml(template)}">
        <div class="preview-customer-box"><strong>${customerHeading(template, company)}</strong><br>${escapeHtml(customer?.name || "-")}<br>${escapeHtml(customer?.address || "").replaceAll("\n", "<br>")}<br>${escapeHtml(customer?.phone || "")}</div>
        <div class="preview-wording-box"><strong>${wordingHtml(company, "party.remarkTitle", template === "minimal" ? "Note" : "Remarks", wordingContext(doc, company, template, { documentTitle: displayType }))}</strong><br>${documentRemark(template, company)}</div>
      </div>
      ${previewTableHtml(doc, template, isDelivery, company)}
      ${previewPaymentTotalsHtml(doc, template, totals, company)}
      ${previewSignatureHtml(doc, isDelivery, company)}`;
  return `
    <div class="preview-paper preview-template-${escapeHtml(template)} ${useBlankCanvas ? "preview-blank-template" : ""}">
      ${doc.type === "markupDraft" ? `<div class="internal-ribbon">${wordingHtml(company, "other.internalRibbon", "INTERNAL MARKUP DRAFT", wordingContext(doc, company, template, { documentTitle: displayType }))}</div>` : ""}
      ${useBlankCanvas ? "" : baseTemplateFrameHtml(company, baseContent, options)}
      ${customTemplateLayerHtml(company, doc, options)}
    </div>
  `;
}


function renderItems() {
  const query = ($("#itemSearch")?.value || "").trim().toLowerCase();
  const items = state.items.filter(item => !query || item.name.toLowerCase().includes(query));
  $("#itemTableBody").innerHTML = items.length ? items.map(item => `
    <tr>
      <td><strong>${escapeHtml(item.name)}</strong></td>
      <td>${escapeHtml(item.details)}</td>
      <td>${escapeHtml(item.unit)}</td>
      <td>${money(item.price)}</td>
      <td>
        <button type="button" class="btn secondary" data-edit-item="${item.id}">Edit</button>
        <button type="button" class="btn danger" data-delete-item="${item.id}">Delete Item</button>
      </td>
    </tr>
  `).join("") : `<tr><td colspan="5" class="muted">No item found.</td></tr>`;
}


function renderCustomerListOnly() {
  const list = $("#customerList");
  if (!list) return;
  const customerQuery = ($("#customerSearch")?.value || "").trim().toLowerCase();
  const customers = state.customers.filter(c => !customerQuery || (c.name || "").toLowerCase().includes(customerQuery));
  list.innerHTML = customers.map(c => `
    <div class="list-card">
      <div><strong>${escapeHtml(c.name || "Unnamed Customer")}</strong><p>${escapeHtml(c.phone || "")} ${c.email ? "• " + escapeHtml(c.email) : ""}<br>${escapeHtml(c.address || "")}</p></div>
      <div class="button-row"><button class="btn secondary" data-edit-customer="${c.id}">Edit</button><button class="btn danger" data-delete-customer="${c.id}">Delete</button></div>
    </div>
  `).join("") || `<p class="muted">No customer found.</p>`;
}

function renderSettings() {
  $("#companySettingsList").innerHTML = state.companies.map(company => `
    <div class="company-editor" data-company-editor="${company.id}">
      <h4>${escapeHtml(company.name)}</h4>
      <div class="form-grid">
        <div class="field"><label>Company Name</label><input class="input" data-company-field="name" value="${escapeHtml(company.name)}"></div>
        <div class="field"><label>Phone</label><input class="input" data-company-field="phone" value="${escapeHtml(company.phone || "")}"></div>
        <div class="field"><label>Email</label><input class="input" data-company-field="email" value="${escapeHtml(company.email || "")}"></div>
        <div class="field"><label>Template</label><select class="input" data-company-field="template">${templates.map(t => `<option value="${t.id}" ${company.template === t.id ? "selected" : ""}>${t.name}</option>`).join("")}</select></div>
        <div class="field"><label>Quotation Prefix</label><input class="input" data-prefix-field="quotation" value="${escapeHtml(company.prefix?.quotation || "QT-")}"></div>
        <div class="field"><label>Invoice Prefix</label><input class="input" data-prefix-field="invoice" value="${escapeHtml(company.prefix?.invoice || "INV-")}"></div>
        <div class="field"><label>Delivery Prefix</label><input class="input" data-prefix-field="delivery" value="${escapeHtml(company.prefix?.delivery || "DO-")}"></div>
        <div class="field"><label>Internal Draft Prefix</label><input class="input" data-prefix-field="markupDraft" value="${escapeHtml(company.prefix?.markupDraft || "MD-")}"></div>
      </div>
      <div class="field" style="margin-top:12px;"><label>Address</label><textarea data-company-field="address">${escapeHtml(company.address || "")}</textarea></div>
      <div class="field"><label>Default Payment Details</label><textarea data-company-field="paymentMethod">${escapeHtml(company.paymentMethod || "")}</textarea></div>
      <div class="button-row space-between">
        <label class="btn ghost">Upload Logo<input type="file" accept="image/*" data-company-logo="${company.id}" hidden></label>
        ${company.logo ? `<button class="btn ghost" data-remove-logo="${company.id}">Remove Logo</button>` : ""}
        <button class="btn danger" data-delete-company="${company.id}">Delete Company</button>
      </div>
    </div>
  `).join("");

  renderCustomerListOnly();
}

function updateDocField(type, field, value, checked = null) {
  const doc = workingDoc(type);
  if (type === "markupDraft" && field === "companyId") {
    const previousCompanyId = doc.companyId || activeCompany().id;
    const previousCompany = companyById(previousCompanyId) || activeCompany();
    const selectedCompany = companyById(value);
    if (!selectedCompany) return;

    const previousPrefix = previousCompany.prefix?.markupDraft || "MD-";
    const shouldRefreshNumber = !doc.number || String(doc.number).startsWith(previousPrefix);
    doc.companyId = selectedCompany.id;
    if (shouldRefreshNumber) doc.number = nextNumber("markupDraft", selectedCompany.id);
    if (previousCompanyId !== selectedCompany.id) delete state.workingDocs[`${previousCompanyId}:markupDraft`];

    // Keep the quotation issue company in sync until the user intentionally chooses a different one.
    if (!doc.issueCompanyId || doc.issueCompanyId === previousCompanyId) {
      doc.issueCompanyId = selectedCompany.id;
      doc.paymentMethod = selectedCompany.paymentMethod || "";
    }
    state.activeCompanyId = selectedCompany.id;
  } else if (field === "issueCompanyId" && type === "markupDraft") {
    doc.issueCompanyId = value;
    const issueCompany = companyById(value);
    if (issueCompany) doc.paymentMethod = issueCompany.paymentMethod || "";
  } else {
    doc[field] = field === "signatureEnabled" || field === "receiverEnabled" || field === "showPaidBalance" ? Boolean(checked) : value;
  }
  if (field === "paid") doc[field] = number(value);
  doc.updatedAt = new Date().toISOString();
  markDocumentActivity(type, true);
  setWorkingDoc(type, doc);
  if (type === "markupDraft" && field === "companyId") {
    renderAll();
    switchTab("markupTab");
  } else {
    type === "markupDraft" ? renderMarkupForm() : renderDocumentForm(type);
  }
}

function updateLineField(type, lineId, field, value) {
  const doc = workingDoc(type);
  const line = doc.items.find(l => l.id === lineId);
  if (!line) return;
  const numericFields = ["qty", "price", "discount", "markup"];
  line[field] = numericFields.includes(field) ? number(value) : value;
  doc.updatedAt = new Date().toISOString();
  markDocumentActivity(type, true);
  setWorkingDoc(type, doc);
  type === "markupDraft" ? renderMarkupForm() : renderDocumentForm(type);
}

function saveDoc(type) {
  type = validDocType(type);
  const doc = touchDocumentAudit(normalizeDoc({ ...workingDoc(type), id: workingDoc(type).id || uid("doc"), updatedAt: new Date().toISOString() }, type, activeCompany().id), "saved record");
  const existingIndex = state.docs.findIndex(d => d.id === doc.id);
  if (existingIndex >= 0) state.docs[existingIndex] = doc;
  else state.docs.push(doc);
  state.workingDocs[`${doc.companyId || activeCompany().id}:${type}`] = makeDoc(type);
  saveState();
  flushCloudSave(true);
  renderAll();
  switchTab("listTab");
}

function openDoc(docId) {
  try {
    const index = state.docs.findIndex(d => d.id === docId);
    if (index < 0) {
      alert("This record could not be found. Please refresh the list and try again.");
      renderDocumentList();
      return;
    }
    const doc = normalizeDoc(state.docs[index], state.docs[index]?.type || "quotation", state.docs[index]?.companyId || activeCompany().id);
    state.docs[index] = doc;
    if (!docTypes[doc.type]) {
      alert("This document type is not supported by the app.");
      renderDocumentList();
      return;
    }
    if (doc.companyId !== activeCompany().id) state.activeCompanyId = doc.companyId;
    setWorkingDoc(doc.type, { ...doc, items: doc.items.map(l => ({ ...l })) });
    persistLocalStateOnly();
    renderCompanyGate();
    renderActiveCompanyLabel();
    renderDocumentList();
    doc.type === "markupDraft" ? renderMarkupForm() : renderDocumentForm(doc.type);
    switchTab(docTypes[doc.type].tab);
    markDocumentActivity(doc.type, false);
  } catch (err) {
    console.error("Open document failed", err);
    alert("Open failed because this record has old or incomplete data. I repaired the app so it will not blank the page. Please try opening it again, or create a fresh record if this one is corrupted.");
    renderDocumentList();
    switchTab("listTab");
  }
}

function deleteDoc(docId) {
  if (!confirm("Delete this document?")) return;
  state.deletedDocIds = Array.from(new Set([...(state.deletedDocIds || []), docId].filter(Boolean)));
  state.docs = state.docs.filter(d => d.id !== docId);
  saveState();
  flushCloudSave(true);
  renderDocumentList();
}

function addLine(type) {
  const doc = workingDoc(type);
  doc.items.push(makeLine(type));
  markDocumentActivity(type, true);
  setWorkingDoc(type, doc);
  type === "markupDraft" ? renderMarkupForm() : renderDocumentForm(type);
}

function removeLine(type, lineId) {
  const doc = workingDoc(type);
  doc.items = doc.items.filter(l => l.id !== lineId);
  if (!doc.items.length) doc.items = [makeLine(type)];
  markDocumentActivity(type, true);
  setWorkingDoc(type, doc);
  type === "markupDraft" ? renderMarkupForm() : renderDocumentForm(type);
}

function convertDoc(fromType, toType) {
  const source = workingDoc(fromType);
  const issueCompany = fromType === "markupDraft" && toType === "quotation"
    ? (companyById(source.issueCompanyId) || companyById(source.companyId) || activeCompany())
    : (companyById(source.companyId) || activeCompany());
  const converted = makeDoc(toType, { ...source, companyId: issueCompany.id });
  converted.companyId = issueCompany.id;
  converted.number = nextNumber(toType, issueCompany.id);

  if (fromType === "markupDraft" && toType === "quotation") {
    converted.paymentMethod = source.paymentMethod || issueCompany.paymentMethod || "";
    converted.items = source.items.map(line => ({
      ...line,
      id: uid("line"),
      price: Number(lineUnitPrice(line, "markupDraft").toFixed(2)),
      markup: 0,
      markupType: "percentage"
    }));
    state.activeCompanyId = issueCompany.id;
  }

  setWorkingDoc(toType, converted);
  markDocumentActivity(toType, true);
  renderAll();
  switchTab(docTypes[toType].tab);
}

function createMarkupFromQuotation() {
  const source = workingDoc("quotation");
  const draft = makeDoc("markupDraft", source);
  setWorkingDoc("markupDraft", draft);
  markDocumentActivity("markupDraft", true);
  renderAll();
  switchTab("markupTab");
}

function openCustomerModal(type) {
  selectedCustomerTarget = type;
  $("#modalCustomerSearch").value = "";
  renderCustomerModalList();
  $("#customerModal").showModal();
}

function renderCustomerModalList() {
  const query = $("#modalCustomerSearch").value.trim().toLowerCase();
  const customers = state.customers.filter(c => !query || c.name.toLowerCase().includes(query));
  $("#modalCustomerList").innerHTML = customers.map(c => `
    <button type="button" class="list-card" data-select-customer="${c.id}">
      <span><strong>${escapeHtml(c.name)}</strong><p>${escapeHtml(c.phone || "")}<br>${escapeHtml(c.address || "")}</p></span>
      <span>Choose</span>
    </button>
  `).join("") || `<p class="muted">No customer. Add one first.</p>`;
}

function openItemModal(type, lineId) {
  selectedLineTarget = { type, lineId };
  $("#modalItemSearch").value = "";
  renderItemModalList();
  $("#itemModal").showModal();
}

function renderItemModalList() {
  const query = $("#modalItemSearch").value.trim().toLowerCase();
  const items = state.items.filter(i => !query || i.name.toLowerCase().includes(query));
  $("#modalItemList").innerHTML = items.map(item => `
    <button type="button" class="list-card" data-select-item="${item.id}">
      <span><strong>${escapeHtml(item.name)}</strong><p>${escapeHtml(item.details)}<br>${escapeHtml(item.unit)} • ${money(item.price)}</p></span>
      <span>Choose</span>
    </button>
  `).join("") || `<p class="muted">No item. Add one first.</p>`;
}

function selectCustomer(customerId) {
  if (!selectedCustomerTarget) return;
  const doc = workingDoc(selectedCustomerTarget);
  doc.customerId = customerId;
  markDocumentActivity(selectedCustomerTarget, true);
  setWorkingDoc(selectedCustomerTarget, doc);
  $("#customerModal").close();
  selectedCustomerTarget === "markupDraft" ? renderMarkupForm() : renderDocumentForm(selectedCustomerTarget);
}

function selectItem(itemId) {
  if (!selectedLineTarget) return;
  const item = itemById(itemId);
  const { type, lineId } = selectedLineTarget;
  const doc = workingDoc(type);
  const line = doc.items.find(l => l.id === lineId);
  if (item && line) {
    line.itemId = item.id;
    line.name = item.name;
    line.details = item.details;
    line.unit = item.unit;
    line.price = item.price;
  }
  markDocumentActivity(type, true);
  setWorkingDoc(type, doc);
  $("#itemModal").close();
  type === "markupDraft" ? renderMarkupForm() : renderDocumentForm(type);
}

function openQuickForm(kind, id = null) {
  const modal = $("#quickFormModal");
  const form = $("#quickForm");
  form.dataset.kind = kind;
  form.dataset.id = id || "";

  let title = "Add Record";
  let fields = [];
  let data = {};
  if (kind === "item") {
    title = id ? "Edit Item" : "Add Item";
    data = id ? itemById(id) : { name: "", details: "", unit: "pcs", price: 0 };
    fields = [
      ["name", "Item Name", "text"], ["details", "Details", "textarea"], ["unit", "Unit", "text"], ["price", "Price", "number"]
    ];
  } else if (kind === "customer") {
    title = id ? "Edit Customer" : "Add Customer";
    data = id ? customerById(id) : { name: "", phone: "", email: "", address: "" };
    fields = [
      ["name", "Customer Name", "text"], ["phone", "Phone", "text"], ["email", "Email", "email"], ["address", "Address", "textarea"]
    ];
  } else if (kind === "company") {
    title = id ? "Edit Company" : "Add Company";
    data = id ? state.companies.find(c => c.id === id) : { name: "", phone: "", email: "", address: "", template: "modern" };
    fields = [
      ["name", "Company Name", "text"], ["phone", "Phone", "text"], ["email", "Email", "email"], ["address", "Address", "textarea"]
    ];
  }
  $("#quickFormTitle").textContent = title;
  $("#quickFormFields").innerHTML = fields.map(([key, label, type]) => `
    <div class="field">
      <label>${label}</label>
      ${type === "textarea" ? `<textarea name="${key}">${escapeHtml(data?.[key] || "")}</textarea>` : `<input class="input" name="${key}" type="${type}" step="0.01" value="${escapeHtml(data?.[key] ?? "")}">`}
    </div>
  `).join("");
  modal.showModal();
}

function handleQuickFormSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const kind = form.dataset.kind;
  const id = form.dataset.id;
  const formData = Object.fromEntries(new FormData(form).entries());

  if (kind === "item") {
    const existing = id ? state.items.find(i => i.id === id) : null;
    const record = { ...(existing || {}), id: id || uid("item"), name: formData.name, details: formData.details, unit: formData.unit || "pcs", price: number(formData.price), updatedAt: new Date().toISOString() };
    const idx = state.items.findIndex(i => i.id === record.id);
    if (idx >= 0) state.items[idx] = record; else state.items.push(record);
  }
  if (kind === "customer") {
    const existing = id ? state.customers.find(c => c.id === id) : null;
    const record = { ...(existing || {}), id: id || uid("customer"), name: formData.name, phone: formData.phone, email: formData.email, address: formData.address, updatedAt: new Date().toISOString() };
    const idx = state.customers.findIndex(c => c.id === record.id);
    if (idx >= 0) state.customers[idx] = record; else state.customers.push(record);
  }
  if (kind === "company") {
    const record = {
      id: id || uid("company"),
      name: formData.name || "New Company",
      phone: formData.phone,
      email: formData.email,
      address: formData.address,
      logo: "",
      template: "modern",
      paymentMethod: "Payment Method: Bank Transfer\nBank:\nAccount No.:\nAccount Name:",
      prefix: { quotation: "QT-", invoice: "INV-", delivery: "DO-", markupDraft: "MD-" },
      updatedAt: new Date().toISOString()
    };
    const idx = state.companies.findIndex(c => c.id === record.id);
    if (idx >= 0) state.companies[idx] = { ...state.companies[idx], ...record }; else state.companies.push(record);
    state.activeCompanyId = record.id;
  }

  saveState();
  $("#quickFormModal").close();
  renderAll();
}

function deleteItem(id) {
  if (!confirm("Delete this item? Existing documents will keep their copied item text.")) return;
  state.items = state.items.filter(i => i.id !== id);
  saveState();
  renderAll();
}

function deleteCustomer(id) {
  if (!confirm("Delete this customer? Existing documents will show No customer if this record is removed.")) return;
  state.customers = state.customers.filter(c => c.id !== id);
  saveState();
  renderAll();
}

function deleteCompany(id) {
  if (state.companies.length <= 1) return alert("At least one company is required.");
  if (!confirm("Delete this company profile? Documents for this company will remain stored but hidden until reassigned.")) return;
  state.companies = state.companies.filter(c => c.id !== id);
  if (state.activeCompanyId === id) state.activeCompanyId = state.companies[0].id;
  saveState();
  renderAll();
}

function handleCompanyField(event) {
  const editor = event.target.closest("[data-company-editor]");
  if (!editor) return;
  const company = state.companies.find(c => c.id === editor.dataset.companyEditor);
  if (!company) return;
  const target = event.target;
  if (target.dataset.companyField) {
    company[target.dataset.companyField] = target.value;
  }
  if (target.dataset.prefixField) {
    company.prefix = company.prefix || {};
    company.prefix[target.dataset.prefixField] = target.value;
  }
  company.updatedAt = new Date().toISOString();
  saveState();

  // Do not re-render the whole Settings tab while typing.
  // Re-rendering replaces the input element and makes the cursor lose focus,
  // which caused users to type only one letter per click.
  if (event.type === "input") {
    if (company.id === state.activeCompanyId) renderActiveCompanyLabel();
    return;
  }

  renderAll();
}

function handleLogoUpload(input) {
  const company = state.companies.find(c => c.id === input.dataset.companyLogo);
  const file = input.files?.[0];
  if (!company || !file) return;
  const reader = new FileReader();
  reader.onload = () => {
    company.logo = reader.result;
    saveState();
    renderAll();
  };
  reader.readAsDataURL(file);
}

function isCanvasSliceBlank(canvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx || canvas.width < 1 || canvas.height < 1) return true;

  const sampleStepX = Math.max(8, Math.floor(canvas.width / 80));
  const sampleStepY = Math.max(8, Math.floor(canvas.height / 80));
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let checked = 0;
  let visible = 0;

  for (let y = 0; y < canvas.height; y += sampleStepY) {
    for (let x = 0; x < canvas.width; x += sampleStepX) {
      const index = (y * canvas.width + x) * 4;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const a = data[index + 3];
      checked += 1;
      if (a > 8 && (r < 245 || g < 245 || b < 245)) visible += 1;
      if (visible > 12) return false;
    }
  }

  return checked === 0 || visible <= 12;
}

async function generatePdf(type) {
  const doc = workingDoc(type);
  if (type === "markupDraft") {
    alert("Markup Draft is internal only. Convert it to an approved Quotation before exporting.");
    return;
  }
  if (!window.jspdf?.jsPDF || !window.html2canvas) {
    alert("PDF export libraries are not loaded yet. Please check your internet connection, refresh, and try again.");
    return;
  }

  const company = documentCompany(doc);
  const template = company.template || "modern";
  const displayType = templateLabel(doc.type, template, company);
  const exportWrap = document.createElement("div");
  exportWrap.className = "pdf-export-stage";
  exportWrap.innerHTML = previewHtml(doc);
  document.body.appendChild(exportWrap);

  const paper = exportWrap.querySelector(".preview-paper");
  if (!paper) {
    exportWrap.remove();
    alert("Could not build PDF preview. Please refresh and try again.");
    return;
  }

  try {
    await document.fonts?.ready;
    const canvas = await window.html2canvas(paper, {
      backgroundColor: "#ffffff",
      scale: Math.max(2, window.devicePixelRatio || 1),
      useCORS: true,
      allowTaint: true,
      scrollX: 0,
      scrollY: 0,
      windowWidth: paper.scrollWidth,
      windowHeight: paper.scrollHeight
    });

    const pdf = new window.jspdf.jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const pageWidth = 210;
    const pageHeight = 297;
    const pagePixelHeight = Math.round(canvas.width * pageHeight / pageWidth);
    const overflow = canvas.height - pagePixelHeight;
    const tinyOverflow = Math.max(24, Math.round(canvas.height * 0.025));

    // The preview is designed as one A4 page. Browser rounding, borders, and
    // html2canvas can make the captured image a few pixels taller than A4.
    // Previously that tiny blank tail was exported as a second PDF page.
    // For normal one-page documents, fit the captured preview onto exactly one A4 page.
    if (overflow <= tinyOverflow) {
      const imgData = canvas.toDataURL("image/png");
      pdf.addImage(imgData, "PNG", 0, 0, pageWidth, pageHeight, undefined, "FAST");
      pdf.save(`${doc.number}-${displayType.replaceAll(" ", "-")}.pdf`);
      return;
    }

    let renderedHeight = 0;
    let pageIndex = 0;

    while (renderedHeight < canvas.height) {
      const sliceHeight = Math.min(pagePixelHeight, canvas.height - renderedHeight);
      const sliceCanvas = document.createElement("canvas");
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = sliceHeight;
      const ctx = sliceCanvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
      ctx.drawImage(canvas, 0, renderedHeight, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

      // Do not create an extra page when the remaining slice is only white space.
      if (pageIndex > 0 && isCanvasSliceBlank(sliceCanvas)) break;

      if (pageIndex > 0) pdf.addPage("a4", "portrait");
      const imgData = sliceCanvas.toDataURL("image/png");
      const imgHeightMm = Math.min(pageHeight, sliceHeight * pageWidth / canvas.width);
      pdf.addImage(imgData, "PNG", 0, 0, pageWidth, imgHeightMm, undefined, "FAST");

      renderedHeight += sliceHeight;
      pageIndex += 1;
    }

    pdf.save(`${doc.number}-${displayType.replaceAll(" ", "-")}.pdf`);
  } catch (err) {
    console.error(err);
    alert("PDF export failed. Please refresh the app and try again.");
  } finally {
    exportWrap.remove();
  }
}

function bindEvents() {
  document.addEventListener("click", event => {
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    if (!target) return;
    try {

    const nav = target.closest(".nav-btn");
    if (nav) { event.preventDefault(); switchTab(nav.dataset.tab); return; }

    const menuToggle = target.closest("#menuToggle");
    if (menuToggle) { event.preventDefault(); $("#sidebar")?.classList.toggle("open"); return; }

    const switchCompanyBtn = target.closest("#switchCompanyBtn");
    if (switchCompanyBtn) { event.preventDefault(); $("#companyGate")?.classList.remove("hidden"); return; }

    const goSettingsFromGate = target.closest("#goSettingsFromGate");
    if (goSettingsFromGate) { event.preventDefault(); $("#companyGate")?.classList.add("hidden"); switchTab("settingsTab"); return; }

    const selectCompanyBtn = target.closest("[data-select-company]");
    if (selectCompanyBtn) { event.preventDefault(); selectCompany(selectCompanyBtn.dataset.selectCompany); return; }

    const newDoc = target.closest("[data-new-doc]");
    if (newDoc) { event.preventDefault(); setWorkingDoc(newDoc.dataset.newDoc, makeDoc(newDoc.dataset.newDoc)); renderAll(); switchTab(docTypes[newDoc.dataset.newDoc].tab); return; }

    const openBtn = target.closest("[data-open-doc]");
    if (openBtn) { event.preventDefault(); openDoc(openBtn.dataset.openDoc); return; }

    const deleteBtn = target.closest("[data-delete-doc]");
    if (deleteBtn) { event.preventDefault(); deleteDoc(deleteBtn.dataset.deleteDoc); return; }

    const saveBtn = target.closest("[data-save-doc]");
    if (saveBtn) { event.preventDefault(); saveDoc(saveBtn.dataset.saveDoc); return; }

    const addLineBtn = target.closest("[data-add-line]");
    if (addLineBtn) { event.preventDefault(); addLine(addLineBtn.dataset.addLine); return; }

    const removeLineBtn = target.closest("[data-remove-line]");
    if (removeLineBtn) { event.preventDefault(); removeLine(removeLineBtn.dataset.removeLine, removeLineBtn.dataset.lineId); return; }

    const pickCustomer = target.closest("[data-pick-customer]");
    if (pickCustomer) { event.preventDefault(); openCustomerModal(pickCustomer.dataset.pickCustomer); return; }

    const pickItem = target.closest("[data-pick-item]");
    if (pickItem) { event.preventDefault(); openItemModal(pickItem.dataset.pickItem, pickItem.dataset.lineId); return; }

    const selectedCustomer = target.closest("[data-select-customer]");
    if (selectedCustomer) { event.preventDefault(); selectCustomer(selectedCustomer.dataset.selectCustomer); return; }

    const selectedItem = target.closest("[data-select-item]");
    if (selectedItem) { event.preventDefault(); selectItem(selectedItem.dataset.selectItem); return; }

    const pdfBtn = target.closest("[data-create-pdf]");
    if (pdfBtn) { event.preventDefault(); generatePdf(pdfBtn.dataset.createPdf); return; }

    const convertBtn = target.closest("[data-convert-doc]");
    if (convertBtn) {
      event.preventDefault();
      const [from, to] = convertBtn.dataset.convertDoc.split(":");
      convertDoc(from, to);
      return;
    }

    const markupFrom = target.closest("[data-create-markup-from]");
    if (markupFrom) { event.preventDefault(); createMarkupFromQuotation(); return; }

    const addItem = target.closest("#addItemBtn, #modalAddItemBtn");
    if (addItem) { event.preventDefault(); openQuickForm("item"); return; }

    const addCustomer = target.closest("#addCustomerBtn, #modalAddCustomerBtn");
    if (addCustomer) { event.preventDefault(); openQuickForm("customer"); return; }

    const addCompany = target.closest("#addCompanyBtn");
    if (addCompany) { event.preventDefault(); openQuickForm("company"); return; }

    const editItem = target.closest("[data-edit-item]");
    if (editItem) { event.preventDefault(); openQuickForm("item", editItem.dataset.editItem); return; }

    const editCustomer = target.closest("[data-edit-customer]");
    if (editCustomer) { event.preventDefault(); openQuickForm("customer", editCustomer.dataset.editCustomer); return; }

    const deleteItemBtn = target.closest("[data-delete-item]");
    if (deleteItemBtn) { event.preventDefault(); deleteItem(deleteItemBtn.dataset.deleteItem); return; }

    const deleteCustomerBtn = target.closest("[data-delete-customer]");
    if (deleteCustomerBtn) { event.preventDefault(); deleteCustomer(deleteCustomerBtn.dataset.deleteCustomer); return; }

    const deleteCompanyBtn = target.closest("[data-delete-company]");
    if (deleteCompanyBtn) { event.preventDefault(); deleteCompany(deleteCompanyBtn.dataset.deleteCompany); return; }

    const removeLogo = target.closest("[data-remove-logo]");
    if (removeLogo) {
      event.preventDefault();
      const company = state.companies.find(c => c.id === removeLogo.dataset.removeLogo);
      if (company) { company.logo = ""; saveState(); renderAll(); }
      return;
    }

    const addTemplate = target.closest("[data-add-template-element]");
    if (addTemplate) { event.preventDefault(); addTemplateElement(addTemplate.dataset.addTemplateElement); return; }

    const selectTemplate = target.closest("[data-select-template-element]");
    if (selectTemplate) { event.preventDefault(); selectTemplateElement(selectTemplate.dataset.selectTemplateElement); return; }

    const deleteTemplate = target.closest("[data-delete-template-element]");
    if (deleteTemplate) { event.preventDefault(); deleteTemplateElement(deleteTemplate.dataset.deleteTemplateElement); return; }

    const duplicateTemplate = target.closest("[data-duplicate-template-element]");
    if (duplicateTemplate) { event.preventDefault(); duplicateTemplateElement(duplicateTemplate.dataset.duplicateTemplateElement); return; }

    const clearTemplate = target.closest("[data-clear-template]");
    if (clearTemplate) { event.preventDefault(); clearTemplateElements(); return; }

    const resetBaseTemplate = target.closest("[data-reset-base-template]");
    if (resetBaseTemplate) { event.preventDefault(); resetBaseTemplateBox(); return; }

    const resetTemplate = target.closest("[data-reset-template-view]");
    if (resetTemplate) { event.preventDefault(); renderTemplateEditor(); return; }

    const resetWording = target.closest("[data-reset-wording-field]");
    if (resetWording) { event.preventDefault(); resetWordingField(resetWording.dataset.resetWordingField); return; }

    const resetAllWording = target.closest("[data-reset-all-wordings]");
    if (resetAllWording) { event.preventDefault(); resetAllWordings(); return; }

    const refreshWording = target.closest("[data-refresh-wording-preview]");
    if (refreshWording) { event.preventDefault(); renderWordingPreview(); return; }

    const signOutBtn = target.closest("#signOutBtn");
    if (signOutBtn) { event.preventDefault(); signOutCloud(); return; }


    const installBtn = target.closest("#installBtn");
    if (installBtn && deferredInstallPrompt) {
      event.preventDefault();
      deferredInstallPrompt.prompt();
      deferredInstallPrompt.userChoice.finally(() => { deferredInstallPrompt = null; $("#installBtn")?.classList.add("hidden"); });
      return;
    }
    } catch (err) {
      console.error("Button action failed", err);
      alert("This button action failed, but the app did not crash. Please refresh once and try again. If it repeats, clear the site cache and use the latest fixed version.");
    }
  });

  document.addEventListener("input", event => {
    const target = event.target;
    if (target.matches("#documentSearch")) renderDocumentList();
    if (target.matches("#itemSearch")) renderItems();
    if (target.matches("#customerSearch")) renderCustomerListOnly();
    if (target.matches("#modalCustomerSearch")) renderCustomerModalList();
    if (target.matches("#modalItemSearch")) renderItemModalList();
    if (target.matches("[data-company-field]") || target.matches("[data-prefix-field]")) handleCompanyField(event);
    if (target.matches("[data-wording-field]")) updateWordingField(target.dataset.wordingField, target.value);
  });

  document.addEventListener("change", event => {
    const target = event.target;
    if (target.matches("#documentTypeFilter")) renderDocumentList();
    if (target.matches("[data-template-company]")) { templateEditor.companyId = target.value; templateEditor.selectedId = null; renderTemplateEditor(); }
    if (target.matches("[data-template-doc-type]")) { templateEditor.docType = target.value; renderTemplateEditor(); }
    if (target.matches("[data-wording-company]")) { wordingEditor.companyId = target.value; renderWordingEditor(); }
    if (target.matches("[data-wording-doc-type]")) { wordingEditor.docType = target.value; renderWordingEditor(); }
    if (target.matches("[data-template-mode]")) setTemplateMode(target.value);
    if (target.matches("[data-template-field]")) updateTemplateElement(target.dataset.templateId, target.dataset.templateField, target.value);
    if (target.matches("[data-base-template-field]")) updateBaseTemplateBox(target.dataset.baseTemplateField, target.value);
    if (target.matches("[data-company-field]") || target.matches("[data-prefix-field]")) handleCompanyField(event);
    if (target.matches("[data-wording-field]")) updateWordingField(target.dataset.wordingField, target.value);
    if (target.matches("[data-doc-field]")) updateDocField(target.dataset.docType, target.dataset.docField, target.value, target.checked);
    if (target.matches("[data-line-field]")) {
      const row = target.closest("tr[data-line-id]");
      const form = target.closest("section.tab");
      const type = form?.id === "quotationTab" ? "quotation" : form?.id === "invoiceTab" ? "invoice" : form?.id === "deliveryTab" ? "delivery" : "markupDraft";
      updateLineField(type, row.dataset.lineId, target.dataset.lineField, target.value);
    }
    if (target.matches("[data-company-logo]")) handleLogoUpload(target);
  });

  document.addEventListener("pointerdown", event => {
    const baseResize = event.target.closest("[data-base-template-resize]");
    if (baseResize) return beginBaseTemplateDrag(event, "resize");
    const resize = event.target.closest("[data-template-resize]");
    if (resize) return beginTemplateDrag(event, "resize");
    const el = event.target.closest(".template-edit-canvas [data-template-element]");
    if (el) return beginTemplateDrag(event, "move");
    const base = event.target.closest(".template-edit-canvas [data-base-template]");
    if (base) return beginBaseTemplateDrag(event, "move");
  });
  document.addEventListener("pointermove", handleTemplatePointerMove);
  document.addEventListener("pointerup", endTemplateDrag);
  document.addEventListener("pointercancel", endTemplateDrag);

  $("#quickForm").addEventListener("submit", handleQuickFormSubmit);
  $("#authForm")?.addEventListener("submit", handleAuthSubmit);
  $("#signOutBtn")?.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); signOutCloud(); });
  ["click", "keydown", "mousemove", "touchstart"].forEach(eventName => {
    document.addEventListener(eventName, () => markUserActivity(), { passive: true });
  });
  window.addEventListener("beforeunload", () => { markPresenceOffline(); });
}

function registerPwa() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(console.warn);
  }
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    $("#installBtn").classList.remove("hidden");
  });
}

bindEvents();
initFirebaseSync();
try {
  renderAll();
} catch (err) {
  console.error("Initial render failed", err);
  alert("The app found old/incomplete saved data. It will open the document list safely. If you still see a blank tab, clear site data once and reload.");
  try { renderCompanyGate(); renderActiveCompanyLabel(); renderDocumentList(); switchTab("listTab"); } catch (innerErr) { console.error(innerErr); }
}
registerPwa();
