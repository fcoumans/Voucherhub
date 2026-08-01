// Client-side QR/barcode detection (crop only — nothing uploaded until the
// voucher is saved) and AI field extraction (pre-fill only — the user still
// reviews and explicitly saves; nothing here writes to the database).
//
// `go` (router) and `barcodeGroupVisible`/`barcodePreviewHtml` (rendered by
// the voucher-form view) still live outside this module — `go` temporarily
// from app.js (repointed once core/router.js exists), the barcode template
// helpers from './views.js' (a same-feature, one-directional import).
import { supabase } from '../../lib/supabase.js';
import { state, CATEGORIES } from '../../core/state.js';
import { esc, mountOverlay, closeOverlay } from '../../core/dom.js';
import { showToast } from '../../core/toast.js';
import { icon } from '../../core/ui.js';
import { go } from '../../core/router.js';
import { voucherFormState } from './voucher-form-state.js';
import { fileKind, resolveMimeType, ALLOWED_FILE_TYPES, MAX_SCAN_FILES } from './vouchers.js';
import { barcodeGroupVisible, barcodePreviewHtml } from './views.js';

/* ============================================================
   BARCODE / QR DETECTION (client-side crop, purely local —
   nothing is uploaded until the voucher is actually saved)
   ============================================================ */
function loadImageElement(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image failed to load'));
    img.src = url;
  });
}

// Voucher photos sometimes have more than one QR code on them — the actual
// redemption code plus an unrelated marketing one ("subscribe to our
// newsletter", social links). zxing's single-shot decode just returns
// whichever one it happens to find first. This masks out each hit and keeps
// decoding the same frame so multiple distinct codes are all found, not just
// the first — up to maxAttempts, deduped against `seenTexts` by text.
//
// QR only: 1D barcode scanning was both unreliable (zxing's row-sampling
// only checks a handful of lines near the canvas's own center, so a barcode
// that isn't centered/dominant in a full photo gets missed even though it
// decodes fine in isolation) and expensive (rotation + multi-scale tiling to
// compensate), which blocked the main thread long enough to also break the
// AI extraction call running alongside it. QR's global finder-pattern search
// is reliable and fast without any of that, so that's all this looks for.
function scanCanvasForCodes(reader, canvas, { imgW, imgH, maxAttempts, candidates, seenTexts }) {
  const ctx = canvas.getContext('2d');
  for (let i = 0; i < maxAttempts; i++) {
    let result;
    try {
      result = reader.decodeFromCanvas(canvas);
    } catch {
      return; // no (more) codes found
    }
    const points = (result.getResultPoints?.() || []).filter(Boolean);
    if (!points.length) return;
    const xs = points.map(p => p.getX());
    const ys = points.map(p => p.getY());

    const text = result.getText?.() || '';
    if (!seenTexts.has(text)) {
      seenTexts.add(text);
      candidates.push({
        text,
        x0: Math.min(...xs), y0: Math.min(...ys),
        x1: Math.max(...xs), y1: Math.max(...ys),
      });
    }

    // Mask this code out so the next decode attempt finds a different one.
    const mx0 = Math.max(0, Math.min(...xs) - 6), my0 = Math.max(0, Math.min(...ys) - 6);
    const mx1 = Math.min(imgW, Math.max(...xs) + 6), my1 = Math.min(imgH, Math.max(...ys) + 6);
    ctx.fillStyle = '#808080';
    ctx.fillRect(mx0, my0, mx1 - mx0, my1 - my0);
  }
}

