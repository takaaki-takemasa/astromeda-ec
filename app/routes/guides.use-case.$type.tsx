/**
 * 用途別LP 8種 — FPS・ライブ配信・クリエイター・VTuber・MMO・カジュアル・学生・テレワーク
 *
 * Route param `$type` で用途を動的に切り替え。各用途に最適なスペック・機能を提示。
 * SEO最適化: 用途別キーワード対策、FAQPage + WebPage 構造化データ、
 * AI引用可能な定量的スペック表、内部リンク誘導。
 */

import {Link} from 'react-router';
import type {Route} from './+types/guides.use-case.$type';
import {T, STORE_URL, PAGE_WIDTH} from '~/lib/astromeda-data';
import {RouteErrorBoundary} from '~/components/astro/RouteErrorBoundary';

const USE_CASES: Record<
  string,
  {
    title: string;
    description: string;
    heroText: string;
    gpuMin: string;
    gpuRec: string;
    ramMin: string;
    ramRec: string;
    keyFeatures: string[];
    faq: {q: string; a: string}[];
    collection: string;
  }
> = {
  fps: {
    title: 'FPSゲーム',
    description: '競技性の高いFPSゲームで勝つためのゲーミングPC。144fps以上の高フレームレートが必須。',
    heroText:
      'FPSゲームで勝つには、144fps以上を安定して出せるGPUが必須です。ASTROMEDAのGAMERティアなら、VALORANT/Apex Legendsで200fps以上を実現します。',
    gpuMin: 'RTX 5060',
    gpuRec: 'RTX 5070 Ti',
    ramMin: '16GB DDR5',
    ramRec: '32GB DDR5',
    keyFeatures: [
      '144Hz以上の高リフレッシュレートモニター対応',
      '低遅延設定でラグを最小化',
      'NVIDIAリフレックス対応で入力遅延軽減',
      'RTX 5000シリーズのDLSS 4で高fps維持',
    ],
    faq: [
      {
        q: 'FPSゲームに必要なfpsの目安は？',
        a: '競技的にプレイするなら144fps以上、プロレベルなら240fps以上が目安です。ASTROMEDAのGAMERティア（RTX 5070 Ti）なら、フルHDで200fps以上を安定して出せるため、VALORANT・Apex Legends・フォートナイトなど主流タイトルで十分な性能があります。',
      },
      {
        q: 'CPU選びのポイントは何ですか？',
        a: 'FPSゲームはGPUだけでなくCPUも重要です。フレームレートを上げるにはCPUの性能も必要になるため、Ryzen 7やCore Ultra 7以上のマルチスレッド性能が推奨されます。ASTROMEDAなら標準で高性能CPUがセットアップされています。',
      },
      {
        q: '4K解像度でFPSゲームはプレイできますか？',
        a: '4K（3840×2160）でのFPSプレイはGPUに非常に高い負荷がかかります。RTX 5090でも4Kでのハイフレームレート安定は難しく、フルHD・WQHD（1440p）でのプレイが推奨されます。これらの解像度なら高fpsを狙いやすくなります。',
      },
    ],
    collection: '/collections/astromeda',
  },
  streaming: {
    title: 'ライブ配信',
    description: '配信とゲームを同時処理。NVENCエンコーダーが搭載された高性能GPUが必須。',
    heroText:
      '配信しながらゲームをプレイするには、GPUのNVENCエンコーダーが重要です。RTX 5070 Ti以上なら、1080p/60fpsの高画質配信とゲームプレイを両立できます。',
    gpuMin: 'RTX 5070',
    gpuRec: 'RTX 5080',
    ramMin: '32GB DDR5',
    ramRec: '64GB DDR5',
    keyFeatures: [
      'NVENCハードウェアエンコーダーで低遅延配信',
      '1080p/60fps高画質配信とゲームプレイ同時処理',
      '大容量メモリ（32GB以上）で複数アプリ同時実行',
      'Twitch・YouTube同時マルチ配信対応',
    ],
    faq: [
      {
        q: '配信とゲームの同時プレイに必要なスペックは？',
        a: 'ゲーム配信にはGPUのNVENCエンコーダー機能が非常に重要です。RTX 5070 Ti以上なら1080p/60fpsの高画質配信をCPUに負荷をかけずに実現でき、ゲームも高fpsで動作させられます。メモリは32GB以上推奨です。',
      },
      {
        q: 'CPU使用率が高くなるのを避けるには？',
        a: 'ハードウェアエンコーディング（NVENCまたはQuickSync）を使用することが最重要です。RTX 5000シリーズのNVENCなら、CPU使用率を5～10%に抑えながら高画質で配信できます。OBS・ストリームヤード等の配信ソフトでエンコーダー設定を「NVIDIA NVENC」に変更してください。',
      },
      {
        q: '4K配信はできますか？',
        a: '技術的には可能ですが、視聴者側の回線環境により視聴困難になる場合が多いため、1080p/60fpsまたは1440p/60fpsが実用的です。RTX 5080なら1440p/60fpsでの配信と高fpsゲームプレイの両立が可能です。',
      },
    ],
    collection: '/collections/astromeda',
  },
  creative: {
    title: 'クリエイター',
    description: '動画編集・3Dモデリング・イラスト制作向け。高VRAMと高マルチスレッド性能が必須。',
    heroText:
      '動画編集、3Dモデリング、イラスト制作にはGPUのVRAMとCPUのマルチスレッド性能が重要です。CREATORティアのRTX 5080/5090なら、4K動画編集もストレスフリーです。',
    gpuMin: 'RTX 5070 Ti',
    gpuRec: 'RTX 5090',
    ramMin: '32GB DDR5',
    ramRec: '64GB DDR5',
    keyFeatures: [
      '4K動画編集での高速レンダリング（CUDA対応）',
      '3DモデリングのGPU演算加速（CUDA/OptiX）',
      'イラスト制作・AIアート生成対応',
      '大容量VRAM（16GB以上）で複数レイヤー処理',
    ],
    faq: [
      {
        q: '4K動画編集に必要なスペックは？',
        a: 'VRAM 16GB以上、CPU 12コア以上のマルチスレッド性能が推奨されます。RTX 5080（16GB）以上なら、Adobe Premiere Pro・DaVinciなどの4K編集ソフトでプロキシなしでのリアルタイムプレビュー、高速エクスポートが実現できます。',
      },
      {
        q: 'BlenderやMaya等の3Dソフトに最適なGPUは？',
        a: 'CUDA対応GPUが必須です。RTX 5090なら、Blender Cyclesでのレンダリングが大幅に高速化され、複雑なシーンでもレンダリング時間が劇的に短縮されます。VRAMも32GBあると、大規模シーンの処理が余裕をもって実行できます。',
      },
      {
        q: 'イラスト制作にRTX 5090は必要ですか？',
        a: '2D イラスト制作のみなら RTX 5070 Ti で十分ですが、AI 画像生成（Stable Diffusion 等）や 3D 背景制作を並行する場合は RTX 5080/5090 が活躍します。特に大バッチサイズでの高速生成には高 VRAM が有利です。',
      },
    ],
    collection: '/collections/astromeda',
  },
  vtuber: {
    title: 'VTuber',
    description: '3Dモデル描画+ゲーム+配信の3点セット。高い総合性能が必須。',
    heroText:
      'VTuber活動には、3Dモデル描画+ゲーム+配信の3つを同時処理するパワーが必要です。RTX 5070 Ti以上とCore Ultra 7以上の組み合わせが最適です。',
    gpuMin: 'RTX 5070 Ti',
    gpuRec: 'RTX 5080',
    ramMin: '32GB DDR5',
    ramRec: '64GB DDR5',
    keyFeatures: [
      'Unity/Unreal Engine での3Dモデル高品質描画',
      'NVENCで低遅延ライブ配信',
      '複数カメラ・トラッキング同時処理',
      'OBS＋配信ソフトの複数ウィンドウ運用',
    ],
    faq: [
      {
        q: 'VTuber配信用のPC最小スペックは？',
        a: 'RTX 5070 Ti + Ryzen 7/Core Ultra 7 + メモリ32GB が推奨最小構成です。3Dモデル描画（Unity/Unreal）で GPU 使用率 60～80%、ゲーム+配信で CPU 使用率 40～60% 程度になることを想定すると、この構成で安定動作します。',
      },
      {
        q: '複数キャラクター（衣装チェンジ等）をリアルタイムで切り替えられますか？',
        a: 'RTX 5080以上なら、複数の高品質3Dモデルをメモリに常駐させて瞬時に切り替え可能です。メモリ64GB推奨。ただしUnityのシーン最適化が重要であり、モデルのポリゴン数・テクスチャサイズを調整することも重要です。',
      },
      {
        q: 'バーチャル背景と複数ウィンドウの同時実行は可能ですか？',
        a: 'RTX 5070 Ti以上なら可能です。OBS（3Dモデル出力）＋ゲーム＋配信ソフト＋チャット監視ツール を同時運用できます。ただしメモリは 32GB 以上推奨し、PC に余裕を持たせることが重要です。',
      },
    ],
    collection: '/collections/astromeda',
  },
  mmo: {
    title: 'MMO/オープンワールド',
    description: '広大マップと大量NPC描画。大容量VRAMのGPUが有利。',
    heroText:
      'MMOやオープンワールドゲームは広大なマップと大量のプレイヤーを描画するため、VRAMの大きなGPUが有利です。RTX 5070以上で快適なプレイが可能です。',
    gpuMin: 'RTX 5070',
    gpuRec: 'RTX 5080',
    ramMin: '32GB DDR5',
    ramRec: '32GB DDR5',
    keyFeatures: [
      '大容量VRAM（12GB以上）でテクスチャ大量読み込み',
      'オープンワールドのストレスフリー高fps',
      'ウルトラ設定での長時間プレイ安定性',
      'マルチプレイヤー環境での安定ネットワーク処理',
    ],
    faq: [
      {
        q: 'FF14・PSO2・黒い砂漠 等のMMOで推奨スペックは？',
        a: 'これらのタイトルなら RTX 5070 で十分ですが、最高画質（ウルトラ/最高設定）で WQHD 144fps を目指すなら RTX 5070 Ti 推奨です。VRAMは12GB以上あると、テクスチャ キャッシュが充実してフレームレート安定性が向上します。',
      },
      {
        q: 'Elden Ring・スターフィールド等のAAAタイトルは？',
        a: 'Elden Ring なら RTX 5070 で 1440p/100fps 以上可能です。より重い Star Field の場合は RTX 5070 Ti で 1440p/80fps 程度が目安です。両タイトル共に最高画質での長時間プレイを想定すると、RTX 5080 が安心です。',
      },
      {
        q: 'CPUの選び方は？MMOではボトルネックになりますか？',
        a: 'MMO/オープンワールドは GPU 負荷が高いため、CPU ボトルネックは通常発生しません。Ryzen 5 / Core Ultra 5 でも十分ですが、複数プレイヤーが密集している町エリアでの安定性を考慮すると Ryzen 7 / Core Ultra 7 がおすすめです。',
      },
    ],
    collection: '/collections/astromeda',
  },
  casual: {
    title: 'カジュアルゲーム',
    description: 'マインクラフト・フォートナイト等の軽いタイトル向け。コスパ重視。',
    heroText:
      'マインクラフトやフォートナイトなどのカジュアルゲームなら、RTX 5060でも十分快適にプレイできます。コスパ重視のGAMERティアがおすすめです。',
    gpuMin: 'RTX 5060',
    gpuRec: 'RTX 5070',
    ramMin: '16GB DDR5',
    ramRec: '16GB DDR5',
    keyFeatures: [
      'フルHD/144fpsで軽量ゲーム快適プレイ',
      '発熱・消費電力を抑えた効率的なパフォーマンス',
      '低価格で高コストパフォーマンス',
      'マインクラフト・フォートナイト・Apex等で100fps以上',
    ],
    faq: [
      {
        q: 'RTX 5060 でマインクラフトやフォートナイトはプレイできますか？',
        a: 'はい、余裕でプレイできます。フルHD で 100fps 以上安定して出せます。RTX 5060 は 8GB VRAM を搭載しており、軽量ゲームのテクスチャ処理には十分です。マインクラフトなら シェーダー有効状態でも 60fps 以上で動作します。',
      },
      {
        q: 'RTX 5060 と RTX 5070 では何が違いますか？',
        a: 'RTX 5070 は VRAM 12GB（5060 は 8GB）、メモリバス幅が広く、CUDAコア数が約 40% 多いため性能は約 25～30% 高いです。カジュアルゲームなら 5060 で十分ですが、シェーダー多用やMOD導入なら 5070 がおすすめです。',
      },
      {
        q: 'カジュアルゲーマーが避けるべき選択肢は？',
        a: 'オーバースペック（RTX 5090 等）を購入することです。電気代・本体価格共に無駄になります。カジュアルゲーム + Web閲覧・事務作業程度なら RTX 5060 + メモリ 16GB が最適です。将来ハードなゲームに挑戦する予定があれば 5070 を検討してください。',
      },
    ],
    collection: '/collections/astromeda',
  },
  study: {
    title: '学生・勉強＋ゲーム',
    description: 'オンライン授業・レポート・プログラミング+ゲーム両立。コスパ重視。',
    heroText:
      '学業とゲームを両立するなら、コスパの良いGAMERティアが最適です。オンライン授業、レポート作成、プログラミング学習にも対応し、放課後はゲームも楽しめます。',
    gpuMin: 'RTX 5060',
    gpuRec: 'RTX 5060',
    ramMin: '16GB DDR5',
    ramRec: '32GB DDR5',
    keyFeatures: [
      'オンライン授業＋レポート作成＋ブラウザ複数タブ同時運用',
      'Visual Studio Code・GitHub・IDE 軽快動作',
      '放課後のゲームプレイで気分転換',
      'プログラミング学習と GPU 演算の基礎体験',
    ],
    faq: [
      {
        q: 'オンライン授業・レポート作成に必要なスペックは？',
        a: 'Zoom・Google Meet 等でのビデオ会議と Word・Google Docs でのレポート作成なら、RTX 5060 + CPU Ryzen 5 + メモリ 16GB で十分すぎるほどです。むしろ CPU のシングルスレッド性能とメモリが重要で、これらの作業では GPU の出番はありません。',
      },
      {
        q: 'Python・JavaScript 学習と GPU 計算について',
        a: 'プログラミング言語学習の大半は GPU を使いませんが、将来的に深層学習（TensorFlow・PyTorch）を学ぶなら CUDA 対応 GPU があると便利です。RTX 5060 でも CUDA 基本操作は可能ですが、機械学習に本格的に取り組むなら RTX 5070 Ti 以上を検討してください。',
      },
      {
        q: '学生の予算が限られている場合の選択肢は？',
        a: 'ASTROMEDAのGAMERティア（RTX 5060、¥199,980～）が最適です。学業とゲーム両方のニーズを満たし、電気代も安く（RTX 5060は TDP 150W）、将来パーツアップグレードの余地もあります。分割払い対応もしており、毎月の支払い負担を軽減できます。',
      },
    ],
    collection: '/collections/astromeda',
  },
  work: {
    title: 'テレワーク＋ゲーム',
    description: 'ビジネスアプリ+ゲーム両立。仕事効率と趣味を両立するマルチタスク向け。',
    heroText:
      '在宅勤務とゲームを1台で。ビジネスアプリの動作は軽快で、仕事終わりのゲームもハイクオリティ。RTX 5060以上でWeb会議+ゲームのマルチタスクに対応します。',
    gpuMin: 'RTX 5060',
    gpuRec: 'RTX 5070',
    ramMin: '16GB DDR5',
    ramRec: '32GB DDR5',
    keyFeatures: [
      'Excel・PowerPoint・Slack・Teams 複数同時実行',
      'Google Meet・Zoom での安定したビデオ会議',
      '仕事終わりのゲームプレイでリフレッシュ',
      '多モニタ対応で生産性向上',
    ],
    faq: [
      {
        q: 'テレワークに必要なスペックは？',
        a: 'Web 会議＋ブラウザ＋ Office なら、RTX 5060 + CPU Ryzen 5 + メモリ 16GB で完全に事足ります。これらのアプリは CPU・メモリ負荷が中心で GPU は使いません。むしろ複数アプリを同時実行するため、メモリは 16GB 以上あると快適です。',
      },
      {
        q: 'マルチモニタ設定は可能ですか？',
        a: 'はい。RTX 5060 も複数 HDMI/DisplayPort 出力に対応しており、3 台のモニタ同時接続が可能です。仕事用モニタ 2 台＋ゲーム用モニタ 1 台という使い分けができ、生産性を大幅に向上させられます。',
      },
      {
        q: 'ゲーム中にテレワークアプリのバックグラウンド実行は？',
        a: 'RTX 5070 以上 + メモリ 32GB 推奨です。Slack・メール通知を背景で受け取りながらゲーム進行は可能ですが、ゲーム中の急な Zoom 会議対応を想定すると、CPU に余裕があり、メモリが十分（32GB）な構成がおすすめです。',
      },
    ],
    collection: '/collections/astromeda',
  },
};

