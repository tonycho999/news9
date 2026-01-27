# PhiliNews: Journalist Assistant 🇵🇭

A powerful, efficient web application designed for Filipino journalists with 15+ years of experience. This tool helps you quickly find, scrape, and summarize today's news articles based on keywords, and export them into professional reports or presentations.

## Features

*   **Real-time News Search:** Finds the latest articles from Filipino news sources (Inquirer, Philstar, Rappler, etc.) using DuckDuckGo.
*   **Automatic Scraping & Summarization:** Extracts the core content and provides concise summaries using NLP.
*   **Export to PDF:** Generates a clean, readable PDF report with links to original sources.
*   **Export to PowerPoint:** Creates a slide deck with one slide per article, perfect for quick briefings.
*   **Google Drive Integration:** (Optional) Save reports directly to your Google Drive.

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
    streamlit run app.py
    ```

## Usage

1.  Open the app in your browser (usually `http://localhost:8501`).
2.  Enter a keyword (e.g., "Traffic", "inflation", "Marcos").
3.  Adjust the number of articles to find in the sidebar.
4.  Click **Search News**.
5.  Review the results. Uncheck any articles you don't want in the report.
6.  Click **Generate PDF Report** or **Generate Presentation** to download your files.

## Google Drive Setup (Optional)

To enable the "Save to Drive" feature:
1.  Create a project in the [Google Cloud Console](https://console.cloud.google.com/).
2.  Enable the **Google Drive API**.
3.  Create **OAuth 2.0 Client IDs** (Desktop App).
4.  Download the JSON file and save it as `credentials.json` in the root folder of this project.
5.  Open `src/drive_utils.py` and uncomment the import statements and the logic inside the `DriveUploader` class.
6.  Restart the app.

## Technologies Used

*   **Streamlit:** Web interface.
*   **DuckDuckGo Search (`ddgs`):** Search engine.
*   **Newspaper3k:** Article scraping and summarization.
*   **FPDF:** PDF generation.
*   **Python-PPTX:** PowerPoint generation.
