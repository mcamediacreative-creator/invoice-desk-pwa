# Invoice Desk PWA

A local-first HTML invoicing app starter for quotations, invoices, delivery orders, item database, customer database, multi-company letterheads, templates, calculations, and PDF export.

## Included features

- Company selection screen on arrival
- Multi-company settings with logo, address, phone, email, template, document prefixes, and payment details
- Windows-like sidebar interface
- Document list with search by customer name and delete button
- Quotation page
- Invoice page
- Delivery order page
- Item list page with add, edit, search, and delete
- Customer database in Settings and customer selection popup
- Item selection popup from item database
- Calculations for price, quantity, item discount, grand total, paid, and balance due
- Prepared By signature toggle
- Delivery order Prepared By and Received By signature blocks
- PDF export for Quotation, Invoice, and Delivery Order
- Internal Markup Draft that can be converted into an approved Quotation
- PWA install support
- Firebase-ready project structure
- Capacitor-ready package scripts for Android/iOS wrapping

## Important note about APK and iPhone

- Android uses APK/AAB. You can wrap this PWA with Capacitor and build APK/AAB in Android Studio.
- iPhone does not use APK. For iPhone, use PWA installation through Safari, or build an iOS app with Capacitor using Xcode and Apple Developer tools.

## Run locally

```bash
cd invoicing-pwa
npm install
npm run serve
```

Then open the local address shown in your terminal.

You can also open `index.html` directly, but PWA installation and service worker caching work best from a local server or HTTPS hosting.

## Publish with GitHub Pages

1. Create a new GitHub repository.
2. Upload all files in this folder.
3. Go to **Settings > Pages**.
4. Choose branch `main` and folder `/root`.
5. Save and open the GitHub Pages URL.

## Publish with Firebase Hosting

Install Firebase CLI:

```bash
npm install -g firebase-tools
firebase login
firebase init hosting
```

Recommended Firebase answers:

- Public directory: `.`
- Configure as single-page app: `yes`
- Set up automatic builds with GitHub: optional

Deploy:

```bash
firebase deploy
```

## Build Android APK using Capacitor

```bash
npm install
npx cap init InvoiceDesk com.yourcompany.invoicedesk --web-dir .
npx cap add android
npx cap sync
npx cap open android
```

In Android Studio:

- Build > Generate Signed Bundle / APK
- Choose APK for testing or AAB for Play Store

## Build for iPhone

```bash
npm install
npx cap init InvoiceDesk com.yourcompany.invoicedesk --web-dir .
npx cap add ios
npx cap sync
npx cap open ios
```

You need macOS, Xcode, and Apple Developer setup to publish or install as a native iOS app. For a simpler option, host the PWA and install it from Safari using **Share > Add to Home Screen**.

## Firebase database plan

The current app uses `localStorage` so it works immediately. For production Firebase sync, create these Firestore collections:

- `companies`
- `customers`
- `items`
- `quotations`
- `invoices`
- `deliveryOrders`
- `markupDrafts`
- `templates`

Recommended Firestore document fields mirror the JavaScript objects in `app.js`.

Security reminder: do not publish real customer data with open Firestore rules. Add Firebase Authentication and restrict each user/company to its own records.

## Customisation ideas

- Replace the sample company profiles in `app.js > defaultState()`.
- Add more templates in the `templates` array and CSS classes beginning with `.preview-template-`.
- PDF export now captures the same `.preview-paper` live preview using html2canvas + jsPDF, so edit template layout in the preview HTML/CSS instead of maintaining a separate PDF layout.
- Add login before enabling Firebase sync.

## Latest update

- Template 1 now places the logo on the left, company details below the logo, and the Quotation/Invoice/Delivery Order title on the right.
- Template 2 now places the logo on the left, company details beside the logo, and the document title on the very right.
- Templates 3, 4, and 5 now have distinct arrangements, wording, table styles, and payment-method placements.
- The live preview and PDF export both use the selected company's template style.
- Item rows inside quotation, invoice, delivery order, and markup draft pages keep the **Delete Row** button, while the Item Database keeps the **Delete Item** button.


## Latest UI/PDF update
- The draft/editor area is reorganised with cleaner cards, a sticky A4 preview, and clearer item table spacing.
- PDF export now renders from the same live preview design, so exported files should match the on-screen preview much more closely.

## Manual Edit Template Tab

The app now includes an **Edit Template** tab. Use it to customise each company's document layout:

- Add a draggable/resizable **Logo** block anywhere on the A4 page. The logo uses the selected company's logo from Settings.
- Add unlimited independent wording blocks, so each label or wording can be moved and edited separately.
- Add quick wording blocks for Document Title, Document No., Date, Company Name, Company Details, Customer Name, Customer Details, Grand Total, and Balance Due.
- Add rectangle/box elements.
- Add dynamic blocks such as Company Info, Customer Info, Document Info, Item Table, Totals, Payment, and Signature.
- Use placeholders inside wording, such as `{{companyName}}`, `{{companyPhone}}`, `{{companyEmail}}`, `{{companyAddress}}`, `{{customerName}}`, `{{customerPhone}}`, `{{customerEmail}}`, `{{customerAddress}}`, `{{documentTitle}}`, `{{documentNo}}`, `{{date}}`, `{{grandTotal}}`, `{{paid}}`, and `{{balanceDue}}`.
- Switch between **base template + custom overlay** or **blank fully custom canvas**.
- The PDF export captures the same live preview, including custom template elements.

