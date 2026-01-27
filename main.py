from flask import Flask, render_template, request, jsonify, send_file, url_for
import os
import uuid
import datetime
from src.scraper import NewsScraper
from src.exporter import NewsExporter

app = Flask(__name__)
# Secure secret key would be needed for sessions in production,
# but we are using client-side state for simplicity here or temp storage.
app.secret_key = 'philinews_secret_key'

# Temporary storage for generated files to allow download
# In production, use a proper temp directory or object storage with cleanup
# Use /tmp for serverless environments (Vercel)
import tempfile
DOWNLOAD_FOLDER = tempfile.gettempdir()

scraper = NewsScraper()
exporter = NewsExporter()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/search', methods=['POST'])
def search():
    data = request.json
    keyword = data.get('keyword')
    num_results = int(data.get('num_results', 5))

    if not keyword:
        return jsonify({'error': 'Keyword is required'}), 400

    try:
        # Search for links
        links = scraper.search_articles(keyword, num_results=num_results)

        results = []
        for link in links:
            # Process each link
            # Note: synchronous processing might be slow.
            # ideally this should be a background task or incremental.
            # For this MVP, we process them sequentially.
            article_data = scraper.process_article(link.get('href'), initial_title=link.get('title'))
            results.append(article_data)

        return jsonify({'results': results})
    except Exception as e:
        print(f"Search error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/export', methods=['POST'])
def export():
    data = request.json
    articles = data.get('articles', [])
    fmt = data.get('format', 'pdf') # pdf or pptx
    keyword = data.get('keyword', 'report')

    if not articles:
        return jsonify({'error': 'No articles selected'}), 400

    filename = f"{keyword.replace(' ', '_')}_{uuid.uuid4().hex[:8]}.{fmt}"
    filepath = os.path.join(DOWNLOAD_FOLDER, filename)

    try:
        if fmt == 'pdf':
            exporter.to_pdf(articles, filepath)
        elif fmt == 'pptx':
            exporter.to_pptx(articles, filepath)
        else:
            return jsonify({'error': 'Invalid format'}), 400

        # Return the download URL
        download_url = url_for('download_file', filename=filename, _external=True)
        return jsonify({'download_url': download_url})

    except Exception as e:
        print(f"Export error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/download/<filename>')
def download_file(filename):
    return send_file(os.path.join(DOWNLOAD_FOLDER, filename), as_attachment=True)

# Service Worker and Manifest
@app.route('/manifest.json')
def manifest():
    return send_file('static/manifest.json')

@app.route('/sw.js')
def service_worker():
    return send_file('static/sw.js')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
