import streamlit as st
import os
from src.scraper import NewsScraper
from src.exporter import NewsExporter
import time

# Set page config
st.set_page_config(
    page_title="PhiliNews Assistant",
    page_icon="📰",
    layout="wide"
)

# Initialize modules
@st.cache_resource
def get_scraper():
    return NewsScraper()

scraper = get_scraper()
exporter = NewsExporter()

# Session State
if 'articles' not in st.session_state:
    st.session_state.articles = []
if 'processed' not in st.session_state:
    st.session_state.processed = False

# Sidebar
st.sidebar.title("PhiliNews 🇵🇭")
st.sidebar.caption("For the Modern Filipino Journalist")
num_results = st.sidebar.slider("Number of articles to find", min_value=1, max_value=20, value=5)

st.sidebar.markdown("---")
st.sidebar.markdown("### About")
st.sidebar.info(
    "This tool searches for today's news in the Philippines based on your keyword, "
    "scrapes the content, and generates summaries for your reports."
)

# Main Content
st.title("Search & Scrape News")
st.markdown("Enter a keyword to find recent news stories from the Philippines.")

col1, col2 = st.columns([3, 1])
with col1:
    keyword = st.text_input("Keyword", placeholder="e.g. Traffic, Inflation, Marcos, Sara Duterte")
with col2:
    search_btn = st.button("Search News", type="primary", use_container_width=True)

if search_btn and keyword:
    st.session_state.articles = []
    st.session_state.processed = False

    with st.spinner(f"Searching for '{keyword}' in Philippine news..."):
        # Search links
        links = scraper.search_articles(keyword, num_results=num_results)

        if not links:
            st.warning("No recent articles found. Try a broader keyword.")
        else:
            progress_bar = st.progress(0)
            status_text = st.empty()

            # Process each link
            total = len(links)
            for i, link in enumerate(links):
                status_text.text(f"Processing ({i+1}/{total}): {link.get('title', 'Unknown Title')}")
                # Pass title from search result if available
                article_data = scraper.process_article(link['href'], initial_title=link.get('title'))
                if article_data:
                    st.session_state.articles.append(article_data)
                progress_bar.progress((i + 1) / total)

            st.session_state.processed = True
            st.success(f"Found and processed {len(st.session_state.articles)} articles!")
            time.sleep(1) # let user see success message
            st.rerun()

# Display Results
if st.session_state.processed and st.session_state.articles:
    st.markdown("---")
    st.header("Search Results")

    # Selection for export
    selected_indices = []

    for i, article in enumerate(st.session_state.articles):
        with st.expander(f"{i+1}. {article['title']}", expanded=True):
            col_a, col_b = st.columns([3, 1])
            with col_a:
                st.markdown(f"**Source:** [{article['url']}]({article['url']})")
                authors = ", ".join(article['authors']) if article['authors'] else "Unknown"
                st.caption(f"Authors: {authors} | Date: {article['publish_date']}")
                st.write(article['summary'])
            with col_b:
                # Checkbox to include in report
                if st.checkbox("Include in Report", value=True, key=f"select_{i}"):
                    selected_indices.append(i)

                # Show image if available (and valid URL)
                if article.get('top_image') and article['top_image'].startswith('http'):
                    st.image(article['top_image'], use_column_width=True)

    st.markdown("---")
    st.header("Export Options")

    if selected_indices:
        selected_articles = [st.session_state.articles[i] for i in selected_indices]

        col_pdf, col_pptx, col_drive = st.columns(3)

        with col_pdf:
            if st.button("Generate PDF Report"):
                filename = f"report_{keyword.replace(' ', '_')}.pdf"
                try:
                    exporter.to_pdf(selected_articles, filename)
                    with open(filename, "rb") as f:
                        st.download_button(
                            label="Download PDF",
                            data=f,
                            file_name=filename,
                            mime="application/pdf"
                        )
                except Exception as e:
                    st.error(f"Failed to generate PDF: {e}")

        with col_pptx:
            if st.button("Generate Presentation"):
                filename = f"slides_{keyword.replace(' ', '_')}.pptx"
                try:
                    exporter.to_pptx(selected_articles, filename)
                    with open(filename, "rb") as f:
                        st.download_button(
                            label="Download PPTX",
                            data=f,
                            file_name=filename,
                            mime="application/vnd.openxmlformats-officedocument.presentationml.presentation"
                        )
                except Exception as e:
                    st.error(f"Failed to generate PPTX: {e}")

        with col_drive:
            st.button("Save to Google Drive (Setup Required)", disabled=True, help="Requires OAuth2 setup. Please configure credentials in src/drive_utils.py")
            st.info("To enable Drive integration, please deploy this app with your Google Cloud credentials.")
    else:
        st.warning("Select at least one article to generate a report.")

elif st.session_state.processed and not st.session_state.articles:
    st.info("No articles were successfully processed.")
