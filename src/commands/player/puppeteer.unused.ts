/**
 * This file is unused, but in the event that we need to do web scraping with puppeteer for anything in the future,
 * this serves as an example of how to do it.
 */
import { Cluster } from 'puppeteer-cluster';

import { error } from 'src/logging';

const clusterInitialization = (async () => {
  try {
    const cluster = await Cluster.launch({
      concurrency: Cluster.CONCURRENCY_CONTEXT,
      maxConcurrency: 2,
      puppeteerOptions: {
        // @ts-ignore This is incorrect typing
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
        ],
      },
    });
    await cluster.task(async ({ page, data: query }) => {
      const url = new URL('https://www.youtube.com/results');
      url.searchParams.set('search_query', query);
      await page.goto(url.href, {
        waitUntil: ['load', 'domcontentloaded'],
      });
      const firstResultElement = await page.$('a#video-title');
      const youtubeLink: string = await page.evaluate(e => e.href, firstResultElement);
      return youtubeLink;
    });
    return cluster;
  } catch (err) {
    error(err);
    throw new Error('Puppeteer not configured');
  }
})();

export async function example(): Promise<string> {
  const cluster = await clusterInitialization;
  const youtubeLink = await cluster.execute('example');
  return youtubeLink;
}
