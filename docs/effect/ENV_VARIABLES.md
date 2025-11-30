# Environment Variables Documentation

Tento dokument popisuje všechny environment variables používané v PatroCMS.

## Cloudflare Bindings

Tyto bindings nejsou ENV variables, ale Cloudflare Workers objekty. **NEPŘEDÁVAJÍ SE** přes Effect.Config!

### Required Bindings

| Binding | Type | Popis |
|---------|------|-------|
| `DB` | `D1Database` | Primární D1 databáze pro ukládání dat |
| `MEDIA_BUCKET` | `R2Bucket` | R2 bucket pro ukládání media souborů |
| `ASSETS` | `Fetcher` | Fetcher pro statické assety |

### Optional Bindings

| Binding | Type | Popis | Default |
|---------|------|-------|---------|
| `CACHE_KV` | `KVNamespace` | KV namespace pro caching | - |
| `EMAIL_QUEUE` | `Queue` | Queue pro email zprávy | - |

## String Environment Variables

Tyto ENV vars **SE PŘEDÁVAJÍ** přes Effect.Config.

### Email Configuration

| Variable | Type | Required | Popis | Default |
|----------|------|----------|-------|---------|
| `SENDGRID_API_KEY` | `string` | Ne | API klíč pro SendGrid | - |
| `DEFAULT_FROM_EMAIL` | `string` | Ne | Výchozí odesílatel emailů | - |

### Cloudflare Images Configuration

| Variable | Type | Required | Popis | Default |
|----------|------|----------|-------|---------|
| `IMAGES_ACCOUNT_ID` | `string` | Ne | Cloudflare Images Account ID | - |
| `IMAGES_API_TOKEN` | `string` | Ne | Cloudflare Images API Token | - |

### Application Configuration

| Variable | Type | Required | Popis | Default |
|----------|------|----------|-------|---------|
| `ENVIRONMENT` | `string` | Ne | Environment (development/production) | `production` |
| `BUCKET_NAME` | `string` | Ne | Název R2 bucketu | `patro-media-dev` |

## Usage Notes

### Cloudflare Bindings
Cloudflare bindings se předávají přímo do Effect Layers:

```typescript
// ✅ SPRÁVNĚ - Bindings jdou přímo do Layer
const dbLayer = makeDatabaseLayer(c.env.DB)
const mediaLayer = makeMediaServiceLayer(c.env.MEDIA_BUCKET)
```

### String ENV Variables
String ENV vars se čtou přes Effect.Config:

```typescript
// ✅ SPRÁVNĚ - String values přes Config
const config = Config.all({
  sendgridKey: Config.string('SENDGRID_API_KEY').pipe(
    Config.withDefault('')
  ),
  environment: Config.string('ENVIRONMENT').pipe(
    Config.withDefault('production')
  )
})
```

## Migration Status

- [ ] Email configuration (SENDGRID_API_KEY, DEFAULT_FROM_EMAIL)
- [ ] Images configuration (IMAGES_ACCOUNT_ID, IMAGES_API_TOKEN)
- [ ] Application configuration (ENVIRONMENT, BUCKET_NAME)
- [ ] JWT configuration (pokud existuje)

## Security Notes

⚠️ **DŮLEŽITÉ:**
- `SENDGRID_API_KEY` a `IMAGES_API_TOKEN` jsou **SENSITIVE** hodnoty
- Použij `Config.redacted()` pro tyto klíče
- Nikdy neloguj tyto hodnoty v plaintext

## References

- [Effect Config Documentation](https://effect.website/docs/configuration/)
- [Cloudflare Workers Bindings](https://developers.cloudflare.com/workers/configuration/bindings/)