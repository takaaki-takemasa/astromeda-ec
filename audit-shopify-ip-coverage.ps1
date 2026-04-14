# Shopify IP Collaboration Product Coverage Audit
# Executes all GraphQL queries and generates audit report
# Usage: .\audit-shopify-ip-coverage.ps1

param(
    [switch]$OutputJson = $false,
    [string]$OutputPath = "audit-report.json"
)

$ErrorActionPreference = "Stop"

# Configuration
$STORE = "staging-mining-base.myshopify.com"
$TOKEN = "9d4f49c05d1373832b46fedab6110962"
$ENDPOINT = "https://$STORE/api/2024-01/graphql.json"

# IP Collection Handles (from astromeda-data.ts COLLABS array)
$IPHandles = @{
    "ONE PIECE バウンティラッシュ" = "one-piece-bountyrush-collaboration"
    "NARUTO-ナルト- 疾風伝" = "naruto-shippuden"
    "僕のヒーローアカデミア" = "heroaca-collaboration"
    "ストリートファイター6" = "streetfighter-collaboration"
    "サンリオキャラクターズ" = "sanrio-characters-collaboration"
    "ソニック・ザ・ヘッジホッグ" = "sega-sonic-astromeda-collaboration"
    "呪術廻戦" = "jujutsukaisen-collaboration"
    "チェンソーマン レゼ篇" = "chainsawman-movie-reze"
    "ぼっち・ざ・ろっく！" = "bocchi-rocks-collaboration"
    "hololive English" = "hololive-english-collaboration"
    "BLEACH Rebirth of Souls" = "bleach-rebirth-of-souls-collaboration"
    "BLEACH 千年血戦篇" = "bleach-anime-astromeda-collaboration"
    "コードギアス 反逆のルルーシュ" = "geass-collaboration"
    "東京喰種トーキョーグール" = "tokyoghoul-collaboration"
}

# IP Search Keywords
$IPKeywords = @{
    "ONE PIECE バウンティラッシュ" = @("ONE PIECE", "ワンピース", "バウンティラッシュ")
    "NARUTO-ナルト- 疾風伝" = @("NARUTO", "ナルト", "疾風伝")
    "僕のヒーローアカデミア" = @("ヒーローアカデミア", "ヒロアカ", "デク", "爆豪", "轟")
    "ストリートファイター6" = @("ストリートファイター", "Street Fighter", "SF6")
    "サンリオキャラクターズ" = @("サンリオ", "キティ", "ハローキティ")
    "ソニック・ザ・ヘッジホッグ" = @("ソニック", "Sonic", "シャドウ")
    "呪術廻戦" = @("呪術廻戦", "じゅじゅつかいせん", "Jujutsu Kaisen")
    "チェンソーマン レゼ篇" = @("チェンソーマン", "レゼ篇", "Chainsaw Man")
    "ぼっち・ざ・ろっく！" = @("ぼっち", "ぼざろ", "Bocchi")
    "hololive English" = @("hololive", "ホロライブ", "英語圏")
    "BLEACH Rebirth of Souls" = @("BLEACH", "ブリーチ", "Rebirth")
    "BLEACH 千年血戦篇" = @("BLEACH", "千年血戦篇", "Thousand-Year")
    "コードギアス 反逆のルルーシュ" = @("コードギアス", "ルルーシュ", "Code Geass")
    "東京喰種トーキョーグール" = @("東京喰種", "トーキョーグール", "Tokyo Ghoul")
}

# Helper function to execute GraphQL query
function Invoke-GraphQLQuery {
    param(
        [Parameter(Mandatory=$true)]
        [string]$Query
    )

    try {
        $body = @{
            query = $Query
        } | ConvertTo-Json -Depth 10

        Write-Verbose "Executing query..."
        $response = Invoke-WebRequest -Uri $ENDPOINT `
            -Method Post `
            -Headers @{
                "Content-Type" = "application/json"
                "X-Shopify-Storefront-Access-Token" = $TOKEN
            } `
            -Body $body `
            -TimeoutSec 30

        return $response.Content | ConvertFrom-Json
    }
    catch {
        Write-Error "GraphQL Query Failed: $_"
        return $null
    }
}

# Query 1: Get all products in a collection
function Get-CollectionProducts {
    param(
        [Parameter(Mandatory=$true)]
        [string]$Handle
    )

    $query = @"
{
  collectionByHandle(handle: "$Handle") {
    id
    title
    handle
    products(first: 250) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        title
        productType
        tags
        vendor
        handle
        variants(first: 1) {
          nodes {
            id
            sku
          }
        }
      }
    }
  }
}
"@

    return Invoke-GraphQLQuery -Query $query
}

