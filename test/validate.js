const fs = require("fs");
const path = require("path");

const htmlDir = path.join(__dirname, "..", "HelloWorld");
const files = fs.readdirSync(htmlDir).filter((f) => f.endsWith(".html"));

let failures = 0;

for (const file of files) {
  const content = fs.readFileSync(path.join(htmlDir, file), "utf8");

  // Check for DOCTYPE
  if (!content.includes("<!DOCTYPE html>")) {
    console.error(`FAIL: ${file} is missing <!DOCTYPE html>`);
    failures++;
  }

  // Check that all opened tags have matching structure
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

  if (failures === 0) {
    console.log(`PASS: ${file} has valid structure`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} validation failure(s)`);
  process.exit(1);
} else {
  console.log(`\nAll ${files.length} file(s) passed validation`);
}
