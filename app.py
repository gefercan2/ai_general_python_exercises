"""
Unified Local AI System - Main Application

Streamlit dashboard providing:
- File management and indexing
- Voyant-style text analysis
- AI query pipeline with RAG and correction memory
"""

import streamlit as st
from pathlib import Path
import sys

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent))

from core.config import (
    PAGE_TITLE,
    PAGE_ICON,
    LAYOUT,
    STARTUP_MESSAGE,
    STOPWORD_LANGUAGES,
    DEFAULT_STOPWORD_LANG
)
from core.models import check_ollama_running
from modules import (
    create_file_manager,
    get_file_summary,
    analyze_text,
    create_pipeline,
    QueryMode
)

# Page configuration
st.set_page_config(
    page_title=PAGE_TITLE,
    page_icon=PAGE_ICON,
    layout=LAYOUT
)

# Initialize session state
if 'pipeline' not in st.session_state:
    st.session_state.pipeline = create_pipeline(
        use_rag=True,
        use_memory=True,
        mode=QueryMode.FULL_PIPELINE
    )

if 'file_manager' not in st.session_state:
    st.session_state.file_manager = create_file_manager()

if 'query_history' not in st.session_state:
    st.session_state.query_history = []

if 'current_text' not in st.session_state:
    st.session_state.current_text = None

if 'selected_file' not in st.session_state:
    st.session_state.selected_file = None


# ============================================================================
# SIDEBAR - SYSTEM STATUS & CONFIGURATION
# ============================================================================

with st.sidebar:
    st.title("⚙️ System Status")
    
    # Check Ollama
    ollama_running = check_ollama_running()
    if ollama_running:
        st.success("✓ Ollama is running")
    else:
        st.error("✗ Ollama is not running")
        st.info("Start Ollama in terminal: `ollama serve`")
    
    st.divider()
    
    # Pipeline configuration
    st.subheader("🤖 AI Configuration")
    
    # Mode selection
    mode_options = {
        "Mode 1: SmolLM Only (Fast)": QueryMode.SMOLLM_ONLY,
        "Mode 2: Qwen Only (Code)": QueryMode.QWEN_ONLY,
        "Mode 3: Full Pipeline (Best)": QueryMode.FULL_PIPELINE,
        "Mode 4: TinyLlama Only (Fastest)": QueryMode.TINYLLAMA_ONLY
    }
    
    selected_mode = st.selectbox(
        "Query Mode",
        options=list(mode_options.keys()),
        index=2  # Default to Full Pipeline
    )
    st.session_state.pipeline.set_mode(mode_options[selected_mode])
    
    # RAG toggle
    rag_enabled = st.checkbox(
        "Enable RAG (Use indexed documents)",
        value=st.session_state.pipeline.use_rag
    )
    st.session_state.pipeline.use_rag = rag_enabled
    
    # Memory toggle
    memory_enabled = st.checkbox(
        "Enable Correction Memory",
        value=st.session_state.pipeline.use_memory
    )
    st.session_state.pipeline.use_memory = memory_enabled
    
    # Pipeline status
    status = st.session_state.pipeline.get_status()
    
    st.divider()
    st.subheader("📊 Statistics")
    
    if 'rag_chunks' in status:
        st.metric("Indexed Chunks", status['rag_chunks'])
        st.metric("Indexed Files", status['rag_sources'])
    
    if 'corrections_count' in status:
        st.metric("Saved Corrections", status['corrections_count'])
    
    st.divider()
    
    # Info
    st.caption("💡 Tip: Upload documents in the File Manager, then ask questions in AI Query.")


# ============================================================================
# MAIN APPLICATION - TABS
# ============================================================================

st.title("🤖 Unified Local AI System")
st.caption("Local document analysis and AI-powered Q&A")

# Create tabs
tab1, tab2, tab3 = st.tabs(["📁 File Manager", "📖 Text Analysis", "🤖 AI Query"])


# ============================================================================
# TAB 1: FILE MANAGER
# ============================================================================

