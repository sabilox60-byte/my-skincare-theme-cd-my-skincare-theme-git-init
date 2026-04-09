# GitHub → Shopify Theme Setup

## Step 1: Create GitHub repository

1. Go to https://github.com/new
2. Name: `[your-brand]-shopify-theme` (private repository recommended)
3. Initialize with README: **NO** (we push existing files)
4. Click **Create repository**

---

## Step 2: Initialize git and push

Open a terminal in the theme folder (same folder as `assets/`, `sections/`, etc.):

```bash
git init
git add .
git commit -m "Initial theme build"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git push -u origin main
```

---

## Step 3: Connect to Shopify

1. Go to **Shopify Admin → Online Store → Themes**
2. Click **Add theme → Connect from GitHub**
3. Authorize the Shopify GitHub app if prompted
4. Select your repository and branch: `main`
5. Click **Connect**
6. The theme appears as a new unpublished theme — click **Customize** to open the Theme Editor

---

## Step 4: Configure theme settings in the Theme Editor

Open **Customize → Theme settings** and fill in:

| Setting | Where | Value |
|---------|-------|-------|
| Logo | Settings → Logo | Upload your SVG or PNG |
| Favicon | Settings → Favicon | Upload 32×32px icon |
| Instagram URL | Settings → Social Media | `https://instagram.com/yourbrand` |
| Facebook URL | Settings → Social Media | `https://facebook.com/yourbrand` |
| TikTok URL | Settings → Social Media | `https://tiktok.com/@yourbrand` |
| YouTube URL | Settings → Social Media | `https://youtube.com/@yourbrand` |
| WhatsApp number | Settings → Social Media | `+39 333 123 4567` |
| Free shipping threshold | Settings → Cart | `39` (€39) |

---

## Step 5: Create navigation menus

Go to **Shopify Admin → Online Store → Navigation** and create these menus:

| Menu handle | Purpose | Used in |
|-------------|---------|---------|
| `main-menu` | Desktop + mobile top nav | Header |
| `footer-shop` | Footer column 1 — Shop links | Footer |
| `footer-brand` | Footer column 2 — Brand/About links | Footer |
| `footer-care` | Footer column 3 — Customer Care links | Footer |

Then in the Theme Editor, assign each menu to the Footer section columns.

Suggested links for `main-menu`:
- Skincare (with mega menu enabled) → `/collections/all`
- Protocolli → `/collections/tutti-i-protocolli-skincare`
- Make-up → `/collections/make-up`

---

## Step 6: Create required product metafields

Go to **Shopify Admin → Settings → Custom data → Products** and add:

| Namespace | Key | Type | Purpose |
|-----------|-----|------|---------|
| `reviews` | `rating` | Rating | Star rating on product cards + PDP |
| `reviews` | `rating_count` | Integer | Review count display |
| `reviews` | `breakdown` | JSON (`[{stars: 5, percent: 88}]`) | Star breakdown bars in reviews section |
| `skincare` | `routine_step` | Integer (1–7) | Highlights the correct step in the step bar |
| `skincare` | `key_ingredients` | JSON (`[{name, benefit_description, benefit_label}]`) | Key ingredient carousel cards |
| `skincare` | `property_icons` | JSON (`[{image_url, label}]`) | Property icon badges in the buy box |
| `skincare` | `inci_list` | Multi-line text | Full INCI ingredient list accordion |
| `clinical` | `results` | JSON (`[{percentage, label}]`) | Clinical % stats section |

> All metafields are optional — sections render gracefully when absent.

---

## Step 7: Auto-deploy on push

Every push to `main` automatically updates the theme in Shopify:

```bash
git add .
git commit -m "describe your change"
git push origin main
```

Shopify syncs within ~30 seconds. You can verify in **Admin → Themes** — the theme will show "Syncing…" then update.

---

## Step 8: Install recommended apps

| App | Purpose | Shopify App Store |
|-----|---------|-------------------|
| **Judge.me Reviews** | Populates the `#product-reviews` section on PDPs | Search "Judge.me" |
| **Smile.io** | Loyalty points (shown as estimate in cart drawer) | Search "Smile.io" |
| **Klaviyo** | Email marketing, newsletter integration | Search "Klaviyo" |
| **Pandectes GDPR** | EU cookie consent banner — no theme code needed | Search "Pandectes" |

### Judge.me integration

After installing Judge.me, replace the placeholder content inside `#reviews-list` in `sections/product-reviews.liquid`:

```liquid
{{- 'judgeme_widgets' | t: widget_type: 'judgeme_reviews',
    concierge_install: true, product: product -}}
```

### Klarna / BNPL

The `bnpl_text` setting in `sections/product-main.liquid` renders a plain text badge.
For live Klarna messaging, replace it with the official Klarna On-site Messaging script.

---

## Step 9: Go live

1. In **Admin → Themes**, click the three-dot menu on your new theme
2. Select **Publish**
3. Confirm — your store now runs this theme

---

## Metafield JSON schema examples

**`skincare.key_ingredients`**
```json
[
  {
    "name": "Acido Ialuronico",
    "benefit_description": "Trattiene fino a 1000 volte il proprio peso in acqua, idratando in profondità.",
    "benefit_label": "Idratazione profonda"
  },
  {
    "name": "Niacinamide 10%",
    "benefit_description": "Riduce la visibilità dei pori dilatati e uniforma il tono della pelle.",
    "benefit_label": "Pori ridotti"
  }
]
```

**`clinical.results`**
```json
[
  { "percentage": "100%", "label": "Pelle percepita come ben detersa e idratata dopo l'utilizzo.*" },
  { "percentage": "90%",  "label": "Pelle percepita come confortevole e senza tensione.*" },
  { "percentage": "90%",  "label": "Delicatezza della detersione confermata dai volontari.*" }
]
```

**`reviews.breakdown`**
```json
[
  { "stars": 5, "percent": 88 },
  { "stars": 4, "percent": 7 },
  { "stars": 3, "percent": 3 },
  { "stars": 2, "percent": 1 },
  { "stars": 1, "percent": 1 }
]
```
