const fs = require('node:fs');
const pkg = require('./package.json');
const filename = 'assets/js/main.min.js';
const script = fs.readFileSync(filename, 'utf8');
const dateObj = new Date();
const banner = `/*!
 * Minimal Mistakes Jekyll Theme ${pkg.version} by ${pkg.author}
 * Copyright 2013-${dateObj.getFullYear()} Michael Rose - mademistakes.com | @mmistakes
 * Licensed under ${pkg.license}
 */
`;

if (script.slice(0, 3) !== '/**') {
  fs.writeFileSync(filename, banner + script);
}
