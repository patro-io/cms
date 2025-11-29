# Logo Assets - Quick Guide

This directory contains static assets for the PatroCMS admin interface, including the default logo.

## 📁 Files

- **`logo.svg`** - Default PatroCMS logo (SVG format)

## 🎯 Usage

### Method 1: R2 Storage (Recommended)

Upload logo to Cloudflare R2 and serve it via `/files/` endpoint:

```bash
# Upload via wrangler CLI
wrangler r2 object put patro-cms-media/logo.svg --file=./packages/core/assets/logo.svg

# Access at
# http://localhost:8787/files/logo.svg
```

### Method 2: Appearance Settings

Set logo URL via admin UI:

1. Navigate to `/admin/settings/appearance`
2. Set **Logo URL**: `/files/logo.svg` (or external URL)
3. Save settings
4. Logo appears everywhere in admin interface

### Method 3: Environment Variable

Set in `wrangler.toml`:

```toml
[vars]
LOGO_URL = "https://cdn.example.com/logo.svg"
```

### Method 4: Inline Fallback (Auto)

If no logo is configured, the system automatically uses inline SVG fallback.

## 🎨 Logo Priority

1. **Appearance Settings (DB)** - Highest priority ⭐
2. **Environment Variable** - `LOGO_URL`
3. **R2 Storage** - `/files/logo.svg`
4. **Inline SVG** - Default PatroCMS logo

## 🔧 Customization

### Replace Default Logo

1. Create your logo as SVG (recommended) or PNG
2. Replace `logo.svg` with your file
3. Upload to R2:
   ```bash
   wrangler r2 object put patro-cms-media/logo.svg --file=./path/to/your/logo.svg
   ```
4. Set in appearance settings: `/files/logo.svg`

### Logo Requirements

- **Format**: SVG (preferred), PNG, JPG
- **Size**: < 100KB recommended
- **Dimensions**: Flexible (auto-scaled)
- **Transparent background**: Recommended for dark themes

### Example SVG Structure

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 543 85">
  <!-- Your logo paths here -->
  <path fill="#ffffff" d="..."/>
</svg>
```

## 🚀 Advanced Usage

### Dynamic Logo Per Environment

**Development:**
```bash
LOGO_URL=/files/logo-dev.svg
```

**Production:**
```bash
LOGO_URL=https://cdn.mycompany.com/logo-prod.svg
```

### Multi-brand Support

Store multiple logos in R2:
- `/files/logo-brand-a.svg`
- `/files/logo-brand-b.svg`

Set dynamically via appearance settings based on tenant/context.

## 📚 Related Documentation

- [Appearance Settings Guide](../../docs/appearance-settings.md)
- [R2 Storage Setup](../../docs/r2-storage.md)
- [Template System](../../docs/templates.md)

## 🐛 Troubleshooting

### Logo not showing?

1. Check R2 bucket:
   ```bash
   wrangler r2 object list patro-cms-media
   ```

2. Verify URL in DB:
   ```sql
   SELECT * FROM settings WHERE category = 'appearance' AND key = 'logoUrl';
   ```

3. Check browser console for 404/CORS errors

### Logo too large?

Use `size` parameter in templates:

```typescript
renderLogo({ 
  logoUrl: '/files/logo.svg',
  size: 'sm' // Options: sm, md, lg, xl
})
```

---

**Created:** 2025-11-23  
**Version:** 1.0.0