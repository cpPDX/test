const fs = require("fs");
const path = require("path");

const htmlDir = path.join(__dirname, "..", "HelloWorld");
let failures = 0;

// Validate HTML files
const htmlFiles = fs.readdirSync(htmlDir).filter((f) => f.endsWith(".html"));
for (const file of htmlFiles) {
  const content = fs.readFileSync(path.join(htmlDir, file), "utf8");

  if (!content.includes("<!DOCTYPE html>")) {
    console.error(`FAIL: ${file} is missing <!DOCTYPE html>`);
    failures++;
  }
  if (!content.includes("<html") || !content.includes("</html>")) {
    console.error(`FAIL: ${file} is missing <html> wrapper`);
    failures++;
  }
  if (!content.includes("<head") || !content.includes("</head>")) {
    console.error(`FAIL: ${file} is missing <head> section`);
    failures++;
  }
  if (!content.includes("<body") || !content.includes("</body>")) {
    console.error(`FAIL: ${file} is missing <body> section`);
    failures++;
  }
  if (!content.includes("<title>")) {
    console.error(`FAIL: ${file} is missing <title> tag`);
    failures++;
  }

  if (failures === 0) {
    console.log(`PASS: ${file} has valid HTML structure`);
  }
}

// Validate JS files exist and are non-empty
const jsFiles = fs.readdirSync(htmlDir).filter((f) => f.endsWith(".js"));
for (const file of jsFiles) {
  const stat = fs.statSync(path.join(htmlDir, file));
  if (stat.size === 0) {
    console.error(`FAIL: ${file} is empty`);
    failures++;
  } else {
    console.log(`PASS: ${file} exists and is non-empty (${stat.size} bytes)`);
  }
}

// Validate CSS files exist and are non-empty
const cssFiles = fs.readdirSync(htmlDir).filter((f) => f.endsWith(".css"));
for (const file of cssFiles) {
  const stat = fs.statSync(path.join(htmlDir, file));
  if (stat.size === 0) {
    console.error(`FAIL: ${file} is empty`);
    failures++;
  } else {
    console.log(`PASS: ${file} exists and is non-empty (${stat.size} bytes)`);
  }
}

const total = htmlFiles.length + jsFiles.length + cssFiles.length;
if (failures > 0) {
  console.error(`\n${failures} validation failure(s)`);
  process.exit(1);
} else {
  console.log(`\nAll ${total} file(s) passed validation`);
}
