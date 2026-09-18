const fs = require('fs');
const path = require('path');
const https = require('https');

const data = require('./maimai_data.json');
const imgDir = path.join(__dirname, 'maimai_img');

if (!fs.existsSync(imgDir)) {
    fs.mkdirSync(imgDir, { recursive: true });
}

const CDN_HOST = 'dp4p6x0xfi5o9.cloudfront.net';
const CDN_IP = '99.86.156.132';
const CONCURRENCY = 15;

const imageNames = [...new Set(data.songs.map(s => s.imageName).filter(Boolean))];
const toDownload = imageNames.filter(name => {
    const p = path.join(imgDir, name);
    return !fs.existsSync(p) || fs.statSync(p).size === 0;
});

console.log(`Total unique images: ${imageNames.length}`);
console.log(`Already downloaded: ${imageNames.length - toDownload.length}`);
console.log(`To download: ${toDownload.length}`);

let completed = 0;
let failed = 0;
const failedImages = [];
let index = 0;

function downloadOne(imageName) {
    return new Promise((resolve, reject) => {
        const filePath = path.join(imgDir, imageName);
        const options = {
            hostname: CDN_IP,
            port: 443,
            path: `/maimai/img/cover/${encodeURIComponent(imageName)}`,
            method: 'GET',
            headers: { Host: CDN_HOST },
            servername: CDN_HOST,
            rejectUnauthorized: true,
            timeout: 30000,
        };

        const req = https.request(options, (res) => {
            if (res.statusCode === 200) {
                const fileStream = fs.createWriteStream(filePath);
                res.pipe(fileStream);
                fileStream.on('finish', () => {
                    fileStream.close();
                    resolve();
                });
                fileStream.on('error', reject);
            } else {
                reject(new Error(`HTTP ${res.statusCode}`));
            }
        });

        req.on('timeout', () => {
            req.destroy(new Error('timeout'));
        });
        req.on('error', reject);
        req.end();
    });
}

async function worker() {
    while (index < toDownload.length) {
        const current = toDownload[index++];
        try {
            await downloadOne(current);
            completed++;
            if (completed % 50 === 0) {
                const pct = ((completed / toDownload.length) * 100).toFixed(1);
                console.log(`  Progress: ${completed}/${toDownload.length} (${pct}%) - failed: ${failed}`);
            }
        } catch (err) {
            failed++;
            failedImages.push(current);
            if (failed % 10 === 0) {
                console.log(`  Failed: ${failed} - ${current} - ${err.message}`);
            }
        }
    }
}

(async () => {
    const startTime = Date.now();
    console.log(`Starting download with ${CONCURRENCY} concurrent workers...\n`);

    const workers = [];
    for (let i = 0; i < CONCURRENCY; i++) {
        workers.push(worker());
    }
    await Promise.all(workers);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n=== Done in ${elapsed}s ===`);
    console.log(`Downloaded: ${completed}`);
    console.log(`Failed: ${failed}`);

    if (failedImages.length > 0) {
        fs.writeFileSync(
            path.join(__dirname, 'failed_images.txt'),
            failedImages.join('\n')
        );
        console.log(`Failed list saved to failed_images.txt`);
    }

    const totalSize = fs.readdirSync(imgDir)
        .filter(f => f.endsWith('.png'))
        .reduce((sum, f) => sum + fs.statSync(path.join(imgDir, f)).size, 0);
    console.log(`Total size: ${(totalSize / 1024 / 1024).toFixed(1)} MB`);
})();
