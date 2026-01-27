import datetime
from duckduckgo_search import DDGS
from newspaper import Article, Config
import nltk
from tenacity import retry, stop_after_attempt, wait_fixed, retry_if_exception_type
import os
import requests
import feedparser

# Try to import googlesearch as fallback
try:
    from googlesearch import search as google_search
except ImportError:
    google_search = None

class NewsScraper:
    def __init__(self):
        # Configure NLTK data path for serverless environments (read-only FS)
        nltk_data_path = os.path.join(os.path.abspath(os.sep), "tmp", "nltk_data")
        if nltk_data_path not in nltk.data.path:
            nltk.data.path.append(nltk_data_path)

        # Ensure punkt is available
        try:
            nltk.data.find('tokenizers/punkt')
            nltk.data.find('tokenizers/punkt_tab')
        except LookupError:
            try:
                if not os.path.exists(nltk_data_path):
                    os.makedirs(nltk_data_path, exist_ok=True)
                nltk.download('punkt', download_dir=nltk_data_path)
                nltk.download('punkt_tab', download_dir=nltk_data_path)
            except Exception as e:
                print(f"Failed to download NLTK data: {e}")
                pass

    @retry(stop=stop_after_attempt(3), wait=wait_fixed(5), retry=retry_if_exception_type(Exception))
    def _search_ddg(self, query, num_results):
        results = []
        with DDGS() as ddgs:
            # region='ph-ph' targets Philippines
            # timelimit='d' means last day (today)
            ddgs_gen = ddgs.text(query, region='ph-ph', timelimit='d', max_results=num_results)
            for r in ddgs_gen:
                results.append(r)
        return results

    def _search_google(self, query, num_results):
        print("Falling back to Google Search...")
        results = []
        if not google_search:
            print("Google search library not installed.")
            return []

        try:
            # First try advanced mode to get metadata
            urls = google_search(query, num_results=num_results, advanced=True)
            for r in urls:
                if hasattr(r, 'url'):
                    results.append({
                        'href': r.url,
                        'title': r.title,
                        'body': r.description
                    })
        except TypeError:
             # If advanced=True fails, fall back to simple search (URL strings only)
             print("Google advanced search failed, trying simple mode...")
             try:
                urls = google_search(query, num_results=num_results)
                for url in urls:
                    results.append({
                        'href': url,
                        'title': None,
                        'body': ''
                    })
             except Exception as e:
                 print(f"Google simple search error: {e}")
        except Exception as e:
            print(f"Google search error: {e}")
            # Try simple mode if advanced raised another exception
            if not results:
                 try:
                    urls = google_search(query, num_results=num_results)
                    for url in urls:
                        results.append({'href': url, 'title': None, 'body': ''})
                 except:
                    pass

        return results

    def _search_feed(self, keyword, num_results=20):
        """
        Fallback to searching RSS feeds.
        Now includes more feeds and behaves more aggressively to find results.
        """
        print("Falling back to RSS Feeds...")

        feeds = [
            "https://www.inquirer.net/fullfeed",
            "https://www.philstar.com/rss",
            "https://www.rappler.com/feed",
            "https://data.gmanews.tv/gno/rss/news/nation.xml",
            "https://www.manilatimes.net/feed/"
        ]

        results = []
        keyword_lower = keyword.lower()

        for feed_url in feeds:
            try:
                feed = feedparser.parse(feed_url)
                for entry in feed.entries:
                    title = entry.get('title', '')
                    summary = entry.get('summary', '')
                    link = entry.get('link', '')

                    # Fuzzy match: check if keyword is in title or summary
                    if keyword_lower in title.lower() or keyword_lower in summary.lower():
                        results.append({
                            'href': link,
                            'title': title,
                            'body': summary
                        })

                    if len(results) >= num_results:
                        return results
            except Exception as e:
                print(f"RSS parse error for {feed_url}: {e}")

        # If no strict matches found, but we have a generic keyword like "news",
        # or if results are empty, return the top headlines from the first working feed
        # This ensures we always return *something* rather than nothing.
        if not results:
            print("No keyword matches in RSS. Fetching top headlines as fallback.")
            for feed_url in feeds:
                try:
                    feed = feedparser.parse(feed_url)
                    for entry in feed.entries[:num_results]:
                         results.append({
                            'href': entry.get('link', ''),
                            'title': entry.get('title', ''),
                            'body': entry.get('summary', '')
                        })
                    if results:
                        break # Stop after filling from one feed
                except:
                    continue

        return results[:num_results]

    def search_articles(self, keyword, num_results=10):
        """
        Searches for articles using DuckDuckGo with a Philippines region context.
        Returns a list of dictionaries with 'href', 'title', 'body'.
        """
        query = f"{keyword} news Philippines"

        print(f"Searching for: {query}")

        # 1. Try DuckDuckGo
        try:
            results = self._search_ddg(query, num_results)
            if results:
                return results
        except Exception as e:
            print(f"DuckDuckGo error: {e}")

        # 2. Fallback to Google
        try:
            results = self._search_google(query, num_results)
            if results:
                return results
        except Exception as e:
            print(f"Google fallback error: {e}")

        # 3. Fallback to RSS Feeds
        try:
            results = self._search_feed(keyword, num_results)
            if results:
                 return results
        except Exception as e:
            print(f"RSS fallback error: {e}")

        return []

    def process_article(self, url, initial_title=None):
        """
        Downloads, parses, and summarizes a single article.
        """
        user_agent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
        config = Config()
        config.browser_user_agent = user_agent
        config.request_timeout = 10

        try:
            article = Article(url, config=config)
            article.download()
            article.parse()
            try:
                article.nlp()
            except Exception as e:
                print(f"NLP processing failed for {url}: {e}")
                # Continue without summary if NLP fails

            title = article.title if article.title else initial_title

            return {
                'title': title,
                'authors': article.authors,
                'publish_date': article.publish_date,
                'summary': article.summary if article.summary else article.text[:200] + "...",
                'text': article.text,
                'top_image': article.top_image,
                'url': url,
                'error': None
            }
        except Exception as e:
            print(f"Error processing {url}: {e}")
            return {
                'title': initial_title if initial_title else 'Error processing article',
                'summary': f"Could not extract content. Error: {str(e)}",
                'url': url,
                'error': str(e),
                'top_image': None,
                'authors': [],
                'publish_date': None
            }

if __name__ == "__main__":
    # Simple test
    scraper = NewsScraper()
    print("Testing search...")
    links = scraper.search_articles("government", num_results=3)
    print(f"Found {len(links)} links.")

    if links:
        print(f"Processing first link: {links[0].get('href')}")
        data = scraper.process_article(links[0].get('href'), initial_title=links[0].get('title'))
        print(f"Title: {data.get('title')}")
        print(f"Summary: {data.get('summary')[:100]}...")
