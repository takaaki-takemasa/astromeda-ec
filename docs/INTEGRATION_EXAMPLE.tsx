/**
 * INTEGRATION EXAMPLE: QR Code API Usage in Components
 * This file demonstrates how to use the /api/qr-code endpoint
 */

import {useState, useEffect} from 'react';

/**
 * Simple QR Code Display Component
 * Renders an SVG QR code for the given URL
 */
export function ProductQRCode({url, size = 256}: {url: string; size?: number}) {
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({
      url,
      size: size.toString(),
    });

    fetch(`/api/qr-code?${params}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`QR generation failed: ${res.status}`);
        }
        return res.text();
      })
      .then((svg) => {
        setQrSvg(svg);
        setError(null);
      })
      .catch((err) => {
        console.error('QR Code generation error:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      });
  }, [url, size]);

  if (error) {
    return <div className="text-red-600 text-sm">Failed to generate QR: {error}</div>;
  }

  if (!qrSvg) {
    return <div className="bg-gray-100 animate-pulse" style={{width: size, height: size}} />;
  }

  return (
    <div
      className="inline-block border border-gray-300 rounded-lg p-2"
      dangerouslySetInnerHTML={{__html: qrSvg}}
    />
  );
}

/**
 * Product Card with QR Code
 * Shows product info + scannable QR code linking to product page
 */
export function ProductCardWithQR({
  title,
  handle,
  image,
  price,
  baseUrl = 'https://shop.mining-base.co.jp',
}: {
  title: string;
  handle: string;
  image?: string;
  price: string;
  baseUrl?: string;
}) {
  const productUrl = `${baseUrl}/products/${handle}`;

  return (
    <div className="border rounded-lg overflow-hidden shadow-md">
      {/* Product Image */}
      {image && <img src={image} alt={title} className="w-full h-48 object-cover" />}

      {/* Product Info */}
      <div className="p-4">
        <h3 className="font-bold text-lg mb-2">{title}</h3>
        <p className="text-gray-600 mb-4">{price}</p>

        {/* QR Code Section */}
        <div className="flex items-center justify-between border-t pt-4">
          <div className="flex-1">
            <p className="text-xs text-gray-500 mb-2">Scan to view</p>
            <ProductQRCode url={productUrl} size={128} />
          </div>
          <a
            href={productUrl}
            className="ml-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            View Product
          </a>
        </div>
      </div>
    </div>
  );
}

/**
 * Order Confirmation Page with Tracking QR
 * Useful for including QR code in order confirmation emails
 */
export function OrderConfirmationWithQR({
  orderId,
  trackingUrl,
  customerEmail,
}: {
  orderId: string;
  trackingUrl: string;
  customerEmail: string;
}) {
  return (
    <div className="max-w-md mx-auto border rounded-lg p-6 bg-white">
      <h2 className="text-2xl font-bold mb-4">Order Confirmed!</h2>
      <p className="text-gray-600 mb-4">Order #{orderId}</p>

      {/* QR Code for easy tracking */}
      <div className="flex justify-center mb-6 p-4 bg-gray-50 rounded">
        <ProductQRCode url={trackingUrl} size={256} />
      </div>

      <p className="text-sm text-gray-600 mb-4">
        Scan the QR code above with your phone to track your order or visit:
      </p>
      <a href={trackingUrl} className="text-blue-600 underline break-all text-sm">
        {trackingUrl}
      </a>

      <p className="text-sm text-gray-600 mt-4">
        Confirmation sent to: <strong>{customerEmail}</strong>
      </p>
    </div>
  );
}

/**
 * Social Sharing Component with QR Code
 * Generate QR for campaign/promotional links
 */
export function SocialShareWithQR({
  campaignUrl,
  campaignName,
}: {
  campaignUrl: string;
  campaignName: string;
}) {
  return (
    <div className="bg-gradient-to-r from-purple-500 to-pink-500 text-white p-8 rounded-lg">
      <h3 className="text-2xl font-bold mb-2">{campaignName}</h3>
      <p className="mb-6">Scan to join our campaign</p>

      <div className="flex justify-between items-center">
        <div className="bg-white p-4 rounded">
          <ProductQRCode url={campaignUrl} size={200} />
        </div>

        <div className="ml-8">
          <p className="text-sm mb-4">Share the link:</p>
          <input
            type="text"
            value={campaignUrl}
            readOnly
            className="w-full p-2 rounded text-black text-sm"
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Batch QR Code Generator
 * Useful for generating QR codes for multiple products
 */
export function BatchQRCodeGenerator({
  products,
}: {
  products: Array<{id: string; handle: string; title: string}>;
}) {
  const [qrCodes, setQrCodes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const generateQRs = async () => {
      const codes: Record<string, string> = {};

      for (const product of products) {
        const url = `https://shop.mining-base.co.jp/products/${product.handle}`;
        const params = new URLSearchParams({url, size: '256'});

        try {
          const res = await fetch(`/api/qr-code?${params}`);
          if (res.ok) {
            codes[product.id] = await res.text();
          }
        } catch (err) {
          console.error(`Failed to generate QR for ${product.id}:`, err);
        }
      }

      setQrCodes(codes);
      setLoading(false);
    };

    generateQRs();
  }, [products]);

  if (loading) {
    return <div>Generating QR codes...</div>;
  }

  return (
    <div className="grid grid-cols-3 gap-4">
      {products.map((product) => (
        <div key={product.id} className="border rounded-lg p-4">
          <h4 className="font-bold text-sm mb-2">{product.title}</h4>
          {qrCodes[product.id] ? (
            <div dangerouslySetInnerHTML={{__html: qrCodes[product.id]}} />
          ) : (
            <div className="bg-gray-100 w-32 h-32" />
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Direct Image Tag Usage
 * Simplest approach using img tag directly
 */
export function SimpleQRCodeImage({url}: {url: string}) {
  return (
    <img
      src={`/api/qr-code?${new URLSearchParams({url, size: '256'})}`}
      alt="QR Code"
      width="256"
      height="256"
    />
  );
}

/**
 * Print-Friendly QR Code
 * Optimized for printing (larger size, clear margins)
 */
export function PrintableQRCode({url, label}: {url: string; label?: string}) {
  return (
    <div className="flex flex-col items-center justify-center p-8 bg-white">
      {label && <h3 className="text-lg font-bold mb-4">{label}</h3>}

      <div className="border-4 border-black p-4 mb-4">
        <ProductQRCode url={url} size={512} />
      </div>

      <p className="text-center text-sm text-gray-600 max-w-xs">{url}</p>
    </div>
  );
}
