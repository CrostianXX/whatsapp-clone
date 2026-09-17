const Scraper = require('images-scraper');

const google = new Scraper({
  puppeteer: {
    headless: 'new',
    args: ['--no-sandbox']
  },
});

(async () => {
  const results = await google.scrape('pinterest zee jkt48', 30);
  console.log(`Found ${results.length} images!`);
  console.log(results.slice(0, 5));
})();
