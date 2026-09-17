const axios = require('axios');
const cheerio = require('cheerio');

async function scrapeDDG(query) {
  try {
    const res = await axios.get(`https://html.duckduckgo.com/html/?q=site:pinterest.com+${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)'
      }
    });
    
    const $ = cheerio.load(res.data);
    const links = [];
    $('.result__url').each((i, el) => {
      links.push($(el).attr('href'));
    });
    
    console.log(`Found ${links.length} links!`);
    console.log(links.slice(0, 5));
  } catch (err) {
    console.error(err.message);
  }
}

scrapeDDG('zee jkt48');
