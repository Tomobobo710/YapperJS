const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const http = require('http');
const { createWriteStream } = require('fs');
const { pipeline } = require('stream');

// Configuration
const LLAMA_CPP_REPO = 'https://github.com/ggml-org/llama.cpp.git';
const LLAMA_CPP_DIR = path.join(__dirname, '../llama.cpp');
const BUILD_DIR = path.join(LLAMA_CPP_DIR, 'build');
const BIN_DIR = path.join(BUILD_DIR, 'bin');

// Detect platform
function getPlatform() {
    const platform = os.platform();
    const arch = os.arch();

    if (platform === 'win32') {
        return arch === 'x64' ? 'windows-x64' : 'windows-arm64';
    } else if (platform === 'darwin') {
        return arch === 'arm64' ? 'macos-arm64' : 'macos-x64';
    } else if (platform === 'linux') {
        return 'linux-x64';
    }
    throw new Error(`Unsupported platform: ${platform}-${arch}`);
}

// Fetch latest release from GitHub API
async function getLatestRelease() {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.github.com',
            path: '/repos/ggml-org/llama.cpp/releases/latest',
            method: 'GET',
            headers: {
                'User-Agent': 'Node.js',
                'Accept': 'application/vnd.github.v3+json'
            }
        };

        https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const release = JSON.parse(data);
                    resolve(release);
                } catch (e) {
                    reject(new Error('Failed to parse GitHub API response'));
                }
            });
        }).on('error', reject).end();
    });
}

// Find the right binary asset for the platform
function findBinaryAsset(release, platform) {
    const assets = release.assets || [];
    
    // Map platforms to asset name patterns (in priority order)
    const patterns = {
        'windows-x64': ['llama-.*-bin-win-cuda', 'win-cuda', 'llama-.*-bin-win-cpu', 'win-cpu'],
        'macos-x64': ['llama-.*-bin-macos-x64', 'bin-macos-x64'],
        'macos-arm64': ['llama-.*-bin-macos-arm64', 'bin-macos-arm64'],
        'linux-x64': ['llama-.*-bin-ubuntu-x64', 'bin-ubuntu-x64']
    };

    const searchPatterns = patterns[platform] || [];
    
    for (const pattern of searchPatterns) {
        const regex = new RegExp(pattern, 'i');
        const asset = assets.find(a => 
            regex.test(a.name) && (a.name.endsWith('.zip') || a.name.endsWith('.tar.gz'))
        );
        if (asset) return asset;
    }
    
    return null;
}

// Download file from URL
async function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        const dir = path.dirname(destPath);
        
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        console.log(`Downloading from: ${url}`);
        
        const file = createWriteStream(destPath);
        protocol.get(url, (response) => {
            if (response.statusCode === 302 || response.statusCode === 301) {
                // Follow redirect
                downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
                return;
            }
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download: ${response.statusCode}`));
                return;
            }
            
            const totalSize = parseInt(response.headers['content-length'], 10);
            let downloadedSize = 0;
            
            response.on('data', (chunk) => {
                downloadedSize += chunk.length;
                const percent = Math.round((downloadedSize / totalSize) * 100);
                process.stdout.write(`\rProgress: ${percent}%`);
            });
            
            pipeline(response, file, (err) => {
                process.stdout.write('\n');
                if (err) {
                    fs.unlinkSync(destPath);
                    reject(err);
                } else {
                    resolve();
                }
            });
        }).on('error', (err) => {
            if (fs.existsSync(destPath)) {
                fs.unlinkSync(destPath);
            }
            reject(err);
        });
    });
}

// Download and extract latest release binaries
async function downloadLatestRelease(platform) {
    console.log('Fetching latest llama.cpp release...');
    const release = await getLatestRelease();
    
    const asset = findBinaryAsset(release, platform);
    if (!asset) {
        throw new Error(
            `No prebuilt binary found for ${platform} in latest release.\n` +
            `Available assets: ${release.assets.map(a => a.name).join(', ')}`
        );
    }

    console.log(`Found: ${asset.name}`);
    
    const downloadPath = path.join(__dirname, asset.name);
    
    try {
        // Download
        await downloadFile(asset.browser_download_url, downloadPath);
        
        console.log('Extracting...');
        
        // Create bin directory
        if (!fs.existsSync(BIN_DIR)) {
            fs.mkdirSync(BIN_DIR, { recursive: true });
        }

        // Extract based on file type
        if (asset.name.endsWith('.zip')) {
            const AdmZip = require('adm-zip');
            const zip = new AdmZip(downloadPath);
            zip.extractAllTo(BIN_DIR, true);
        } else if (asset.name.endsWith('.tar.gz')) {
            // For tar.gz, use tar command
            await new Promise((resolve, reject) => {
                const tar = spawn('tar', ['-xzf', downloadPath, '-C', BIN_DIR], { stdio: 'inherit' });
                tar.on('close', (code) => {
                    if (code === 0) resolve();
                    else reject(new Error('Failed to extract tar.gz'));
                });
            });
        }

        // Clean up archive
        fs.unlinkSync(downloadPath);
        console.log('Extraction complete!');

    } catch (error) {
        if (fs.existsSync(downloadPath)) {
            fs.unlinkSync(downloadPath);
        }
        throw error;
    }
}

// Ensure llama-server is available
async function ensureLlamaServer() {
    // First check if llama-server exists
    const existingServer = checkLlamaServer();
    if (existingServer) {
        console.log('llama-server found at:', existingServer);
        return existingServer;
    }

    // Download latest release
    const platform = getPlatform();
    console.log(`Detected platform: ${platform}\n`);
    
    try {
        await downloadLatestRelease(platform);
    } catch (error) {
        throw new Error(`Failed to download llama.cpp: ${error.message}`);
    }

    // Verify it was extracted
    const serverPath = checkLlamaServer();
    if (!serverPath) {
        throw new Error('Downloaded llama.cpp but could not find llama-server executable');
    }

    return serverPath;
}

// Check if llama-server exists
function checkLlamaServer() {
    const possiblePaths = [
        path.join(BIN_DIR, 'llama-server' + (os.platform() === 'win32' ? '.exe' : '')),
        path.join(BUILD_DIR, 'llama-server' + (os.platform() === 'win32' ? '.exe' : '')),
        'llama-server' // In PATH
    ];

    for (const binPath of possiblePaths) {
        if (fs.existsSync(binPath)) {
            console.log(`Found llama-server at: ${binPath}`);
            return binPath;
        }
    }

    // Check if in PATH
    try {
        exec('llama-server --help', { timeout: 5000 }, (error) => {
            if (!error) {
                console.log('Found llama-server in PATH');
                return 'llama-server';
            }
        });
    } catch (e) {
        // Ignore
    }

    return null;
}

// Main installation function
async function install() {
    try {
        console.log('Checking for llama-server...\n');
        const serverPath = await ensureLlamaServer();
        console.log('\nllama-server is ready!');
        console.log(`Location: ${serverPath}\n`);
        return serverPath;
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

// Export for use in other scripts
module.exports = { install, checkLlamaServer, ensureLlamaServer };

if (require.main === module) {
    install();
}