with tab1:
    st.header("📁 Document Repository")
    
    col1, col2 = st.columns([2, 1])
    
    with col1:
        st.subheader("Upload Files")
        
        uploaded_files = st.file_uploader(
            "Choose files to upload",
            type=['txt', 'md', 'csv', 'pdf', 'docx'],
            accept_multiple_files=True
        )
        
        if uploaded_files:
            if st.button("📤 Upload & Index Files"):
                with st.spinner("Uploading and indexing..."):
                    for uploaded_file in uploaded_files:
                        # Upload
                        result = st.session_state.file_manager.upload_file(uploaded_file)
                        
                        if result['success']:
                            st.success(result['message'])
                            
                            # Auto-index
                            index_result = st.session_state.file_manager.index_file(result['filename'])
                            if index_result['success']:
                                st.info(f"✓ {index_result['message']}")
                            else:
                                st.warning(index_result['message'])
                        else:
                            st.error(result['message'])
    
    with col2:
        st.subheader("Quick Actions")
        
        if st.button("🔄 Index All Unindexed"):
            with st.spinner("Indexing files..."):
                result = st.session_state.file_manager.index_all_files()
                if result['success']:
                    st.success(result['message'])
                else:
                    st.error(result['message'])
        
        if st.button("🗑️ Clear Index"):
            if st.session_state.file_manager.vector_store.count() > 0:
                result = st.session_state.file_manager.clear_index()
                st.warning(result['message'])
            else:
                st.info("Index is already empty")
    
    st.divider()
    
    # File status
    st.subheader("📋 Repository Status")
    
    status = st.session_state.file_manager.get_file_status()
    
    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Total Files", status['total_files'])
    col2.metric("Indexed", status['indexed_count'])
    col3.metric("Unindexed", status['unindexed_count'])
    col4.metric("Total Chunks", status['total_chunks'])
    
    # File lists
    if status['all_files']:
        st.subheader("Files")
        
        for file_info in status['all_files']:
            is_indexed = file_info['name'] in st.session_state.file_manager.get_indexed_sources()
            
            col1, col2, col3, col4 = st.columns([3, 1, 1, 1])
            
            with col1:
                icon = "✓" if is_indexed else "○"
                st.text(f"{icon} {file_info['name']} ({file_info['size_kb']} KB)")
            
            with col2:
                if not is_indexed:
                    if st.button("Index", key=f"index_{file_info['name']}"):
                        result = st.session_state.file_manager.index_file(file_info['name'])
                        st.rerun()
            
            with col3:
                if is_indexed:
                    if st.button("Reindex", key=f"reindex_{file_info['name']}"):
                        result = st.session_state.file_manager.reindex_file(file_info['name'])
                        st.rerun()
            
            with col4:
                if st.button("Delete", key=f"delete_{file_info['name']}"):
                    result = st.session_state.file_manager.delete_file(file_info['name'])
                    st.rerun()
    else:
        st.info("No files in repository. Upload files above to get started.")


# ============================================================================
# TAB 2: TEXT ANALYSIS
# ============================================================================

with tab2:
    st.header("📖 Text Analysis (Voyant-style)")
    
    # File selection
    all_files = st.session_state.file_manager.get_all_files()
    
    if all_files:
        file_options = ["[Select a file]"] + [f['name'] for f in all_files]
        selected_file = st.selectbox("Choose a file to analyze", file_options)
        
        if selected_file != "[Select a file]":
            # Load file content
            file_path = st.session_state.file_manager.documents_dir / selected_file
            
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    text = f.read()
                
                st.session_state.current_text = text
                st.session_state.selected_file = selected_file
                
                # Language selection
                language = st.selectbox(
                    "Stopword Language",
                    options=STOPWORD_LANGUAGES,
                    index=STOPWORD_LANGUAGES.index(DEFAULT_STOPWORD_LANG)
                )
                
                # Create analyzer
                with st.spinner("Analyzing text..."):
                    analyzer = analyze_text(text, language)
                
                # Statistics
                st.subheader("📊 Statistics")
                stats = analyzer.get_statistics()
                
                col1, col2, col3, col4 = st.columns(4)
                col1.metric("Total Words", stats['total_words'])
                col2.metric("Unique Words", stats['unique_words'])
                col3.metric("Sentences", stats['total_sentences'])
                col4.metric("Vocab Diversity", f"{stats['vocabulary_diversity']:.3f}")
                
                col1, col2, col3, col4 = st.columns(4)
                col1.metric("Filtered Words", stats['filtered_words'])
                col2.metric("Stopwords Removed", stats['stopwords_removed'])
                col3.metric("Avg Sentence Length", stats['avg_sentence_length'])
                col4.metric("Avg Word Length", stats['avg_word_length'])
                
                st.divider()
                
                # Word Frequency
                st.subheader("📈 Word Frequency")
                
                top_n = st.slider("Number of words to display", 10, 50, 30)
                fig = analyzer.create_frequency_chart(top_n=top_n)
                st.plotly_chart(fig, use_container_width=True)
                
                # Show table
                freq = analyzer.get_word_frequency(top_n)
                st.dataframe(
                    [(word, count) for word, count in freq],
                    column_config={
                        "0": "Word",
                        "1": "Frequency"
                    },
                    hide_index=True
                )
                
                st.divider()
                
                # Word Cloud
                st.subheader("☁️ Word Cloud")
                wc_image = analyzer.generate_word_cloud_image()
                st.image(wc_image)
                
                st.divider()
                
                # KWIC
                st.subheader("🔍 Keywords in Context (KWIC)")
                
                search_term = st.text_input("Search for a word or phrase")
                
                if search_term:
                    kwic_results = analyzer.get_kwic(search_term, max_results=20)
                    
                    if kwic_results:
                        st.success(f"Found {len(kwic_results)} occurrences:")
                        
                        for i, sentence in enumerate(kwic_results, 1):
                            # Highlight the search term
                            highlighted = sentence.replace(
                                search_term,
                                f"**{search_term}**"
                            )
                            highlighted = highlighted.replace(
                                search_term.lower(),
                                f"**{search_term.lower()}**"
                            )
                            highlighted = highlighted.replace(
                                search_term.upper(),
                                f"**{search_term.upper()}**"
                            )
                            highlighted = highlighted.replace(
                                search_term.capitalize(),
                                f"**{search_term.capitalize()}**"
                            )
                            
                            st.markdown(f"{i}. {highlighted}")
                    else:
                        st.warning(f"No occurrences of '{search_term}' found")
                
                st.divider()
                
                # Additional analyses
                col1, col2 = st.columns(2)
                
                with col1:
                    st.subheader("📏 Word Length Distribution")
                    length_fig = analyzer.create_word_length_distribution()
                    st.plotly_chart(length_fig, use_container_width=True)
                
                with col2:
                    st.subheader("🔗 Top Bigrams")
                    bigrams = analyzer.get_ngrams(n=2, top_k=10)
                    
                    if bigrams:
                        st.dataframe(
                            [(ngram, count) for ngram, count in bigrams],
                            column_config={
                                "0": "Bigram",
                                "1": "Frequency"
                            },
                            hide_index=True
                        )
                    else:
                        st.info("Not enough data for bigrams")
            
            except Exception as e:
                st.error(f"Error loading file: {e}")
    else:
        st.info("No files available. Upload files in the File Manager tab.")


