const fs = require('fs');
const path = require('path');
const { sync: glob } = require('glob');

console.log('Generate locale');

main();

function main() {
    let langRes = {};

    getLocaleFiles().forEach(file => {
        const tLang = readFile(file);
        langRes = {...langRes, ...tLang};
    });

    writeObj(langRes);
}

function getLocaleFiles() {
    const ignoredFiles = new Set([
        'metadata.json',
        'package.json',
        'package-lock.json',
        'tsconfig.json'
    ]);
    const files = [
        './Activities/websites/general.json',
        ...glob('./Activities/websites/*/*/*.json'),
        ...glob('./Activities/websites/*/*/v*/*.json')
    ];

    return [...new Set(files)].filter(file => {
        const normalized = file.replace(/\\/g, '/');
        if (normalized.includes('/dist/')) return false;
        return !ignoredFiles.has(path.basename(file));
    });
}

function readFile(file) {
    const data = fs.readFileSync(file, 'utf8');
    const json = JSON.parse(data);
    const res = {};
    for (const el in json) {
        if (json[el] && typeof json[el].message === 'string') {
            res[el] = json[el].message;
        }
    }

    return res;
}

function writeObj(obj) {
    console.log(`Generated ${Object.keys(obj).length} locale strings`);
    const content = `
        var language = ${JSON.stringify(obj)};
    `;
    fs.mkdirSync('./Extension/Pages', { recursive: true });
    fs.writeFileSync('./Extension/Pages/locale.js', content);
}
