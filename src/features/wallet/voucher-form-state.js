// Transient, unsaved edit state for the "add/edit voucher" form — pending
// photo/PDF uploads, AI-extraction results still to apply, and a
// just-detected barcode crop. None of this is persisted until the form is
// submitted (see saveVoucher in vouchers.js). Kept as one mutable object
// (mirroring core/state.js's pattern) rather than reassignable `let`s
// because it's written to from scanning.js, views.js, and the voucher-form
// submit handler — properties can be reassigned across module boundaries,
// bare `let` bindings can't.
export const voucherFormState = {
  pendingNewFiles: [],          // [{ localId, file, mimeType, kind: 'image'|'pdf', previewUrl }] chosen in the voucher form, not yet uploaded
  removedFileIds: [],           // ids of existing voucher_files rows queued for deletion on save
  pendingExtractionFiles: null, // [{ file, mimeType }, ...] picked from the add-voucher menu, staged for go('voucher-form') to attach
  pendingExtractionEntry: null, // the pendingNewFiles entry whose AI-extracted fields still need applying after render
  pendingExtractionResult: null, // fields already resolved by startVoucherScan, applied on the next voucher-form render
  pendingBarcode: null,         // { blob, previewUrl } newly detected barcode/QR crop, not yet uploaded
  barcodeRemoved: false,        // true if the user removed the current/existing barcode this session
  barcodeScanState: null,       // null | 'scanning' | 'missing' — shown inline so a failed/in-progress scan is never silent
};
