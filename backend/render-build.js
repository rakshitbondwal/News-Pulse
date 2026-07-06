const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log("Starting production build preparation...");

// 1. Install python dependencies into a virtual environment
try {
  console.log("Setting up Python virtual environment...");
  execSync('python3 -m venv ../scraper/venv', { stdio: 'inherit' });
  console.log("Installing python packages...");
  execSync('../scraper/venv/bin/pip install -r ../scraper/requirements.txt', { stdio: 'inherit' });
} catch (e) {
  console.warn("Python setup warn (continuing):", e.message);
}

// 2. Modify server.js paths for Linux environment
try {
  console.log("Modifying server.js for Linux runtime...");
  const serverFile = path.join(__dirname, 'server.js');
  let content = fs.readFileSync(serverFile, 'utf8');
  
  content = content
    .replace(/venv\\\\Scripts\\\\python\.exe/g, 'venv/bin/python')
    .replace(/,\s*\{\s*shell:\s*["']cmd\.exe["']\s*\}/g, '')
    .replace(/cd \/d/g, 'cd');
    
  fs.writeFileSync(serverFile, content);
  console.log("Successfully updated server.js!");
} catch (e) {
  console.error("Error modifying server.js:", e.message);
  process.exit(1);
}