# ============================================================================
# TAB 3: AI QUERY
# ============================================================================

with tab3:
    st.header("🤖 AI-Powered Q&A")
    
    if not ollama_running:
        st.error("⚠️ Ollama is not running. Please start Ollama to use AI features.")
        st.code("ollama serve")
    else:
        # Query input
        question = st.text_area(
            "Ask a question",
            placeholder="What is the main topic of my documents? How much memory does my GPU have?",
            height=100
        )
        
        col1, col2 = st.columns([1, 3])
        
        with col1:
            ask_button = st.button("🚀 Ask", type="primary", use_container_width=True)
        
        with col2:
            if st.session_state.query_history:
                if st.button("🗑️ Clear History", use_container_width=True):
                    st.session_state.query_history = []
                    st.rerun()
        
        # Process query
        if ask_button and question.strip():
            with st.spinner("Processing..."):
                result = st.session_state.pipeline.query(question)
                
                # Add to history
                st.session_state.query_history.append({
                    'question': question,
                    'result': result
                })
        
        # Display results
        if st.session_state.query_history:
            st.divider()
            
            # Show latest result first
            for i, item in enumerate(reversed(st.session_state.query_history)):
                q = item['question']
                r = item['result']
                
                with st.expander(f"Q: {q[:80]}...", expanded=(i == 0)):
                    # Question
                    st.markdown(f"**Question:** {q}")
                    
                    # Answer
                    st.markdown("**Answer:**")
                    
                    if r.memory_hit:
                        st.info(f"🧠 Memory Hit (similarity: {r.memory_similarity:.2f})")
                    
                    st.markdown(r.answer)
                    
                    # Metadata
                    st.divider()
                    
                    col1, col2, col3 = st.columns(3)
                    
                    with col1:
                        st.caption(f"**Model:** {r.model_used}")
                        st.caption(f"**Mode:** {r.mode.name if r.mode else 'N/A'}")
                    
                    with col2:
                        st.caption(f"**RAG:** {'✓' if r.rag_used else '✗'} ({r.rag_chunks} chunks)")
                        st.caption(f"**Memory:** {'✓' if r.memory_hit else '✗'}")
                    
                    with col3:
                        st.caption(f"**Critique:** {'✓' if r.critique_passed else '⚠️'}")
                        st.caption(f"**Retries:** {r.retries}")
                    
                    # Sources
                    if r.sources:
                        with st.expander("📚 Sources"):
                            for j, source in enumerate(r.sources, 1):
                                st.markdown(f"**[{j}]** {source['metadata']['source']} (similarity: {source['similarity']:.2f})")
                                st.caption(source['text'][:200] + "...")
                    
                    # Execution path (debug)
                    with st.expander("🔍 Execution Path (Debug)"):
                        st.code(" → ".join(r.execution_path))
                    
                    # Correction interface
                    st.divider()
                    
                    if not r.memory_hit and not r.critique_passed:
                        st.warning("⚠️ This answer failed critique. Consider providing a correction.")
                    
                    with st.form(key=f"correction_form_{i}"):
                        st.subheader("✏️ Correct This Answer")
                        
                        correct_answer = st.text_area(
                            "Correct answer",
                            placeholder="Enter the correct answer...",
                            height=100
                        )
                        
                        submit_correction = st.form_submit_button("💾 Save Correction")
                        
                        if submit_correction and correct_answer.strip():
                            success = st.session_state.pipeline.add_correction(
                                question=q,
                                wrong_answer=r.answer,
                                correct_answer=correct_answer,
                                model_used=r.model_used
                            )
                            
                            if success:
                                st.success("✓ Correction saved to memory")
                            else:
                                st.error("Failed to save correction")


# ============================================================================
# FOOTER
# ============================================================================

st.divider()
st.caption("""
**Unified Local AI System** — Fully local document analysis and AI-powered Q&A  
No data leaves your machine | All processing happens locally
""")
