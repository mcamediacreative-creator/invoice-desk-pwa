/*
  Allowed User ID list for Invoice Desk PWA.

  IMPORTANT:
  This file only controls which ID names are accepted and what name appears in
  Online / Idle / Editing and edit history. It does NOT store passwords.

  To add a real login user:
  1. Firebase Console > Authentication > Users > Add user
  2. Use email format: USERID@invoice-desk-pwa.app
     Example: STAFF01@invoice-desk-pwa.app
  3. Set the password/PIN there. Firebase password must be at least 6 characters.
  4. Add the same USERID below with the display name and role.
  5. Upload this file to GitHub and deploy Firebase Hosting again.
*/
window.INVOICE_DESK_ID_AUTH_DOMAIN = "invoice-desk-pwa.app";

window.INVOICE_DESK_ALLOWED_USERS = [
  { id: "DIL", name: "Muhammad Fudhail", role: "Admin" },
  { id: "ARIF", name: "Arif", role: "Admin" },
  { id: "DIN", name: "Din", role: "Staff" }
];

window.INVOICE_DESK_ACCESS_OPTIONS = {
  caseSensitiveIds: false
};
