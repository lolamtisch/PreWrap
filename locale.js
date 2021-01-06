const request = require('request');
const fs = require('fs')

console.log('Generate locale');

getJson('https://api.premid.app/v2/langFile/extension/en')
    .then((lang) => {

        langRes = readFile('./Localization/src/Extension/presence.json');

        langRes = {...langRes, ...lang};

        getFolder('./Localization/src/Presence').forEach(el => {
            const tLang = readFile('./Localization/src/Presence/'+el);
            langRes = {...langRes, ...tLang};
        });

        writeObj(langRes);
    })

function getFolder(path) {
    return fs.readdirSync(path);
}

function readFile(path) {
    const data = fs.readFileSync(path, 'utf8');
    const json = JSON.parse(data);
    const res = {};
    for (const el in json) {
        res[el] = json[el].message;
    }

    return res;
}

function writeObj(obj) {
    console.log(obj);
    const content = `
        var language = ${JSON.stringify(obj)};
    `;
    fs.writeFileSync('./Extension/Pages/locale.js', content);
}

async function getJson(url) {
	return new Promise((resolve, reject) => {
		request({url: url}, function (error, response, body) {
			if(error) {
				console.error('error:', error);
				reject(error);
				return;
			}
			if(response && response.statusCode === 200) {
				resolve(JSON.parse(body));
			}
		});
	})
}
