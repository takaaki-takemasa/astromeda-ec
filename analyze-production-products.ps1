# Shopify Production Site Product Analysis Script
# Purpose: Compare product counts across all IP collaborations and main categories
# Run this from PowerShell on Windows

$handles = @(
    'one-piece-bountyrush-collaboration',
    'naruto-shippuden',
    'heroaca-collaboration',
    'streetfighter-collaboration',
    'sanrio-characters-collaboration',
    'sega-sonic-astromeda-collaboration',
    'jujutsukaisen-collaboration',
    'chainsawman-movie-reze',
    'bocchi-rocks-collaboration',
    'hololive-english-collaboration',
    'bleach-rebirth-of-souls-collaboration',
    'bleach-anime-astromeda-collaboration',
    'geass-collaboration',
    'tokyoghoul-collaboration',
    'lovelive-nijigasaki-collaboration',
    'swordart-online-collaboration',
    'yurucamp-collaboration',
    'pacmas-astromeda-collaboration',
    'sumikko',
    'girls-und-panzer-collaboration',
    'gadgets',
    'goods'
)

$specialItems = @('トートバッグ', 'メタルカード', '缶バッジ', 'パーカー', 'Tシャツ')
$results = @()

Write-Host "Starting Shopify production product analysis..." -ForegroundColor Green
Write-Host ""

foreach ($handle in $handles) {
    try {
        $url = "https://shop.mining-base.co.jp/collections/$handle/products.json?limit=250"
        Write-Host "Fetching: $handle..." -ForegroundColor Cyan

        $response = Invoke-WebRequest -Uri $url -TimeoutSec 10 -ErrorAction Stop
        $json = $response.Content | ConvertFrom-Json
        $products = $json.products

        $totalCount = $products.Count
        $specialItemsList = @()

        foreach ($product in $products) {
            $title = $product.title
            foreach ($keyword in $specialItems) {
                if ($title -match [regex]::Escape($keyword)) {
                    $specialItemsList += $title
                    break
                }
            }
        }

        $results += [PSCustomObject]@{
            Handle = $handle
            TotalCount = $totalCount
            SpecialItemsCount = $specialItemsList.Count
            SpecialItemsTitles = @($specialItemsList | Select-Object -First 10)
            Status = 'OK'
        }

        # Add delay to avoid rate limiting
        Start-Sleep -Milliseconds 500
    }
    catch {
        Write-Host "ERROR: $_" -ForegroundColor Red
        $results += [PSCustomObject]@{
            Handle = $handle
            TotalCount = 'ERROR'
            SpecialItemsCount = 'ERROR'
            SpecialItemsTitles = @()
            Status = 'FAILED'
            Error = $_.Exception.Message
        }
    }
}

# Output Summary Table
Write-Host ""
Write-Host ("=" * 120) -ForegroundColor White
Write-Host "SUMMARY TABLE" -ForegroundColor White
Write-Host ("=" * 120) -ForegroundColor White

$summaryTable = $results | Select-Object @{Name='Handle';Expression={$_.Handle}}, `
                                          @{Name='Total Count';Expression={$_.TotalCount}}, `
                                          @{Name='Special Items';Expression={$_.SpecialItemsCount}}

$summaryTable | Format-Table -AutoSize

# Detailed report for items with special products
Write-Host ""
Write-Host ("=" * 120) -ForegroundColor White
Write-Host "DETAILED SPECIAL ITEMS REPORT" -ForegroundColor White
Write-Host ("=" * 120) -ForegroundColor White

foreach ($result in $results) {
    if ($result.SpecialItemsCount -gt 0) {
        Write-Host ""
        Write-Host "$($result.Handle) ($($result.SpecialItemsCount) items):" -ForegroundColor Yellow
        $result.SpecialItemsTitles | ForEach-Object { Write-Host "  - $_" }
    }
}

# Statistics
Write-Host ""
Write-Host ("=" * 120) -ForegroundColor White
Write-Host "STATISTICS" -ForegroundColor White
Write-Host ("=" * 120) -ForegroundColor White

$successfulResults = $results | Where-Object { $_.Status -eq 'OK' }
$ipCollabs = $successfulResults | Where-Object { $_.Handle -notmatch '^(gadgets|goods)$' }
$categoryCollections = $successfulResults | Where-Object { $_.Handle -match '^(gadgets|goods)$' }

if ($ipCollabs.Count -gt 0) {
    $totalIpProducts = ($ipCollabs | Measure-Object -Property TotalCount -Sum).Sum
    $totalSpecialItems = ($ipCollabs | Measure-Object -Property SpecialItemsCount -Sum).Sum
    Write-Host ""
    Write-Host "IP Collaborations ($($ipCollabs.Count) collections):" -ForegroundColor Cyan
    Write-Host "  Total products: $totalIpProducts"
    Write-Host "  Total special items (バッグ/カード/バッジ/パーカー/Tシャツ): $totalSpecialItems"
}

if ($categoryCollections.Count -gt 0) {
    $totalCategoryProducts = ($categoryCollections | Measure-Object -Property TotalCount -Sum).Sum
    Write-Host ""
    Write-Host "Category Collections ($($categoryCollections.Count) collections):" -ForegroundColor Cyan
    Write-Host "  Total products: $totalCategoryProducts"
}

# Export to CSV for reference
$csvPath = ".\production-product-analysis.csv"
$results | Export-Csv -Path $csvPath -NoTypeInformation -Encoding UTF8
Write-Host ""
Write-Host "Full results exported to: $csvPath" -ForegroundColor Green