export const loader: Route.LoaderFunction = async ({params}) => {
  const {type} = params;

  if (!USE_CASES[type]) {
    throw new Response('Not Found', {status: 404});
  }

  return {type, useCase: USE_CASES[type]};
};

export const meta: Route.MetaFunction = ({data}) => {
  const type = data?.type || 'unknown';
  const useCase = data?.useCase;

  if (!useCase) {
    return [{title: 'ゲーミングPC選び方ガイド | ASTROMEDA ゲーミングPC'}];
  }

  const title = `${useCase.title}向けゲーミングPC | ASTROMEDA ゲーミングPC`;
  const url = `${STORE_URL}/guides/use-case/${type}`;

  return [
    {title},
    {name: 'description', content: useCase.description},
    {tagName: 'link' as const, rel: 'canonical', href: url},
    {property: 'og:title', content: title},
    {property: 'og:description', content: useCase.description},
    {property: 'og:url', content: url},
    {property: 'og:type', content: 'article'},
    {name: 'twitter:card', content: 'summary'},
    {name: 'twitter:title', content: title},
    {name: 'twitter:description', content: useCase.description},
  ];
};

export default function UseCasePage({loaderData}: Route.ComponentProps) {
  const {type, useCase} = loaderData;

  // FAQ Schema
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: useCase.faq.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.a,
      },
    })),
  };

  // WebPage Schema
  const webPageJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    headline: `${useCase.title}向けゲーミングPC — 選び方ガイド`,
    description: useCase.description,
    url: `${STORE_URL}/guides/use-case/${type}`,
    author: {
      '@type': 'Organization',
      name: 'ASTROMEDA',
      url: STORE_URL,
    },
    publisher: {
      '@type': 'Organization',
      name: 'ASTROMEDA',
      url: STORE_URL,
    },
  };

  const specRows = [
    {label: 'GPU最低', min: useCase.gpuMin, rec: useCase.gpuRec},
    {label: 'メモリ最低', min: useCase.ramMin, rec: useCase.ramRec},
  ];

  return (
    <div
      style={{
        background: T.bg,
        minHeight: '100vh',
        fontFamily: "'Outfit','Noto Sans JP',system-ui,sans-serif",
        color: T.tx,
      }}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{__html: JSON.stringify(faqJsonLd)}}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{__html: JSON.stringify(webPageJsonLd)}}
      />

      <div
        style={{...PAGE_WIDTH, paddingTop: 'clamp(32px, 4vw, 64px)', paddingBottom: 'clamp(32px, 4vw, 64px)'}}
      >
        {/* Breadcrumb */}
        <nav style={{fontSize: 11, color: 'rgba(255,255,255,.4)', marginBottom: 24}}>
          <Link to="/" style={{color: 'rgba(255,255,255,.4)', textDecoration: 'none'}}>
            ホーム
          </Link>
          {' / '}
          <Link to="/guides" style={{color: 'rgba(255,255,255,.4)', textDecoration: 'none'}}>
            ガイド
          </Link>
          {' / '}
          <Link to="/guides/use-case/fps" style={{color: 'rgba(255,255,255,.4)', textDecoration: 'none'}}>
            用途別
          </Link>
          {' / '}
          <span style={{color: T.c}}>{useCase.title}</span>
        </nav>

        {/* Header */}
        <header style={{marginBottom: 48}}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: T.c,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              display: 'block',
              marginBottom: 8,
            }}
          >
            Use Case Guide
          </span>
          <h1
            style={{
              fontSize: 'clamp(28px, 5vw, 40px)',
              fontWeight: 900,
              margin: '0 0 16px',
              lineHeight: 1.2,
            }}
          >
            {useCase.title}向けゲーミングPC
            <br />
            — 選び方ガイド
          </h1>
          <p
            style={{
              fontSize: 16,
              color: 'rgba(255,255,255,.7)',
              lineHeight: 1.8,
              margin: '0 0 24px',
              maxWidth: 680,
            }}
          >
            {useCase.description}
          </p>
          <div
            style={{
              fontSize: 13,
              background: 'rgba(0,240,255,.08)',
              border: '1px solid rgba(0,240,255,.2)',
              borderRadius: 10,
              padding: '16px 20px',
              color: 'rgba(255,255,255,.8)',
              fontStyle: 'italic',
              lineHeight: 1.6,
            }}
          >
            {useCase.heroText}
          </div>
        </header>

        {/* Recommended Specs Table */}
        <section style={{marginBottom: 56}}>
          <h2
            style={{
              fontSize: 'clamp(22px, 3vw, 28px)',
              fontWeight: 900,
              color: T.c,
              marginBottom: 24,
              paddingBottom: 12,
              borderBottom: `2px solid ${T.c}`,
            }}
          >
            推奨スペック
          </h2>

          <div style={{overflowX: 'auto'}}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 13,
                backgroundColor: 'rgba(255,255,255,.02)',
                border: '1px solid rgba(255,255,255,.08)',
              }}
            >
              <thead>
                <tr style={{backgroundColor: 'rgba(0,240,255,.08)', borderBottom: '2px solid rgba(0,240,255,.2)'}}>
                  <th
                    style={{
                      padding: '16px',
                      textAlign: 'left',
                      fontWeight: 800,
                      color: T.c,
                      minWidth: 120,
                    }}
                  >
                    パーツ
                  </th>
                  <th style={{padding: '16px', textAlign: 'left', fontWeight: 800, color: 'rgba(255,255,255,.7)', minWidth: 150}}>
                    最低スペック
                  </th>
                  <th style={{padding: '16px', textAlign: 'left', fontWeight: 800, color: T.c, minWidth: 150}}>
                    推奨スペック
                  </th>
                </tr>
              </thead>
              <tbody>
                {specRows.map((row, i) => (
                  <tr
                    key={i}
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,.06)',
                      backgroundColor: i % 2 === 0 ? 'rgba(255,255,255,.02)' : 'transparent',
                    }}
                  >
                    <td style={{padding: '14px 16px', fontWeight: 700, color: 'rgba(255,255,255,.9)'}}>{row.label}</td>
                    <td style={{padding: '14px 16px', color: 'rgba(255,255,255,.7)'}}>{row.min}</td>
                    <td style={{padding: '14px 16px', color: T.c, fontWeight: 600}}>{row.rec}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div
            style={{
              fontSize: 12,
              color: 'rgba(255,255,255,.5)',
              marginTop: 16,
              padding: 12,
              background: 'rgba(255,255,255,.02)',
              borderRadius: 8,
            }}
          >
            <strong>注:</strong> 最低スペックはゲーム最小設定での動作目安です。推奨スペックは高画質・高フレームレートでの快適プレイを想定しています。
          </div>
        </section>

        {/* Key Features Section */}
        <section style={{marginBottom: 56}}>
          <h2
            style={{
              fontSize: 'clamp(22px, 3vw, 28px)',
              fontWeight: 900,
              color: T.c,
              marginBottom: 24,
              paddingBottom: 12,
              borderBottom: `2px solid ${T.c}`,
            }}
          >
            {useCase.title}向けの重要機能
          </h2>

          <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24}}>
            {useCase.keyFeatures.map((feature, i) => (
              <div
                key={i}
                style={{
                  padding: 24,
                  background: 'linear-gradient(135deg, rgba(0,240,255,.08), rgba(255,179,0,.04))',
                  border: '1px solid rgba(0,240,255,.15)',
                  borderRadius: 16,
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 900,
                    color: T.c,
                    marginBottom: 12,
                  }}
                >
                  ✓
                </div>
                <p
                  style={{
                    fontSize: 13,
                    color: 'rgba(255,255,255,.8)',
                    lineHeight: 1.7,
                    margin: 0,
                    fontWeight: 600,
                  }}
                >
                  {feature}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ Section */}
        <section style={{marginBottom: 56}}>
          <h2
            style={{
              fontSize: 'clamp(22px, 3vw, 28px)',
              fontWeight: 900,
              color: T.c,
              marginBottom: 24,
              paddingBottom: 12,
              borderBottom: `2px solid ${T.c}`,
            }}
          >
            よくある質問
          </h2>

          {useCase.faq.map((item, i) => (
            <details
              key={i}
              style={{
                marginBottom: 12,
                padding: 0,
                background: 'rgba(255,255,255,.03)',
                border: '1px solid rgba(255,255,255,.08)',
                borderRadius: 10,
                overflow: 'hidden',
              }}
            >
              <summary
                style={{
                  cursor: 'pointer',
                  padding: '16px 20px',
                  fontWeight: 700,
                  fontSize: 13,
                  color: T.tx,
                  userSelect: 'none',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>{item.q}</span>
                <span
                  style={{
                    fontSize: 18,
                    color: T.c,
                    transition: 'transform 0.3s',
                  }}
                >
                  ▼
                </span>
              </summary>
              <div
                style={{
                  padding: '0 20px 16px 20px',
                  fontSize: 13,
                  color: 'rgba(255,255,255,.7)',
                  lineHeight: 1.8,
                  borderTop: '1px solid rgba(255,255,255,.06)',
                }}
              >
                {item.a}
              </div>
            </details>
          ))}
        </section>

        {/* Conclusion */}
        <section
          style={{
            padding: 32,
            background: `linear-gradient(135deg, ${T.c}22 0%, ${T.g}22 100%)`,
            border: `1px solid ${T.c}33`,
            borderRadius: 16,
            marginBottom: 48,
          }}
        >
          <h2
            style={{
              fontSize: 'clamp(20px, 2.5vw, 26px)',
              fontWeight: 900,
              margin: '0 0 16px',
            }}
          >
            {useCase.title}に最適なPCで最高のゲーム体験を
          </h2>
          <p
            style={{
              fontSize: 14,
              color: 'rgba(255,255,255,.8)',
              lineHeight: 1.8,
              margin: 0,
            }}
          >
            ASTROMEDAなら、{useCase.title}向けに最適化されたPCが手に入ります。国内自社工場での丁寧な組み立て、電話・LINEでの永年サポート、最長3年保証で、購入後も安心して愛用できます。
          </p>
        </section>

        {/* CTA */}
        <div
          style={{
            textAlign: 'center',
            marginBottom: 32,
          }}
        >
          <div style={{display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap'}}>
            <Link
              to={useCase.collection}
              style={{
                display: 'inline-block',
                padding: '16px 32px',
                background: T.c,
                color: '#000',
                fontSize: 13,
                fontWeight: 800,
                borderRadius: 10,
                textDecoration: 'none',
              }}
            >
              {useCase.title}向けPCを見る →
            </Link>
            <Link
              to="/guides"
              style={{
                display: 'inline-block',
                padding: '16px 32px',
                background: 'transparent',
                color: T.g,
                fontSize: 13,
                fontWeight: 800,
                borderRadius: 10,
                textDecoration: 'none',
                border: `1px solid ${T.g}4D`,
              }}
            >
              他のガイドを見る →
            </Link>
          </div>
        </div>

        {/* Back link */}
        <div style={{textAlign: 'center'}}>
          <Link
            to="/guides"
            style={{fontSize: 13, color: 'rgba(255,255,255,.5)', textDecoration: 'none'}}
          >
            ← ガイド一覧に戻る
          </Link>
        </div>
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  return <RouteErrorBoundary />;
}
