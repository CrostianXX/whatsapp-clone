const puppeteer = require('puppeteer');

async function scrapePinterestDirectly(query) {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  
  // Extremely tall viewport!
  await page.setViewport({ width: 1920, height: 20000 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36');
  
  await page.goto(`https://id.pinterest.com/search/pins/?q=${encodeURIComponent(query)}`, { waitUntil: 'networkidle2' });
  
  const images = await page.evaluate(() => {
    const imgElements = document.querySelectorAll('img');
    const results = [];
    imgElements.forEach(img => {
      const src = img.src;
      if (src && src.includes('pinimg.com')) {
         const resMatch = src.match(/\/(\d+)x(?:\d+)?\//);
         if ((resMatch && parseInt(resMatch[1]) >= 200) || src.includes('/originals/')) {
            results.push(src);
         }
      }
    });
    return Array.from(new Set(results));
  });
  
  await browser.close();
  console.log(`Found ${images.length} images!`);
}

scrapePinterestDirectly('zee jkt48');