export async function findBarcodeCandidates(file, mimeType) {
  if (fileKind(mimeType) !== 'image') return { img: null, imgW: 0, imgH: 0, candidates: [] };
  const objectUrl = URL.createObjectURL(file);
  try {
    const { BrowserMultiFormatReader } = await import('@zxing/browser');
    const { DecodeHintType, BarcodeFormat } = await import('@zxing/library');
    const img = await loadImageElement(objectUrl);
    const imgW = img.naturalWidth, imgH = img.naturalHeight;

    const hints = new Map();
    hints.set(DecodeHintType.TRY_HARDER, true);
    hints.set(DecodeHintType.ALSO_INVERTED, true);
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE, BarcodeFormat.MICRO_QR_CODE]);
    const reader = new BrowserMultiFormatReader(hints);

    const canvas = document.createElement('canvas');
    canvas.width = imgW;
    canvas.height = imgH;
    canvas.getContext('2d').drawImage(img, 0, 0);

    const candidates = [];
    scanCanvasForCodes(reader, canvas, { imgW, imgH, maxAttempts: 6, candidates, seenTexts: new Set() });

    return { img, imgW, imgH, candidates };
  } catch (err) {
    console.error('findBarcodeCandidates error:', err);
    return { img: null, imgW: 0, imgH: 0, candidates: [] };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function normalizeCodeForCompare(s) {
  return (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Picks the most likely "this is the actual redemption code" candidate when
// a photo has more than one QR code on it: prefer whichever one's decoded
// text matches the code the AI extraction already read off the same photo,
// otherwise the largest code in the photo (marketing codes are usually
// smaller/secondary on the layout).
export function pickBestBarcodeCandidate(candidates, referenceCode) {
  if (!candidates.length) return null;
  const normRef = normalizeCodeForCompare(referenceCode);
  if (normRef) {
    const match = candidates.find(c => {
      const normText = normalizeCodeForCompare(c.text);
      return normText.length >= 4 && (normText === normRef || normText.includes(normRef) || normRef.includes(normText));
    });
    if (match) return match;
  }
  return candidates.slice().sort((a, b) => ((b.x1 - b.x0) * (b.y1 - b.y0)) - ((a.x1 - a.x0) * (a.y1 - a.y0)))[0];
}

export async function cropBarcodeCandidate(img, imgW, imgH, candidate) {
  const pad = Math.max(imgW, imgH) * 0.08;
  const x0 = Math.max(0, candidate.x0 - pad);
  const y0 = Math.max(0, candidate.y0 - pad);
  const x1 = Math.min(imgW, candidate.x1 + pad);
  const y1 = Math.min(imgH, candidate.y1 + pad);
  const w = x1 - x0, h = y1 - y0;
  if (w < 20 || h < 20) return null;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(img, x0, y0, w, h, 0, 0, w, h);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  return blob ? { blob, previewUrl: URL.createObjectURL(blob) } : null;
}

// Same as findBarcodeCandidates but scans several files (e.g. front + back
// photos of the same voucher) and pools all their candidates into one list,
// each tagged with the source image it was found on so it can still be
// cropped from the right one later.
export async function findBarcodeCandidatesForFiles(fileEntries) {
  const perFile = await Promise.all(fileEntries.map(({ file, mimeType }) => findBarcodeCandidates(file, mimeType)));
  const candidates = [];
  for (const { img, imgW, imgH, candidates: fileCandidates } of perFile) {
    for (const c of fileCandidates) candidates.push({ ...c, img, imgW, imgH });
  }
  return candidates;
}

// Convenience wrapper for call sites that don't have a reference code to
// disambiguate multiple candidates with (see pickBestBarcodeCandidate).
export async function detectBarcodeCrop(file, mimeType, referenceCode = null) {
  const { img, imgW, imgH, candidates } = await findBarcodeCandidates(file, mimeType);
  const best = pickBestBarcodeCandidate(candidates, referenceCode);
  if (!best || !img) return null;
  return cropBarcodeCandidate(img, imgW, imgH, best);
}

// Only auto-fills the barcode slot if it's currently empty, mirroring the
// "pre-fill, never clobber" rule used for the AI text fields — an explicit
// remove always wins over a later auto-detect from another photo.
export function renderBarcodeGroupNow(v) {
  const group = document.getElementById('barcode-group');
  const preview = document.getElementById('barcode-preview');
  if (!group || !preview) return;
  group.style.display = barcodeGroupVisible(v) ? '' : 'none';
  preview.innerHTML = barcodePreviewHtml(v);
}

export async function maybeAutoDetectBarcode(file, mimeType, existingBarcodePath) {
  if (voucherFormState.pendingBarcode || voucherFormState.barcodeRemoved || existingBarcodePath) return;

  // Visible immediately — so adding a photo always shows *something* is
  // happening, instead of the barcode section staying silent either way.
  voucherFormState.barcodeScanState = 'scanning';
  renderBarcodeGroupNow(state.vouchers.find(x => x.id === state.params.id));

  const referenceCode = document.querySelector('#form-voucher [name="code"]')?.value || null;
  const found = await detectBarcodeCrop(file, mimeType, referenceCode);
  if (voucherFormState.pendingBarcode || voucherFormState.barcodeRemoved) return; // state changed while awaiting (e.g. user removed manually)

  voucherFormState.barcodeScanState = found ? null : 'missing';
  if (found) voucherFormState.pendingBarcode = found;
  renderBarcodeGroupNow(state.vouchers.find(x => x.id === state.params.id));
}

/* ============================================================
   AI VOUCHER EXTRACTION (pre-fill only — the user still reviews
   and explicitly saves; nothing here writes to the database)
   ============================================================ */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Pure data fetch — no DOM/toast side effects, so it can run behind the
// scan-loading screen (see startVoucherScan) without racing the render.
// Accepts one or more { file, mimeType } pairs (e.g. front + back photos of
// the same voucher) and returns one combined sanitized fields object, or
// null if extraction failed.
async function extractVoucherFields(fileEntries) {
  try {
    const files = await Promise.all(fileEntries.map(async ({ file, mimeType }) => ({
      fileBase64: await fileToBase64(file),
      mimeType,
    })));
    const { data, error } = await supabase.functions.invoke('extract-voucher', {
      body: { files },
    });
    if (error) return { fields: null, rateLimited: error?.context?.status === 429 };
    if (!data?.fields) return { fields: null, rateLimited: false };
    return { fields: data.fields, rateLimited: false };
  } catch (err) {
    console.error('extractVoucherFields error:', err);
    return { fields: null, rateLimited: false };
  }
}

// Only fills fields the user hasn't already typed into — this is strictly
// a pre-fill, the user still reviews and submits through the normal form.
export function applyExtractedFields(fields) {
  const form = document.getElementById('form-voucher');
  if (!form) return;

  const setIfEmpty = (name, value) => {
    if (value == null || value === '') return;
    const field = form.querySelector(`[name="${name}"]`);
    if (field && !field.value) field.value = value;
  };

  setIfEmpty('brand', fields.brand);
  if (fields.amount != null) {
    setIfEmpty('amount', String(fields.amount));
  } else if (fields.valueDescription) {
    // Non-monetary value ("weekend getaway for two") — only switch the form
    // into description mode if both value fields are still untouched.
    const amountField = form.querySelector('[name="amount"]');
    const descField    = form.querySelector('[name="valueDescription"]');
    if (amountField && !amountField.value && descField && !descField.value) {
      descField.value = fields.valueDescription;
      form.querySelector('.value-mode-btn[data-mode="description"]')?.click();
    }
  }
  setIfEmpty('expiryDate', fields.expiryDate);
  setIfEmpty('code', fields.code);
  setIfEmpty('pin', fields.pin);
  setIfEmpty('notes', fields.termsAndConditions);

  if (fields.category && CATEGORIES.includes(fields.category)) {
    const catSel = form.querySelector('[name="category"]');
    if (catSel) catSel.value = fields.category;
  }
  if (fields.voucherType) {
    const typeSel = form.querySelector('[name="voucherType"]');
    if (typeSel) typeSel.value = fields.voucherType;
  }

  // A note was found on the photo (e.g. inside a greeting card) — reveal the
  // gift-note section so it isn't silently filled in behind a collapsed prompt.
  if (fields.giftMessage || fields.giftSender) {
    setIfEmpty('giftMessage', fields.giftMessage);
    setIfEmpty('giftSender', fields.giftSender);
    document.querySelector('.gift-note-prompt')?.style.setProperty('display', 'none');
    const noteFields = document.getElementById('gift-note-fields');
    if (noteFields) noteFields.style.display = '';
  }
}

function showScanLoadingScreen() {
  const el = document.createElement('div');
  el.id = 'scan-loading-screen';
  el.className = 'scan-loading';
  el.innerHTML = `
    <div class="scan-spinner"></div>
    <h3>Reading your voucher…</h3>
    <p>Detecting the brand, value, code and QR code from your photo.</p>
    <button type="button" class="scan-skip" id="scan-skip-btn">Skip &amp; enter manually</button>
  `;
  document.body.appendChild(el);
  return el;
}

function hideScanLoadingScreen() {
  document.getElementById('scan-loading-screen')?.remove();
}

let scanToken = 0; // guards against a superseded/skipped scan applying stale results later

// Runs AI field extraction and barcode detection in parallel behind a full
// -screen loading state, then only navigates to the form once both are
// resolved — so the very first render already has the pre-filled fields
// and the cropped barcode, instead of racing a background fill-in against
// however fast the user hits Save.
//
// fileEntries is one or more { file, mimeType } pairs — e.g. a front photo
// plus a back photo with terms & conditions — extracted together as a
// single combined voucher (one AI call sees every page/side at once).
export async function startVoucherScan(fileEntries) {
  const token = ++scanToken;
  const screen = showScanLoadingScreen();
  let settled = false;

  const finish = (fields, barcode, { silent = false, rateLimited = false } = {}) => {
    if (settled || token !== scanToken) return;
    settled = true;
    hideScanLoadingScreen();
    voucherFormState.pendingExtractionFiles  = fileEntries;
    voucherFormState.pendingExtractionResult = fields;
    voucherFormState.pendingBarcode           = barcode;
    voucherFormState.barcodeScanState         = silent ? null : (barcode ? null : 'missing');
    go('voucher-form').then(() => {
      if (silent) return;
      if (rateLimited) {
        showToast("You've reached today's AI-scan limit. Please fill in manually, or try again later.");
      } else if (!fields) {
        showToast('Could not auto-read this file. Please fill in manually.');
      } else if (!barcode) {
        showToast('Auto-filled. No scannable QR code found in this photo.');
      } else {
        showToast('Auto-filled from your photo. Please check the details before saving.');
      }
    });
  };

  screen.querySelector('#scan-skip-btn').addEventListener('click', () => finish(null, null, { silent: true }));

  const emptyCandidates = [];
  const emptyExtraction = { fields: null, rateLimited: false };
  const [extractionOutcome, candidatesOutcome] = await Promise.allSettled([
    Promise.race([extractVoucherFields(fileEntries), new Promise(resolve => setTimeout(() => resolve(emptyExtraction), 25000))]),
    Promise.race([findBarcodeCandidatesForFiles(fileEntries), new Promise(resolve => setTimeout(() => resolve(emptyCandidates), 25000))]),
  ]);
  const { fields, rateLimited } = extractionOutcome.status === 'fulfilled' ? extractionOutcome.value : emptyExtraction;
  const candidates = candidatesOutcome.status === 'fulfilled' ? candidatesOutcome.value : emptyCandidates;

  // Now that extraction is done too, use its code field (if any) to pick
  // the right candidate when the photos have more than one code between them.
  const best = pickBestBarcodeCandidate(candidates, fields?.code);
  const barcode = best ? await cropBarcodeCandidate(best.img, best.imgW, best.imgH, best) : null;

  finish(fields, barcode, { rateLimited });
}

/* ============================================================
   ADD-VOUCHER MENU ("+" tap: offers photo/file capture, which kicks off
   the scan above, alongside a plain manual-entry path)
   ============================================================ */
// Just one file input, not one per source: on mobile browsers, any file
// input that accepts images (without a `capture` attribute) already opens
// the OS's own combined sheet with Take Photo / Photo Library / Browse
// Files as options — so a separate "Take Photo" button just duplicated a
// choice the native sheet already offers. Let the OS handle that split.
// Camera capture only ever yields one photo per tap (there's no "take
// several, then confirm" step on a file input), so front + back photos have
// to be added one at a time. This stages them locally — nothing is scanned
// until the user explicitly taps Scan — instead of firing startVoucherScan
// the instant the first photo lands.
export function showAddVoucherMenu() {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
  <div class="dialog">
    <h3>Add Voucher</h3>
    <div id="menu-initial">
      <p>Scan a photo or PDF to auto-fill the details, or enter them yourself.</p>
      <div class="dialog-actions" style="flex-direction:column;gap:8px">
        <button type="button" class="btn btn-primary btn-full" id="menu-choose-file">Photo or File</button>
        <button type="button" class="btn btn-ghost btn-full" id="menu-manual-entry">Manual Entry</button>
      </div>
    </div>
    <div id="menu-staging" style="display:none">
      <p>Add more photos (e.g. front &amp; back with terms), then scan them together.</p>
      <div class="attachment-grid" id="menu-staged-grid"></div>
      <div class="dialog-actions" style="flex-direction:column;gap:8px;margin-top:12px">
        <button type="button" class="btn btn-primary btn-full" id="menu-scan-btn">Scan</button>
        <button type="button" class="btn btn-ghost btn-full" id="menu-add-more">${icon.plus2} Add another photo</button>
        <button type="button" class="btn btn-ghost btn-full" id="menu-staging-cancel">Cancel</button>
      </div>
    </div>
    <input type="file" id="menu-file-input" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf" multiple style="display:none">
  </div>`;
  document.body.appendChild(overlay);
  mountOverlay(overlay);

  const staged = []; // [{ file, mimeType, previewUrl }]

  const closeMenu = () => {
    staged.forEach(s => s.previewUrl && URL.revokeObjectURL(s.previewUrl));
    closeOverlay(overlay);
  };
  overlay.addEventListener('click', e => { if (e.target === overlay) closeMenu(); });
  overlay.querySelector('#menu-manual-entry').addEventListener('click', () => { closeMenu(); go('voucher-form'); });
  overlay.querySelector('#menu-staging-cancel').addEventListener('click', closeMenu);
  overlay.querySelector('#menu-choose-file').addEventListener('click', () => overlay.querySelector('#menu-file-input').click());
  overlay.querySelector('#menu-add-more').addEventListener('click', () => overlay.querySelector('#menu-file-input').click());

  const renderStaged = () => {
    const grid = overlay.querySelector('#menu-staged-grid');
    grid.innerHTML = staged.map((s, i) => `
      <div class="attachment-tile">
        ${s.mimeType === 'application/pdf'
          ? `<div class="attachment-file-icon">${icon.file}<span>PDF</span></div>`
          : `<img class="attachment-thumb" src="${esc(s.previewUrl)}" alt="Photo ${i + 1}">`}
        <button type="button" class="attachment-remove" data-staged-idx="${i}" title="Remove">✕</button>
      </div>`).join('');
    overlay.querySelector('#menu-scan-btn').textContent = staged.length > 1 ? `Scan ${staged.length} Photos` : 'Scan';
    overlay.querySelector('#menu-initial').style.display = staged.length ? 'none' : '';
    overlay.querySelector('#menu-staging').style.display = staged.length ? '' : 'none';
  };

  overlay.querySelector('#menu-staged-grid').addEventListener('click', e => {
    const btn = e.target.closest('[data-staged-idx]');
    if (!btn) return;
    const [removed] = staged.splice(Number(btn.dataset.stagedIdx), 1);
    if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
    renderStaged();
  });

  overlay.querySelector('#menu-scan-btn').addEventListener('click', () => {
    if (!staged.length) return;
    const fileEntries = staged.map(({ file, mimeType }) => ({ file, mimeType }));
    staged.forEach(s => s.previewUrl && URL.revokeObjectURL(s.previewUrl)); // the raw File objects live on in fileEntries; only this menu's own preview URLs go
    closeOverlay(overlay);
    startVoucherScan(fileEntries);
  });

  overlay.querySelector('#menu-file-input').addEventListener('change', (e) => {
    const input = e.target;
    const selected = Array.from(input.files || []);
    input.value = '';
    if (!selected.length) return;
    if (staged.length + selected.length > MAX_SCAN_FILES) { showToast(`Select up to ${MAX_SCAN_FILES} photos in total`); return; }
    for (const file of selected) {
      const mimeType = resolveMimeType(file);
      if (!ALLOWED_FILE_TYPES.includes(mimeType)) { showToast('Unsupported file type'); continue; }
      if (file.size > 10 * 1024 * 1024) { showToast(`${file.name} is over 10MB`); continue; }
      staged.push({ file, mimeType, previewUrl: mimeType === 'application/pdf' ? null : URL.createObjectURL(file) });
    }
    renderStaged();
  });
}
