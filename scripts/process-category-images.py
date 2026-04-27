#!/usr/bin/env python3
"""
patch 0182 (2026-04-27): CATEGORY 3カードの画像から白背景を除去 (alpha cutout)。

CEO 指示「白抜きできている製品と背景の白が残っている製品の二つ」への根本対応。
GADGETS (キーボード) と GOODS (ヒーローアカデミア) の白背景を flood-fill で透明化し、
public/category-cards/{slug}.png に保存する。GAMING PC は既に白抜き済だが冪等処理で無害。

Pillow の flood fill は (x, y) tuple stack で四方の隣接ピクセルを巡る。
near-white 判定 = (r, g, b) all > 255 - tolerance。
"""

import io
import os
import sys
from pathlib import Path

import requests
from PIL import Image

# Source: 旧サイト Shopify CDN の現行 featuredImage URL (固定)。
# 将来 Shopify 側で画像が差し替わった場合は workflow_dispatch で再実行。
SOURCES = {
    'gaming-pc': 'https://cdn.shopify.com/s/files/1/0741/0407/8628/files/32_b56b93df-55aa-4e6c-bcb6-2f47864f01fa.png',
    'gadgets':   'https://cdn.shopify.com/s/files/1/0741/0407/8628/files/87_3f9b8cde-3300-4cc2-ab95-2b5f5b10c708.png',
    'goods':     'https://cdn.shopify.com/s/files/1/0741/0407/8628/files/230_114cae03-014b-4bb5-95d3-142baf9b9c3f.png',
}

# tolerance: 255 からの距離。25 = (230-255) を「白」と判定。
# あまり大きくすると製品の明るい部分まで透明化される。
TOLERANCE = 25

# anti-aliasing: 透明境界の隣接ピクセルが薄ければ部分透過 (255 段階)。
EDGE_SOFTEN_THRESHOLD = 220

OUT_DIR = Path('public/category-cards')


def remove_white_bg(img: Image.Image, tolerance: int = TOLERANCE) -> Image.Image:
    """画像の四辺から flood-fill して、近白ピクセルを alpha=0 にする。

    内部の白 (例: キーキャップの白) は連結していないため温存される。
    """
    img = img.convert('RGBA')
    w, h = img.size
    px = img.load()

    visited = bytearray(w * h)
    stack: list[tuple[int, int]] = []
    for x in range(w):
        stack.append((x, 0))
        stack.append((x, h - 1))
    for y in range(h):
        stack.append((0, y))
        stack.append((w - 1, y))

    threshold = 255 - tolerance
    removed = 0
    while stack:
        x, y = stack.pop()
        idx = y * w + x
        if visited[idx]:
            continue
        visited[idx] = 1
        r, g, b, _ = px[x, y]
        if r < threshold or g < threshold or b < threshold:
            continue
        px[x, y] = (r, g, b, 0)
        removed += 1
        if x > 0:        stack.append((x - 1, y))
        if x < w - 1:    stack.append((x + 1, y))
        if y > 0:        stack.append((x, y - 1))
        if y < h - 1:    stack.append((x, y + 1))

    # Edge softening: 透明隣接ピクセルが2つ以上 + 自分が明るめ → alpha 段階化
    softened = 0
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            nt = 0
            if px[x, y - 1][3] == 0: nt += 1
            if px[x, y + 1][3] == 0: nt += 1
            if px[x - 1, y][3] == 0: nt += 1
            if px[x + 1, y][3] == 0: nt += 1
            if nt >= 2:
                lightness = (r + g + b) / 3
                if lightness > EDGE_SOFTEN_THRESHOLD:
                    new_alpha = max(0, min(255, int(255 * (255 - lightness) / 35)))
                    px[x, y] = (r, g, b, new_alpha)
                    softened += 1

    print(f'  removed={removed:,} alpha=0  softened={softened:,} edge px')
    return img


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    failures = 0
    for slug, url in SOURCES.items():
        out_path = OUT_DIR / f'{slug}.png'
        print(f'\n=== {slug} ===')
        print(f'  src: {url}')
        try:
            res = requests.get(url, timeout=120)
            res.raise_for_status()
            print(f'  downloaded {len(res.content):,} bytes')
            img = Image.open(io.BytesIO(res.content))
            print(f'  size: {img.size[0]}x{img.size[1]}')
            cut = remove_white_bg(img)
            cut.save(out_path, 'PNG', optimize=True)
            print(f'  saved → {out_path} ({out_path.stat().st_size:,} bytes)')
        except Exception as exc:
            print(f'  ✗ FAIL: {exc}', file=sys.stderr)
            failures += 1
    return 0 if failures == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
