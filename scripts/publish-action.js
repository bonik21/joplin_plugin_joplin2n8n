const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function run(cmd) {
    return execSync(cmd, { stdio: 'inherit' });
}

function runCapture(cmd) {
    return execSync(cmd, { encoding: 'utf8' }).trim();
}

function main() {
    const pkgPath = path.resolve(__dirname, '../package.json');
    if (!fs.existsSync(pkgPath)) {
        console.error('Error: package.json not found');
        process.exit(1);
    }

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const version = pkg.version;
    const tagName = `v${version}`;

    console.log(`\n📦 Preparing to trigger GitHub Actions release for ${pkg.name}@${version} (${tagName})...\n`);

    // 1. Check for uncommitted changes
    try {
        const status = runCapture('git status --porcelain');
        if (status) {
            console.warn('⚠️  Warning: You have uncommitted changes in your working tree:');
            console.warn(status);
            console.warn('\nPlease commit or stash your changes before releasing.\n');
            process.exit(1);
        }
    } catch (e) {
        console.error('Failed to check git status:', e.message);
        process.exit(1);
    }

    // 2. Check if tag already exists locally or remotely
    let tagExists = false;
    try {
        const existingTags = runCapture(`git tag -l "${tagName}"`);
        if (existingTags.split('\n').map(t => t.trim()).includes(tagName)) {
            tagExists = true;
            console.log(`ℹ️  Tag ${tagName} already exists locally.`);
        }
    } catch (e) {
        // ignore
    }

    // 3. Create tag if it doesn't exist
    if (!tagExists) {
        try {
            console.log(`🏷️  Creating git tag: ${tagName}`);
            run(`git tag -a "${tagName}" -m "Release ${tagName}"`);
        } catch (e) {
            console.error(`Failed to create tag ${tagName}:`, e.message);
            process.exit(1);
        }
    }

    // 4. Push tag to origin
    try {
        console.log(`🚀 Pushing tag ${tagName} to origin...`);
        run(`git push origin "${tagName}"`);
        console.log(`\n✅ Tag ${tagName} pushed successfully!`);
        console.log(`\n🔗 GitHub Actions workflow has been triggered:`);
        console.log(`   https://github.com/bonik21/joplin_plugin_joplin2n8n/actions\n`);
    } catch (e) {
        console.error(`\n❌ Failed to push tag ${tagName} to origin:`, e.message);
        process.exit(1);
    }
}

main();
