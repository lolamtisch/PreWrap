const fs = require("fs");
const path = require("path");


var manifest = path.join(__dirname, "..", "Extension", "manifest.json");
fs.readFile(manifest, "utf8", function (err, data) {
  if (err) {
    return console.log(err);
  }

  const ver = new Date().toISOString().replace(/T.*/, "").replace(/-0*/g, ".");

  const result = data.replace(
    /"version": "[\d|\.]+",/g,
    `"version": "${ver}",`
  );

  fs.writeFile(manifest, result, "utf8", function (err) {
    if (err) return console.log(err);
  });
});
