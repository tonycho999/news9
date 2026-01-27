# PhiliNews: Journalist Assistant 🇵🇭

A powerful, efficient Progressive Web App (PWA) designed for Filipino journalists. This tool helps you quickly find, scrape, and summarize today's news articles based on keywords, and export them into professional reports or presentations.

## Features

*   **Real-time News Search:** Finds the latest articles from Filipino news sources (Inquirer, Philstar, Rappler, etc.) using DuckDuckGo.
*   **Automatic Scraping & Summarization:** Extracts the core content and provides concise summaries using NLP.
*   **Export to PDF & PPTX:** Generates reports and slide decks on the fly.
*   **Installable App (PWA):** Can be installed on mobile phones and desktops for an app-like experience.
*   **Mobile Optimized:** Responsive interface designed for use on the go.

## Installation

1.  **Clone the repository:**
    ```bash
    git clone <repo_url>
    cd <repo_directory>
    ```

2.  **Install dependencies:**
    It is recommended to use a virtual environment.
    ```bash
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
    ```

3.  **Run the application:**
    ```bash
    python3 main.py
    ```

## Usage

1.  Open the app in your browser (usually `http://localhost:5000`).
2.  **Install on Mobile:**
    *   **Android (Chrome):** Tap the menu (three dots) -> "Install App" or "Add to Home Screen".
    *   **iOS (Safari):** Tap the "Share" button -> "Add to Home Screen".
3.  Enter a keyword (e.g., "Traffic", "inflation", "Marcos").
4.  Adjust the number of articles to find.
5.  Click **Search News**.
6.  Review the results. Uncheck any articles you don't want in the report.
7.  Click **Save as PDF** or **Save as PPT** to download your files.

## Google Drive Integration

To enable the "Save to Drive" feature (currently requires manual code integration in `main.py`):
1.  Configure credentials as per `src/drive_utils.py` documentation.
2.  Uncomment and implement the uploader logic in `main.py`.

## Technologies Used

*   **Flask:** Backend web framework.
*   **Bootstrap 5:** Mobile-first frontend UI.
*   **DuckDuckGo Search (`ddgs`):** Search engine.
*   **Newspaper3k:** Article scraping and summarization.
*   **FPDF:** PDF generation.
*   **Python-PPTX:** PowerPoint generation.
