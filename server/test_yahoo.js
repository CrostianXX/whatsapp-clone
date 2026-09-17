const puppeteer = require('puppeteer');

async function scrapeYahoo(query) {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  await page.goto(`https://images.search.yahoo.com/search/images?p=pinterest+${encodeURIComponent(query)}`, { waitUntil: 'domcontentloaded' });
  
  const images = await page.evaluate(() => {
    const results = [];
    document.querySelectorAll('li.ld a img').forEach(img => {
      const src = img.src || img.getAttribute('data-src');
      if (src && src.startsWith('http')) {
        results.push(src);
      }
    });
    return results;
  });
  
  await browser.close();
  console.log(`Found ${images.length} images from Yahoo!`);
  console.log(images.slice(0, 5));
}

scrapeYahoo('zee jkt48');