# Query 2: Search for products by keyword
function Search-ProductsByKeyword {
    param(
        [Parameter(Mandatory=$true)]
        [string]$Keyword
    )

    $escapedKeyword = $Keyword -replace '"', '\"'
    $query = @"
{
  products(first: 50, query: "$escapedKeyword") {
    pageInfo {
      hasNextPage
      endCursor
    }
    nodes {
      id
      title
      productType
      tags
      vendor
      handle
      collections(first: 10) {
        nodes {
          handle
          title
        }
      }
      variants(first: 1) {
        nodes {
          id
          sku
        }
      }
    }
  }
}
"@

    return Invoke-GraphQLQuery -Query $query
}

# Main audit execution
function Invoke-IPAudit {
    Write-Host "=== Shopify IP Collaboration Product Coverage Audit ===" -ForegroundColor Cyan
    Write-Host "Store: $STORE"
    Write-Host "Date: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    Write-Host ""

    $auditResults = @()
    $totalIPs = 0
    $totalOrphaned = 0

    foreach ($ip in $IPHandles.Keys) {
        $totalIPs++
        $handle = $IPHandles[$ip]

        Write-Host "Auditing: $ip [$handle]" -ForegroundColor Yellow

        # Get collection products
        Write-Host "  → Fetching collection products..." -NoNewline
        $collectionResult = Get-CollectionProducts -Handle $handle

        if (-not $collectionResult -or $collectionResult.errors) {
            Write-Host " FAILED" -ForegroundColor Red
            Write-Error "Error querying collection: $($collectionResult.errors)"
            continue
        }

        $collection = $collectionResult.data.collectionByHandle
        $collectionProducts = @($collection.products.nodes)
        $collectionCount = $collectionProducts.Count
        Write-Host " [$collectionCount products]" -ForegroundColor Green

        # Search for products by keywords
        Write-Host "  → Searching by keywords..." -NoNewline
        $keywords = $IPKeywords[$ip]
        $allSearchProducts = @()
        $searchCount = 0

        foreach ($keyword in $keywords) {
            $searchResult = Search-ProductsByKeyword -Keyword $keyword

            if ($searchResult.data.products.nodes) {
                $allSearchProducts += $searchResult.data.products.nodes
                $searchCount += $searchResult.data.products.nodes.Count
            }
        }

        # Deduplicate search results by ID
        $uniqueSearchProducts = $allSearchProducts | Sort-Object -Property id -Unique
        $totalSearchCount = $uniqueSearchProducts.Count
        Write-Host " [$totalSearchCount products]" -ForegroundColor Green

        # Find orphaned products (in search but not in collection)
        $collectionIds = $collectionProducts.id
        $orphanedProducts = $uniqueSearchProducts | Where-Object { $_.id -notin $collectionIds }
        $orphanCount = $orphanedProducts.Count

        if ($orphanCount -gt 0) {
            Write-Host "  ⚠ WARNING: $orphanCount products NOT in collection!" -ForegroundColor Yellow
            $totalOrphaned += $orphanCount
        }

        # Calculate coverage
        if ($totalSearchCount -gt 0) {
            $coverage = [Math]::Round(($collectionCount / $totalSearchCount) * 100, 1)
        }
        else {
            $coverage = 0
        }

        # Build result object
        $result = [PSCustomObject]@{
            name = $ip
            handle = $handle
            collectionProductCount = $collectionCount
            keywordSearchCount = $totalSearchCount
            orphanedCount = $orphanCount
            orphanedProducts = @($orphanedProducts | Select-Object -Property @{n="title"; e="title"}, @{n="handle"; e="handle"}, @{n="sku"; e="variants.nodes[0].sku"})
            coveragePercent = $coverage
            collectionSample = @($collectionProducts | Select-Object -First 3 -Property @{n="title"; e="title"}, @{n="handle"; e="handle"})
        }

        $auditResults += $result
        Write-Host "  ✓ Coverage: $coverage%" -ForegroundColor Green
        Write-Host ""
    }

    # Generate summary
    $avgCoverage = $auditResults | Measure-Object -Property coveragePercent -Average | Select-Object -ExpandProperty Average

    $summary = [PSCustomObject]@{
        auditDate = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
        store = $STORE
        totalIPsAudited = $totalIPs
        totalOrphanedProducts = $totalOrphaned
        averageCoveragePercent = [Math]::Round($avgCoverage, 1)
        ips = $auditResults
    }

    # Output results
    Write-Host "=== AUDIT SUMMARY ===" -ForegroundColor Cyan
    Write-Host "Total IPs Audited: $totalIPs"
    Write-Host "Total Orphaned Products: $totalOrphaned"
    Write-Host "Average Coverage: $([Math]::Round($avgCoverage, 1))%"
    Write-Host ""

    if ($OutputJson) {
        Write-Host "Saving report to: $OutputPath"
        $summary | ConvertTo-Json -Depth 10 | Out-File -FilePath $OutputPath -Encoding UTF8
        Write-Host "✓ Report saved" -ForegroundColor Green
    }

    return $summary
}

# Execute audit
try {
    $results = Invoke-IPAudit
    exit 0
}
catch {
    Write-Error "Audit failed: $_"
    exit 1
}
