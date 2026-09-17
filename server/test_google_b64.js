const puppeteer = require('puppeteer');

async function scrapeGoogleImagesBase64(query) {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  await page.goto(`https://www.google.com/search?q=pinterest+${encodeURIComponent(query)}&tbm=isch`, { waitUntil: 'domcontentloaded' });
  
  const images = await page.evaluate(() => {
    const results = [];
    document.querySelectorAll('img').forEach(img => {
      const src = img.src || img.getAttribute('data-src');
      if (src && src.startsWith('data:image/jpeg;base64')) {
        results.push(src);
      }
    });
    return results;
  });
  
  await browser.close();
  console.log(`Found ${images.length} base64 images!`);
}

scrapeGoogleImagesBase64('zee jkt48');
