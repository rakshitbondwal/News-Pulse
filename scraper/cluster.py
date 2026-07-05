import re
from collections import defaultdict
from pymongo import MongoClient
from dotenv import load_dotenv
import os

load_dotenv()

client = MongoClient(os.getenv('MONGO_URI'))
db = client.newspulse
articles_col = db.articles
clusters_col = db.clusters

STOPWORDS = set('''a an the is are was were be been being and or but if then than
so to of in on at for with by from as this that these those it its he she they
his her their them we us our you your i me my not no do does did done can could will
would shall should may might must about into over under after before during while
new says say said told according reuters ap news bbc npr al jazeera
img src href http https www com html div span class story article
alt width height amp lt gt nbsp'''.split())

OVERLAP_THRESHOLD = 4


def clean_text(text):
    text = re.sub(r'<[^>]+>', ' ', text)
    text = re.sub(r'http\S+', ' ', text)
    return text


def extract_keywords(text):
    text = clean_text(text)
    words = re.findall(r"[a-zA-Z]+", text.lower())
    return set(w for w in words if w not in STOPWORDS and len(w) > 2)


def cluster_articles():
    articles = list(articles_col.find({}))
    print(f"Loaded {len(articles)} articles")

    keyword_sets = {}
    for a in articles:
        text = (a.get('title', '') + ' ' + (a.get('summary') or '')).strip()
        keyword_sets[a['_id']] = extract_keywords(text)

    ids = list(keyword_sets.keys())
    parent = {i: i for i in ids}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(x, y):
        px, py = find(x), find(y)
        if px != py:
            parent[px] = py

    for i in range(len(ids)):
        for j in range(i + 1, len(ids)):
            shared = keyword_sets[ids[i]] & keyword_sets[ids[j]]
            if len(shared) >= OVERLAP_THRESHOLD:
                union(ids[i], ids[j])

    groups = defaultdict(list)
    for aid in ids:
        groups[find(aid)].append(aid)

    clusters_col.delete_many({})
    articles_col.update_many({}, {"$set": {"cluster_id": None}})

    cluster_count = 0
    for root, member_ids in groups.items():
        if len(member_ids) < 2:
            continue

        member_articles = [a for a in articles if a['_id'] in member_ids]

        word_counts = defaultdict(int)
        for aid in member_ids:
            for w in keyword_sets[aid]:
                word_counts[w] += 1
        top_words = sorted(word_counts.items(), key=lambda x: -x[1])[:3]
        label = ' '.join(w for w, _ in top_words).title() or 'Untitled Cluster'

        times = [a['published_at'] for a in member_articles if a.get('published_at')]
        start_time = min(times) if times else None
        end_time = max(times) if times else None

        cluster_doc = {
            'label': label,
            'article_ids': member_ids,
            'article_count': len(member_ids),
            'start_time': start_time,
            'end_time': end_time,
        }
        result = clusters_col.insert_one(cluster_doc)
        cluster_count += 1

        articles_col.update_many(
            {"_id": {"$in": member_ids}},
            {"$set": {"cluster_id": result.inserted_id}}
        )

    print(f"Created {cluster_count} clusters")
    unclustered = sum(1 for ids_ in groups.values() if len(ids_) < 2)
    print(f"{unclustered} articles remained unclustered (singleton stories)")


if __name__ == '__main__':
    cluster_articles()
