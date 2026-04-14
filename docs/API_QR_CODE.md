# QR Code Auto-Generation API

## Overview
Server-side QR code generation API for the Astromeda EC site.

### Endpoint
```
GET /api/qr-code
```

### Query Parameters
| Parameter | Type | Default | Description | Constraints |
|-----------|------|---------|-------------|-------------|
| `url` | string | (required) | URL to encode in QR code | Valid absolute URL, max 2953 chars |
| `size` | number | 256 | Output SVG size in pixels | 64-1024 |
| `margin` | number | 4 | White space border (modules) | 0-20 |

### Response
- **Content-Type**: `image/svg+xml; charset=utf-8`
- **Status**: 200 (success) or error code
- **Headers**:
  - `Cache-Control`: `public, max-age=86400, immutable` (24-hour caching)
  - `X-RateLimit-Limit`: Rate limit ceiling
  - `X-RateLimit-Used`: Requests used in current window
  - `X-RateLimit-Remaining`: Requests remaining
  - `X-RateLimit-Reset`: Unix timestamp of reset time

### Examples

#### Basic Usage
```
/api/qr-code?url=https://shop.mining-base.co.jp/
```

#### Custom Size
```
/api/qr-code?url=https://example.com&size=512
```

#### With Margin
```
/api/qr-code?url=https://example.com&size=256&margin=6
```

### Error Responses

#### Missing URL (400)
```json
{
  "error": "Missing required parameter: url"
}
```

#### Invalid URL Format (400)
```json
{
  "error": "Invalid URL format"
}
```

#### Invalid Size Parameter (400)
```json
{
  "error": "Invalid size: must be between 64 and 1024"
}
```

#### URL Too Long (413)
```json
{
  "error": "URL too long for QR code generation"
}
```

#### Method Not Allowed (405)
```json
{
  "error": "Method not allowed"
}
```

### Usage in Components

#### React Component Example
```tsx
import {useState, useEffect} from 'react';

export function QRCodeDisplay({url}: {url: string}) {
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({
      url,
      size: '256',
    });

    fetch(`/api/qr-code?${params}`)
      .then((res) => {
        if (!res.ok) throw new Error(`QR generation failed: ${res.status}`);
        return res.text();
      })
      .then((svg) => {
        setQrSvg(svg);
        setError(null);
      })
      .catch((err) => {
        setError(err.message);
        setQrSvg(null);
      })
      .finally(() => setLoading(false));
  }, [url]);

  if (loading) return <div>Generating QR code...</div>;
  if (error) return <div className="text-red-600">{error}</div>;

  return (
    <div
      dangerouslySetInnerHTML={{__html: qrSvg || ''}}
      className="inline-block"
    />
  );
}
```

#### With Image Tag
```tsx
<img
  src={`/api/qr-code?url=${encodeURIComponent(productUrl)}&size=256`}
  alt="Product QR Code"
  width="256"
  height="256"
/>
```

### Performance Notes

1. **Caching**: SVGs are cached for 24 hours with `immutable` flag. Identical URLs always return cached results.
2. **Generation**: Pure TypeScript implementation (no external libraries).
3. **Size**: Typical 256×256 QR SVG is 2-5KB.
4. **Rate Limiting**: Informational headers only (soft limit). No hard enforcement on client requests.

### Technical Details

- **Algorithm**: Simplified QR Version 1 (21×21 modules)
- **Encoding**: Byte mode with error correction support
- **Compatibility**: Tested with standard QR scanners and mobile devices
- **SVG Format**: Scalable, cacheable, no image asset required

### Testing

```bash
npm run test -- app/lib/qr-code.test.ts
```

Tests cover:
- SVG generation validity
- Custom sizing and colors
- Error handling for invalid inputs
- Rate limit header generation
