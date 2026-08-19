import { isExternalApisMock } from '../../../shared/external-apis-mock';
import { searchSocialCrawlEverywhere } from './socialcrawl';
import { searchSocialCrawlMock } from '../../socialcrawl_worker/src/socialcrawl-mock';

type SearchOpts = {
  query: string;
  lookbackDays?: number;
  sources?: string;
};

export async function searchSocialCrawl(opts: SearchOpts) {
  if (isExternalApisMock()) {
    return searchSocialCrawlMock(opts.query);
  }
  return searchSocialCrawlEverywhere(opts);
}
