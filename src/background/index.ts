import { getHashCode } from 'common/string';
import { getUrlDomain, getUrlWithPathOnly } from 'common/url';

export interface VisitedItem {
  key: number;
  domain: string;
  title: string;
  url: string;
  lastVisitTime: number;
}

export interface Message<T> {
  cmd: string;
  params?: T;
}

export interface GetVisitedItemsParams {
  domain?: string;
}

export const CMD_GET_VISITED_ITEMS = 'getVisitedItems';

const UPDATE_INTERVAL = 1000;
const REFRESH_DURATION = 1000 * 60 * 5;

let visitedItems: VisitedItem[] = [];
let startTime = 0;
let removed = false;
let active = true;

chrome.history.onVisitRemoved.addListener(() => {
  removed = true;
  active = true;
});
chrome.history.onVisited.addListener(() => {
  active = true;
});
chrome.tabs.onUpdated.addListener(() => {
  active = true;
});

chrome.runtime.onMessage.addListener(
  ({ cmd, params }: Message<GetVisitedItemsParams>, _, sendResponse) => {
    if (cmd === CMD_GET_VISITED_ITEMS) {
      getVisitedItems(params.domain).then(sendResponse);
      return true;
    }
  }
);

const update = async() => {
  if (active) {
    active = false;
    await refreshVistedItems(startTime);
    startTime = removed ? 0 : (Date.now() - REFRESH_DURATION);
    removed = false;
  }
  setTimeout(update, UPDATE_INTERVAL);
};
update();

async function refreshVistedItems(startTime: number) {
  const newItems = await getHistory(startTime);
  const newKeyItemMap: { [key: number]: VisitedItem } = {};
  for (const item of newItems) {
    newKeyItemMap[item.key] = item;
  }
  const finalItems: VisitedItem[] = [];
  for (const item of newItems) {
    if (item === newKeyItemMap[item.key]) {
      finalItems.push(item);
    }
  }
  if (startTime) {
    for (const item of visitedItems) {
      if (item.lastVisitTime < startTime) {
        finalItems.push(item);
      }
    }
  }
  visitedItems = finalItems;
}

function getHistory(startTime: number): Promise<VisitedItem[]> {
  return new Promise<VisitedItem[]>(resolve => {
    chrome.history.search({
      text: '',
      maxResults: 0,
      startTime,
    }, items => resolve(items.map(toVisitedItem)));
  });
}

function toVisitedItem(item: chrome.history.HistoryItem): VisitedItem {
  return {
    key: getVisitedItemKey(item.title, item.url),
    domain: getUrlDomain(item.url),
    title: item.title,
    url: item.url,
    lastVisitTime: item.lastVisitTime,
  };
}

function getVisitedItemKey(title: string, url: string): number {
  return getHashCode(title + getUrlWithPathOnly(url));
}

async function getVisitedItems(domain?: string): Promise<VisitedItem[]> {
  if (!domain) {
    return visitedItems;
  }
  return visitedItems.filter(item => item.domain === domain);
}