After replacing files, clear browser/PWA cache or press Ctrl + F5 so the new service worker cache loads.


## Latest update
- Added **Show Paid & Balance Due** option in Quotation, Invoice, and Markup Draft editor.
- When switched off, Paid and Balance Due are hidden from the live preview and exported PDF.
- Custom template total blocks also respect this setting.


## Update: Settings typing focus fix

- Fixed the Settings tab issue where company fields re-rendered after every keystroke.
- You can now type full company names, addresses, phone numbers, emails, prefixes, and payment details normally without clicking after each letter.
- Customer search list now updates without rebuilding the whole Settings tab.

## Template Editor Update

This version adds a movable/resizable **Ready-made Template** layer inside the Edit Template tab. Select **Ready-made Template** from the Layers list or click the built-in template on the A4 canvas, then drag to move or use the bottom-right handle to resize. Custom wording, logo, box, item table, totals, payment, and signature blocks can still be placed on top of it.


## Latest fix: tab render repair

This build fixes a tab rendering issue where Invoice, Delivery Order, Edit Template, or Settings could appear blank after the ready-made template editor update. Customer list rendering was repaired, and tab rendering is now isolated so one section error will not blank the entire app.

## Update - PDF blank second page fix
- PDF export now fits normal one-page previews onto exactly one A4 page.
- Added a blank-page guard so tiny white overflow from html2canvas/browser rounding is not exported as a second page.
- Service worker cache bumped so the browser loads the repaired script.

## Update - Edit Wording tab
- Added a new **Edit Wording** tab for editing the ready-made template wording without moving layout blocks.
- Each company can have its own custom wording for document titles, header labels, customer/remarks labels, table headings, totals, payment headings, signature wording, and internal draft ribbon wording.
- Wording supports placeholders such as `{{documentTitle}}`, `{{documentNo}}`, `{{date}}`, `{{companyName}}`, `{{customerName}}`, `{{grandTotal}}`, `{{paid}}`, and `{{balanceDue}}`.
- Changes are saved while typing and apply to live preview and PDF export.

## Delivery Order Quantity Alignment Fix

The Delivery Order preview/PDF table now centers quantity-related columns so the quantity values line up with their column headings across all built-in templates and custom item-table blocks.

After replacing files, clear browser/PWA cache or press Ctrl + F5 so the new service worker cache loads.


## Markup Draft Company Selection

Markup Draft now includes two company selectors: one for choosing which company the internal markup draft is created and saved under, and another for choosing which company will issue the converted quotation. Changing the draft company also updates the active company, draft prefix/number, preview, and save location.

## Update - Firebase Cloud Sync

This build enables Firebase Authentication and Cloud Firestore syncing.

### What syncs
- Companies and logos
- Customers
- Items
- Documents
- Working drafts
- Custom template layouts
- Edited wording

### Firebase features required
In Firebase Console, make sure these are enabled:
1. Authentication > Sign-in method > Anonymous
2. Firestore Database

### Firestore rules
Use these Firestore rules so authenticated app users can access the same shared invoice app data and live presence status:

```js
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /sharedApps/{appId} {
      allow read, write: if request.auth != null;

      match /presence/{clientId} {
        allow read, write: if request.auth != null;
      }
    }
  }
}
```

### First ID login / migration
When you enter an ID on the first device, the app checks the shared Firestore document. If no shared cloud data exists yet, the current local browser data is uploaded as the first shared cloud copy.

After that, enter any user ID/name on another device to load the same shared data.

### Updating after deploy
Because this app is a PWA, after deployment press Ctrl + F5 once or uninstall/reinstall the PWA so the new service worker cache loads.

## Update - Full login page and stronger sync
- Changed Firebase Auth into a full login page. The main invoice app is hidden until login and cloud data loading are complete.
- Improved Create Account and Reset Password buttons with direct button handlers and clearer login/register screen text.
- Improved cloud sync for saved documents by forcing an immediate cloud save after saving or deleting a document.
- Improved first-login migration. If this device already has local invoice data and cloud data exists, the app now merges or uploads local data instead of blindly replacing it.
- Added safer merge logic for companies, customers, items, documents, working drafts, templates, and wording.


## Update - Sidebar credit
- Added the credit text at the very bottom of the left sidebar: **This Web Base App Created by Muhammad Fudhail**.
- Service worker cache updated so the new sidebar version loads after redeploy.

## Update - Shared ID Login, Presence, and Edit Activity

This build changes login from email/password to a simple **User ID / Name** page. The app signs in with Firebase Anonymous Authentication behind the scenes, then uses the entered ID for online status, edit history, and working-on-document indicators.

Important Firebase setup:
1. In Firebase Authentication, enable **Anonymous** sign-in provider.
2. Update Firestore Rules to allow authenticated users to access the shared app path:

```js
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /sharedApps/{appId} {
      allow read, write: if request.auth != null;

      match /presence/{clientId} {
        allow read, write: if request.auth != null;
      }
    }
  }
}
```

Changes included:
- Everyone enters only a User ID / Name.
- Everyone shares the same synced cloud document set.
- Auto logout after 1 hour.
- Top bar shows online / idle / editing users.
- Document forms show who is currently working on the document.
- Saved documents show who last edited them and recent edit history.
