# arcade-songs 数据下载脚本
# 数据源: https://dp4p6x0xfi5o9.cloudfront.net (CloudFront CDN)
# 注意: 本地 DNS 可能无法解析此域名，使用 --resolve 参数绕过

param(
    [string]$Game = "maimai",
    [switch]$Images,
    [switch]$AllGames
)

$CdnHost = "dp4p6x0xfi5o9.cloudfront.net"
$CdnIp = "99.86.156.132"
$OutputDir = $PSScriptRoot

$Games = @("maimai")
if ($AllGames) {
    $Games = @("maimai","chunithm","sdvx","jubeat","wacca","taiko","ongeki","polarischord","ddr","drs","gitadora","gc","popn","nostalgia","diva","rb","museca","crossbeats")
} elseif ($Game -ne "maimai") {
    $Games = @($Game)
}

foreach ($g in $Games) {
    Write-Host "`n=== Downloading $g data ===" -ForegroundColor Cyan

    $dataFile = Join-Path $OutputDir "${g}_data.json"
    $galleryFile = Join-Path $OutputDir "${g}_gallery.yaml"

    # Download data.json
    Write-Host "  Downloading data.json..."
    & curl.exe --resolve "${CdnHost}:443:${CdnIp}" -s -L -o $dataFile "https://${CdnHost}/${g}/data.json"
    if ($LASTEXITCODE -eq 0) {
        $size = [math]::Round((Get-Item $dataFile).Length / 1MB, 2)
        Write-Host "  data.json: ${size} MB" -ForegroundColor Green
    } else {
        Write-Host "  data.json: FAILED" -ForegroundColor Red
        continue
    }

    # Download gallery.yaml
    Write-Host "  Downloading gallery.yaml..."
    & curl.exe --resolve "${CdnHost}:443:${CdnIp}" -s -L -o $galleryFile "https://${CdnHost}/${g}/gallery.yaml"
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  gallery.yaml: OK" -ForegroundColor Green
    }

    # Download images (optional)
    if ($Images) {
        Write-Host "  Downloading images..."
        $imgDir = Join-Path $OutputDir "${g}_img"
        if (-not (Test-Path $imgDir)) { New-Item -ItemType Directory -Path $imgDir | Out-Null }

        $json = Get-Content $dataFile -Raw | ConvertFrom-Json
        $total = $json.songs.Count
        $i = 0
        foreach ($song in $json.songs) {
            $i++
            if ($song.imageName) {
                $imgPath = Join-Path $imgDir $song.imageName
                if (-not (Test-Path $imgPath)) {
                    & curl.exe --resolve "${CdnHost}:443:${CdnIp}" -s -L -o $imgPath "https://${CdnHost}/${g}/img/$($song.imageName)"
                }
                if ($i % 100 -eq 0) { Write-Host "    Progress: $i / $total" }
            }
        }
        Write-Host "  Images: ${total} downloaded" -ForegroundColor Green
    }

    # Show data info
    $json = Get-Content $dataFile -Raw | ConvertFrom-Json
    $totalSheets = 0
    foreach ($s in $json.songs) { if ($s.sheets) { $totalSheets += $s.sheets.Count } }
    Write-Host "  updateTime: $($json.updateTime)"
    Write-Host "  songs: $($json.songs.Count), sheets: ${totalSheets}"
}

Write-Host "`nDone!" -ForegroundColor Green
Write-Host "`nData source: https://${CdnHost}"
Write-Host "If DNS fails, the script uses --resolve ${CdnHost}:443:${CdnIp} to bypass."
Write-Host "`nUsage:"
Write-Host "  .\download_data.ps1                    # Download maimai data only"
Write-Host "  .\download_data.ps1 -Game chunithm     # Download chunithm data"
Write-Host "  .\download_data.ps1 -Images            # Download maimai data + cover images"
Write-Host "  .\download_data.ps1 -AllGames          # Download all games' data"
