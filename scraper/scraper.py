import feedparser
import trafilatura
import hashlib
from datetime import datetime
from dateutil import parser as dateparser
from pymongo import MongoClient
from dotenv import load_dotenv
import os

load_dotenv()

FEEDS = {
    "BBC": "http://feeds.bbci.co.uk/news/rss.xml",
    "NPR": "https://feeds.npr.org/1001/rss.xml",
    "Al Jazeera": "https://www.aljazeera.com/xml/rss/all.xml",
}

client = MongoClient(os.getenv("MONGO_URI"))
db = client.newspulse
articles_col = db.articles
articles_col.create_index("url_hash", unique=True)


def url_hash(url):
    return hashlib.sha256(url.encode()).hexdigest()


def normalize_date(entry):
    for field in ("published", "updated", "pubDate"):
        raw = getattr(entry, field, None)
        if raw:
            try:
                return dateparser.parse(raw)
            except Exception:
                continue
    return datetime.utcnow()


def extract_full_text(url):
    try:
        downloaded = trafilatura.fetch_url(url)
        if downloaded:
            text = trafilatura.extract(downloaded)
            return text
    except Exception as e:
        print(f"  [warn] full text extraction failed for {url}: {e}")
    return None


def get_summary(entry):
    if hasattr(entry, "content"):
        return entry.content[0].value
    if hasattr(entry, "summary"):
        return entry.summary
    if hasattr(entry, "description"):
        return entry.description
    return ""


def run_scraper():
    total_new = 0
    for source, feed_url in FEEDS.items():
        print(f"Fetching {source}...")
        feed = feedparser.parse(feed_url)

        for entry in feed.entries:
            url = entry.get("link")
            if not url:
                continue

            h = url_hash(url)
            if articles_col.find_one({"url_hash": h}):
                continue

            summary = get_summary(entry)
            full_text = extract_full_text(url)

            doc = {
                "url": url,
                "url_hash": h,
                "title": entry.get("title", "Untitled"),
                "summary": summary,
                "full_text": full_text,
                "source": source,
                "published_at": normalize_date(entry),
                "scraped_at": datetime.utcnow(),
                "cluster_id": None,
            }

            try:
                articles_col.insert_one(doc)
                total_new += 1
                print(f"  + {doc['title'][:60]}")
            except Exception as e:
                print(f"  [error] insert failed: {e}")

    print(f"\nDone. {total_new} new articles added.")
    return total_new


if __name__ == "__main__":
    run_scraper()
