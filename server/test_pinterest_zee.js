const puppeteer = require('puppeteer');

async function scrapePinterestDirectly(query) {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36');
  
  await page.goto(`https://id.pinterest.com/search/pins/?q=${encodeURIComponent(query)}`, { waitUntil: 'domcontentloaded' });
  
  await new Promise(r => setTimeout(r, 2000));
  
  // Try to scroll 3 times
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
    await new Promise(r => setTimeout(r, 1500));
  }
  
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
    return results;
  });
  
  await browser.close();
  console.log(`Found ${images.length} images directly from Pinterest!`);
  console.log(images.slice(0, 5));
}

scrapePinterestDirectly('zee jkt48');
