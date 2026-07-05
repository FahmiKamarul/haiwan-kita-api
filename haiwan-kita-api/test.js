const chromium = require('@sparticuz/chromium');
console.log('Keys:', Object.keys(chromium));
if (chromium.default) {
  console.log('Default keys:', Object.keys(chromium.default));
}
