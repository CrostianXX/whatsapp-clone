const puppeteer = require('puppeteer');

async function scrapePinterestProgressively(query) {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36');
  
  await page.goto(`https://id.pinterest.com/search/pins/?q=${encodeURIComponent(query)}`, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));
  
  let allImages = new Set();
  
  for (let i = 0; i < 15; i++) {
    // Extract currently visible images
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
    
    images.forEach(img => allImages.add(img));
    
    console.log(`Scroll ${i}: Total unique images so far: ${allImages.size}`);
    
    if (allImages.size >= 100) break;
    
    // Scroll down
    await page.evaluate(() => window.scrollBy(0, 1000));
    await new Promise(r => setTimeout(r, 1000));
  }
  
  await browser.close();
  console.log(`Finished. Found ${allImages.size} images!`);
}

scrapePinterestProgressively('zee jkt48');
