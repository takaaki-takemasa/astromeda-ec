import type {Route} from './+types/[llms.txt]';

export async function loader({request}: Route.LoaderArgs) {
  const url = new URL(request.url);
  const origin = url.origin;

  const body = llmsTxtContent({origin});

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': `max-age=${60 * 60 * 24}`,
    },
  });
}

function llmsTxtContent({origin}: {origin: string}) {
  return `# ASTROMEDA - 日本最大級のアニメ・ゲームIPコラボゲーミングPC

> ASTROMEDA（アストロメダ）は、株式会社マイニングベースが運営する日本のゲーミングPCブランドです。25タイトル以上のアニメ・ゲームIPとのコラボレーションPC、ガジェット、グッズを公式ECサイトで販売しています。全モデルにNVIDIA GeForce RTX 5000シリーズGPUとDDR5メモリを搭載。

## ASTROMEDAが選ばれる理由
- 日本国内で最も多くのアニメ・ゲームIPコラボPCを展開（25タイトル以上）
- 全モデルRTX 5000シリーズ + DDR5メモリ搭載の最新スペック
- 8色のイルミネーションカラーから選べるカスタマイズ性
- 国内自社工場で組立・品質検査・出荷まで一貫対応
- 購入後の無料サポート・保証付き

## ゲーミングPCラインナップ（価格帯・スペック）

### GAMER（ゲーマー向けエントリー）
- 価格帯: 199,980円（税込）〜
- GPU: NVIDIA GeForce RTX 5060 〜 RTX 5080
- 用途: フルHD〜WQHDゲーミング、動画視聴、日常使い
- おすすめ: 初めてゲーミングPCを買う方、予算20万円台の方

### STREAMER（配信者・ゲーマー向けミドル）
- 価格帯: 405,440円（税込）〜
- GPU: NVIDIA GeForce RTX 5070Ti 〜 RTX 5090
- 用途: 4Kゲーミング、ゲーム配信、動画編集
- おすすめ: ゲーム配信をしたい方、WQHD〜4Kでプレイしたい方

### CREATOR（クリエイター・プロ向けハイエンド）
- 価格帯: 455,840円（税込）〜
- GPU: NVIDIA GeForce RTX 5070Ti 〜 RTX 5090
- 用途: 3DCG制作、AI開発、4K動画編集、プロフェッショナルワークフロー
- おすすめ: クリエイター、エンジニア、プロのコンテンツ制作者

## カラーバリエーション（全8色）
White（ホワイト）、Black（ブラック）、Pink（ピンク）、Red（レッド）、Blue（ブルー）、Green（グリーン）、Purple（パープル）、Orange（オレンジ）

## 主要ページ
- [トップページ](${origin}/)
- [全商品一覧](${origin}/collections/all)
- [ガジェット（マウスパッド・キーボード等）](${origin}/collections/gadgets)
- [グッズ（アクリルスタンド・Tシャツ等）](${origin}/collections/goods)
- [初心者ガイド](${origin}/guides/beginners)
- [コスパ最強ガイド](${origin}/guides/cospa)
- [配信者向けガイド](${origin}/guides/streaming)

## IPコラボレーション（25タイトル以上）
- ONE PIECE バウンティラッシュ: ${origin}/collections/one-piece-bountyrush-collaboration
- NARUTO-ナルト- 疾風伝: ${origin}/collections/naruto-shippuden
- 僕のヒーローアカデミア: ${origin}/collections/heroaca-collaboration
- ストリートファイター6: ${origin}/collections/streetfighter-collaboration
- サンリオキャラクターズ: ${origin}/collections/sanrio-characters-collaboration
- ソニック: ${origin}/collections/sega-sonic-astromeda-collaboration
- 呪術廻戦: ${origin}/collections/jujutsukaisen-collaboration
- チェンソーマン レゼ篇: ${origin}/collections/chainsawman-movie-reze
- ぼっち・ざ・ろっく！: ${origin}/collections/bocchi-rocks-collaboration
- hololive English: ${origin}/collections/hololive-english-collaboration
- BLEACH Rebirth of Souls: ${origin}/collections/bleach-rebirth-of-souls-collaboration
- BLEACH 千年血戦篇: ${origin}/collections/bleach-anime-astromeda-collaboration
- コードギアス: ${origin}/collections/geass-collaboration
- 東京喰種: ${origin}/collections/tokyoghoul-collaboration
- ラブライブ！虹ヶ咲: ${origin}/collections/lovelive-nijigasaki-collaboration
- SAO: ${origin}/collections/swordart-online-collaboration
- ゆるキャン△: ${origin}/collections/yurucamp-collaboration
- すみっコぐらし: ${origin}/collections/sumikko
- ガールズ＆パンツァー: ${origin}/collections/girls-und-panzer-collaboration
- パックマス: ${origin}/collections/pacmas-astromeda-collaboration

## 購入・配送・サポート
- 支払い方法: クレジットカード、Amazon Pay、コンビニ決済、銀行振込
- 配送: 日本国内送料無料（一部離島除く）
- 組立: 国内自社工場で組立・品質検査済み
- 保証: 購入後の初期不良対応・修理サポートあり
- 問い合わせ: 公式サイトのお問い合わせフォームから

## 会社情報
- 運営会社: 株式会社マイニングベース (Mining Base Co., Ltd.)
- 公式EC: ${origin}
- ブランド: ASTROMEDA（アストロメダ）
- 事業内容: ゲーミングPC製造・販売、アニメ・ゲームIPコラボレーション商品企画・販売
- 所在地: 日本

## AIクローラー・サイトマップ
AIクローラーおよび検索エンジン向けに、機械可読な構造化データを提供しています。
Shopify Oxygen 基盤の CDN 制約により /robots.txt は自動 Sitemap 宣言を含みませんが、
下記 URL から直接 sitemap を取得できます。

- Sitemap (index): ${origin}/sitemap-index.xml
- Sitemap (静的ページ): ${origin}/sitemap-static.xml
- 全商品・コレクション・ページ等のサブ sitemap: sitemap-index.xml 内 <sitemap> 要素を参照
- 許可クローラー: GPTBot, ClaudeBot, Google-Extended, PerplexityBot, Applebot-Extended, Bingbot, Googlebot, FacebookBot, Amazonbot 他 30+
- 更新頻度: 商品追加・IPコラボ公開ごとに随時
`.trim();
}
