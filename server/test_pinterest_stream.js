const puppeteer = require('puppeteer');

async function testPinterestStream(baseQuery) {
  const suffixes = ['', ' aesthetic', ' cute', ' icon', ' ootd', ' wallpaper', ' selca', ' photoshoot'];
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  
  await page.setViewport({ width: 1920, height: 2500 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36');
  
  let totalImages = 0;
  
  for (const suffix of suffixes) {
    const query = baseQuery + suffix;
    console.log(`Searching for: ${query}...`);
    
    try {
      await page.goto(`https://id.pinterest.com/search/pins/?q=${encodeURIComponent(query)}`, { waitUntil: 'domcontentloaded' });
      await new Promise(r => setTimeout(r, 1500)); // wait for images to populate
      
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
      
      console.log(`Found ${images.length} images for "${query}"!`);
      totalImages += images.length;
    } catch (e) {
      console.error(`Error searching ${query}: ${e.message}`);
    }
  }
  
  await browser.close();
  console.log(`Finished! Total images: ${totalImages}`);
}

testPinterestStream('zee jkt48');
