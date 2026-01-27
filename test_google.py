from googlesearch import search

print("Testing Google Search...")
try:
    results = search("Philippines news", num_results=5, advanced=True)
    for r in results:
        print(f"Title: {r.title}")
        print(f"URL: {r.url}")
        print(f"Desc: {r.description}")
except TypeError:
    print("advanced=True not supported, falling back to URLs only.")
    results = search("Philippines news", num_results=5)
    for r in results:
        print(r)
except Exception as e:
    print(f"Error: {e}")
